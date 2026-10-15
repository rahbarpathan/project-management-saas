import { Request, Response, NextFunction } from 'express';
import {
  CreateTaskInput,
  UpdateTaskInput,
  MoveTaskInput,
  TaskPaginationQuery,
} from '@sprintflow/shared';
import { tasksService } from './tasks.service';
import { BadRequestError, UnauthorizedError } from '../../common/errors/app-error';

export class TasksController {
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

  public async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const projectId = this.getParam(req, 'id');
      const input = req.body as CreateTaskInput;

      const task = await tasksService.createTask(userId, projectId, input);
      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  }

  public async listProjectTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const projectId = this.getParam(req, 'id');
      const query = req.query as unknown as TaskPaginationQuery;

      const result = await tasksService.listProjectTasks(userId, projectId, query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const taskId = this.getParam(req, 'id');

      const task = await tasksService.getTaskById(userId, taskId);
      res.status(200).json({ task });
    } catch (error) {
      next(error);
    }
  }

  public async updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const taskId = this.getParam(req, 'id');
      const input = req.body as UpdateTaskInput;

      const task = await tasksService.updateTask(userId, taskId, input);
      res.status(200).json({ task });
    } catch (error) {
      next(error);
    }
  }

  public async moveTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const taskId = this.getParam(req, 'id');
      const input = req.body as MoveTaskInput;

      const task = await tasksService.moveTask(userId, taskId, input);
      res.status(200).json({ task });
    } catch (error) {
      next(error);
    }
  }

  public async deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const taskId = this.getParam(req, 'id');

      await tasksService.deleteTask(userId, taskId);
      res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const tasksController = new TasksController();
