import { Router } from 'express';
import { updateTaskSchema, moveTaskSchema } from '@sprintflow/shared';
import { tasksController } from './tasks.controller';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';

export const tasksRouter = Router();

// All task routes require authentication
tasksRouter.use(authenticate);

tasksRouter.get('/:id', tasksController.getTask.bind(tasksController));

tasksRouter.patch(
  '/:id/move',
  validate({ body: moveTaskSchema }),
  tasksController.moveTask.bind(tasksController),
);

tasksRouter.patch(
  '/:id',
  validate({ body: updateTaskSchema }),
  tasksController.updateTask.bind(tasksController),
);

tasksRouter.delete('/:id', tasksController.deleteTask.bind(tasksController));
