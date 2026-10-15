import { Router } from 'express';
import {
  updateProjectSchema,
  createTaskSchema,
  taskPaginationQuerySchema,
} from '@sprintflow/shared';
import { projectsController } from './projects.controller';
import { tasksController } from '../tasks';
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

// Task sub-routes for projects
projectsRouter.get(
  '/:id/tasks',
  validate({ query: taskPaginationQuerySchema }),
  tasksController.listProjectTasks.bind(tasksController),
);

projectsRouter.post(
  '/:id/tasks',
  validate({ body: createTaskSchema }),
  tasksController.createTask.bind(tasksController),
);

