import { Request, Response, NextFunction } from 'express';
import { RegisterInput, LoginInput } from '@sprintflow/shared';
import { authService } from './auth.service';
import { getEnv } from '../../config/env';
import { UnauthorizedError } from '../../common/errors/app-error';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const env = getEnv();
  const isProduction = env.NODE_ENV === 'production';

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export function clearAuthCookies(res: Response): void {
  const env = getEnv();
  const isProduction = env.NODE_ENV === 'production';

  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });

  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

export class AuthController {
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as RegisterInput;
      const result = await authService.register(input);

      setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

      res.status(201).json({
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as LoginInput;
      const result = await authService.login(input);

      setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

      res.status(200).json({
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  }

  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken =
        (req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined) ??
        (req.body?.refreshToken as string | undefined);

      await authService.revokeRefreshToken(refreshToken);
      clearAuthCookies(res);

      res.status(200).json({
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken =
        (req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined) ??
        (req.body?.refreshToken as string | undefined);

      if (!refreshToken) {
        throw new UnauthorizedError('Refresh token required');
      }

      const result = await authService.rotateRefreshToken(refreshToken);

      setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

      res.status(200).json({
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      res.status(200).json({
        user: req.user,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
