import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for SprintFlow SaaS.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Sequential execution for predictable collaboration and database state
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_WEBSERVER
    ? undefined
    : [
        {
          command: 'pnpm exec tsx e2e/test-server.ts',
          url: 'http://localhost:4000/health',
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
        {
          command: 'pnpm --filter @sprintflow/web dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
      ],
});
