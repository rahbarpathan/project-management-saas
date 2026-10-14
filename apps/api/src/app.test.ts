import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from './app';
import { prisma } from './db/prisma';
import { validate } from './common/middleware/validate';
import { BadRequestError, UnauthorizedError, ForbiddenError, ConflictError } from './common/errors/app-error';

describe('SprintFlow App Foundation', () => {
  let app = createApp();

  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Health and Readiness Probes', () => {
    it('responds to GET /health with 200 and status "ok"', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });

    it('attaches and returns an x-request-id header on GET /health', async () => {
      const response = await request(app).get('/health');
      const reqId = response.headers['x-request-id'];

      expect(reqId).toBeDefined();
      expect(typeof reqId).toBe('string');
      expect(String(reqId).length).toBeGreaterThan(0);
    });

    it('preserves an existing x-request-id passed by the client', async () => {
      const customRequestId = 'test-client-req-id-12345';
      const response = await request(app)
        .get('/health')
        .set('x-request-id', customRequestId);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });

    it('responds to GET /ready with 200 when database connectivity succeeds', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ '?column?': 1 }]);

      const response = await request(app).get('/ready');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ready',
        database: 'connected',
        timestamp: expect.any(String),
      });
    });

    it('responds to GET /ready with 503 when database is down', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection refused'));

      const response = await request(app).get('/ready');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: expect.stringContaining('Database connection failed'),
        },
      });
    });
  });

  describe('Centralized Error Handling & JSON Shape', () => {
    it('returns a consistent JSON shape {error:{code,message}} for 404 routes', async () => {
      const response = await request(app).get('/api/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Cannot GET /api/does-not-exist',
        },
      });
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('returns consistent JSON shape for custom typed AppErrors (400, 401, 403, 409)', async () => {
      const testApp = createApp((r) => {
        r.get('/test/400', () => {
          throw new BadRequestError('Invalid query parameter', { param: 'limit' });
        });
        r.get('/test/401', () => {
          throw new UnauthorizedError('Authentication token expired');
        });
        r.get('/test/403', () => {
          throw new ForbiddenError('Insufficient permissions');
        });
        r.get('/test/409', () => {
          throw new ConflictError('Workspace slug already exists');
        });
      });

      const res400 = await request(testApp).get('/test/400');
      expect(res400.status).toBe(400);
      expect(res400.body).toEqual({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid query parameter',
          details: { param: 'limit' },
        },
      });

      const res401 = await request(testApp).get('/test/401');
      expect(res401.status).toBe(401);
      expect(res401.body.error.code).toBe('UNAUTHORIZED');

      const res403 = await request(testApp).get('/test/403');
      expect(res403.status).toBe(403);
      expect(res403.body.error.code).toBe('FORBIDDEN');

      const res409 = await request(testApp).get('/test/409');
      expect(res409.status).toBe(409);
      expect(res409.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Zod Validation Middleware', () => {
    const sampleSchema = {
      body: z.object({
        name: z.string().min(3, 'Name must be at least 3 characters'),
        email: z.string().email('Invalid email address'),
      }),
      query: z.object({
        limit: z.coerce.number().positive().optional(),
      }),
    };

    const testApp = createApp((r) => {
      r.post(
        '/test/validate',
        validate(sampleSchema),
        (req, res) => {
          res.status(200).json({ success: true, data: req.body });
        },
      );
    });

    it('returns 400 with field-level details when validation fails', async () => {
      const response = await request(testApp)
        .post('/test/validate')
        .send({ name: 'Al', email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: expect.arrayContaining([
            { field: 'body.name', message: 'Name must be at least 3 characters' },
            { field: 'body.email', message: 'Invalid email address' },
          ]),
        },
      });
    });

    it('passes and processes request when validation succeeds', async () => {
      const response = await request(testApp)
        .post('/test/validate')
        .send({ name: 'Alex Vance', email: 'alex@sprintflow.dev' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { name: 'Alex Vance', email: 'alex@sprintflow.dev' },
      });
    });
  });
});
