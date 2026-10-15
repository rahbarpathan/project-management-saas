import { EventEmitter } from 'node:events';
import { Prisma } from '@prisma/client';
import {
  CreateTaskInput,
  UpdateTaskInput,
  MoveTaskInput,
  TaskPaginationQuery,
  TaskResponse,
  TaskListResponse,
  TaskStatus,
  TaskPriority,
  Role,
} from '@sprintflow/shared';
import { prisma } from '../../db/prisma';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '../../common/errors/app-error';
import { assertPermission } from '../../common/permissions';
import {
  calculateFractionalPosition,
  generateRebalancedPositions,
  POSITION_STEP,
} from './position';

export type TaskEventType = 'TASK_CREATED' | 'TASK_UPDATED' | 'TASK_MOVED' | 'TASK_DELETED';

export interface TaskEventPayload {
  type: TaskEventType;
  workspaceId: string;
  projectId: string;
  actorId: string;
  task: TaskResponse | { id: string; projectId: string };
  timestamp: string;
}

export const taskEventEmitter = new EventEmitter();

export interface TaskWithAssignee {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | string | null;
  position: unknown;
  version: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  assignee?: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
}

export class TasksService {
  /**
   * Helper to map a Prisma Task record (with Decimal position) to TaskResponse.
   */
  public mapTaskToResponse(task: TaskWithAssignee): TaskResponse {
    return {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      status: task.status as TaskStatus,
      priority: task.priority as TaskPriority,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate ? (task.dueDate instanceof Date ? task.dueDate.toISOString() : task.dueDate) : null,
      position: typeof task.position === 'object' && task.position !== null ? Number(task.position) : Number(task.position || 0),
      version: task.version,
      createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt,
      updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt,
      assignee: task.assignee
        ? {
            id: task.assignee.id,
            email: task.assignee.email,
            name: task.assignee.name,
            avatarUrl: task.assignee.avatarUrl,
            createdAt: task.assignee.createdAt instanceof Date ? task.assignee.createdAt.toISOString() : task.assignee.createdAt,
            updatedAt: task.assignee.updatedAt instanceof Date ? task.assignee.updatedAt.toISOString() : task.assignee.updatedAt,
          }
        : null,
    };
  }

