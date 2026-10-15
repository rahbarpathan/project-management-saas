import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots');

test.describe('Capture Production Screenshots & Accessibility Audit', () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  async function setDarkTheme(page: Page, isDark: boolean) {
    await page.evaluate((dark: boolean) => {
      localStorage.setItem('sprintflow-theme', dark ? 'dark' : 'light');
      if (dark) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }, isDark);
    await page.waitForTimeout(200);
  }

  async function runAccessibilityAudit(page: Page, screenName: string, theme: string) {
    // Inject axe-core directly to run WCAG 2.1 AA audit
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js',
    });

    const results = await page.evaluate(async () => {
      const axeRunner = (window as unknown as { axe: { run: (opts: unknown) => Promise<{ violations: unknown[]; passes: unknown[] }> } }).axe;
      return await axeRunner.run({
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
      });
    });

    const violations = results.violations.length;
    const passes = results.passes.length;
    const score = Math.round((passes / (passes + violations)) * 100);

    console.log(
      `[Accessibility Audit] Screen: ${screenName} (${theme}) -> Score: ${score}% (${passes} rules passed, ${violations} violations)`,
    );

    return { score, passes, violations };
  }

  test('captures screenshots in light and dark themes and audits accessibility', async ({ page }) => {
    page.setViewportSize({ width: 1440, height: 900 });

    const auditResults: Record<string, number> = {};

    // -------------------------------------------------------------
    // 1. LOGIN SCREEN (Light & Dark)
    // -------------------------------------------------------------
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Light
    await setDarkTheme(page, false);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'login-light.png'), fullPage: true });
    const loginLightAudit = await runAccessibilityAudit(page, 'Login', 'light');
    auditResults['login-light'] = loginLightAudit.score;

    // Dark
    await setDarkTheme(page, true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'login-dark.png'), fullPage: true });
    const loginDarkAudit = await runAccessibilityAudit(page, 'Login', 'dark');
    auditResults['login-dark'] = loginDarkAudit.score;

    // -------------------------------------------------------------
    // LOG IN AS ADMIN FOR AUTHENTICATED SCREENS
    // -------------------------------------------------------------
    await page.fill('input[name="email"]', 'admin@sprintflow.dev');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // -------------------------------------------------------------
    // 2. KANBAN BOARD SCREEN (Light & Dark)
    // -------------------------------------------------------------
    await page.goto('/workspaces/ws-acme-1/projects/prj-plat-1/board');
    await page.waitForLoadState('networkidle');

    // Light
    await setDarkTheme(page, false);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'board-light.png'), fullPage: true });
    const boardLightAudit = await runAccessibilityAudit(page, 'Kanban Board', 'light');
    auditResults['board-light'] = boardLightAudit.score;

    // Dark
    await setDarkTheme(page, true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'board-dark.png'), fullPage: true });
    const boardDarkAudit = await runAccessibilityAudit(page, 'Kanban Board', 'dark');
    auditResults['board-dark'] = boardDarkAudit.score;

    // -------------------------------------------------------------
    // 3. TASK DETAIL DRAWER SCREEN (Light & Dark)
    // -------------------------------------------------------------
    // Click on the first task card to open drawer
    const taskCard = page.locator('text=Setup production healthchecks').first();
    await taskCard.click();
    await expect(page.locator('h2:has-text("Task:")')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);

    // Dark
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'task-drawer-dark.png') });
    const drawerDarkAudit = await runAccessibilityAudit(page, 'Task Drawer', 'dark');
    auditResults['drawer-dark'] = drawerDarkAudit.score;

    // Light
    await setDarkTheme(page, false);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'task-drawer-light.png') });
    const drawerLightAudit = await runAccessibilityAudit(page, 'Task Drawer', 'light');
    auditResults['drawer-light'] = drawerLightAudit.score;

    // Close drawer
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // -------------------------------------------------------------
    // 4. SPRINT PAGE (Light & Dark)
    // -------------------------------------------------------------
    await page.goto('/workspaces/ws-acme-1/projects/prj-plat-1/sprints');
    await page.waitForLoadState('networkidle');

    // Light
    await setDarkTheme(page, false);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'sprint-page-light.png'), fullPage: true });
    const sprintLightAudit = await runAccessibilityAudit(page, 'Sprint Page', 'light');
    auditResults['sprint-light'] = sprintLightAudit.score;

    // Dark
    await setDarkTheme(page, true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'sprint-page-dark.png'), fullPage: true });
    const sprintDarkAudit = await runAccessibilityAudit(page, 'Sprint Page', 'dark');
    auditResults['sprint-dark'] = sprintDarkAudit.score;

    // Save accessibility audit summary to docs/accessibility.json
    fs.writeFileSync(
      path.resolve(process.cwd(), 'docs/accessibility.json'),
      JSON.stringify(auditResults, null, 2),
      'utf-8',
    );
  });
});
