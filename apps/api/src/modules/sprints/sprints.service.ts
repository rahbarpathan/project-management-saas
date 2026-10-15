import { Prisma } from '@prisma/client';
import {
  CreateSprintInput,
  UpdateSprintInput,
  SprintResponse,
  SprintListResponse,
  Role,
} from '@sprintflow/shared';
import { prisma } from '../../db/prisma';
import { NotFoundError, BadRequestError } from '../../common/errors/app-error';
import { assertPermission } from '../../common/permissions';
import { socketService } from '../socket/socket.service';
import { tasksService, TaskWithAssignee } from '../tasks/tasks.service';

export interface SprintWithTasks {
  id: string;
  projectId: string;
  name: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  createdAt: Date | string;
  updatedAt: Date | string;
  sprintTasks?: Array<{
    id: string;
    sprintId: string;
    taskId: string;
    addedAt: Date | string;
    task?: TaskWithAssignee;
  }>;
}

export class SprintsService {
  /**
   * Helper to map Prisma Sprint record to SprintResponse
   */
  public mapSprintToResponse(sprint: SprintWithTasks): SprintResponse {
    const sprintTasks = sprint.sprintTasks || [];
    const tasks = sprintTasks.filter((st) => st.task).map((st) => tasksService.mapTaskToResponse(st.task!));
    const completedTasksCount = tasks.filter((t) => t.status === 'DONE').length;

    return {
      id: sprint.id,
      projectId: sprint.projectId,
      name: sprint.name,
      startDate: sprint.startDate
        ? sprint.startDate instanceof Date
          ? sprint.startDate.toISOString()
          : sprint.startDate
        : null,
      endDate: sprint.endDate
        ? sprint.endDate instanceof Date
          ? sprint.endDate.toISOString()
          : sprint.endDate
        : null,
      status: sprint.status,
      createdAt: sprint.createdAt instanceof Date ? sprint.createdAt.toISOString() : sprint.createdAt,
      updatedAt: sprint.updatedAt instanceof Date ? sprint.updatedAt.toISOString() : sprint.updatedAt,
      tasksCount: sprintTasks.length,
      completedTasksCount,
      tasks: tasks.length > 0 ? tasks : undefined,
    };
  }

  /**
   * Resolves project -> workspace -> membership.
   */
  public async getProjectAndMembershipOrThrow(userId: string, projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { workspace: true },
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
   * Resolves sprint -> project -> workspace -> membership.
   */
  public async getSprintAndMembershipOrThrow(userId: string, sprintId: string) {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: {
        project: {
          include: { workspace: true },
        },
      },
    });

    if (!sprint) {
      throw new NotFoundError('Sprint not found');
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: sprint.project.workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Sprint not found');
    }

