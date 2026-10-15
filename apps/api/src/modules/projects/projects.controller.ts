import { Request, Response, NextFunction } from 'express';
import {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectPaginationQuery,
} from '@sprintflow/shared';
import { projectsService } from './projects.service';
import { BadRequestError, UnauthorizedError } from '../../common/errors/app-error';

export class ProjectsController {
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

  public async listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      const query = req.query as unknown as ProjectPaginationQuery;
      const result = await projectsService.listProjects(userId, workspaceId, query);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      const input = req.body as CreateProjectInput;
      const project = await projectsService.createProject(userId, workspaceId, input);

      res.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  }

  public async getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const projectId = this.getParam(req, 'id');
      const project = await projectsService.getProjectById(userId, projectId);

      res.status(200).json({ project });
    } catch (error) {
      next(error);
    }
  }

  public async updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const projectId = this.getParam(req, 'id');
      const input = req.body as UpdateProjectInput;
      const project = await projectsService.updateProject(userId, projectId, input);

      res.status(200).json({ project });
    } catch (error) {
      next(error);
    }
  }

  public async deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const projectId = this.getParam(req, 'id');
      await projectsService.deleteProject(userId, projectId);

      res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const projectsController = new ProjectsController();
