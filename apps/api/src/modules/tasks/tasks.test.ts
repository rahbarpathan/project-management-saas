/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../db/prisma';
import { getEnv } from '../../config/env';
import { Role, TaskStatus, TaskPriority } from '@sprintflow/shared';
import { tasksService } from './tasks.service';

interface MockUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockWorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

interface MockProject {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: Date | null;
  position: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MockActivityLog {
  id: string;
  workspaceId: string | null;
  projectId: string;
  taskId: string | null;
  actorId: string;
  action: string;
  metadata: any;
  createdAt: Date;
}

function createAuthHeader(user: { id: string; email: string }): string {
  const env = getEnv();
  const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_ACCESS_SECRET, {
    expiresIn: '1h',
  });
  return `Bearer ${token}`;
}

describe('Tasks Module Integration Tests', () => {
  let app = createApp();

  let users: MockUser[] = [];
  let members: MockWorkspaceMember[] = [];
  let projects: MockProject[] = [];
  let tasks: MockTask[] = [];
  let activityLogs: MockActivityLog[] = [];

  const ownerUser: MockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'owner@sprintflow.dev',
    name: 'Owner User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const memberUser: MockUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'member@sprintflow.dev',
    name: 'Member User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const viewerUser: MockUser = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'viewer@sprintflow.dev',
    name: 'Viewer User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const outsiderUser: MockUser = {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'outsider@sprintflow.dev',
    name: 'Outsider User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mainWorkspace: MockWorkspace = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Main Workspace',
    slug: 'main-ws',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const otherWorkspace: MockWorkspace = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Other Workspace',
    slug: 'other-ws',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testProject: MockProject = {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    workspaceId: mainWorkspace.id,
    name: 'Core Engine',
    key: 'CORE',
    description: 'Core project',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    app = createApp();
    users = [{ ...ownerUser }, { ...memberUser }, { ...viewerUser }, { ...outsiderUser }];
    projects = [{ ...testProject }];
    tasks = [];
    activityLogs = [];

    members = [
      { id: 'm-1', workspaceId: mainWorkspace.id, userId: ownerUser.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-2', workspaceId: mainWorkspace.id, userId: memberUser.id, role: 'MEMBER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-3', workspaceId: mainWorkspace.id, userId: viewerUser.id, role: 'VIEWER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-4', workspaceId: otherWorkspace.id, userId: outsiderUser.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
    ];

    // Mock prisma.user
    vi.spyOn(prisma.user as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = users.find((u) => (args.where.id ? u.id === args.where.id : u.email === args.where.email));
      if (!found) return null;
      return { ...found } as never;
    });

    // Mock prisma.workspaceMember
    vi.spyOn(prisma.workspaceMember as any, 'findUnique').mockImplementation(async (args: any) => {
      const target = args.where.workspaceId_userId;
      if (!target) return null;
      const found = members.find((m) => m.workspaceId === target.workspaceId && m.userId === target.userId);
      return (found ? { ...found } : null) as never;
    });

    // Mock prisma.project
    vi.spyOn(prisma.project as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = projects.find((p) => p.id === args.where.id);
      if (!found) return null;
      return {
        ...found,
        workspace: mainWorkspace.id === found.workspaceId ? mainWorkspace : otherWorkspace,
      } as never;
    });

    // Mock prisma.task
    vi.spyOn(prisma.task as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = tasks.find((t) => t.id === args.where.id);
      if (!found) return null;
      const assignee = found.assigneeId ? users.find((u) => u.id === found.assigneeId) : null;
      const project = projects.find((p) => p.id === found.projectId);
      return {
        ...found,
        assignee,
        project: project ? { ...project, workspace: mainWorkspace } : null,
      } as never;
    });

    vi.spyOn(prisma.task as any, 'findUniqueOrThrow').mockImplementation(async (args: any) => {
      const found = tasks.find((t) => t.id === args.where.id);
      if (!found) throw new Error('Task not found');
      const assignee = found.assigneeId ? users.find((u) => u.id === found.assigneeId) : null;
      const project = projects.find((p) => p.id === found.projectId);
      return {
        ...found,
        assignee,
        project: project ? { ...project, workspace: mainWorkspace } : null,
      } as never;
    });

    vi.spyOn(prisma.task as any, 'findFirst').mockImplementation(async (args: any) => {
      const filtered = tasks.filter((t) => {
        let match = true;
        if (args.where.projectId && t.projectId !== args.where.projectId) match = false;
        if (args.where.status && t.status !== args.where.status) match = false;
        return match;
      });
      if (filtered.length === 0) return null;
      if (args.orderBy?.position === 'desc') {
        filtered.sort((a, b) => b.position - a.position);
      } else {
        filtered.sort((a, b) => a.position - b.position);
      }
      return { ...filtered[0] } as never;
    });

    vi.spyOn(prisma.task as any, 'findMany').mockImplementation(async (args: any) => {
      const filtered = tasks.filter((t) => {
        let match = true;
        if (args.where.projectId && t.projectId !== args.where.projectId) match = false;
        if (args.where.status && t.status !== args.where.status) match = false;
        if (args.where.priority && t.priority !== args.where.priority) match = false;
        if (args.where.assigneeId && t.assigneeId !== args.where.assigneeId) match = false;
        if (args.where.id?.not && t.id === args.where.id.not) match = false;
        if (args.where.title?.contains) {
          const search = args.where.title.contains.toLowerCase();
          if (!t.title.toLowerCase().includes(search)) match = false;
        }
        if (args.where.dueDate) {
          if (args.where.dueDate.gte && (!t.dueDate || t.dueDate < args.where.dueDate.gte)) match = false;
          if (args.where.dueDate.lte && (!t.dueDate || t.dueDate > args.where.dueDate.lte)) match = false;
        }
        return match;
      });

      // Sorting
      if (args.orderBy) {
        const orderConfigs = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        filtered.sort((a, b) => {
          for (const config of orderConfigs) {
            const [field, direction] = Object.entries(config)[0] as [keyof MockTask, 'asc' | 'desc'];
            const valA = a[field] ?? '';
            const valB = b[field] ?? '';
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
          }
          return 0;
        });
      }

      const skip = args.skip || 0;
      const take = args.take !== undefined ? args.take : filtered.length;
      const paginated = filtered.slice(skip, skip + take);

      return paginated.map((t) => ({
        ...t,
        assignee: t.assigneeId ? users.find((u) => u.id === t.assigneeId) : null,
      })) as never;
    });

    vi.spyOn(prisma.task as any, 'count').mockImplementation(async (args: any) => {
      const filtered = tasks.filter((t) => {
        let match = true;
        if (args.where.projectId && t.projectId !== args.where.projectId) match = false;
        if (args.where.status && t.status !== args.where.status) match = false;
        if (args.where.priority && t.priority !== args.where.priority) match = false;
        if (args.where.assigneeId && t.assigneeId !== args.where.assigneeId) match = false;
        if (args.where.title?.contains) {
          const search = args.where.title.contains.toLowerCase();
          if (!t.title.toLowerCase().includes(search)) match = false;
        }
        if (args.where.dueDate) {
          if (args.where.dueDate.gte && (!t.dueDate || t.dueDate < args.where.dueDate.gte)) match = false;
          if (args.where.dueDate.lte && (!t.dueDate || t.dueDate > args.where.dueDate.lte)) match = false;
        }
        return match;
      });
      return filtered.length as never;
    });

    vi.spyOn(prisma.task as any, 'create').mockImplementation(async (args: any) => {
      const newTask: MockTask = {
        id: randomUUID(),
        projectId: args.data.projectId,
        title: args.data.title,
        description: args.data.description ?? null,
        status: args.data.status ?? 'BACKLOG',
        priority: args.data.priority ?? 'MEDIUM',
        assigneeId: args.data.assigneeId ?? null,
        dueDate: args.data.dueDate ? new Date(args.data.dueDate) : null,
        position: args.data.position,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tasks.push(newTask);
      return {
        ...newTask,
        assignee: newTask.assigneeId ? users.find((u) => u.id === newTask.assigneeId) : null,
      } as never;
    });

    vi.spyOn(prisma.task as any, 'update').mockImplementation(async (args: any) => {
      const found = tasks.find((t) => t.id === args.where.id);
      if (!found) throw new Error('Task not found');
      if (args.data.position !== undefined) found.position = args.data.position;
      if (args.data.status !== undefined) found.status = args.data.status;
      if (args.data.title !== undefined) found.title = args.data.title;
      found.updatedAt = new Date();
      return {
        ...found,
        assignee: found.assigneeId ? users.find((u) => u.id === found.assigneeId) : null,
      } as never;
    });

    vi.spyOn(prisma.task as any, 'updateMany').mockImplementation(async (args: any) => {
      const { id, version } = args.where;
      const target = tasks.find((t) => t.id === id && t.version === version);
      if (!target) {
        return { count: 0 } as never;
      }
      if (args.data.version?.increment) {
        target.version += args.data.version.increment;
      }
      if (args.data.title !== undefined) target.title = args.data.title;
      if (args.data.description !== undefined) target.description = args.data.description;
      if (args.data.status !== undefined) target.status = args.data.status;
      if (args.data.priority !== undefined) target.priority = args.data.priority;
      if (args.data.position !== undefined) target.position = args.data.position;
      if (args.data.dueDate !== undefined) target.dueDate = args.data.dueDate ? new Date(args.data.dueDate) : null;
      if (args.data.assignee?.connect?.id) {
        target.assigneeId = args.data.assignee.connect.id;
      } else if (args.data.assignee?.disconnect) {
        target.assigneeId = null;
      }
      target.updatedAt = new Date();
      return { count: 1 } as never;
    });

    vi.spyOn(prisma.task as any, 'delete').mockImplementation(async (args: any) => {
      tasks = tasks.filter((t) => t.id !== args.where.id);
      return {} as never;
    });

    // Mock prisma.activityLog
    vi.spyOn(prisma.activityLog as any, 'create').mockImplementation(async (args: any) => {
      const log: MockActivityLog = {
        id: `act-${activityLogs.length + 1}`,
        workspaceId: args.data.workspaceId,
        projectId: args.data.projectId,
        taskId: args.data.taskId ?? null,
        actorId: args.data.actorId,
        action: args.data.action,
        metadata: args.data.metadata,
        createdAt: new Date(),
      };
      activityLogs.push(log);
      return { ...log } as never;
    });

    // Mock cascade targets
    vi.spyOn(prisma.comment as any, 'deleteMany').mockResolvedValue({ count: 0 } as never);
    vi.spyOn(prisma.sprintTask as any, 'deleteMany').mockResolvedValue({ count: 0 } as never);

    // Mock prisma.$transaction with rollback tracking
    vi.spyOn(prisma as any, '$transaction').mockImplementation(async (cb: any) => {
      const taskSnapshot = tasks.map((t) => ({ ...t }));
      const logSnapshot = activityLogs.map((l) => ({ ...l }));
      try {
        const txMock = {
          task: prisma.task,
          activityLog: prisma.activityLog,
          comment: prisma.comment,
          sprintTask: prisma.sprintTask,
        };
        return await cb(txMock);
      } catch (err) {
        // Atomic rollback on failure
        tasks = taskSnapshot;
        activityLogs = logSnapshot;
        throw err;
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Concurrency control: Two simultaneous updates with same version
  describe('Concurrency Control', () => {
    it('allows only one simultaneous update with the same version and rejects the second with 409', async () => {
      // Create initial task
      const createRes = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Concurrent Target Task' });

      expect(createRes.status).toBe(201);
      const taskId = createRes.body.task.id;
      const initialVersion = createRes.body.task.version;
      expect(initialVersion).toBe(1);

      // Perform two simultaneous updates with initialVersion (1)
      const update1Promise = request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ version: initialVersion, title: 'Winner Title' });

      const update2Promise = request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ version: initialVersion, title: 'Loser Title' });

      const [res1, res2] = await Promise.all([update1Promise, update2Promise]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);

      // Verify that the 409 response contains the updated task
      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.error.code).toBe('CONFLICT');
      expect(conflictRes.body.error.details.currentTask).toBeDefined();
      expect(conflictRes.body.error.details.currentTask.version).toBe(2);
    });

    it('rejects update if expected version is omitted (400)', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'No Version Task' });

      const taskId = createRes.body.task.id;

      const res = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Updated without version' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // 2. Validation: Invalid status/priority returns 400
  describe('Validation & Field Constraints', () => {
    it('returns 400 when creating a task with invalid status', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Task with invalid status', status: 'NON_EXISTENT_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });

    it('returns 400 when creating a task with invalid priority', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Task with invalid priority', priority: 'MEGA_HIGH' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 if title is empty string', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 if assignee is not a member of the workspace', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({
          title: 'Task for Outsider',
          assigneeId: outsiderUser.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Assignee must be a member of the workspace/i);
    });
  });

  // 3. RBAC: Viewer gets 403 on every mutation
  describe('Role-Based Access Control', () => {
    let existingTaskId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ title: 'RBAC Seed Task' });
      existingTaskId = res.body.task.id;
    });

    it('denies Viewer from creating a task (403)', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ title: 'Viewer Attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies Viewer from updating a task (403)', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${existingTaskId}`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ version: 1, title: 'Viewer Update Attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies Viewer from moving a task (403)', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${existingTaskId}/move`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ version: 1, status: 'DONE' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies Viewer from deleting a task (403)', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${existingTaskId}`)
        .set('Authorization', createAuthHeader(viewerUser));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Viewer to read tasks (200)', async () => {
      const listRes = await request(app)
        .get(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(viewerUser));

      expect(listRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/tasks/${existingTaskId}`)
        .set('Authorization', createAuthHeader(viewerUser));

      expect(getRes.status).toBe(200);
      expect(getRes.body.task.id).toBe(existingTaskId);
    });

    it('returns 404 when non-member tries to read tasks', async () => {
      const res = await request(app)
        .get(`/api/tasks/${existingTaskId}`)
        .set('Authorization', createAuthHeader(outsiderUser));

      expect(res.status).toBe(404);
    });
  });

  // 4. Filters, sorting, and pagination
  describe('Filtering, Sorting, and Pagination', () => {
    beforeEach(async () => {
      // Seed 5 tasks with varied status, priority, title, dates
      const seedData = [
        { title: 'Alpha Feature', status: 'TODO', priority: 'HIGH', dueDate: '2026-11-01T00:00:00.000Z' },
        { title: 'Beta Bugfix', status: 'IN_PROGRESS', priority: 'URGENT', dueDate: '2026-11-05T00:00:00.000Z' },
        { title: 'Gamma Documentation', status: 'BACKLOG', priority: 'LOW', dueDate: '2026-11-10T00:00:00.000Z' },
        { title: 'Delta Refactoring', status: 'DONE', priority: 'MEDIUM', dueDate: '2026-11-15T00:00:00.000Z' },
        { title: 'Epsilon Feature', status: 'TODO', priority: 'MEDIUM', dueDate: '2026-11-20T00:00:00.000Z' },
      ];

      for (const item of seedData) {
        await request(app)
          .post(`/api/projects/${testProject.id}/tasks`)
          .set('Authorization', createAuthHeader(memberUser))
          .send(item);
      }
    });

    it('filters by title search case-insensitively', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/tasks?search=FEATURE`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
    });

    it('filters by status', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/tasks?status=TODO`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.tasks.every((t: any) => t.status === 'TODO')).toBe(true);
    });

    it('filters by priority', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/tasks?priority=URGENT`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toBe('Beta Bugfix');
    });

    it('filters by due date range', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/tasks?dueDateFrom=2026-11-04T00:00:00.000Z&dueDateTo=2026-11-12T00:00:00.000Z`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2); // Beta (Nov 5) and Gamma (Nov 10)
    });

    it('paginates correctly with metadata', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/tasks?page=2&limit=2`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
    });

    it('sorts by title descending', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/tasks?sortBy=title&sortOrder=desc`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(res.status).toBe(200);
      expect(res.body.tasks[0].title).toBe('Gamma Documentation');
      expect(res.body.tasks[4].title).toBe('Alpha Feature');
    });
  });

  // 5. Move produces correct ordering and triggers rebalance
  describe('Move & Fractional Positioning', () => {
    it('moves a task between two neighbors with correct fractional position', async () => {
      // Create 3 tasks in TODO column
      const res1 = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Task 1', status: 'TODO' });

      const res2 = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Task 2', status: 'TODO' });

      const res3 = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Task 3', status: 'TODO' });

      const t1 = res1.body.task;
      const t2 = res2.body.task;
      const t3 = res3.body.task;

      expect(t1.position).toBe(1000);
      expect(t2.position).toBe(2000);
      expect(t3.position).toBe(3000);

      // Move Task 3 between Task 1 and Task 2
      const moveRes = await request(app)
        .patch(`/api/tasks/${t3.id}/move`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({
          version: t3.version,
          status: 'TODO',
          prevTaskId: t1.id,
          nextTaskId: t2.id,
        });

      expect(moveRes.status).toBe(200);
      expect(moveRes.body.task.position).toBe(1500);
      expect(moveRes.body.task.version).toBe(2);

      // Verify list order
      const listRes = await request(app)
        .get(`/api/projects/${testProject.id}/tasks?status=TODO&sortBy=position&sortOrder=asc`)
        .set('Authorization', createAuthHeader(memberUser));

      const orderedIds = listRes.body.tasks.map((t: any) => t.id);
      expect(orderedIds).toEqual([t1.id, t3.id, t2.id]);
    });

    it('triggers rebalance when gap is below minimum threshold', async () => {
      // Force two neighbor tasks with an extremely small gap (0.0001)
      const resA = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Task A', status: 'TODO' });

      const resB = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Task B', status: 'TODO' });

      const resC = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Task C', status: 'TODO' });

      const tA = resA.body.task;
      const tB = resB.body.task;
      const tC = resC.body.task;

      // Manually set small gap between tA and tB
      const storedA = tasks.find((t) => t.id === tA.id)!;
      const storedB = tasks.find((t) => t.id === tB.id)!;
      storedA.position = 1000.0001;
      storedB.position = 1000.0002;

      // Move Task C between Task A and Task B -> Gap is 0.0001, triggering rebalance!
      const moveRes = await request(app)
        .patch(`/api/tasks/${tC.id}/move`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({
          version: tC.version,
          status: 'TODO',
          prevTaskId: tA.id,
          nextTaskId: tB.id,
        });

      expect(moveRes.status).toBe(200);

      // Verify rebalanced positions: all tasks spaced sequentially by 1000
      const listRes = await request(app)
        .get(`/api/projects/${testProject.id}/tasks?status=TODO&sortBy=position&sortOrder=asc`)
        .set('Authorization', createAuthHeader(memberUser));

      const positions = listRes.body.tasks.map((t: any) => t.position);
      expect(positions).toEqual([1000, 2000, 3000]);

      const orderedIds = listRes.body.tasks.map((t: any) => t.id);
      expect(orderedIds).toEqual([tA.id, tC.id, tB.id]);
    });
  });

  // 6. Transactional atomicity: Task + ActivityLog in same transaction with rollback
  describe('Transactional Activity Logging', () => {
    it('creates an ActivityLog entry in the same transaction on task creation', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Logged Task' });

      expect(res.status).toBe(201);
      const taskId = res.body.task.id;

      const log = activityLogs.find((l) => l.taskId === taskId);
      expect(log).toBeDefined();
      expect(log!.action).toBe('TASK_CREATED');
      expect(log!.actorId).toBe(memberUser.id);
      expect(log!.metadata.title).toBe('Logged Task');
    });

    it('rolls back both task and activity log when an error occurs in the transaction', async () => {
      const initialTaskCount = tasks.length;
      const initialLogCount = activityLogs.length;

      // Call service with a forced transaction failure hook
      await expect(
        tasksService.createTask(
          memberUser.id,
          testProject.id,
          { title: 'Will Fail Task' },
          async () => {
            throw new Error('Simulated database write failure');
          },
        ),
      ).rejects.toThrow('Simulated database write failure');

      // Assert complete rollback
      expect(tasks.length).toBe(initialTaskCount);
      expect(activityLogs.length).toBe(initialLogCount);
      expect(tasks.some((t) => t.title === 'Will Fail Task')).toBe(false);
    });

    it('writes TASK_UPDATED and TASK_MOVED and TASK_DELETED activity logs', async () => {
      // 1. Create
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ title: 'Full Lifecycle Task' });
      const taskId = res.body.task.id;

      // 2. Update
      await request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ version: 1, title: 'Renamed Lifecycle Task' });

      expect(activityLogs.some((l) => l.taskId === taskId && l.action === 'TASK_UPDATED')).toBe(true);

      // 3. Move
      await request(app)
        .patch(`/api/tasks/${taskId}/move`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ version: 2, status: 'DONE' });

      expect(activityLogs.some((l) => l.taskId === taskId && l.action === 'TASK_MOVED')).toBe(true);

      // 4. Delete
      const delRes = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(delRes.status).toBe(200);
      expect(activityLogs.some((l) => l.action === 'TASK_DELETED')).toBe(true);
    });
  });
});
