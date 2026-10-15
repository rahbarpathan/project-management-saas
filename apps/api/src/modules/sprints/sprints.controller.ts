import { Request, Response, NextFunction } from 'express';
import {
  createSprintSchema,
  updateSprintSchema,
  addSprintTaskSchema,
} from '@sprintflow/shared';
import { sprintsService } from './sprints.service';
import { BadRequestError } from '../../common/errors/app-error';

export class SprintsController {
  public async createSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const projectId = req.params.id as string;
      const parsed = createSprintSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new BadRequestError('Validation failed', parsed.error.flatten());
      }

      const sprint = await sprintsService.createSprint(userId, projectId, parsed.data);
      res.status(201).json({ sprint });
    } catch (err) {
      next(err);
    }
  }

  public async listProjectSprints(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const projectId = req.params.id as string;
      const result = await sprintsService.listProjectSprints(userId, projectId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getSprintById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sprintId = req.params.id as string;
      const sprint = await sprintsService.getSprintById(userId, sprintId);
      res.status(200).json({ sprint });
    } catch (err) {
      next(err);
    }
  }

  public async updateSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sprintId = req.params.id as string;
      const parsed = updateSprintSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new BadRequestError('Validation failed', parsed.error.flatten());
      }

      const sprint = await sprintsService.updateSprint(userId, sprintId, parsed.data);
      res.status(200).json({ sprint });
    } catch (err) {
      next(err);
    }
  }

  public async deleteSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sprintId = req.params.id as string;
      await sprintsService.deleteSprint(userId, sprintId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  public async addTaskToSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sprintId = req.params.id as string;
      const parsed = addSprintTaskSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new BadRequestError('Validation failed', parsed.error.flatten());
      }

      const sprint = await sprintsService.addTaskToSprint(userId, sprintId, parsed.data.taskId);
      res.status(200).json({ sprint });
    } catch (err) {
      next(err);
    }
  }

  public async removeTaskFromSprint(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sprintId = req.params.id as string;
      const taskId = (req.params.taskId || req.body?.taskId) as string;

      if (!taskId) {
        throw new BadRequestError('Task ID is required');
      }

      const sprint = await sprintsService.removeTaskFromSprint(userId, sprintId, taskId);
      res.status(200).json({ sprint });
    } catch (err) {
      next(err);
    }
  }
}

export const sprintsController = new SprintsController();
