import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .min(1, 'DATABASE_URL cannot be empty')
    .refine(
      (val) => val.startsWith('postgresql://') || val.startsWith('postgres://'),
      'DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://',
    ),
  TEST_DATABASE_URL: z
    .string()
    .refine(
      (val) => val.startsWith('postgresql://') || val.startsWith('postgres://'),
      'TEST_DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://',
    )
    .optional(),
  CLIENT_URL: z
    .string({ required_error: 'CLIENT_URL is required' })
    .url('CLIENT_URL must be a valid URL')
    .default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be at least 16 characters')
    .default('sprintflow_default_access_secret_key_32_characters_minimum'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 characters')
    .default('sprintflow_default_refresh_secret_key_32_characters_minimum'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function formatEnvIssues(issues: z.ZodIssue[]): string {
  return issues.map((issue) => `  * ${issue.path.join('.') || 'env'}: ${issue.message}`).join('\n');
}

export function loadEnvFileIfPresent(): void {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(process.cwd(), '../api/.env'),
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        break;
      } catch {
        // Fall back gracefully if loading fails
      }
    }
  }
}

export function validateEnv(rawEnv: Record<string, string | undefined>): EnvConfig {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const errorDetails = formatEnvIssues(parsed.error.issues);
    const errorMessage = `[SprintFlow Config Error] Missing or invalid environment variables:\n${errorDetails}\n\nPlease check your .env file against .env.example.`;
    throw new Error(errorMessage);
  }

  return parsed.data;
}

let cachedEnv: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  loadEnvFileIfPresent();

  try {
    cachedEnv = validateEnv(process.env);
    return cachedEnv;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n========================================\n${message}\n========================================\n`);
    if (process.env.NODE_ENV === 'test') {
      throw error;
    }
    process.exit(1);
  }
}

export function resetCachedEnv(): void {
  cachedEnv = null;
}
