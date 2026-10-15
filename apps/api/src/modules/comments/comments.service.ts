import { Prisma } from '@prisma/client';
import {
  CreateCommentInput,
  UpdateCommentInput,
  CommentPaginationQuery,
  CommentResponse,
  CommentListResponse,
  Role,
} from '@sprintflow/shared';
import { prisma } from '../../db/prisma';
import { NotFoundError, ForbiddenError } from '../../common/errors/app-error';
import { assertPermission } from '../../common/permissions';

export interface CommentWithAuthor {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  author?: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
}

export class CommentsService {
  private mapCommentToResponse(comment: CommentWithAuthor): CommentResponse {
    return {
      id: comment.id,
      taskId: comment.taskId,
      authorId: comment.authorId,
      content: comment.content,
      createdAt: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt,
      updatedAt: comment.updatedAt instanceof Date ? comment.updatedAt.toISOString() : comment.updatedAt,
      author: comment.author
        ? {
            id: comment.author.id,
            email: comment.author.email,
            name: comment.author.name,
            avatarUrl: comment.author.avatarUrl,
            createdAt: comment.author.createdAt instanceof Date ? comment.author.createdAt.toISOString() : comment.author.createdAt,
            updatedAt: comment.author.updatedAt instanceof Date ? comment.author.updatedAt.toISOString() : comment.author.updatedAt,
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
   * Resolves comment -> task -> project -> workspace -> membership.
   */
  public async getCommentAndMembershipOrThrow(userId: string, commentId: string) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        task: {
          include: {
            project: {
              include: { workspace: true },
            },
          },
        },
        author: true,
      },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: comment.task.project.workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Comment not found');
    }

    return { comment, task: comment.task, project: comment.task.project, membership };
  }

  /**
   * Creates a comment on a task.
   * Viewer gets 403 on comments:create.
   * Comment creation and ActivityLog row happen in ONE transaction.
   */
  public async createComment(
    userId: string,
    taskId: string,
    input: CreateCommentInput,
    transactionHook?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<CommentResponse> {
    const { task, project, membership } = await this.getTaskAndMembershipOrThrow(userId, taskId);
    assertPermission(membership.role as Role, 'comments:create');

    const created = await prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          taskId,
          authorId: userId,
          content: input.content,
        },
        include: {
          author: true,
        },
      });

      const preview =
        comment.content.length > 80 ? `${comment.content.slice(0, 80)}...` : comment.content;

      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          taskId: task.id,
          actorId: userId,
          action: 'COMMENT_CREATED',
          metadata: {
            commentId: comment.id,
            preview,
          },
        },
      });

      if (transactionHook) {
        await transactionHook(tx);
      }

      return comment;
    });

    return this.mapCommentToResponse(created);
  }

  /**
   * Lists comments for a task with pagination.
   * Requires tasks:read permission (Viewers can read).
   */
  public async listTaskComments(
    userId: string,
    taskId: string,
    query: CommentPaginationQuery,
  ): Promise<CommentListResponse> {
    const { membership } = await this.getTaskAndMembershipOrThrow(userId, taskId);
    assertPermission(membership.role as Role, 'tasks:read');

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where = { taskId };

    const total = await prisma.comment.count({ where });

    const items = await prisma.comment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        author: true,
      },
    });

    return {
      comments: items.map((c) => this.mapCommentToResponse(c)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Updates a comment.
   * Only the author can edit their own comment.
   */
  public async updateComment(
    userId: string,
    commentId: string,
    input: UpdateCommentInput,
  ): Promise<CommentResponse> {
    const { comment } = await this.getCommentAndMembershipOrThrow(userId, commentId);

    if (comment.authorId !== userId) {
      throw new ForbiddenError('You can only edit your own comments');
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: {
        content: input.content,
      },
      include: {
        author: true,
      },
    });

    return this.mapCommentToResponse(updated);
  }

  /**
   * Deletes a comment.
   * Authors can delete their own comments; Admin+ can delete any comment.
   * Deletion and ActivityLog row happen in ONE transaction.
   */
  public async deleteComment(
    userId: string,
    commentId: string,
    transactionHook?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    const { comment, project, membership } = await this.getCommentAndMembershipOrThrow(userId, commentId);

    const isAuthor = comment.authorId === userId;
    const isAdminOrOwner = membership.role === 'ADMIN' || membership.role === 'OWNER';

    if (!isAuthor && !isAdminOrOwner) {
      throw new ForbiddenError('You do not have permission to delete this comment');
    }

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          taskId: comment.taskId,
          actorId: userId,
          action: 'COMMENT_DELETED',
          metadata: {
            commentId: comment.id,
            isAuthor,
            deletedByRole: membership.role,
          },
        },
      });

      await tx.comment.delete({
        where: { id: commentId },
      });

      if (transactionHook) {
        await transactionHook(tx);
      }
    });
  }
}

export const commentsService = new CommentsService();
