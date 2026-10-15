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

function createAuthHeader(user: { id: string; email: string }): string {
  const env = getEnv();
  const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_ACCESS_SECRET, {
    expiresIn: '1h',
  });
  return `Bearer ${token}`;
}

describe('Workspaces & RBAC Integration Tests', () => {
  let app = createApp();

  let users: MockUser[] = [];
  let workspaces: MockWorkspace[] = [];
  let members: MockWorkspaceMember[] = [];

  const userA: MockUser = {
    id: 'user-a-id',
    email: 'usera@sprintflow.dev',
    name: 'User A',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: MockUser = {
    id: 'user-b-id',
    email: 'userb@sprintflow.dev',
    name: 'User B',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userC: MockUser = {
    id: 'user-c-id',
    email: 'userc@sprintflow.dev',
    name: 'User C',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    app = createApp();
    users = [{ ...userA }, { ...userB }, { ...userC }];
    workspaces = [];
    members = [];

    // Mock prisma.user
    vi.spyOn(prisma.user as any, 'findUnique').mockImplementation(async (args: unknown) => {
      const { where, select } = args as { where: { id?: string; email?: string }; select?: Record<string, boolean> };
      const found = users.find((u) => (where.id ? u.id === where.id : u.email === where.email));
      if (!found) return null;

      if (select) {
        const result: Record<string, unknown> = {};
        for (const k of Object.keys(select)) {
          if (select[k]) result[k] = (found as any)[k];
        }
        return result as never;
      }
      return { ...found } as never;
    });

    // Mock prisma.$transaction
    vi.spyOn(prisma as any, '$transaction').mockImplementation(async (cb: any) => {
      const txMock = {
        workspace: {
          create: async (args: { data: { name: string; slug: string } }) => {
            const ws: MockWorkspace = {
              id: `ws-${workspaces.length + 1}`,
              name: args.data.name,
              slug: args.data.slug,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            workspaces.push(ws);
            return ws;
          },
        },
        workspaceMember: {
          create: async (args: { data: { workspaceId: string; userId: string; role: Role } }) => {
            const m: MockWorkspaceMember = {
              id: `m-${members.length + 1}`,
              workspaceId: args.data.workspaceId,
              userId: args.data.userId,
              role: args.data.role,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            members.push(m);
            return m;
          },
        },
      };
      return cb(txMock);
    });

    // Mock prisma.workspace
    vi.spyOn(prisma.workspace as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = workspaces.find((w) => (args.where.id ? w.id === args.where.id : w.slug === args.where.slug));
      if (!found) return null;
      const wsMembers = members.filter((m) => m.workspaceId === found.id);
      return { ...found, _count: { members: wsMembers.length, projects: 0 } } as never;
    });

    vi.spyOn(prisma.workspace as any, 'findFirst').mockImplementation(async (args: any) => {
      const found = workspaces.find((w) => {
        const matchesSlug = args.where.slug ? w.slug === args.where.slug : true;
        const notMatchesId = args.where.NOT?.id ? w.id !== args.where.NOT.id : true;
        return matchesSlug && notMatchesId;
      });
      return (found ? { ...found } : null) as never;
    });

    vi.spyOn(prisma.workspace as any, 'update').mockImplementation(async (args: any) => {
      const found = workspaces.find((w) => w.id === args.where.id);
      if (!found) throw new Error('Not found');
      if (args.data.name) found.name = args.data.name;
      if (args.data.slug) found.slug = args.data.slug;
      found.updatedAt = new Date();
      return { ...found, _count: { members: members.filter((m) => m.workspaceId === found.id).length, projects: 0 } } as never;
    });

    vi.spyOn(prisma.workspace as any, 'delete').mockImplementation(async (args: any) => {
      workspaces = workspaces.filter((w) => w.id !== args.where.id);
      members = members.filter((m) => m.workspaceId !== args.where.id);
      return {} as never;
    });

    // Mock prisma.workspaceMember
    vi.spyOn(prisma.workspaceMember as any, 'findUnique').mockImplementation(async (args: any) => {
      const target = args.where.workspaceId_userId;
      if (!target) return null;
      const found = members.find((m) => m.workspaceId === target.workspaceId && m.userId === target.userId);
      return (found ? { ...found } : null) as never;
    });

    vi.spyOn(prisma.workspaceMember as any, 'findFirst').mockImplementation(async (args: any) => {
      const found = members.find((m) => (args.where.id ? m.id === args.where.id : true) && (args.where.workspaceId ? m.workspaceId === args.where.workspaceId : true));
      return (found ? { ...found } : null) as never;
    });

    vi.spyOn(prisma.workspaceMember as any, 'findMany').mockImplementation(async (args: any) => {
      let filtered = members;
      if (args.where.userId) filtered = filtered.filter((m) => m.userId === args.where.userId);
      if (args.where.workspaceId) filtered = filtered.filter((m) => m.workspaceId === args.where.workspaceId);

      return filtered.map((m) => {
        const ws = workspaces.find((w) => w.id === m.workspaceId);
        const u = users.find((usr) => usr.id === m.userId);
        return {
          ...m,
          workspace: ws ? { ...ws, _count: { members: members.filter((x) => x.workspaceId === ws.id).length, projects: 0 } } : null,
          user: u ? { ...u } : null,
        };
      }) as never;
    });

    vi.spyOn(prisma.workspaceMember as any, 'create').mockImplementation(async (args: any) => {
      const newM: MockWorkspaceMember = {
        id: `m-${members.length + 1}`,
        workspaceId: args.data.workspaceId,
        userId: args.data.userId,
        role: args.data.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      members.push(newM);
      const u = users.find((usr) => usr.id === newM.userId);
      return { ...newM, user: u } as never;
    });

    vi.spyOn(prisma.workspaceMember as any, 'count').mockImplementation(async (args: any) => {
      let filtered = members.filter((m) => m.workspaceId === args.where.workspaceId);
      if (args.where.role) filtered = filtered.filter((m) => m.role === args.where.role);
      return filtered.length as never;
    });

    vi.spyOn(prisma.workspaceMember as any, 'update').mockImplementation(async (args: any) => {
      const found = members.find((m) => m.id === args.where.id);
      if (!found) throw new Error('Not found');
      found.role = args.data.role;
      found.updatedAt = new Date();
      const u = users.find((usr) => usr.id === found.userId);
      return { ...found, user: u } as never;
    });

    vi.spyOn(prisma.workspaceMember as any, 'delete').mockImplementation(async (args: any) => {
      members = members.filter((m) => m.id !== args.where.id);
      return {} as never;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Workspace Creation & Atomic Transaction', () => {
    it('creates a workspace and makes creator the OWNER in a single transaction', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', createAuthHeader(userA))
        .send({ name: 'Acme Corp' });

      expect(res.status).toBe(201);
      expect(res.body.workspace).toBeDefined();
      expect(res.body.workspace.name).toBe('Acme Corp');
      expect(res.body.workspace.slug).toBe('acme-corp');
      expect(res.body.workspace.currentUserRole).toBe('OWNER');

      // Verify member record was created
      expect(members.length).toBe(1);
      expect(members[0]?.userId).toBe(userA.id);
      expect(members[0]?.role).toBe('OWNER');
    });

    it('lists workspaces the user belongs to', async () => {
      await request(app)
        .post('/api/workspaces')
        .set('Authorization', createAuthHeader(userA))
        .send({ name: 'User A Workspace' });

      const res = await request(app)
        .get('/api/workspaces')
        .set('Authorization', createAuthHeader(userA));

      expect(res.status).toBe(200);
      expect(res.body.workspaces).toHaveLength(1);
      expect(res.body.workspaces[0].name).toBe('User A Workspace');
    });
  });

  describe('Cross-Tenant Security: ID Guessing Returns 404', () => {
    let workspaceBId: string;

    beforeEach(async () => {
      // User B creates a workspace
      const createRes = await request(app)
        .post('/api/workspaces')
        .set('Authorization', createAuthHeader(userB))
        .send({ name: 'Secret Workspace B' });

      workspaceBId = createRes.body.workspace.id;
    });

    it('returns 404 when User A tries to GET Workspace B by ID', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceBId}`)
        .set('Authorization', createAuthHeader(userA));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when User A tries to PATCH Workspace B by ID', async () => {
      const res = await request(app)
        .patch(`/api/workspaces/${workspaceBId}`)
        .set('Authorization', createAuthHeader(userA))
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when User A tries to DELETE Workspace B by ID', async () => {
      const res = await request(app)
        .delete(`/api/workspaces/${workspaceBId}`)
        .set('Authorization', createAuthHeader(userA));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when User A tries to view or add members to Workspace B', async () => {
      const listRes = await request(app)
        .get(`/api/workspaces/${workspaceBId}/members`)
        .set('Authorization', createAuthHeader(userA));

      expect(listRes.status).toBe(404);

      const addRes = await request(app)
        .post(`/api/workspaces/${workspaceBId}/members`)
        .set('Authorization', createAuthHeader(userA))
        .send({ email: userC.email, role: 'MEMBER' });

      expect(addRes.status).toBe(404);
    });
  });

  describe('Role-Based Access Control on Workspaces', () => {
    let workspaceId: string;

    beforeEach(async () => {
      // User A creates workspace (Owner)
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', createAuthHeader(userA))
        .send({ name: 'Main Workspace' });
      workspaceId = res.body.workspace.id;

      // Add User B as MEMBER and User C as VIEWER
      await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', createAuthHeader(userA))
        .send({ email: userB.email, role: 'MEMBER' });

      await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', createAuthHeader(userA))
        .send({ email: userC.email, role: 'VIEWER' });
    });

    it('allows VIEWER to read workspace but rejects updates and deletion', async () => {
      const readRes = await request(app)
        .get(`/api/workspaces/${workspaceId}`)
        .set('Authorization', createAuthHeader(userC));
      expect(readRes.status).toBe(200);

      const updateRes = await request(app)
        .patch(`/api/workspaces/${workspaceId}`)
        .set('Authorization', createAuthHeader(userC))
        .send({ name: 'Viewer Renamed' });
      expect(updateRes.status).toBe(403);
      expect(updateRes.body.error.code).toBe('FORBIDDEN');

      const deleteRes = await request(app)
        .delete(`/api/workspaces/${workspaceId}`)
        .set('Authorization', createAuthHeader(userC));
      expect(deleteRes.status).toBe(403);
    });

    it('allows MEMBER to read workspace but rejects workspace updates and deletion', async () => {
      const updateRes = await request(app)
        .patch(`/api/workspaces/${workspaceId}`)
        .set('Authorization', createAuthHeader(userB))
        .send({ name: 'Member Renamed' });
      expect(updateRes.status).toBe(403);

      const deleteRes = await request(app)
        .delete(`/api/workspaces/${workspaceId}`)
        .set('Authorization', createAuthHeader(userB));
      expect(deleteRes.status).toBe(403);
    });

    it('allows OWNER to update and delete workspace', async () => {
      const updateRes = await request(app)
        .patch(`/api/workspaces/${workspaceId}`)
        .set('Authorization', createAuthHeader(userA))
        .send({ name: 'Owner Updated' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.workspace.name).toBe('Owner Updated');

      const deleteRes = await request(app)
        .delete(`/api/workspaces/${workspaceId}`)
        .set('Authorization', createAuthHeader(userA));
      expect(deleteRes.status).toBe(200);

      // Verify deletion
      const readAfterRes = await request(app)
        .get(`/api/workspaces/${workspaceId}`)
        .set('Authorization', createAuthHeader(userA));
      expect(readAfterRes.status).toBe(404);
    });
  });

  describe('Member Management Guardrails', () => {
    let workspaceId: string;
    let ownerMemberId: string;
    let adminMemberId: string;

    beforeEach(async () => {
      // User A (Owner)
      const wsRes = await request(app)
        .post('/api/workspaces')
        .set('Authorization', createAuthHeader(userA))
        .send({ name: 'Guardrail Workspace' });
      workspaceId = wsRes.body.workspace.id;

      ownerMemberId = members.find((m) => m.userId === userA.id)!.id;

      // Add User B as ADMIN
      const addAdminRes = await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', createAuthHeader(userA))
        .send({ email: userB.email, role: 'ADMIN' });
      adminMemberId = addAdminRes.body.member.id;
    });

    it('forbids an ADMIN from modifying an OWNER role', async () => {
      const res = await request(app)
        .patch(`/api/workspaces/${workspaceId}/members/${ownerMemberId}`)
        .set('Authorization', createAuthHeader(userB))
        .send({ role: 'MEMBER' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Admins cannot modify workspace owners');
    });

    it('forbids an ADMIN from removing an OWNER', async () => {
      const res = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${ownerMemberId}`)
        .set('Authorization', createAuthHeader(userB));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Admins cannot remove workspace owners');
    });

    it('forbids an ADMIN from assigning the OWNER role', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', createAuthHeader(userB))
        .send({ email: userC.email, role: 'OWNER' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Only workspace owners can assign the owner role');
    });

    it('rejects removing the last OWNER with 400 Bad Request', async () => {
      const res = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${ownerMemberId}`)
        .set('Authorization', createAuthHeader(userA));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toContain('Cannot remove or demote the last owner');
    });

    it('rejects demoting the last OWNER with 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/workspaces/${workspaceId}/members/${ownerMemberId}`)
        .set('Authorization', createAuthHeader(userA))
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toContain('Cannot remove or demote the last owner');
    });

    it('allows demoting or removing an OWNER if another OWNER exists', async () => {
      // Promote User B to OWNER
      const promoteRes = await request(app)
        .patch(`/api/workspaces/${workspaceId}/members/${adminMemberId}`)
        .set('Authorization', createAuthHeader(userA))
        .send({ role: 'OWNER' });
      expect(promoteRes.status).toBe(200);

      // Now demoting User A is allowed
      const demoteRes = await request(app)
        .patch(`/api/workspaces/${workspaceId}/members/${ownerMemberId}`)
        .set('Authorization', createAuthHeader(userB))
        .send({ role: 'ADMIN' });
      expect(demoteRes.status).toBe(200);
      expect(demoteRes.body.member.role).toBe('ADMIN');
    });
  });
});
