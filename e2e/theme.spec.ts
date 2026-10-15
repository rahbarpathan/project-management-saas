import { test, expect } from '@playwright/test';

test.describe('Theme Toggle & Persistence', () => {
  test('toggle theme, reload, theme persists', async ({ page }) => {
    // 1. Visit Login page (which includes ThemeToggle in the header)
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // 2. Locate theme toggle button by accessible aria-label
    const themeButton = page.locator('button[aria-label*="Toggle theme"]');
    await expect(themeButton).toBeVisible();

    // 3. Cycle theme to dark
    // Default mode is system -> 1st click: light -> 2nd click: dark
    await themeButton.click();
    let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (!isDark) {
      await themeButton.click();
      isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    }

    // Assert theme is dark and localStorage was updated
    expect(isDark).toBe(true);
    await expect(page.locator('html')).toHaveClass(/dark/);
    const storedBeforeReload = await page.evaluate(() => localStorage.getItem('sprintflow-theme'));
    expect(storedBeforeReload).toBe('dark');

    // 4. Reload page to test persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 5. Assert dark theme remains applied after full reload
    await expect(page.locator('html')).toHaveClass(/dark/);
    const storedAfterReload = await page.evaluate(() => localStorage.getItem('sprintflow-theme'));
    expect(storedAfterReload).toBe('dark');

    // 6. Toggle back to light and verify persistence again
    await themeButton.click(); // dark -> system
    await themeButton.click(); // system -> light
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('sprintflow-theme'))).toBe('light');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('sprintflow-theme'))).toBe('light');
  });
});
