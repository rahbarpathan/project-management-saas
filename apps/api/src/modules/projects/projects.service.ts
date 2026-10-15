import { Prisma } from '@prisma/client';
import {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectPaginationQuery,
  ProjectResponse,
  ProjectListResponse,
  Role,
} from '@sprintflow/shared';
import { prisma } from '../../db/prisma';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '../../common/errors/app-error';
import { assertPermission } from '../../common/permissions';

export class ProjectsService {
  /**
   * Helper to fetch an authenticated user's membership in a workspace.
   * Throws NotFoundError if user is not a member, preventing cross-workspace enumeration.
   */
  public async getMembershipOrThrow(userId: string, workspaceId: string) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Workspace not found');
    }

    return membership;
  }

  /**
   * Resolves project -> workspace -> membership.
   * Throws NotFoundError if project does not exist OR if user is not a member of the workspace,
   * guaranteeing that cross-workspace access attempts return 404.
   */
  public async getProjectAndMembershipOrThrow(userId: string, projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workspace: true,
      },
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: project.workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Project not found');
    }

    return { project, membership };
  }

  /**
   * Creates a project within a workspace.
   * Validates key format (uppercase, 2-5 chars), enforces workspace uniqueness,
   * checks projects:create permission, and records an activity log entry.
   */
  public async createProject(
    userId: string,
    workspaceId: string,
    input: CreateProjectInput,
  ): Promise<ProjectResponse> {
    const membership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(membership.role as Role, 'projects:create');

    const key = input.key.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,5}$/.test(key)) {
      throw new BadRequestError('Project key must consist of 2 to 5 uppercase alphanumeric characters');
    }

    const existing = await prisma.project.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key,
        },
      },
    });

    if (existing) {
      throw new ConflictError(`A project with key '${key}' already exists in this workspace`);
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          workspaceId,
          name: input.name,
          key,
          description: input.description,
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          projectId: created.id,
          actorId: userId,
          action: 'PROJECT_CREATED',
          metadata: {
            name: created.name,
            key: created.key,
          },
        },
      });

      return created;
    });

    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      key: project.key,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      tasksCount: 0,
      sprintsCount: 0,
    };
  }

  /**
   * Lists projects in a workspace with pagination and search.
   * Requires projects:read.
   */
  public async listProjects(
    userId: string,
    workspaceId: string,
    query: ProjectPaginationQuery,
  ): Promise<ProjectListResponse> {
    const membership = await this.getMembershipOrThrow(userId, workspaceId);
    assertPermission(membership.role as Role, 'projects:read');

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = {
      workspaceId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { key: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const total = await prisma.project.count({ where });

    const items = await prisma.project.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            tasks: true,
            sprints: true,
          },
        },
      },
    });

    return {
      projects: items.map((p) => ({
        id: p.id,
        workspaceId: p.workspaceId,
        name: p.name,
        key: p.key,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        tasksCount: p._count?.tasks ?? 0,
        sprintsCount: p._count?.sprints ?? 0,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single project by ID.
   * Requires projects:read.
   */
  public async getProjectById(userId: string, projectId: string): Promise<ProjectResponse> {
    const { project, membership } = await this.getProjectAndMembershipOrThrow(userId, projectId);
    assertPermission(membership.role as Role, 'projects:read');

    const counts = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        _count: {
          select: {
            tasks: true,
            sprints: true,
          },
        },
      },
    });

    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      key: project.key,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      tasksCount: counts?._count?.tasks ?? 0,
      sprintsCount: counts?._count?.sprints ?? 0,
    };
  }

  /**
   * Updates project details (name, description).
   * Requires projects:update.
   */
  public async updateProject(
    userId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectResponse> {
    const { membership } = await this.getProjectAndMembershipOrThrow(userId, projectId);
    assertPermission(membership.role as Role, 'projects:update');

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: {
        _count: {
          select: {
            tasks: true,
            sprints: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      name: updated.name,
      key: updated.key,
      description: updated.description,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      tasksCount: updated._count?.tasks ?? 0,
      sprintsCount: updated._count?.sprints ?? 0,
    };
  }

  /**
   * Deliberately cascades project deletion:
   * 1. Logs activity log entry
   * 2. Deletes task comments
   * 3. Deletes sprint tasks
   * 4. Deletes tasks
   * 5. Deletes sprints
   * 6. Deletes project
   * Requires projects:delete (Admin or Owner).
   */
  public async deleteProject(userId: string, projectId: string): Promise<void> {
    const { project, membership } = await this.getProjectAndMembershipOrThrow(userId, projectId);
    assertPermission(membership.role as Role, 'projects:delete');

    await prisma.$transaction(async (tx) => {
      // 1. Write deletion activity log entry
      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          actorId: userId,
          action: 'PROJECT_DELETED',
          metadata: {
            name: project.name,
            key: project.key,
          },
        },
      });

      // 2. Cascade task comments
      await tx.comment.deleteMany({
        where: {
          task: {
            projectId,
          },
        },
      });

      // 3. Cascade sprint tasks
      await tx.sprintTask.deleteMany({
        where: {
          sprint: {
            projectId,
          },
        },
      });

      // 4. Cascade tasks
      await tx.task.deleteMany({
        where: {
          projectId,
        },
      });

      // 5. Cascade sprints
      await tx.sprint.deleteMany({
        where: {
          projectId,
        },
      });

      // 6. Delete project
      await tx.project.delete({
        where: {
          id: projectId,
        },
      });
    });
  }
}

export const projectsService = new ProjectsService();
