/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../../app';
import { prisma } from '../../db/prisma';

interface MockUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockRefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

describe('Auth Module Integration Tests', () => {
  let app = createApp();

  // In-memory test store to emulate Prisma operations
  let users: MockUser[] = [];
  let refreshTokens: MockRefreshToken[] = [];

  beforeEach(() => {
    app = createApp();
    users = [];
    refreshTokens = [];

    // Mock prisma.user methods
    vi.spyOn(prisma.user as any, 'findUnique').mockImplementation(async (args: unknown) => {
      const { where, select } = args as {
        where: { email?: string; id?: string };
        select?: Record<string, boolean>;
      };
      const found = users.find((u) => (where.email ? u.email === where.email : u.id === where.id));
      if (!found) return null;

      if (select) {
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) {
            selected[key] = (found as unknown as Record<string, unknown>)[key];
          }
        }
        return selected as never;
      }

      return { ...found } as never;
    });

    vi.spyOn(prisma.user as any, 'create').mockImplementation(async (args: unknown) => {
      const { data, select } = args as {
        data: { email: string; name: string; passwordHash: string };
        select?: Record<string, boolean>;
      };
      const newUser: MockUser = {
        id: `user-${users.length + 1}`,
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.push(newUser);

      if (select) {
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) {
            selected[key] = (newUser as unknown as Record<string, unknown>)[key];
          }
        }
        return selected as never;
      }

      return { ...newUser } as never;
    });

    // Mock prisma.refreshToken methods
    vi.spyOn(prisma.refreshToken as any, 'create').mockImplementation(async (args: unknown) => {
      const { data } = args as { data: { userId: string; token: string; expiresAt: Date } };
      const newToken: MockRefreshToken = {
        id: `token-${refreshTokens.length + 1}`,
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      refreshTokens.push(newToken);
      return { ...newToken } as never;
    });

    vi.spyOn(prisma.refreshToken as any, 'findUnique').mockImplementation(async (args: unknown) => {
      const { where } = args as { where: { token: string } };
      const found = refreshTokens.find((t) => t.token === where.token);
      if (!found) return null;
      const user = users.find((u) => u.id === found.userId);
      return { ...found, user } as never;
    });

    vi.spyOn(prisma.refreshToken as any, 'update').mockImplementation(async (args: unknown) => {
      const { where, data } = args as { where: { id: string }; data: { revokedAt?: Date } };
      const token = refreshTokens.find((t) => t.id === where.id);
      if (token && data.revokedAt !== undefined) {
        token.revokedAt = data.revokedAt;
      }
      return { ...token } as never;
    });

    vi.spyOn(prisma.refreshToken as any, 'updateMany').mockImplementation(async (args: unknown) => {
      const { where, data } = args as {
        where: { userId?: string; token?: string; revokedAt?: null };
        data: { revokedAt?: Date };
      };
      let count = 0;
      for (const t of refreshTokens) {
        const matchesUser = where.userId ? t.userId === where.userId : true;
        const matchesToken = where.token ? t.token === where.token : true;
        const matchesRevoked = where.revokedAt === null ? t.revokedAt === null : true;
        if (matchesUser && matchesToken && matchesRevoked) {
          if (data.revokedAt !== undefined) {
            t.revokedAt = data.revokedAt;
          }
          count++;
        }
      }
      return { count } as never;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('returns 400 when registration password is weak (fails minimum complexity)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Jane Doe',
        email: 'jane@sprintflow.dev',
        password: 'weak',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body.error.details)).toContain('body.password');
    });

    it('successfully registers with a strong password, sets cookies, and never returns passwordHash', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'Jane Doe',
        email: 'jane@sprintflow.dev',
        password: 'StrongPassword123!',
      });

      expect(response.status).toBe(201);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('jane@sprintflow.dev');
      expect(response.body.user.name).toBe('Jane Doe');

      // Password hash must NEVER appear in response body or user object
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(response.body.passwordHash).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');

      // Cookies must be set with httpOnly
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.startsWith('access_token=') && c.includes('HttpOnly'))).toBe(true);
      expect(cookies.some((c) => c.startsWith('refresh_token=') && c.includes('HttpOnly'))).toBe(true);
    });

    it('returns 409 Conflict when attempting to register with an existing email', async () => {
      // First registration
      await request(app).post('/api/auth/register').send({
        name: 'Jane Doe',
        email: 'duplicate@sprintflow.dev',
        password: 'StrongPassword123!',
      });

      // Duplicate registration attempt
      const duplicateRes = await request(app).post('/api/auth/register').send({
        name: 'Another Jane',
        email: 'duplicate@sprintflow.dev',
        password: 'AnotherStrongPassword123!',
      });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error.code).toBe('CONFLICT');
      expect(duplicateRes.body.error.message).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const passwordHash = await bcrypt.hash('CorrectPass123!', 10);
      users.push({
        id: 'user-login-test',
        email: 'existing@sprintflow.dev',
        name: 'Existing User',
        passwordHash,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('returns 401 with generic message when email does not exist (no enumeration)', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@sprintflow.dev',
        password: 'SomePassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('returns 401 with identical generic message when password is wrong', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'existing@sprintflow.dev',
        password: 'WrongPassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('returns 200 with cookies on valid login and never exposes password hash', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'existing@sprintflow.dev',
        password: 'CorrectPass123!',
      });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('existing@sprintflow.dev');
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    });
  });

  describe('POST /api/auth/refresh and Token Rotation', () => {
    it('rotates refresh token and rejects reuse of an old/revoked token', async () => {
      // 1. Register to obtain initial cookies
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Rotation Tester',
        email: 'rotation@sprintflow.dev',
        password: 'StrongPass123!',
      });
      expect(regRes.status).toBe(201);

      const initialCookies = regRes.headers['set-cookie'] as unknown as string[];
      const initialRefreshTokenCookie = initialCookies.find((c) => c.startsWith('refresh_token='));
      expect(initialRefreshTokenCookie).toBeDefined();

      const oldRefreshToken: string = (initialRefreshTokenCookie || '').split(';')[0] || '';

      // 2. Refresh token rotation
      const refreshRes1 = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [oldRefreshToken]);

      expect(refreshRes1.status).toBe(200);
      expect(refreshRes1.body.user.email).toBe('rotation@sprintflow.dev');

      const newCookies = refreshRes1.headers['set-cookie'] as unknown as string[];
      const newRefreshTokenCookie = newCookies.find((c) => c.startsWith('refresh_token='));
      expect(newRefreshTokenCookie).toBeDefined();

      // 3. Attempting to reuse old refresh token MUST be rejected
      const reuseRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [oldRefreshToken]);

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error.code).toBe('UNAUTHORIZED');
      expect(reuseRes.body.error.message).toContain('revoked');
    });

    it('rejects refresh when no token is provided', async () => {
      const response = await request(app).post('/api/auth/refresh');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the refresh token and clears auth cookies', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Logout Tester',
        email: 'logout@sprintflow.dev',
        password: 'StrongPass123!',
      });

      const cookies = regRes.headers['set-cookie'] as unknown as string[];
      const refreshTokenCookie = cookies.find((c) => c.startsWith('refresh_token='));
      expect(refreshTokenCookie).toBeDefined();
      const tokenValue: string = (refreshTokenCookie || '').split(';')[0] || '';

      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [tokenValue]);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toContain('Logged out successfully');

      // Refreshing with the revoked token must fail
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [tokenValue]);

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 when accessing /me unauthenticated', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Authentication required');
    });

    it('returns 200 with user profile when access token cookie is present', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Profile Tester',
        email: 'profile@sprintflow.dev',
        password: 'StrongPass123!',
      });

      const cookies = regRes.headers['set-cookie'] as unknown as string[];
      const accessTokenCookie = cookies.find((c) => c.startsWith('access_token='));
      expect(accessTokenCookie).toBeDefined();
      const tokenValue: string = (accessTokenCookie || '').split(';')[0] || '';

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [tokenValue]);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toBeDefined();
      expect(meRes.body.user.email).toBe('profile@sprintflow.dev');
      expect(meRes.body.user.name).toBe('Profile Tester');
      expect(meRes.body.user.passwordHash).toBeUndefined();
    });

    it('returns 200 with user profile when Authorization Bearer token header is present', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Bearer Tester',
        email: 'bearer@sprintflow.dev',
        password: 'StrongPass123!',
      });

      const cookies = regRes.headers['set-cookie'] as unknown as string[];
      const accessTokenCookie = cookies.find((c) => c.startsWith('access_token='));
      expect(accessTokenCookie).toBeDefined();
      const tokenValue: string = ((accessTokenCookie || '').split(';')[0] || '').replace('access_token=', '');

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenValue}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('bearer@sprintflow.dev');
      expect(meRes.body.user.passwordHash).toBeUndefined();
    });
  });
});
