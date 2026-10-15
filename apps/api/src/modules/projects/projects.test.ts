/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../db/prisma';
import { getEnv } from '../../config/env';
import { Role } from '@sprintflow/shared';

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

describe('Projects Module Integration Tests', () => {
  let app = createApp();

  let users: MockUser[] = [];
  let members: MockWorkspaceMember[] = [];
  let projects: MockProject[] = [];
  let activityLogs: MockActivityLog[] = [];

  const ownerUser: MockUser = {
    id: 'user-owner-id',
    email: 'owner@sprintflow.dev',
    name: 'Owner User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminUser: MockUser = {
    id: 'user-admin-id',
    email: 'admin@sprintflow.dev',
    name: 'Admin User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const memberUser: MockUser = {
    id: 'user-member-id',
    email: 'member@sprintflow.dev',
    name: 'Member User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const viewerUser: MockUser = {
    id: 'user-viewer-id',
    email: 'viewer@sprintflow.dev',
    name: 'Viewer User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const outsiderUser: MockUser = {
    id: 'user-outsider-id',
    email: 'outsider@sprintflow.dev',
    name: 'Outsider User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mainWorkspace: MockWorkspace = {
    id: 'ws-main-id',
    name: 'Main Workspace',
    slug: 'main-ws',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const otherWorkspace: MockWorkspace = {
    id: 'ws-other-id',
    name: 'Other Workspace',
    slug: 'other-ws',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    app = createApp();
    users = [{ ...ownerUser }, { ...adminUser }, { ...memberUser }, { ...viewerUser }, { ...outsiderUser }];
    projects = [];
    activityLogs = [];

    members = [
      { id: 'm-1', workspaceId: mainWorkspace.id, userId: ownerUser.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-2', workspaceId: mainWorkspace.id, userId: adminUser.id, role: 'ADMIN', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-3', workspaceId: mainWorkspace.id, userId: memberUser.id, role: 'MEMBER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-4', workspaceId: mainWorkspace.id, userId: viewerUser.id, role: 'VIEWER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-5', workspaceId: otherWorkspace.id, userId: outsiderUser.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
    ];

    // Mock prisma.user
    vi.spyOn(prisma.user as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = users.find((u) => (args.where.id ? u.id === args.where.id : u.email === args.where.email));
      if (!found) return null;
      if (args.select) {
        const res: Record<string, unknown> = {};
        for (const k of Object.keys(args.select)) {
          if (args.select[k]) res[k] = (found as any)[k];
        }
        return res as never;
      }
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
      if (args.where.workspaceId_key) {
        const { workspaceId, key } = args.where.workspaceId_key;
        const found = projects.find((p) => p.workspaceId === workspaceId && p.key === key);
        return (found ? { ...found } : null) as never;
      }
      if (args.where.id) {
        const found = projects.find((p) => p.id === args.where.id);
        if (!found) return null;
        return { ...found, _count: { tasks: 0, sprints: 0 } } as never;
      }
      return null as never;
    });

    vi.spyOn(prisma.project as any, 'findMany').mockImplementation(async (args: any) => {
      let filtered = projects.filter((p) => p.workspaceId === args.where.workspaceId);
      if (args.where.OR) {
        const searchTerm = args.where.OR[0]?.name?.contains?.toLowerCase();
        if (searchTerm) {
          filtered = filtered.filter(
            (p) => p.name.toLowerCase().includes(searchTerm) || p.key.toLowerCase().includes(searchTerm),
          );
        }
      }
      const skip = args.skip || 0;
      const take = args.take !== undefined ? args.take : filtered.length;
      const paginated = filtered.slice(skip, skip + take);

      return paginated.map((p) => ({
        ...p,
        _count: { tasks: 0, sprints: 0 },
      })) as never;
    });

    vi.spyOn(prisma.project as any, 'count').mockImplementation(async (args: any) => {
      let filtered = projects.filter((p) => p.workspaceId === args.where.workspaceId);
      if (args.where.OR) {
        const searchTerm = args.where.OR[0]?.name?.contains?.toLowerCase();
        if (searchTerm) {
          filtered = filtered.filter(
            (p) => p.name.toLowerCase().includes(searchTerm) || p.key.toLowerCase().includes(searchTerm),
          );
        }
      }
      return filtered.length as never;
    });

    vi.spyOn(prisma.project as any, 'create').mockImplementation(async (args: any) => {
      const newP: MockProject = {
        id: `proj-${projects.length + 1}`,
        workspaceId: args.data.workspaceId,
        name: args.data.name,
        key: args.data.key,
        description: args.data.description ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      projects.push(newP);
      return { ...newP } as never;
    });

    vi.spyOn(prisma.project as any, 'update').mockImplementation(async (args: any) => {
      const found = projects.find((p) => p.id === args.where.id);
      if (!found) throw new Error('Not found');
      if (args.data.name) found.name = args.data.name;
      if (args.data.description !== undefined) found.description = args.data.description;
      found.updatedAt = new Date();
      return { ...found, _count: { tasks: 0, sprints: 0 } } as never;
    });

    vi.spyOn(prisma.project as any, 'delete').mockImplementation(async (args: any) => {
      projects = projects.filter((p) => p.id !== args.where.id);
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
    vi.spyOn(prisma.task as any, 'deleteMany').mockResolvedValue({ count: 0 } as never);
    vi.spyOn(prisma.sprint as any, 'deleteMany').mockResolvedValue({ count: 0 } as never);

    // Mock prisma.$transaction
    vi.spyOn(prisma as any, '$transaction').mockImplementation(async (cb: any) => {
      const txMock = {
        project: prisma.project,
        activityLog: prisma.activityLog,
        comment: prisma.comment,
        sprintTask: prisma.sprintTask,
        task: prisma.task,
        sprint: prisma.sprint,
      };
      return cb(txMock);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Key Validation and Uniqueness', () => {
    it('accepts valid 2-5 uppercase alphanumeric key and writes activity log', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({
          name: 'SprintFlow Core',
          key: 'SFC',
          description: 'Core backend engine',
        });

      expect(res.status).toBe(201);
      expect(res.body.project).toBeDefined();
      expect(res.body.project.key).toBe('SFC');
      expect(res.body.project.name).toBe('SprintFlow Core');

      // Verify activity log entry written
      expect(activityLogs).toHaveLength(1);
      expect(activityLogs[0]?.action).toBe('PROJECT_CREATED');
      expect(activityLogs[0]?.actorId).toBe(ownerUser.id);
      expect(activityLogs[0]?.projectId).toBe(res.body.project.id);
      expect(activityLogs[0]?.metadata).toEqual({ name: 'SprintFlow Core', key: 'SFC' });
    });

    it('automatically transforms lowercase valid key to uppercase', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({
          name: 'Mobile App',
          key: 'mob',
        });

      expect(res.status).toBe(201);
      expect(res.body.project.key).toBe('MOB');
    });

    it('rejects keys shorter than 2 chars or longer than 5 chars with 400', async () => {
      const shortRes = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'Short Key', key: 'A' });
      expect(shortRes.status).toBe(400);

      const longRes = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'Too Long Key', key: 'TOOLONG' });
      expect(longRes.status).toBe(400);
    });

    it('rejects keys containing symbols or invalid characters with 400', async () => {
      const symbolRes = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'Symbol Key', key: 'SF-1' });
      expect(symbolRes.status).toBe(400);
    });

    it('rejects duplicate key in the same workspace with 409 Conflict', async () => {
      await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'First Project', key: 'CORE' });

      const duplicateRes = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'Second Project', key: 'CORE' });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error.code).toBe('CONFLICT');
      expect(duplicateRes.body.error.message).toContain('already exists');
    });

    it('allows identical key in a different workspace', async () => {
      await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'Main Core', key: 'CORE' });

      const otherRes = await request(app)
        .post(`/api/workspaces/${otherWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(outsiderUser))
        .send({ name: 'Other Core', key: 'CORE' });

      expect(otherRes.status).toBe(201);
      expect(otherRes.body.project.key).toBe('CORE');
    });
  });

  describe('Role-Based Access Control Across All 4 Roles', () => {
    let projectId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'Test Project', key: 'TEST' });
      projectId = res.body.project.id;
    });

    it('VIEWER: can read, cannot create, update, or delete', async () => {
      // 1. Can read project
      const getRes = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(viewerUser));
      expect(getRes.status).toBe(200);

      // 2. Cannot create
      const createRes = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ name: 'Viewer Proj', key: 'VIEW' });
      expect(createRes.status).toBe(403);

      // 3. Cannot update
      const updateRes = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ name: 'Viewer Renamed' });
      expect(updateRes.status).toBe(403);

      // 4. Cannot delete
      const deleteRes = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(viewerUser));
      expect(deleteRes.status).toBe(403);
    });

    it('MEMBER: can read, cannot create, update, or delete', async () => {
      // 1. Can read
      const getRes = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(memberUser));
      expect(getRes.status).toBe(200);

      // 2. Cannot create
      const createRes = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ name: 'Member Proj', key: 'MEM' });
      expect(createRes.status).toBe(403);

      // 3. Cannot update
      const updateRes = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(memberUser))
        .send({ name: 'Member Renamed' });
      expect(updateRes.status).toBe(403);

      // 4. Cannot delete
      const deleteRes = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(memberUser));
      expect(deleteRes.status).toBe(403);
    });

    it('ADMIN: can create, read, update, and delete project (requires Admin or higher)', async () => {
      // 1. Can create
      const createRes = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(adminUser))
        .send({ name: 'Admin Project', key: 'ADM' });
      expect(createRes.status).toBe(201);
      const adminProjId = createRes.body.project.id;

      // 2. Can read
      const getRes = await request(app)
        .get(`/api/projects/${adminProjId}`)
        .set('Authorization', createAuthHeader(adminUser));
      expect(getRes.status).toBe(200);

      // 3. Can update
      const updateRes = await request(app)
        .patch(`/api/projects/${adminProjId}`)
        .set('Authorization', createAuthHeader(adminUser))
        .send({ name: 'Admin Updated' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.project.name).toBe('Admin Updated');

      // 4. Can delete and writes activity log
      const initialLogsCount = activityLogs.length;
      const deleteRes = await request(app)
        .delete(`/api/projects/${adminProjId}`)
        .set('Authorization', createAuthHeader(adminUser));
      expect(deleteRes.status).toBe(200);

      // Verify activity log entry written for deletion
      const deleteLog = activityLogs.find((l) => l.action === 'PROJECT_DELETED' && l.projectId === adminProjId);
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.actorId).toBe(adminUser.id);
      expect(activityLogs.length).toBeGreaterThan(initialLogsCount);
    });

    it('OWNER: can create, read, update, and delete project', async () => {
      // 1. Can update
      const updateRes = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'Owner Updated' });
      expect(updateRes.status).toBe(200);

      // 2. Can delete
      const deleteRes = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(ownerUser));
      expect(deleteRes.status).toBe(200);

      // Subsequent read returns 404
      const getAfterDelete = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', createAuthHeader(ownerUser));
      expect(getAfterDelete.status).toBe(404);
    });
  });

  describe('Cross-Workspace Access Isolation', () => {
    let mainProjectId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(ownerUser))
        .send({ name: 'Main Secret Project', key: 'MSP' });
      mainProjectId = res.body.project.id;
    });

    it('returns 404 when a user from Workspace B attempts to GET a project from Workspace A', async () => {
      const res = await request(app)
        .get(`/api/projects/${mainProjectId}`)
        .set('Authorization', createAuthHeader(outsiderUser));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when a user from Workspace B attempts to PATCH a project from Workspace A', async () => {
      const res = await request(app)
        .patch(`/api/projects/${mainProjectId}`)
        .set('Authorization', createAuthHeader(outsiderUser))
        .send({ name: 'Hacked Project Name' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when a user from Workspace B attempts to DELETE a project from Workspace A', async () => {
      const res = await request(app)
        .delete(`/api/projects/${mainProjectId}`)
        .set('Authorization', createAuthHeader(outsiderUser));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when listing projects for a workspace user is not a member of', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${mainWorkspace.id}/projects`)
        .set('Authorization', createAuthHeader(outsiderUser));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Pagination and Search Filtering', () => {
    beforeEach(async () => {
      // Create 5 projects
      const keys = ['PONE', 'PTWO', 'PTHR', 'PFOU', 'PFIV'];
      for (let i = 0; i < keys.length; i++) {
        await request(app)
          .post(`/api/workspaces/${mainWorkspace.id}/projects`)
          .set('Authorization', createAuthHeader(ownerUser))
          .send({ name: `Project Number ${i + 1}`, key: keys[i] });
      }
    });

    it('paginates project list with page, limit, total, and totalPages metadata', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${mainWorkspace.id}/projects?page=1&limit=2`)
        .set('Authorization', createAuthHeader(ownerUser));

      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(2);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
      });

      // Page 2
      const resPage2 = await request(app)
        .get(`/api/workspaces/${mainWorkspace.id}/projects?page=2&limit=2`)
        .set('Authorization', createAuthHeader(ownerUser));

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.projects).toHaveLength(2);

      // Page 3 (final item)
      const resPage3 = await request(app)
        .get(`/api/workspaces/${mainWorkspace.id}/projects?page=3&limit=2`)
        .set('Authorization', createAuthHeader(ownerUser));

      expect(resPage3.status).toBe(200);
      expect(resPage3.body.projects).toHaveLength(1);
    });

    it('filters project list by search query', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${mainWorkspace.id}/projects?search=PONE`)
        .set('Authorization', createAuthHeader(ownerUser));

      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(1);
      expect(res.body.projects[0].key).toBe('PONE');
    });
  });
});
