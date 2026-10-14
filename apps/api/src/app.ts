import express, { Express } from 'express';
import cors from 'cors';
import { HealthResponse } from '@sprintflow/shared';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const payload: HealthResponse = {
      status: 'ok',
    };
    res.status(200).json(payload);
  });

  return app;
}
