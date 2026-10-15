import { Router } from 'express';
import { updateCommentSchema } from '@sprintflow/shared';
import { commentsController } from './comments.controller';
import { authenticate } from '../../common/middleware/authenticate';
import { validate } from '../../common/middleware/validate';

export const commentsRouter = Router();

// All comment routes require authentication
commentsRouter.use(authenticate);

commentsRouter.patch(
  '/:id',
  validate({ body: updateCommentSchema }),
  commentsController.updateComment.bind(commentsController),
);

commentsRouter.delete('/:id', commentsController.deleteComment.bind(commentsController));
