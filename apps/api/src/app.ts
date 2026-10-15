import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { HealthResponse } from '@sprintflow/shared';
import { getEnv } from './config/env';
import { prisma } from './db/prisma';
import { logger } from './common/logger';
import { requestIdMiddleware } from './common/middleware/request-id';
import { globalRateLimiter } from './common/middleware/rate-limiter';
import { errorHandler } from './common/middleware/error-handler';
import { NotFoundError, AppError } from './common/errors/app-error';
import { authRouter } from './modules/auth';
import { workspacesRouter } from './modules/workspaces';
import { projectsRouter } from './modules/projects';
import { tasksRouter } from './modules/tasks';
import { commentsRouter } from './modules/comments';
import { sprintsRouter } from './modules/sprints';

export function createApp(customRoutes?: (app: Express) => void): Express {
  const env = getEnv();
  const app = express();

  // 1. Security Headers
  app.use(helmet());

  // 2. Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
    }),
  );

  // 3. Request ID Ingestion & Response Header
  app.use(requestIdMiddleware);

  // 4. Pino HTTP Request Logger
  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => {
          const id = req.headers['x-request-id'];
          return (typeof id === 'string' && id.length > 0 ? id : undefined) ?? 'req-unknown';
        },
        customLogLevel: (res, err) => {
          const status = res.statusCode ?? 200;
          if (status >= 500 || err) return 'error';
          if (status >= 400) return 'warn';
          return 'info';
        },
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      }),
    );
  }

  // 5. Rate Limiting
  app.use(globalRateLimiter);

  // 6. Body & Cookie Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // 7. Core Probes
  // GET /health - Shallow liveness check
  app.get('/health', (_req: Request, res: Response) => {
    const payload: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(payload);
  });

  // GET /ready - Deep readiness check (verifies database connectivity)
  app.get('/ready', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (dbError) {
      const message = dbError instanceof Error ? dbError.message : 'Database ping failed';
      next(new AppError(503, 'SERVICE_UNAVAILABLE', `Database connection failed: ${message}`, undefined, false));
    }
  });

  // Mount module routers
  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/sprints', sprintsRouter);

  // Mount custom / module routes if provided
  if (customRoutes) {
    customRoutes(app);
  }

  // 8. 404 Catch-All Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Cannot ${req.method} ${req.path}`));
  });

  // 9. Centralized Error Handler (must be last)
  app.use(errorHandler);

  return app;
}
