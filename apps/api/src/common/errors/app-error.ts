export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: unknown, code = 'BAD_REQUEST') {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown, code = 'UNAUTHORIZED') {
    super(401, code, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown, code = 'FORBIDDEN') {
    super(403, code, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource Not Found', details?: unknown, code = 'NOT_FOUND') {
    super(404, code, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown, code = 'CONFLICT') {
    super(409, code, message, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error', details?: unknown, code = 'INTERNAL_SERVER_ERROR') {
    super(500, code, message, details, false);
  }
}
