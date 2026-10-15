import { Request, Response, NextFunction } from 'express';
import {
  CreateCommentInput,
  UpdateCommentInput,
  CommentPaginationQuery,
  ActivityPaginationQuery,
} from '@sprintflow/shared';
import { commentsService } from './comments.service';
import { activityService } from './activity.service';
import { BadRequestError, UnauthorizedError } from '../../common/errors/app-error';

export class CommentsController {
  private getAuthenticatedUserId(req: Request): string {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedError('Authentication required');
    }
    return req.user.id;
  }

  private getParam(req: Request, paramName: string): string {
    const val = req.params[paramName];
    if (!val) {
      throw new BadRequestError(`Missing required parameter: ${paramName}`);
    }
    return val;
  }

  public async createComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const taskId = this.getParam(req, 'id');
      const input = req.body as CreateCommentInput;

      const comment = await commentsService.createComment(userId, taskId, input);
      res.status(201).json({ comment });
    } catch (error) {
      next(error);
    }
  }

  public async listTaskComments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const taskId = this.getParam(req, 'id');
      const query = req.query as unknown as CommentPaginationQuery;

      const result = await commentsService.listTaskComments(userId, taskId, query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async updateComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const commentId = this.getParam(req, 'id');
      const input = req.body as UpdateCommentInput;

      const comment = await commentsService.updateComment(userId, commentId, input);
      res.status(200).json({ comment });
    } catch (error) {
      next(error);
    }
  }

  public async deleteComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const commentId = this.getParam(req, 'id');

      await commentsService.deleteComment(userId, commentId);
      res.status(200).json({ message: 'Comment deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  public async getTaskActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const taskId = this.getParam(req, 'id');
      const query = req.query as unknown as ActivityPaginationQuery;

      const result = await activityService.listTaskActivity(userId, taskId, query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getProjectActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const projectId = this.getParam(req, 'id');
      const query = req.query as unknown as ActivityPaginationQuery;

      const result = await activityService.listProjectActivity(userId, projectId, query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const commentsController = new CommentsController();
