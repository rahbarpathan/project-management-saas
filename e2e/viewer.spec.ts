import { test, expect } from '@playwright/test';

test.describe('Role-Based Access Control: Viewer Restrictions', () => {
  test('a viewer cannot edit, create, or modify tasks', async ({ page }) => {
    // 1. Log in as Viewer user (Val Rivera)
    await page.goto('/login');
    await page.fill('input[name="email"]', 'viewer@sprintflow.dev');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // 2. Wait for successful login redirect
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // 3. Navigate directly to project tasks view
    await page.goto('/workspaces/ws-acme-1/projects/prj-plat-1/tasks');
    await page.waitForLoadState('networkidle');

    // 4. Assert "Create Task" button is NOT rendered for Viewer role
    const createTaskBtn = page.locator('#create-task-button');
    await expect(createTaskBtn).not.toBeVisible();

    // 5. Click on an existing task row to open the Task Detail Drawer
    const taskRow = page.locator('tbody tr[role="button"]').first();
    await expect(taskRow).toBeVisible({ timeout: 10000 });
    await taskRow.click();

    // 6. Assert Task Detail Drawer displays the read-only Viewer banner
    const readOnlyBanner = page.locator('text=Viewer mode:');
    await expect(readOnlyBanner).toBeVisible();
    await expect(page.locator('text=You have read-only access to this workspace and its tasks.')).toBeVisible();

    // 7. Assert Title input is disabled for Viewer
    const titleInput = page.getByLabel('Title');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toBeDisabled();

    // 8. Assert Delete button is hidden for Viewer
    const deleteBtn = page.locator('button:has-text("Delete Task")');
    await expect(deleteBtn).not.toBeVisible();

    // 9. Navigate to Kanban Board
    await page.goto('/workspaces/ws-acme-1/projects/prj-plat-1/board');
    await page.waitForLoadState('networkidle');

    // 10. Assert Board New Task header button is NOT rendered
    const boardNewTaskBtn = page.locator('button:has-text("New Task")');
    await expect(boardNewTaskBtn).not.toBeVisible();
  });
});
