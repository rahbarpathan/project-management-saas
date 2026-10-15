import { Request, Response, NextFunction } from 'express';
import {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  AddMemberInput,
  UpdateMemberRoleInput,
} from '@sprintflow/shared';
import { workspacesService } from './workspaces.service';
import { BadRequestError, UnauthorizedError } from '../../common/errors/app-error';

export class WorkspacesController {
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

  public async createWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const input = req.body as CreateWorkspaceInput;
      const workspace = await workspacesService.createWorkspace(userId, input);

      res.status(201).json({ workspace });
    } catch (error) {
      next(error);
    }
  }

  public async listWorkspaces(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaces = await workspacesService.listUserWorkspaces(userId);

      res.status(200).json({ workspaces });
    } catch (error) {
      next(error);
    }
  }

  public async getWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      const workspace = await workspacesService.getWorkspaceById(userId, workspaceId);

      res.status(200).json({ workspace });
    } catch (error) {
      next(error);
    }
  }

  public async updateWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      const input = req.body as UpdateWorkspaceInput;
      const workspace = await workspacesService.updateWorkspace(userId, workspaceId, input);

      res.status(200).json({ workspace });
    } catch (error) {
      next(error);
    }
  }

  public async deleteWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      await workspacesService.deleteWorkspace(userId, workspaceId);

      res.status(200).json({ message: 'Workspace deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  public async listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      const members = await workspacesService.listMembers(userId, workspaceId);

      res.status(200).json({ members });
    } catch (error) {
      next(error);
    }
  }

  public async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      const input = req.body as AddMemberInput;
      const member = await workspacesService.addMember(userId, workspaceId, input);

      res.status(201).json({ member });
    } catch (error) {
      next(error);
    }
  }

  public async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      const memberId = this.getParam(req, 'memberId');
      const input = req.body as UpdateMemberRoleInput;
      const member = await workspacesService.updateMemberRole(userId, workspaceId, memberId, input);

      res.status(200).json({ member });
    } catch (error) {
      next(error);
    }
  }

  public async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = this.getAuthenticatedUserId(req);
      const workspaceId = this.getParam(req, 'id');
      const memberId = this.getParam(req, 'memberId');
      await workspacesService.removeMember(userId, workspaceId, memberId);

      res.status(200).json({ message: 'Member removed successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const workspacesController = new WorkspacesController();
