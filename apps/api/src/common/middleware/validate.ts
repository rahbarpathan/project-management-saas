import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '../errors/app-error';

export interface RequestValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export function validate(schemas: RequestValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const errorDetails: ValidationErrorDetail[] = [];

    if (schemas.params) {
      const result = await schemas.params.safeParseAsync(req.params);
      if (!result.success) {
        errorDetails.push(...formatZodIssues(result.error, 'params'));
      } else {
        req.params = result.data as Record<string, string>;
      }
    }

    if (schemas.query) {
      const result = await schemas.query.safeParseAsync(req.query);
      if (!result.success) {
        errorDetails.push(...formatZodIssues(result.error, 'query'));
      } else {
        req.query = result.data as Request['query'];
      }
    }

    if (schemas.body) {
      const result = await schemas.body.safeParseAsync(req.body);
      if (!result.success) {
        errorDetails.push(...formatZodIssues(result.error, 'body'));
      } else {
        req.body = result.data;
      }
    }

    if (errorDetails.length > 0) {
      next(new BadRequestError('Validation failed', errorDetails, 'VALIDATION_ERROR'));
      return;
    }

    next();
  };
}

function formatZodIssues(error: ZodError, target: 'body' | 'params' | 'query'): ValidationErrorDetail[] {
  return error.issues.map((issue) => {
    const pathString = issue.path.join('.');
    const field = pathString ? `${target}.${pathString}` : target;
    return {
      field,
      message: issue.message,
    };
  });
}