  /**
   * Resolves project -> workspace -> membership.
   * Throws NotFoundError if project does not exist OR if user is not a member of the workspace,
   * guaranteeing cross-workspace isolation.
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
   * Resolves task -> project -> workspace -> membership.
   * Throws NotFoundError if task does not exist OR if user is not a member of the workspace.
   */
  public async getTaskAndMembershipOrThrow(userId: string, taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          include: { workspace: true },
        },
        assignee: true,
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
   * Validates that an assignee belongs to the project's workspace.
   */
  private async validateAssigneeMembership(workspaceId: string, assigneeId: string | null | undefined): Promise<void> {
    if (!assigneeId) return;

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: assigneeId,
        },
      },
    });

    if (!member) {
      throw new BadRequestError('Assignee must be a member of the workspace');
    }
  }

  /**
   * Emits a post-commit event.
   */
  private emitEvent(payload: TaskEventPayload): void {
    taskEventEmitter.emit('task:event', payload);
  }

  /**
   * Creates a new task in a project.
   * Assignee must be a workspace member.
   * Position is calculated at the end of the specified status column.
   * Task and ActivityLog row are created in ONE transaction.
   */
  public async createTask(
    userId: string,
    projectId: string,
    input: CreateTaskInput,
    transactionHook?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<TaskResponse> {
    const { project, membership } = await this.getProjectAndMembershipOrThrow(userId, projectId);
    assertPermission(membership.role as Role, 'tasks:create');

    if (input.assigneeId) {
      await this.validateAssigneeMembership(project.workspaceId, input.assigneeId);
    }

    const status = input.status || 'BACKLOG';

    // Calculate initial position: max in status column + POSITION_STEP
    const maxTask = await prisma.task.findFirst({
      where: { projectId, status },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const newPosition = maxTask ? Number(maxTask.position) + POSITION_STEP : POSITION_STEP;

    const createdTask = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          projectId,
          title: input.title,
          description: input.description,
          status,
          priority: input.priority || 'MEDIUM',
          assigneeId: input.assigneeId,
          dueDate: input.dueDate,
          position: newPosition,
        },
        include: {
          assignee: true,
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId,
          taskId: task.id,
          actorId: userId,
          action: 'TASK_CREATED',
          metadata: {
            title: task.title,
            status: task.status,
            priority: task.priority,
          },
        },
      });

      if (transactionHook) {
        await transactionHook(tx);
      }

      return task;
    });

    const response = this.mapTaskToResponse(createdTask);

    this.emitEvent({
      type: 'TASK_CREATED',
      workspaceId: project.workspaceId,
      projectId,
      actorId: userId,
      task: response,
      timestamp: new Date().toISOString(),
    });

    return response;
  }

  /**
   * Lists tasks in a project with title search, filters, sorting, and pagination.
   */
  public async listProjectTasks(
    userId: string,
    projectId: string,
    query: TaskPaginationQuery,
  ): Promise<TaskListResponse> {
    const { membership } = await this.getProjectAndMembershipOrThrow(userId, projectId);
    assertPermission(membership.role as Role, 'tasks:read');

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      projectId,
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.dueDateFrom || query.dueDateTo
        ? {
            dueDate: {
              ...(query.dueDateFrom ? { gte: query.dueDateFrom } : {}),
              ...(query.dueDateTo ? { lte: query.dueDateTo } : {}),
            },
          }
        : {}),
    };

    const total = await prisma.task.count({ where });

    const sortOrder = query.sortOrder || 'asc';
    let orderBy: Prisma.TaskOrderByWithRelationInput[];

    switch (query.sortBy) {
      case 'createdAt':
        orderBy = [{ createdAt: sortOrder }];
        break;
      case 'dueDate':
        orderBy = [{ dueDate: sortOrder }, { createdAt: 'desc' }];
        break;
      case 'priority':
        orderBy = [{ priority: sortOrder }, { position: 'asc' }];
        break;
      case 'title':
        orderBy = [{ title: sortOrder }, { position: 'asc' }];
        break;
      case 'position':
      default:
        orderBy = [{ position: sortOrder }, { createdAt: 'asc' }];
        break;
    }

    const tasks = await prisma.task.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        assignee: true,
      },
    });

    return {
      tasks: tasks.map((t) => this.mapTaskToResponse(t)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single task by ID.
   */
  public async getTaskById(userId: string, taskId: string): Promise<TaskResponse> {
    const { task, membership } = await this.getTaskAndMembershipOrThrow(userId, taskId);
    assertPermission(membership.role as Role, 'tasks:read');

    return this.mapTaskToResponse(task);
  }

  /**
   * Updates task details with optimistic concurrency control.
   * REQUIRES expected `version`.
   * Throws 409 Conflict if task version has changed.
   * Task and ActivityLog row updated/created in ONE transaction.
   */
  public async updateTask(
    userId: string,
    taskId: string,
    input: UpdateTaskInput,
    transactionHook?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<TaskResponse> {
    const { task, project, membership } = await this.getTaskAndMembershipOrThrow(userId, taskId);
    assertPermission(membership.role as Role, 'tasks:update');

    if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
      await this.validateAssigneeMembership(project.workspaceId, input.assigneeId);
    }

    const expectedVersion = input.version;

    const updatedTask = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.TaskUpdateInput = {
        version: { increment: 1 },
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined
          ? input.assigneeId
            ? { assignee: { connect: { id: input.assigneeId } } }
            : { assignee: { disconnect: true } }
          : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      };

      // Perform optimistic concurrency check
      const updateResult = await tx.task.updateMany({
        where: {
          id: taskId,
          version: expectedVersion,
        },
        data: updateData,
      });

      if (updateResult.count === 0) {
        // Optimistic concurrency collision - retrieve latest state for 409 response
        const staleTask = await tx.task.findUnique({
          where: { id: taskId },
          include: { assignee: true },
        });

        if (!staleTask) {
          throw new NotFoundError('Task not found');
        }

        throw new ConflictError('Task has been modified by another user', {
          currentTask: this.mapTaskToResponse(staleTask),
        });
      }

      // Fetch the updated task within the same transaction
      const freshTask = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: { assignee: true },
      });

      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          taskId,
          actorId: userId,
          action: 'TASK_UPDATED',
          metadata: {
            title: freshTask.title,
            status: freshTask.status,
            priority: freshTask.priority,
            version: freshTask.version,
          },
        },
      });

      if (transactionHook) {
        await transactionHook(tx);
      }

      return freshTask;
    });

    const response = this.mapTaskToResponse(updatedTask);

    this.emitEvent({
      type: 'TASK_UPDATED',
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorId: userId,
      task: response,
      timestamp: new Date().toISOString(),
    });

    return response;
  }

  /**
   * Moves a task to a target status and fractional position between two neighbors.
   * Triggers column rebalancing if gaps between positions become too narrow.
   * REQUIRES expected `version`. Throws 409 Conflict if stale.
   * Entire move and ActivityLog occur in ONE transaction.
   */
  public async moveTask(
    userId: string,
    taskId: string,
    input: MoveTaskInput,
    transactionHook?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<TaskResponse> {
    const { task, project, membership } = await this.getTaskAndMembershipOrThrow(userId, taskId);
    assertPermission(membership.role as Role, 'tasks:update');

    const expectedVersion = input.version;
    const targetStatus = input.status || task.status;

    const movedTask = await prisma.$transaction(async (tx) => {
      // 1. Resolve neighbors in target column
      let prevPos: number | null = null;
      let nextPos: number | null = null;

      if (input.prevTaskId) {
        const prevTask = await tx.task.findUnique({
          where: { id: input.prevTaskId },
          select: { id: true, projectId: true, status: true, position: true },
        });
        if (!prevTask || prevTask.projectId !== project.id || prevTask.status !== targetStatus) {
          throw new BadRequestError('Previous task neighbor does not exist in target status column');
        }
        prevPos = Number(prevTask.position);
      }

      if (input.nextTaskId) {
        const nextTask = await tx.task.findUnique({
          where: { id: input.nextTaskId },
          select: { id: true, projectId: true, status: true, position: true },
        });
        if (!nextTask || nextTask.projectId !== project.id || nextTask.status !== targetStatus) {
          throw new BadRequestError('Next task neighbor does not exist in target status column');
        }
        nextPos = Number(nextTask.position);
      }

      // 2. Compute fractional position
      const posResult = calculateFractionalPosition({
        prevPosition: prevPos,
        nextPosition: nextPos,
      });

      let finalPosition = posResult.position;

      // 3. Handle column rebalance if needed
      if (posResult.needsRebalance) {
        // Fetch existing tasks in target column (excluding moving task)
        const siblingTasks = await tx.task.findMany({
          where: {
            projectId: project.id,
            status: targetStatus,
            id: { not: taskId },
          },
          orderBy: { position: 'asc' },
          select: { id: true },
        });

        const orderedIds: string[] = [];
        let inserted = false;

        for (const sibling of siblingTasks) {
          if (!inserted && input.prevTaskId && sibling.id === input.prevTaskId) {
            orderedIds.push(sibling.id);
            orderedIds.push(taskId);
            inserted = true;
            continue;
          }
          if (!inserted && input.nextTaskId && sibling.id === input.nextTaskId) {
            orderedIds.push(taskId);
            orderedIds.push(sibling.id);
            inserted = true;
            continue;
          }
          orderedIds.push(sibling.id);
        }

        if (!inserted) {
          // If neither neighbour matched or both were null (e.g. at head or tail)
          if (input.prevTaskId) {
            orderedIds.push(taskId);
          } else {
            orderedIds.unshift(taskId);
          }
        }

        const rebalanced = generateRebalancedPositions(orderedIds);

        // Update all siblings in transaction
        for (const item of rebalanced) {
          if (item.id === taskId) {
            finalPosition = item.position;
          } else {
            await tx.task.update({
              where: { id: item.id },
              data: { position: item.position },
            });
          }
        }
      }

      // 4. Update the target task with optimistic concurrency check
      const updateResult = await tx.task.updateMany({
        where: {
          id: taskId,
          version: expectedVersion,
        },
        data: {
          status: targetStatus,
          position: finalPosition,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const staleTask = await tx.task.findUnique({
          where: { id: taskId },
          include: { assignee: true },
        });

        if (!staleTask) {
          throw new NotFoundError('Task not found');
        }

        throw new ConflictError('Task has been modified by another user', {
          currentTask: this.mapTaskToResponse(staleTask),
        });
      }

      const freshTask = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: { assignee: true },
      });

      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          taskId,
          actorId: userId,
          action: 'TASK_MOVED',
          metadata: {
            fromStatus: task.status,
            toStatus: targetStatus,
            position: finalPosition,
            version: freshTask.version,
          },
        },
      });

      if (transactionHook) {
        await transactionHook(tx);
      }

      return freshTask;
    });

    const response = this.mapTaskToResponse(movedTask);

    this.emitEvent({
      type: 'TASK_MOVED',
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorId: userId,
      task: response,
      timestamp: new Date().toISOString(),
    });

    return response;
  }

  /**
   * Deletes a task deliberately with comments cascade in ONE transaction.
   * Emits post-commit deletion event.
   */
  public async deleteTask(
    userId: string,
    taskId: string,
    transactionHook?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    const { task, project, membership } = await this.getTaskAndMembershipOrThrow(userId, taskId);
    assertPermission(membership.role as Role, 'tasks:delete');

    await prisma.$transaction(async (tx) => {
      // 1. Log activity log entry
      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          actorId: userId,
          action: 'TASK_DELETED',
          metadata: {
            taskId: task.id,
            title: task.title,
            status: task.status,
          },
        },
      });

      // 2. Cascade comments
      await tx.comment.deleteMany({
        where: { taskId },
      });

      // 3. Cascade sprint tasks
      await tx.sprintTask.deleteMany({
        where: { taskId },
      });

      // 4. Delete task
      await tx.task.delete({
        where: { id: taskId },
      });

      if (transactionHook) {
        await transactionHook(tx);
      }
    });

    this.emitEvent({
      type: 'TASK_DELETED',
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorId: userId,
      task: { id: task.id, projectId: project.id },
      timestamp: new Date().toISOString(),
    });
  }
}

export const tasksService = new TasksService();
