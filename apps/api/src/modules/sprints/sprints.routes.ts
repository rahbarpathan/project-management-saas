import { Router } from 'express';
import {
  updateSprintSchema,
  addSprintTaskSchema,
} from '@sprintflow/shared';
import { sprintsController } from './sprints.controller';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';

export const sprintsRouter = Router();

sprintsRouter.use(authenticate);

sprintsRouter.get('/:id', sprintsController.getSprintById.bind(sprintsController));

sprintsRouter.patch(
  '/:id',
  validate({ body: updateSprintSchema }),
  sprintsController.updateSprint.bind(sprintsController),
);

sprintsRouter.delete('/:id', sprintsController.deleteSprint.bind(sprintsController));

sprintsRouter.post(
  '/:id/tasks',
  validate({ body: addSprintTaskSchema }),
  sprintsController.addTaskToSprint.bind(sprintsController),
);

sprintsRouter.delete(
  '/:id/tasks/:taskId',
  sprintsController.removeTaskFromSprint.bind(sprintsController),
);

sprintsRouter.delete(
  '/:id/tasks',
  sprintsController.removeTaskFromSprint.bind(sprintsController),
);
