import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError, ErrorResponse } from '../errors/app-error';
import { logger } from '../logger';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const requestId = (req.headers['x-request-id'] as string) || (res.getHeader('x-request-id') as string);

  if (err instanceof AppError) {
    const errorBody: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };

    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, `Server Error: ${err.message}`);
    } else {
      logger.warn({ err: { name: err.name, code: err.code, message: err.message, details: err.details }, requestId }, `Client Error [${err.statusCode}]: ${err.message}`);
    }

    res.status(err.statusCode).json(errorBody);
    return;
  }

  // Unhandled / Unexpected Errors
  logger.error({ err, requestId }, `Unhandled Exception: ${err.message}`);

  const fallbackResponse: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  };

  res.status(500).json(fallbackResponse);
};
