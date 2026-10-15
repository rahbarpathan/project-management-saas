import { Router } from 'express';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  addMemberSchema,
  updateMemberRoleSchema,
  createProjectSchema,
  projectPaginationQuerySchema,
} from '@sprintflow/shared';
import { workspacesController } from './workspaces.controller';
import { projectsController } from '../projects';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';

export const workspacesRouter = Router();

// All workspace routes require an authenticated user
workspacesRouter.use(authenticate);

workspacesRouter.get('/', workspacesController.listWorkspaces.bind(workspacesController));

workspacesRouter.post(
  '/',
  validate({ body: createWorkspaceSchema }),
  workspacesController.createWorkspace.bind(workspacesController),
);

workspacesRouter.get('/:id', workspacesController.getWorkspace.bind(workspacesController));

workspacesRouter.patch(
  '/:id',
  validate({ body: updateWorkspaceSchema }),
  workspacesController.updateWorkspace.bind(workspacesController),
);

workspacesRouter.delete('/:id', workspacesController.deleteWorkspace.bind(workspacesController));

// Member management routes
workspacesRouter.get('/:id/members', workspacesController.listMembers.bind(workspacesController));

workspacesRouter.post(
  '/:id/members',
  validate({ body: addMemberSchema }),
  workspacesController.addMember.bind(workspacesController),
);

workspacesRouter.patch(
  '/:id/members/:memberId',
  validate({ body: updateMemberRoleSchema }),
  workspacesController.updateMemberRole.bind(workspacesController),
);

workspacesRouter.delete(
  '/:id/members/:memberId',
  workspacesController.removeMember.bind(workspacesController),
);

// Project management routes under workspace
workspacesRouter.get(
  '/:id/projects',
  validate({ query: projectPaginationQuerySchema }),
  projectsController.listProjects.bind(projectsController),
);

workspacesRouter.post(
  '/:id/projects',
  validate({ body: createProjectSchema }),
  projectsController.createProject.bind(projectsController),
);
