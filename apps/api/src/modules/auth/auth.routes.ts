import { Router } from 'express';
import { registerSchema, loginSchema } from '@sprintflow/shared';
import { authController } from './auth.controller';
import { validate } from '../../common/middleware/validate';
import { authRateLimiter } from '../../common/middleware/rate-limiter';
import { authenticate } from '../../common/middleware/authenticate';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  authController.register.bind(authController),
);

authRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  authController.login.bind(authController),
);

authRouter.post('/logout', authController.logout.bind(authController));

authRouter.post('/refresh', authController.refresh.bind(authController));

authRouter.get('/me', authenticate, authController.getMe.bind(authController));
