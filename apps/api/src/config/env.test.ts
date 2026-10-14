import { describe, it, expect, beforeEach } from 'vitest';
import { validateEnv, resetCachedEnv } from './env';

describe('Environment Config Validation', () => {
  beforeEach(() => {
    resetCachedEnv();
  });

  it('successfully parses valid environment variables and sets defaults', () => {
    const validEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sprintflow_test',
    };

    const config = validateEnv(validEnv);

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(4000);
    expect(config.CLIENT_URL).toBe('http://localhost:3000');
    expect(config.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5432/sprintflow_test',
    );
  });

  it('fails fast with readable error when DATABASE_URL is missing', () => {
    const invalidEnv = {
      NODE_ENV: 'development',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(
      /Missing or invalid environment variables:[\s\S]*DATABASE_URL/i,
    );
  });

  it('fails fast with readable error when DATABASE_URL has invalid scheme', () => {
    const invalidEnv = {
      DATABASE_URL: 'mysql://root:secret@localhost:3306/sprintflow',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(
      /DATABASE_URL must be a valid PostgreSQL connection string/i,
    );
  });

  it('fails fast when PORT is not a valid number', () => {
    const invalidEnv = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sprintflow_dev',
      PORT: 'invalid-port',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/PORT/i);
  });
});
