import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { RegisterInput, LoginInput, UserResponse } from '@sprintflow/shared';
import { prisma } from '../../db/prisma';
import { getEnv } from '../../config/env';
import { ConflictError, UnauthorizedError } from '../../common/errors/app-error';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: UserResponse;
  tokens: TokenPair;
}

export class AuthService {
  /**
   * Hashes a raw refresh token using SHA-256 for secure storage and constant-time lookup.
   */
  public hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generates a 15-minute JWT access token.
   */
  public generateAccessToken(user: { id: string; email: string }): string {
    const env = getEnv();
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      env.JWT_ACCESS_SECRET,
      {
        expiresIn: '15m',
      },
    );
  }

  /**
   * Generates a high-entropy random refresh token.
   */
  public generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  /**
   * Issues a new access token and rotating refresh token, persisting the hashed refresh token.
   */
  public async issueTokens(user: { id: string; email: string }): Promise<TokenPair> {
    const rawRefreshToken = this.generateRefreshToken();
    const hashedToken = this.hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Register a new user with duplicate email check and password hashing.
   */
  public async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(input.password, saltRounds);

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
      },
      select: USER_SELECT,
    });

    const tokens = await this.issueTokens(user);

    const { passwordHash: _hash, ...safeUser } = user as unknown as { passwordHash?: string } & UserResponse;

    return {
      user: safeUser,
      tokens,
    };
  }

  /**
   * Authenticate a user by credentials without exposing which part was incorrect.
   */
  public async login(input: LoginInput): Promise<AuthResult> {
    const userWithPassword = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        ...USER_SELECT,
        passwordHash: true,
      },
    });

    if (!userWithPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(input.password, userWithPassword.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Strip passwordHash completely before returning or logging
    const { passwordHash: _hash, ...safeUser } = userWithPassword;

    const tokens = await this.issueTokens(safeUser);

    return {
      user: safeUser,
      tokens,
    };
  }

  /**
   * Rotates a refresh token: revokes old token and issues fresh access and refresh tokens.
   * If a revoked token is presented, detects token reuse and invalidates all user refresh tokens.
   */
  public async rotateRefreshToken(rawToken: string): Promise<AuthResult> {
    if (!rawToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    const hashedToken = this.hashRefreshToken(rawToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: hashedToken },
      include: {
        user: {
          select: USER_SELECT,
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Token reuse detection: if already revoked, revoke all tokens for this user
    if (storedToken.revokedAt !== null) {
      await prisma.refreshToken.updateMany({
        where: {
          userId: storedToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    // Expiration check
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Revoke the consumed refresh token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revokedAt: new Date(),
      },
    });

    // Issue new token pair
    const tokens = await this.issueTokens(storedToken.user);

    return {
      user: storedToken.user,
      tokens,
    };
  }

  /**
   * Revoke a refresh token on logout.
   */
  public async revokeRefreshToken(rawToken?: string): Promise<void> {
    if (!rawToken) return;

    const hashedToken = this.hashRefreshToken(rawToken);

    try {
      await prisma.refreshToken.updateMany({
        where: {
          token: hashedToken,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      // Graceful no-op if token not found
    }
  }

  /**
   * Retrieves user profile by ID.
   */
  public async getUserById(userId: string): Promise<UserResponse | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
  }
}

export const authService = new AuthService();
