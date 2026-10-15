import { Router } from 'express';
import { updateProjectSchema } from '@sprintflow/shared';
import { projectsController } from './projects.controller';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';

export const projectsRouter = Router();

// All project routes require authentication
projectsRouter.use(authenticate);

projectsRouter.get('/:id', projectsController.getProject.bind(projectsController));

projectsRouter.patch(
  '/:id',
  validate({ body: updateProjectSchema }),
  projectsController.updateProject.bind(projectsController),
);

projectsRouter.delete('/:id', projectsController.deleteProject.bind(projectsController));
