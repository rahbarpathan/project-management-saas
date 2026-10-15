import { test, expect } from '@playwright/test';

test.describe('Optimistic Concurrency & Conflict Detection', () => {
  test('a stale update shows a conflict (409)', async ({ page, request }) => {
    // 1. Log in as Member user (Morgan Lee)
    await page.goto('/login');
    await page.fill('input[name="email"]', 'member@sprintflow.dev');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 2. Navigate to project tasks
    await page.goto('/workspaces/ws-acme-1/projects/prj-plat-1/tasks');
    await page.waitForLoadState('networkidle');

    // 3. Open task drawer for the target task row
    const taskRow = page.locator('tbody tr[role="button"]:has-text("Review permission matrix")').first();
    await expect(taskRow).toBeVisible({ timeout: 10000 });
    await taskRow.click();

    // 4. Extract taskId from URL (?taskId=...)
    await page.waitForURL(/taskId=/, { timeout: 10000 });
    const currentUrl = new URL(page.url());
    const taskId = currentUrl.searchParams.get('taskId') || 'tsk-2';

    // 5. Verify drawer opened with task title input
    const titleInput = page.getByLabel('Title');
    await expect(titleInput).toBeVisible();
    const currentTitle = await titleInput.inputValue();

    // 6. Concurrently mutate the task in the background via authenticated API request
    const loginRes = await request.post('http://localhost:4000/api/auth/login', {
      data: { email: 'admin@sprintflow.dev', password: 'Password123!' },
    });
    expect(loginRes.ok()).toBeTruthy();
    
    const setCookieHeaders = loginRes
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie');
    const cookieHeader = setCookieHeaders.map((h) => h.value.split(';')[0]).join('; ');

    // Direct API mutation increments server version from 1 -> 2 without broadcasting to this client
    const updateRes = await request.patch(`http://localhost:4000/api/tasks/${taskId}?silent=true`, {
      headers: {
        Cookie: cookieHeader,
      },
      data: {
        version: 1,
        title: 'Title mutated concurrently by Admin Sam Taylor',
      },
    });
    expect(updateRes.ok()).toBeTruthy();

    // 7. User in browser now attempts to save their edits using their stale version 1
    await titleInput.fill(`${currentTitle} - Stale User Attempt`);
    const saveButton = page.locator('button:has-text("Save Changes")');
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // 8. Assert Concurrency Conflict alert banner appears in the drawer
    const conflictBanner = page.locator('[role="alert"]');
    await expect(conflictBanner).toBeVisible({ timeout: 10000 });
    await expect(conflictBanner).toContainText('Concurrency Conflict (409)');
    await expect(conflictBanner).toContainText('Conflict: This task was updated by another request');
  });
});
