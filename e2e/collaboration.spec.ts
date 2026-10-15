import { test, expect } from '@playwright/test';

test.describe('End-to-End Collaboration & Real-Time Sync', () => {
  test('register -> create workspace -> project -> task -> second browser context sees live update', async ({
    browser,
  }) => {
    // -------------------------------------------------------------
    // CONTEXT 1: Primary User (Register -> Create Workspace -> Project)
    // -------------------------------------------------------------
    const primaryContext = await browser.newContext();
    const page = await primaryContext.newPage();

    const uniqueEmail = `ada.${Date.now()}@sprintflow.dev`;
    const password = 'Password123!';

    // 1. Register new user (Ada Lovelace)
    await page.goto('/register');
    await page.fill('input[name="name"]', 'Ada Lovelace');
    await page.fill('input[name="email"]', uniqueEmail);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL((url) => !url.pathname.includes('/register'), { timeout: 15000 });

    // 2. Create Workspace
    const getStartedBtn = page.locator('#get-started-create-workspace');
    await expect(getStartedBtn).toBeVisible({ timeout: 10000 });
    await getStartedBtn.click();

    // Fill workspace modal
    const wsDialog = page.locator('[role="dialog"]');
    await expect(wsDialog).toBeVisible();
    await expect(wsDialog.locator('h2#modal-title')).toHaveText('Create New Workspace');
    await wsDialog.locator('input[placeholder="e.g. Acme Corp or Mobile App"]').fill('Cosmic Systems');
    await wsDialog.locator('button:has-text("Create Workspace")').click();

    // 3. Create Project
    await page.waitForURL(/\/workspaces\/[^/]+\/projects/, { timeout: 15000 });
    const createProjectBtn = page.locator('#create-project-button');
    await expect(createProjectBtn).toBeVisible();
    await createProjectBtn.click();

    const prjDialog = page.locator('[role="dialog"]');
    await expect(prjDialog).toBeVisible();
    await expect(prjDialog.locator('h2#modal-title')).toHaveText('Create New Project');
    await prjDialog.locator('input[placeholder="e.g. Website Redesign"]').fill('Telescope Array');
    await prjDialog.locator('input[placeholder="e.g. WEB or PRJ"]').fill('STAR');
    await prjDialog.locator('button:has-text("Create Project")').click();

    // 4. Arrive at Project Tasks Page
    await page.waitForURL(/\/projects\/[^/]+\/tasks/, { timeout: 15000 });
    const projectTasksUrl = page.url();

    // -------------------------------------------------------------
    // CONTEXT 2: Second Browser Context (Collaborator in Same Project)
    // -------------------------------------------------------------
    const collaboratorContext = await browser.newContext();
    const collabPage = await collaboratorContext.newPage();

    // Context 2 logs in with the registered user in a separate browser context
    await collabPage.goto('/login');
    await collabPage.fill('input[name="email"]', uniqueEmail);
    await collabPage.fill('input[name="password"]', password);
    await collabPage.click('button[type="submit"]');
    await collabPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Context 2 navigates to the shared project tasks page
    await collabPage.goto(projectTasksUrl);
    await collabPage.waitForLoadState('networkidle');

    // -------------------------------------------------------------
    // LIVE UPDATE TEST: Context 1 creates task, Context 2 sees it live
    // -------------------------------------------------------------
    const taskTitle = `Calibrate Infrared Sensor ${Date.now()}`;

    // Context 1 creates a new task
    const addTaskBtn = page.locator('#create-task-button');
    await expect(addTaskBtn).toBeVisible();
    await addTaskBtn.click();

    const taskDialog = page.locator('[role="dialog"]');
    await expect(taskDialog).toBeVisible();
    await expect(taskDialog.locator('h2#modal-title')).toHaveText('Create New Task');
    await taskDialog.getByLabel('Title').fill(taskTitle);
    await taskDialog.locator('button:has-text("Create Task")').click();

    // Context 1 sees created task (use .first() for strict mode compliance)
    await expect(page.locator(`text=${taskTitle}`).first()).toBeVisible();

    // Context 2 (second browser context) sees task appear LIVE without page reload!
    await expect(collabPage.locator(`text=${taskTitle}`).first()).toBeVisible({ timeout: 15000 });

    // Clean up browser contexts
    await primaryContext.close();
    await collaboratorContext.close();
  });
});
