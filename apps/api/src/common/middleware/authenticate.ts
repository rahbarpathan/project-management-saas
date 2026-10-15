import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors/app-error';
import { getEnv } from '../../config/env';
import { prisma } from '../../db/prisma';

export interface JwtAccessPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const env = getEnv();

  // 1. Extract access token from httpOnly cookie or Authorization header
  let token: string | undefined;

  if (req.cookies && typeof req.cookies.access_token === 'string') {
    token = req.cookies.access_token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }

  if (!token) {
    return next(new UnauthorizedError('Authentication required'));
  }

  // 2. Verify JWT token
  let payload: JwtAccessPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessPayload;
  } catch {
    return next(new UnauthorizedError('Invalid or expired access token'));
  }

  if (!payload || !payload.userId) {
    return next(new UnauthorizedError('Invalid access token payload'));
  }

  // 3. Confirm user still exists
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return next(new UnauthorizedError('User not found'));
    }

    const { passwordHash: _hash, ...safeUser } = user as unknown as { passwordHash?: string } & AuthenticatedUser;
    req.user = safeUser;
    next();
  } catch (error) {
    next(error);
  }
}
