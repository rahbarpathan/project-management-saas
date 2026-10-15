import {
  ActivityPaginationQuery,
  ActivityListResponse,
  ActivityResponse,
  Role,
} from '@sprintflow/shared';
import { prisma } from '../../db/prisma';
import { NotFoundError } from '../../common/errors/app-error';
import { assertPermission } from '../../common/permissions';

export interface ActivityWithActor {
  id: string;
  workspaceId?: string | null;
  projectId: string;
  taskId?: string | null;
  actorId: string;
  action: string;
  metadata: unknown;
  createdAt: Date | string;
  actor?: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
}

export class ActivityService {
  private mapActivityToResponse(act: ActivityWithActor): ActivityResponse {
    return {
      id: act.id,
      workspaceId: act.workspaceId ?? undefined,
      projectId: act.projectId,
      taskId: act.taskId ?? undefined,
      actorId: act.actorId,
      action: act.action,
      metadata: (typeof act.metadata === 'object' && act.metadata !== null ? act.metadata : {}) as Record<string, unknown>,
      createdAt: act.createdAt instanceof Date ? act.createdAt.toISOString() : act.createdAt,
      actor: act.actor
        ? {
            id: act.actor.id,
            email: act.actor.email,
            name: act.actor.name,
            avatarUrl: act.actor.avatarUrl,
            createdAt: act.actor.createdAt instanceof Date ? act.actor.createdAt.toISOString() : act.actor.createdAt,
            updatedAt: act.actor.updatedAt instanceof Date ? act.actor.updatedAt.toISOString() : act.actor.updatedAt,
          }
        : undefined,
    };
  }

  /**
   * Resolves task -> project -> workspace -> membership.
   */
  public async getTaskAndMembershipOrThrow(userId: string, taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: { workspace: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: task.project.workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Task not found');
    }

    return { task, project: task.project, membership };
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
   * Lists activity logs for a task.
   */
  public async listTaskActivity(
    userId: string,
    taskId: string,
    query: ActivityPaginationQuery,
  ): Promise<ActivityListResponse> {
    const { membership } = await this.getTaskAndMembershipOrThrow(userId, taskId);
    assertPermission(membership.role as Role, 'tasks:read');

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where = { taskId };

    const total = await prisma.activityLog.count({ where });

    const items = await prisma.activityLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: true,
      },
    });

    return {
      activities: items.map((a) => this.mapActivityToResponse(a)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Lists activity logs for a project.
   */
  public async listProjectActivity(
    userId: string,
    projectId: string,
    query: ActivityPaginationQuery,
  ): Promise<ActivityListResponse> {
    const { membership } = await this.getProjectAndMembershipOrThrow(userId, projectId);
    assertPermission(membership.role as Role, 'projects:read');

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where = { projectId };

    const total = await prisma.activityLog.count({ where });

    const items = await prisma.activityLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: true,
      },
    });

    return {
      activities: items.map((a) => this.mapActivityToResponse(a)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const activityService = new ActivityService();
