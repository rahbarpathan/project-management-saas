/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../db/prisma';
import { getEnv } from '../../config/env';
import { socketService } from '../socket/socket.service';
import { sprintsService } from './sprints.service';
import { Role, TaskStatus, TaskPriority } from '@sprintflow/shared';

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

interface MockSprint {
  id: string;
  projectId: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  createdAt: Date;
  updatedAt: Date;
}

interface MockSprintTask {
  id: string;
  sprintId: string;
  taskId: string;
  addedAt: Date;
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

function createAuthHeader(user: { id: string; email: string }): string {
  const env = getEnv();
  const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_ACCESS_SECRET, {
    expiresIn: '1h',
  });
  return `Bearer ${token}`;
}

describe('Sprints Module Integration Tests', () => {
  let app = createApp();

  let users: MockUser[] = [];
  let members: MockWorkspaceMember[] = [];
  let projects: MockProject[] = [];
  let sprints: MockSprint[] = [];
  let sprintTasks: MockSprintTask[] = [];
  let tasks: MockTask[] = [];
  let activityLogs: any[] = [];

  const memberUser: MockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'member@sprintflow.dev',
    name: 'Member User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const viewerUser: MockUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'viewer@sprintflow.dev',
    name: 'Viewer User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const outsiderUser: MockUser = {
    id: '33333333-3333-3333-3333-333333333333',
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

  const testProject: MockProject = {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    workspaceId: mainWorkspace.id,
    name: 'Core Project',
    key: 'CORE',
    description: 'Sprint test project',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const otherProject: MockProject = {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    workspaceId: mainWorkspace.id,
    name: 'Other Project',
    key: 'OTHER',
    description: 'Other project',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    app = createApp();
    users = [{ ...memberUser }, { ...viewerUser }, { ...outsiderUser }];
    projects = [{ ...testProject }, { ...otherProject }];
    sprints = [];
    sprintTasks = [];
    tasks = [];
    activityLogs = [];

    members = [
      {
        id: 'm-1',
        workspaceId: mainWorkspace.id,
        userId: memberUser.id,
        role: 'MEMBER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-2',
        workspaceId: mainWorkspace.id,
        userId: viewerUser.id,
        role: 'VIEWER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Mock prisma.user
    vi.spyOn(prisma.user as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = users.find((u) => (args.where.id ? u.id === args.where.id : u.email === args.where.email));
      return found ? { ...found } : null;
    });

    // Mock prisma.workspaceMember
    vi.spyOn(prisma.workspaceMember as any, 'findUnique').mockImplementation(async (args: any) => {
      const target = args.where.workspaceId_userId;
      if (!target) return null;
      const found = members.find((m) => m.workspaceId === target.workspaceId && m.userId === target.userId);
      return found ? { ...found } : null;
    });

    // Mock prisma.project
    vi.spyOn(prisma.project as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = projects.find((p) => p.id === args.where.id);
      return found ? { ...found, workspace: mainWorkspace } : null;
    });

    // Mock prisma.sprint
    vi.spyOn(prisma.sprint as any, 'create').mockImplementation(async (args: any) => {
      const newSprint: MockSprint = {
        id: randomUUID(),
        projectId: args.data.projectId,
        name: args.data.name,
        startDate: args.data.startDate ? new Date(args.data.startDate) : null,
        endDate: args.data.endDate ? new Date(args.data.endDate) : null,
        status: args.data.status || 'PLANNED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sprints.push(newSprint);
      return { ...newSprint };
    });

    vi.spyOn(prisma.sprint as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = sprints.find((s) => s.id === args.where.id);
      if (!found) return null;
      const proj = projects.find((p) => p.id === found.projectId);
      return {
        ...found,
        project: proj ? { ...proj, workspace: mainWorkspace } : null,
      };
    });

    vi.spyOn(prisma.sprint as any, 'findUniqueOrThrow').mockImplementation(async (args: any) => {
      const found = sprints.find((s) => s.id === args.where.id);
      if (!found) throw new Error('Sprint not found');
      const stList = sprintTasks
        .filter((st) => st.sprintId === found.id)
        .map((st) => {
          const t = tasks.find((item) => item.id === st.taskId);
          return {
            ...st,
            task: t ? { ...t, assignee: null, position: Number(t.position) } : undefined,
          };
        });
      return {
        ...found,
        sprintTasks: stList,
      };
    });

    vi.spyOn(prisma.sprint as any, 'findFirst').mockImplementation(async (args: any) => {
      const found = sprints.find((s) => {
        if (args.where.projectId && s.projectId !== args.where.projectId) return false;
        if (args.where.status && s.status !== args.where.status) return false;
        if (args.where.id?.not && s.id === args.where.id.not) return false;
        return true;
      });
      return found ? { ...found } : null;
    });

    vi.spyOn(prisma.sprint as any, 'findMany').mockImplementation(async (args: any) => {
      const matched = sprints.filter((s) => {
        if (args.where.projectId && s.projectId !== args.where.projectId) return false;
        return true;
      });
      return matched.map((s) => {
        const stList = sprintTasks
          .filter((st) => st.sprintId === s.id)
          .map((st) => {
            const t = tasks.find((item) => item.id === st.taskId);
            return {
              ...st,
              task: t ? { ...t, assignee: null, position: Number(t.position) } : undefined,
            };
          });
        return {
          ...s,
          sprintTasks: stList,
        };
      });
    });

    vi.spyOn(prisma.sprint as any, 'update').mockImplementation(async (args: any) => {
      const target = sprints.find((s) => s.id === args.where.id);
      if (!target) throw new Error('Sprint not found');
      if (args.data.name !== undefined) target.name = args.data.name;
      if (args.data.startDate !== undefined) target.startDate = args.data.startDate ? new Date(args.data.startDate) : null;
      if (args.data.endDate !== undefined) target.endDate = args.data.endDate ? new Date(args.data.endDate) : null;
      if (args.data.status !== undefined) target.status = args.data.status;
      target.updatedAt = new Date();
      const stList = sprintTasks
        .filter((st) => st.sprintId === target.id)
        .map((st) => {
          const t = tasks.find((item) => item.id === st.taskId);
          return {
            ...st,
            task: t ? { ...t, assignee: null, position: Number(t.position) } : undefined,
          };
        });
      return {
        ...target,
        sprintTasks: stList,
      };
    });

    vi.spyOn(prisma.sprint as any, 'delete').mockImplementation(async (args: any) => {
      sprints = sprints.filter((s) => s.id !== args.where.id);
      return {};
    });

    // Mock prisma.sprintTask
    vi.spyOn(prisma.sprintTask as any, 'findMany').mockImplementation(async (args: any) => {
      return sprintTasks
        .filter((st) => st.sprintId === args.where.sprintId)
        .map((st) => {
          const t = tasks.find((item) => item.id === st.taskId);
          return { ...st, task: t ? { ...t } : null };
        });
    });

    vi.spyOn(prisma.sprintTask as any, 'upsert').mockImplementation(async (args: any) => {
      const existing = sprintTasks.find(
        (st) => st.sprintId === args.where.sprintId_taskId.sprintId && st.taskId === args.where.sprintId_taskId.taskId,
      );
      if (existing) return existing;
      const created: MockSprintTask = {
        id: randomUUID(),
        sprintId: args.create.sprintId,
        taskId: args.create.taskId,
        addedAt: new Date(),
      };
      sprintTasks.push(created);
      return created;
    });

    vi.spyOn(prisma.sprintTask as any, 'deleteMany').mockImplementation(async (args: any) => {
      sprintTasks = sprintTasks.filter((st) => {
        if (args.where.sprintId && st.sprintId === args.where.sprintId) {
          if (args.where.taskId && st.taskId !== args.where.taskId) return true;
          return false;
        }
        return true;
      });
      return { count: 1 };
    });

    // Mock prisma.task
    vi.spyOn(prisma.task as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = tasks.find((t) => t.id === args.where.id);
      return found ? { ...found } : null;
    });

    vi.spyOn(prisma.task as any, 'update').mockImplementation(async (args: any) => {
      const found = tasks.find((t) => t.id === args.where.id);
      if (!found) throw new Error('Task not found');
      if (args.data.status) found.status = args.data.status;
      if (args.data.version?.increment) found.version += args.data.version.increment;
      found.updatedAt = new Date();
      return { ...found };
    });

    // Mock activityLog
    vi.spyOn(prisma.activityLog as any, 'create').mockImplementation(async (args: any) => {
      const log = { id: randomUUID(), ...args.data, createdAt: new Date() };
      activityLogs.push(log);
      return log;
    });

    // Mock $transaction
    vi.spyOn(prisma as any, '$transaction').mockImplementation(async (cb: any) => {
      const sprintSnapshot = sprints.map((s) => ({ ...s }));
      const taskSnapshot = tasks.map((t) => ({ ...t }));
      const stSnapshot = sprintTasks.map((st) => ({ ...st }));
      try {
        const txMock = {
          sprint: prisma.sprint,
          sprintTask: prisma.sprintTask,
          task: prisma.task,
          activityLog: prisma.activityLog,
        };
        return await cb(txMock);
      } catch (err) {
        sprints = sprintSnapshot;
        tasks = taskSnapshot;
        sprintTasks = stSnapshot;
        throw err;
      }
    });

    // Spy on socket emissions
    vi.spyOn(socketService, 'emitSprintCreated');
    vi.spyOn(socketService, 'emitSprintUpdated');
    vi.spyOn(socketService, 'emitSprintDeleted');
  });

  describe('Date and Overlap Validation', () => {
    it('rejects sprint creation when endDate is before or equal to startDate', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/sprints`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({
          name: 'Invalid Date Sprint',
          startDate: '2026-10-20T00:00:00Z',
          endDate: '2026-10-19T00:00:00Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Sprint end date must be after start date');
    });

    it('rejects starting a sprint when another active sprint exists in the project', async () => {
      // 1. Create first sprint and make it ACTIVE
      const activeRes = await request(app)
        .post(`/api/projects/${testProject.id}/sprints`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({
          name: 'Sprint 1 Active',
          startDate: '2026-10-01T00:00:00Z',
          endDate: '2026-10-15T00:00:00Z',
        });
      expect(activeRes.status).toBe(201);
      const sprint1Id = activeRes.body.sprint.id;

      await request(app)
        .patch(`/api/sprints/${sprint1Id}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ status: 'ACTIVE' });

      // 2. Create second sprint
      const sprint2Res = await request(app)
        .post(`/api/projects/${testProject.id}/sprints`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({
          name: 'Sprint 2 Planned',
          startDate: '2026-10-16T00:00:00Z',
          endDate: '2026-10-30T00:00:00Z',
        });
      expect(sprint2Res.status).toBe(201);
      const sprint2Id = sprint2Res.body.sprint.id;

      // 3. Attempt to activate second sprint -> should fail with 400
      const activate2Res = await request(app)
        .patch(`/api/sprints/${sprint2Id}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ status: 'ACTIVE' });

      expect(activate2Res.status).toBe(400);
      expect(activate2Res.body.error.message).toContain('An active sprint already exists for this project');
    });
  });

  describe('Role-based Permissions (Member+ can modify, Viewer read-only)', () => {
    it('Viewer gets 403 on sprint create, update, delete, and task association', async () => {
      const sprint: MockSprint = {
        id: randomUUID(),
        projectId: testProject.id,
        name: 'Sprint 1',
        startDate: null,
        endDate: null,
        status: 'PLANNED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sprints.push(sprint);

      // Create
      const createRes = await request(app)
        .post(`/api/projects/${testProject.id}/sprints`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ name: 'Unauthorized Sprint' });
      expect(createRes.status).toBe(403);

      // Update
      const updateRes = await request(app)
        .patch(`/api/sprints/${sprint.id}`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ name: 'Hacked Name' });
      expect(updateRes.status).toBe(403);

      // Add task
      const addTaskRes = await request(app)
        .post(`/api/sprints/${sprint.id}/tasks`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ taskId: randomUUID() });
      expect(addTaskRes.status).toBe(403);

      // Remove task
      const removeTaskRes = await request(app)
        .delete(`/api/sprints/${sprint.id}/tasks/${randomUUID()}`)
        .set('Authorization', createAuthHeader(viewerUser));
      expect(removeTaskRes.status).toBe(403);

      // Delete
      const deleteRes = await request(app)
        .delete(`/api/sprints/${sprint.id}`)
        .set('Authorization', createAuthHeader(viewerUser));
      expect(deleteRes.status).toBe(403);
    });

    it('Viewer can read sprints list and sprint details', async () => {
      const sprint: MockSprint = {
        id: randomUUID(),
        projectId: testProject.id,
        name: 'Readable Sprint',
        startDate: null,
        endDate: null,
        status: 'PLANNED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sprints.push(sprint);

      const listRes = await request(app)
        .get(`/api/projects/${testProject.id}/sprints`)
        .set('Authorization', createAuthHeader(viewerUser));
      expect(listRes.status).toBe(200);
      expect(listRes.body.sprints).toHaveLength(1);

      const getRes = await request(app)
        .get(`/api/sprints/${sprint.id}`)
        .set('Authorization', createAuthHeader(viewerUser));
      expect(getRes.status).toBe(200);
      expect(getRes.body.sprint.name).toBe('Readable Sprint');
    });

    it('returns 404 when non-member tries to read or create sprints (tenant isolation)', async () => {
      const listRes = await request(app)
        .get(`/api/projects/${testProject.id}/sprints`)
        .set('Authorization', createAuthHeader(outsiderUser));
      expect(listRes.status).toBe(404);

      const createRes = await request(app)
        .post(`/api/projects/${testProject.id}/sprints`)
        .set('Authorization', createAuthHeader(outsiderUser))
        .send({ name: 'Outsider Sprint' });
      expect(createRes.status).toBe(404);
    });
  });

  describe('Complete-sprint Logic (Transactional, moves unfinished tasks to BACKLOG)', () => {
    it('moves unfinished tasks back to BACKLOG while keeping DONE tasks as DONE', async () => {
      // 1. Create a sprint
      const sprint: MockSprint = {
        id: randomUUID(),
        projectId: testProject.id,
        name: 'Active Sprint 1',
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-10-15'),
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sprints.push(sprint);

      // 2. Create tasks with different statuses
      const taskDone: MockTask = {
        id: randomUUID(),
        projectId: testProject.id,
        title: 'Finished Task',
        description: null,
        status: 'DONE',
        priority: 'MEDIUM',
        assigneeId: null,
        dueDate: null,
        position: 1000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const taskInProgress: MockTask = {
        id: randomUUID(),
        projectId: testProject.id,
        title: 'Halfway Task',
        description: null,
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assigneeId: null,
        dueDate: null,
        position: 2000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const taskTodo: MockTask = {
        id: randomUUID(),
        projectId: testProject.id,
        title: 'Unstarted Task',
        description: null,
        status: 'TODO',
        priority: 'LOW',
        assigneeId: null,
        dueDate: null,
        position: 3000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      tasks.push(taskDone, taskInProgress, taskTodo);

      // Add all 3 tasks to the sprint
      sprintTasks.push(
        { id: 'st-1', sprintId: sprint.id, taskId: taskDone.id, addedAt: new Date() },
        { id: 'st-2', sprintId: sprint.id, taskId: taskInProgress.id, addedAt: new Date() },
        { id: 'st-3', sprintId: sprint.id, taskId: taskTodo.id, addedAt: new Date() },
      );

      // Complete the sprint
      const completeRes = await request(app)
        .patch(`/api/sprints/${sprint.id}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ status: 'COMPLETED' });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.sprint.status).toBe('COMPLETED');

      // Verify task statuses
      const doneAfter = tasks.find((t) => t.id === taskDone.id);
      const inProgressAfter = tasks.find((t) => t.id === taskInProgress.id);
      const todoAfter = tasks.find((t) => t.id === taskTodo.id);

      expect(doneAfter?.status).toBe('DONE');
      expect(doneAfter?.version).toBe(1); // not incremented

      expect(inProgressAfter?.status).toBe('BACKLOG'); // moved to BACKLOG
      expect(inProgressAfter?.version).toBe(2); // incremented

      expect(todoAfter?.status).toBe('BACKLOG'); // moved to BACKLOG
      expect(todoAfter?.version).toBe(2); // incremented
    });

    it('rolls back completely if a failure occurs during sprint completion', async () => {
      const sprint: MockSprint = {
        id: randomUUID(),
        projectId: testProject.id,
        name: 'Doomed Sprint',
        startDate: null,
        endDate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sprints.push(sprint);

      const task: MockTask = {
        id: randomUUID(),
        projectId: testProject.id,
        title: 'Task in doomed sprint',
        description: null,
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        assigneeId: null,
        dueDate: null,
        position: 1000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tasks.push(task);
      sprintTasks.push({ id: 'st-d', sprintId: sprint.id, taskId: task.id, addedAt: new Date() });

      // Force failure during transaction hook in service
      await expect(
        sprintsService.updateSprint(
          memberUser.id,
          sprint.id,
          { status: 'COMPLETED' },
          async () => {
            throw new Error('Database transaction failure');
          },
        ),
      ).rejects.toThrow('Database transaction failure');

      // State is unchanged
      expect(sprints.find((s) => s.id === sprint.id)?.status).toBe('ACTIVE');
      expect(tasks.find((t) => t.id === task.id)?.status).toBe('IN_PROGRESS');
    });
  });

  describe('Task Association with Sprint', () => {
    it('adds and removes tasks in a sprint', async () => {
      const sprint: MockSprint = {
        id: randomUUID(),
        projectId: testProject.id,
        name: 'Sprint Alpha',
        startDate: null,
        endDate: null,
        status: 'PLANNED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sprints.push(sprint);

      const task: MockTask = {
        id: randomUUID(),
        projectId: testProject.id,
        title: 'Project task',
        description: null,
        status: 'TODO',
        priority: 'MEDIUM',
        assigneeId: null,
        dueDate: null,
        position: 1000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tasks.push(task);

      // Add task to sprint
      const addRes = await request(app)
        .post(`/api/sprints/${sprint.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ taskId: task.id });

      expect(addRes.status).toBe(200);
      expect(addRes.body.sprint.tasksCount).toBe(1);

      // Remove task from sprint
      const removeRes = await request(app)
        .delete(`/api/sprints/${sprint.id}/tasks/${task.id}`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(removeRes.status).toBe(200);
      expect(removeRes.body.sprint.tasksCount).toBe(0);
    });

    it('rejects adding a task that belongs to another project', async () => {
      const sprint: MockSprint = {
        id: randomUUID(),
        projectId: testProject.id,
        name: 'Sprint Alpha',
        startDate: null,
        endDate: null,
        status: 'PLANNED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sprints.push(sprint);

      const outsiderTask: MockTask = {
        id: randomUUID(),
        projectId: otherProject.id, // Different project
        title: 'Outsider task',
        description: null,
        status: 'TODO',
        priority: 'MEDIUM',
        assigneeId: null,
        dueDate: null,
        position: 1000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tasks.push(outsiderTask);

      const addRes = await request(app)
        .post(`/api/sprints/${sprint.id}/tasks`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ taskId: outsiderTask.id });

      expect(addRes.status).toBe(400);
      expect(addRes.body.error.message).toContain('Task does not exist or does not belong to the project');
    });
  });

  describe('Real-time Socket.IO Event Emissions', () => {
    it('emits sprint:created, sprint:updated, and sprint:deleted events', async () => {
      // 1. Create sprint
      const createRes = await request(app)
        .post(`/api/projects/${testProject.id}/sprints`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ name: 'Live Sprint' });

      expect(createRes.status).toBe(201);
      const sprintId = createRes.body.sprint.id;
      expect(socketService.emitSprintCreated).toHaveBeenCalledWith(testProject.id, expect.objectContaining({ id: sprintId }));

      // 2. Update sprint
      const updateRes = await request(app)
        .patch(`/api/sprints/${sprintId}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ name: 'Live Sprint Renamed' });

      expect(updateRes.status).toBe(200);
      expect(socketService.emitSprintUpdated).toHaveBeenCalledWith(testProject.id, expect.objectContaining({ id: sprintId, name: 'Live Sprint Renamed' }));

      // 3. Delete sprint
      const deleteRes = await request(app)
        .delete(`/api/sprints/${sprintId}`)
        .set('Authorization', createAuthHeader(memberUser));

      expect(deleteRes.status).toBe(204);
      expect(socketService.emitSprintDeleted).toHaveBeenCalledWith(testProject.id, sprintId);
    });
  });
});
