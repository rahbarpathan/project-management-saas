import { prisma } from '../db/prisma';

export async function resetDatabase(): Promise<void> {
  const tableNames = [
    'refresh_tokens',
    'comments',
    'sprint_tasks',
    'sprints',
    'tasks',
    'activity_logs',
    'projects',
    'workspace_members',
    'workspaces',
    'users',
  ];

  try {
    const formattedTables = tableNames.map((t) => `"${t}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${formattedTables} CASCADE;`);
  } catch {
    // Graceful fallback for test environments without full truncation permissions
    await prisma.refreshToken.deleteMany().catch(() => {});
    await prisma.comment.deleteMany().catch(() => {});
    await prisma.sprintTask.deleteMany().catch(() => {});
    await prisma.sprint.deleteMany().catch(() => {});
    await prisma.task.deleteMany().catch(() => {});
    await prisma.activityLog.deleteMany().catch(() => {});
    await prisma.project.deleteMany().catch(() => {});
    await prisma.workspaceMember.deleteMany().catch(() => {});
    await prisma.workspace.deleteMany().catch(() => {});
    await prisma.user.deleteMany().catch(() => {});
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
