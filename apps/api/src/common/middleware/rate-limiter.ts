import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { AppError } from '../errors/app-error';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 300, // relaxed in test
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req: Request, _res: Response, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many requests, please try again later.'));
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 10, // strict 10 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req: Request, _res: Response, next) => {
    next(
      new AppError(
        429,
        'TOO_MANY_REQUESTS',
        'Too many authentication attempts from this IP, please try again later.',
      ),
    );
  },
});
