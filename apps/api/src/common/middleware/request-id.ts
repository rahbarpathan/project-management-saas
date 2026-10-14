import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'];
  const requestId = typeof existingId === 'string' && existingId.length > 0 ? existingId : randomUUID();

  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  next();
}
