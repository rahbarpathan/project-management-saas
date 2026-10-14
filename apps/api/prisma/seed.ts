import { PrismaClient, Role, TaskPriority, TaskStatus, SprintStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding SprintFlow database...');

  // 1. Create or update 4 Users (one per role archetype)
  const passwordHash = '$2b$10$abcdefghijklmnopqrstuvwxyzA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P'; // Sample hashed placeholder

  const userOwner = await prisma.user.upsert({
    where: { email: 'owner@sprintflow.dev' },
    update: { name: 'Alex Vance (Owner)' },
    create: {
      email: 'owner@sprintflow.dev',
      name: 'Alex Vance (Owner)',
      passwordHash,
    },
  });

  const userAdmin = await prisma.user.upsert({
    where: { email: 'admin@sprintflow.dev' },
    update: { name: 'Sam Taylor (Admin)' },
    create: {
      email: 'admin@sprintflow.dev',
      name: 'Sam Taylor (Admin)',
      passwordHash,
    },
  });

  const userMember = await prisma.user.upsert({
    where: { email: 'member@sprintflow.dev' },
    update: { name: 'Morgan Lee (Member)' },
    create: {
      email: 'member@sprintflow.dev',
      name: 'Morgan Lee (Member)',
      passwordHash,
    },
  });

  const userViewer = await prisma.user.upsert({
    where: { email: 'viewer@sprintflow.dev' },
    update: { name: 'Val Rivera (Viewer)' },
    create: {
      email: 'viewer@sprintflow.dev',
      name: 'Val Rivera (Viewer)',
      passwordHash,
    },
  });

  // 2. Create 2 Workspaces
  const workspaceAcme = await prisma.workspace.upsert({
    where: { slug: 'acme-corp' },
    update: { name: 'Acme Technologies' },
    create: {
      name: 'Acme Technologies',
      slug: 'acme-corp',
    },
  });

  const workspaceStartup = await prisma.workspace.upsert({
    where: { slug: 'startuplab' },
    update: { name: 'StartupLab Incubator' },
    create: {
      name: 'StartupLab Incubator',
      slug: 'startuplab',
    },
  });

  // 3. Create Workspace Memberships
  const memberships = [
    { workspaceId: workspaceAcme.id, userId: userOwner.id, role: Role.OWNER },
    { workspaceId: workspaceAcme.id, userId: userAdmin.id, role: Role.ADMIN },
    { workspaceId: workspaceAcme.id, userId: userMember.id, role: Role.MEMBER },
    { workspaceId: workspaceAcme.id, userId: userViewer.id, role: Role.VIEWER },
    { workspaceId: workspaceStartup.id, userId: userOwner.id, role: Role.OWNER },
    { workspaceId: workspaceStartup.id, userId: userAdmin.id, role: Role.MEMBER },
  ];

  for (const m of memberships) {
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: m.workspaceId,
          userId: m.userId,
        },
      },
      update: { role: m.role },
      create: m,
    });
  }

  // 4. Create 2 Projects
  const projectPlatform = await prisma.project.upsert({
    where: {
      workspaceId_key: {
        workspaceId: workspaceAcme.id,
        key: 'PLAT',
      },
    },
    update: { name: 'Core Cloud Platform' },
    create: {
      workspaceId: workspaceAcme.id,
      name: 'Core Cloud Platform',
      key: 'PLAT',
      description: 'Central microservices backend and web dashboards.',
    },
  });

  const projectMobile = await prisma.project.upsert({
    where: {
      workspaceId_key: {
        workspaceId: workspaceAcme.id,
        key: 'MOBI',
      },
    },
    update: { name: 'Mobile Companion App' },
    create: {
      workspaceId: workspaceAcme.id,
      name: 'Mobile Companion App',
      key: 'MOBI',
      description: 'iOS and Android client for on-the-go sprint management.',
    },
  });

  // 5. Create a Sprint
  const sprintOne = await prisma.sprint.upsert({
    where: { id: '00000000-0000-4000-a000-000000000001' },
    update: { name: 'Sprint 1 - Foundation' },
    create: {
      id: '00000000-0000-4000-a000-000000000001',
      projectId: projectPlatform.id,
      name: 'Sprint 1 - Foundation',
      status: SprintStatus.ACTIVE,
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  // 6. Create ~20 Tasks with deterministic IDs for repeatable idempotent seeding
  const taskDefinitions = [
    // Project Platform Tasks
    { id: '10000000-0000-4000-a000-000000000001', proj: projectPlatform.id, title: 'Set up OAuth2 authentication', status: TaskStatus.DONE, priority: TaskPriority.HIGH, assignee: userOwner.id, pos: 1000 },
    { id: '10000000-0000-4000-a000-000000000002', proj: projectPlatform.id, title: 'Design Postgres schema with Prisma', status: TaskStatus.DONE, priority: TaskPriority.URGENT, assignee: userAdmin.id, pos: 2000 },
    { id: '10000000-0000-4000-a000-000000000003', proj: projectPlatform.id, title: 'Implement JWT refresh token rotation', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, assignee: userMember.id, pos: 3000 },
    { id: '10000000-0000-4000-a000-000000000004', proj: projectPlatform.id, title: 'Configure Pino structured logger', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, assignee: userMember.id, pos: 4000 },
    { id: '10000000-0000-4000-a000-000000000005', proj: projectPlatform.id, title: 'Add real-time Socket.IO gateway', status: TaskStatus.TODO, priority: TaskPriority.HIGH, assignee: userAdmin.id, pos: 5000 },
    { id: '10000000-0000-4000-a000-000000000006', proj: projectPlatform.id, title: 'Build workspace authorization middleware', status: TaskStatus.TODO, priority: TaskPriority.URGENT, assignee: userOwner.id, pos: 6000 },
    { id: '10000000-0000-4000-a000-000000000007', proj: projectPlatform.id, title: 'Implement drag-and-drop task reordering API', status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, assignee: userMember.id, pos: 7000 },
    { id: '10000000-0000-4000-a000-000000000008', proj: projectPlatform.id, title: 'Add rate limiting to auth endpoints', status: TaskStatus.BACKLOG, priority: TaskPriority.LOW, assignee: null, pos: 8000 },
    { id: '10000000-0000-4000-a000-000000000009', proj: projectPlatform.id, title: 'Benchmark Prisma query execution times', status: TaskStatus.BACKLOG, priority: TaskPriority.LOW, assignee: null, pos: 9000 },
    { id: '10000000-0000-4000-a000-000000000010', proj: projectPlatform.id, title: 'Create automated database backup job', status: TaskStatus.BACKLOG, priority: TaskPriority.MEDIUM, assignee: null, pos: 10000 },
    { id: '10000000-0000-4000-a000-000000000011', proj: projectPlatform.id, title: 'Configure OpenTelemetry traces', status: TaskStatus.BACKLOG, priority: TaskPriority.LOW, assignee: null, pos: 11000 },

    // Project Mobile Tasks
    { id: '20000000-0000-4000-a000-000000000001', proj: projectMobile.id, title: 'Initialize React Native / Expo workspace', status: TaskStatus.DONE, priority: TaskPriority.HIGH, assignee: userAdmin.id, pos: 1000 },
    { id: '20000000-0000-4000-a000-000000000002', proj: projectMobile.id, title: 'Integrate shared Zod validation schemas', status: TaskStatus.DONE, priority: TaskPriority.MEDIUM, assignee: userMember.id, pos: 2000 },
    { id: '20000000-0000-4000-a000-000000000003', proj: projectMobile.id, title: 'Implement offline optimistic task updates', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.URGENT, assignee: userOwner.id, pos: 3000 },
    { id: '20000000-0000-4000-a000-000000000004', proj: projectMobile.id, title: 'Design mobile dark mode theme tokens', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.LOW, assignee: userViewer.id, pos: 4000 },
    { id: '20000000-0000-4000-a000-000000000005', proj: projectMobile.id, title: 'Build push notification trigger service', status: TaskStatus.TODO, priority: TaskPriority.HIGH, assignee: userMember.id, pos: 5000 },
    { id: '20000000-0000-4000-a000-000000000006', proj: projectMobile.id, title: 'Add biometrics login (FaceID / Fingerprint)', status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, assignee: null, pos: 6000 },
    { id: '20000000-0000-4000-a000-000000000007', proj: projectMobile.id, title: 'Implement sprint burn-down chart view', status: TaskStatus.BACKLOG, priority: TaskPriority.MEDIUM, assignee: null, pos: 7000 },
    { id: '20000000-0000-4000-a000-000000000008', proj: projectMobile.id, title: 'Configure App Store release pipeline', status: TaskStatus.BACKLOG, priority: TaskPriority.LOW, assignee: null, pos: 8000 },
    { id: '20000000-0000-4000-a000-000000000009', proj: projectMobile.id, title: 'Perform mobile accessibility audit', status: TaskStatus.BACKLOG, priority: TaskPriority.LOW, assignee: null, pos: 9000 },
  ];

  for (const t of taskDefinitions) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: {
        title: t.title,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assignee,
        position: t.pos,
      },
      create: {
        id: t.id,
        projectId: t.proj,
        title: t.title,
        description: `Description for ${t.title}`,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assignee,
        position: t.pos,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Link first 4 tasks to Sprint 1
  for (const taskDef of taskDefinitions.slice(0, 4)) {
    await prisma.sprintTask.upsert({
      where: {
        sprintId_taskId: {
          sprintId: sprintOne.id,
          taskId: taskDef.id,
        },
      },
      update: {},
      create: {
        sprintId: sprintOne.id,
        taskId: taskDef.id,
      },
    });
  }

  // Create sample comment
  await prisma.comment.upsert({
    where: { id: '30000000-0000-4000-a000-000000000001' },
    update: { content: 'Initial schema design verified against business requirements.' },
    create: {
      id: '30000000-0000-4000-a000-000000000001',
      taskId: '10000000-0000-4000-a000-000000000002',
      authorId: userAdmin.id,
      content: 'Initial schema design verified against business requirements.',
    },
  });

  // Create sample activity log
  await prisma.activityLog.upsert({
    where: { id: '40000000-0000-4000-a000-000000000001' },
    update: {},
    create: {
      id: '40000000-0000-4000-a000-000000000001',
      workspaceId: workspaceAcme.id,
      projectId: projectPlatform.id,
      taskId: '10000000-0000-4000-a000-000000000002',
      actorId: userAdmin.id,
      action: 'TASK_UPDATED',
      metadata: { change: 'status changed to DONE' },
    },
  });

  console.log(`Database seeded successfully:
- 4 Users created
- 2 Workspaces created
- 6 Workspace memberships created
- 2 Projects created (PLAT, MOBI)
- 1 Sprint created
- 20 Tasks created (with status, priority, position, assignees)
- Comments and Activity Logs linked
`);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