    return { sprint, project: sprint.project, membership };
  }

  /**
   * Validates date ordering: endDate must be strictly after startDate.
   */
  private validateDates(startDate?: Date | string | null, endDate?: Date | string | null): void {
    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      if (end <= start) {
        throw new BadRequestError('Sprint end date must be after start date');
      }
    }
  }

  /**
   * Creates a new sprint for a project.
   */
  public async createSprint(
    userId: string,
    projectId: string,
    input: CreateSprintInput,
  ): Promise<SprintResponse> {
    const { project, membership } = await this.getProjectAndMembershipOrThrow(userId, projectId);
    assertPermission(membership.role as Role, 'sprints:create');

    this.validateDates(input.startDate, input.endDate);

    const created = await prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.create({
        data: {
          projectId,
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          status: 'PLANNED',
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId,
          actorId: userId,
          action: 'SPRINT_CREATED',
          metadata: {
            sprintId: sprint.id,
            name: sprint.name,
          },
        },
      });

      return sprint;
    });

    const response = this.mapSprintToResponse(created);
    socketService.emitSprintCreated(projectId, response);
    return response;
  }

  /**
   * Lists all sprints for a project.
   */
  public async listProjectSprints(
    userId: string,
    projectId: string,
  ): Promise<SprintListResponse> {
    const { membership } = await this.getProjectAndMembershipOrThrow(userId, projectId);
    assertPermission(membership.role as Role, 'sprints:read');

    const sprints = await prisma.sprint.findMany({
      where: { projectId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        sprintTasks: {
          include: {
            task: {
              include: {
                assignee: true,
              },
            },
          },
        },
      },
    });

    return {
      sprints: sprints.map((s) => this.mapSprintToResponse(s as unknown as SprintWithTasks)),
    };
  }

  /**
   * Retrieves single sprint with tasks.
   */
  public async getSprintById(userId: string, sprintId: string): Promise<SprintResponse> {
    const { membership } = await this.getSprintAndMembershipOrThrow(userId, sprintId);
    assertPermission(membership.role as Role, 'sprints:read');

    const detailed = await prisma.sprint.findUniqueOrThrow({
      where: { id: sprintId },
      include: {
        sprintTasks: {
          include: {
            task: {
              include: {
                assignee: true,
              },
            },
          },
        },
      },
    });

    return this.mapSprintToResponse(detailed as unknown as SprintWithTasks);
  }

  /**
   * Updates sprint details, handles starting (one active sprint check) and completing (transactional backlog move).
   */
  public async updateSprint(
    userId: string,
    sprintId: string,
    input: UpdateSprintInput,
    transactionHook?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<SprintResponse> {
    const { sprint, project, membership } = await this.getSprintAndMembershipOrThrow(userId, sprintId);
    assertPermission(membership.role as Role, 'sprints:update');

    const effectiveStart = input.startDate !== undefined ? input.startDate : sprint.startDate;
    const effectiveEnd = input.endDate !== undefined ? input.endDate : sprint.endDate;
    this.validateDates(effectiveStart, effectiveEnd);

    // If starting sprint, enforce only ONE active sprint per project (no overlapping active sprints)
    if (input.status === 'ACTIVE' && sprint.status !== 'ACTIVE') {
      const activeSprint = await prisma.sprint.findFirst({
        where: {
          projectId: project.id,
          status: 'ACTIVE',
          id: { not: sprintId },
        },
      });

      if (activeSprint) {
        throw new BadRequestError('An active sprint already exists for this project');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If completing sprint: move unfinished tasks back to BACKLOG
      if (input.status === 'COMPLETED' && sprint.status !== 'COMPLETED') {
        const sprintTasks = await tx.sprintTask.findMany({
          where: { sprintId },
          include: { task: true },
        });

        const unfinishedTasks = sprintTasks.filter((st) => st.task && st.task.status !== 'DONE');

        for (const st of unfinishedTasks) {
          await tx.task.update({
            where: { id: st.taskId },
            data: {
              status: 'BACKLOG',
              version: { increment: 1 },
            },
          });

          await tx.activityLog.create({
            data: {
              workspaceId: project.workspaceId,
              projectId: project.id,
              taskId: st.taskId,
              actorId: userId,
              action: 'TASK_STATUS_CHANGED',
              metadata: {
                fromStatus: st.task.status,
                toStatus: 'BACKLOG',
                reason: 'Sprint completed: unfinished task moved to backlog',
              },
            },
          });
        }
      }

      const freshSprint = await tx.sprint.update({
        where: { id: sprintId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: {
          sprintTasks: {
            include: {
              task: {
                include: {
                  assignee: true,
                },
              },
            },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          actorId: userId,
          action: input.status === 'COMPLETED' ? 'SPRINT_COMPLETED' : 'SPRINT_UPDATED',
          metadata: {
            sprintId,
            name: freshSprint.name,
            status: freshSprint.status,
          },
        },
      });

      if (transactionHook) {
        await transactionHook(tx);
      }

      return freshSprint;
    });

    const response = this.mapSprintToResponse(updated as unknown as SprintWithTasks);
    socketService.emitSprintUpdated(project.id, response);
    return response;
  }

  /**
   * Deletes a sprint (cascades sprint tasks).
   */
  public async deleteSprint(
    userId: string,
    sprintId: string,
    transactionHook?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    const { sprint, project, membership } = await this.getSprintAndMembershipOrThrow(userId, sprintId);
    assertPermission(membership.role as Role, 'sprints:delete');

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          actorId: userId,
          action: 'SPRINT_DELETED',
          metadata: {
            sprintId,
            name: sprint.name,
          },
        },
      });

      await tx.sprintTask.deleteMany({
        where: { sprintId },
      });

      await tx.sprint.delete({
        where: { id: sprintId },
      });

      if (transactionHook) {
        await transactionHook(tx);
      }
    });

    socketService.emitSprintDeleted(project.id, sprintId);
  }

  /**
   * Adds a task to a sprint. Task must belong to the same project.
   */
  public async addTaskToSprint(
    userId: string,
    sprintId: string,
    taskId: string,
  ): Promise<SprintResponse> {
    const { project, membership } = await this.getSprintAndMembershipOrThrow(userId, sprintId);
    assertPermission(membership.role as Role, 'sprints:update');

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || task.projectId !== project.id) {
      throw new BadRequestError('Task does not exist or does not belong to the project');
    }

    // Upsert sprint task relation
    await prisma.sprintTask.upsert({
      where: {
        sprintId_taskId: {
          sprintId,
          taskId,
        },
      },
      create: {
        sprintId,
        taskId,
      },
      update: {},
    });

    const updated = await this.getSprintById(userId, sprintId);
    socketService.emitSprintUpdated(project.id, updated);
    return updated;
  }

  /**
   * Removes a task from a sprint.
   */
  public async removeTaskFromSprint(
    userId: string,
    sprintId: string,
    taskId: string,
  ): Promise<SprintResponse> {
    const { project, membership } = await this.getSprintAndMembershipOrThrow(userId, sprintId);
    assertPermission(membership.role as Role, 'sprints:update');

    await prisma.sprintTask.deleteMany({
      where: {
        sprintId,
        taskId,
      },
    });

    const updated = await this.getSprintById(userId, sprintId);
    socketService.emitSprintUpdated(project.id, updated);
    return updated;
  }
}

export const sprintsService = new SprintsService();
