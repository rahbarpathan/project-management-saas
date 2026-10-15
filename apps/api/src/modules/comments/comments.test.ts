/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../db/prisma';
import { getEnv } from '../../config/env';
import { Role } from '@sprintflow/shared';
import { commentsService } from './comments.service';

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
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: Date | null;
  position: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MockComment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
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

describe('Comments and Activity Module Integration Tests', () => {
  let app = createApp();

  let users: MockUser[] = [];
  let members: MockWorkspaceMember[] = [];
  let projects: MockProject[] = [];
  let tasks: MockTask[] = [];
  let comments: MockComment[] = [];
  let activityLogs: MockActivityLog[] = [];

  const ownerUser: MockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'owner@sprintflow.dev',
    name: 'Owner User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminUser: MockUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'admin@sprintflow.dev',
    name: 'Admin User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const memberA: MockUser = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'membera@sprintflow.dev',
    name: 'Member Author',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const memberB: MockUser = {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'memberb@sprintflow.dev',
    name: 'Member Other',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const viewerUser: MockUser = {
    id: '55555555-5555-5555-5555-555555555555',
    email: 'viewer@sprintflow.dev',
    name: 'Viewer User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const outsiderUser: MockUser = {
    id: '66666666-6666-6666-6666-666666666666',
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
    name: 'Comments Project',
    key: 'COMM',
    description: 'Testing comments',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testTask: MockTask = {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    projectId: testProject.id,
    title: 'Discussion Task',
    description: 'Task description',
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: memberA.id,
    dueDate: null,
    position: 1000,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    app = createApp();
    users = [
      { ...ownerUser },
      { ...adminUser },
      { ...memberA },
      { ...memberB },
      { ...viewerUser },
      { ...outsiderUser },
    ];
    projects = [{ ...testProject }];
    tasks = [{ ...testTask }];
    comments = [];
    activityLogs = [];

    members = [
      { id: 'm-1', workspaceId: mainWorkspace.id, userId: ownerUser.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-2', workspaceId: mainWorkspace.id, userId: adminUser.id, role: 'ADMIN', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-3', workspaceId: mainWorkspace.id, userId: memberA.id, role: 'MEMBER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-4', workspaceId: mainWorkspace.id, userId: memberB.id, role: 'MEMBER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-5', workspaceId: mainWorkspace.id, userId: viewerUser.id, role: 'VIEWER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-6', workspaceId: otherWorkspace.id, userId: outsiderUser.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
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
      const project = projects.find((p) => p.id === found.projectId);
      return {
        ...found,
        project: project ? { ...project, workspace: mainWorkspace } : null,
      } as never;
    });

    // Mock prisma.comment
    vi.spyOn(prisma.comment as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = comments.find((c) => c.id === args.where.id);
      if (!found) return null;
      const task = tasks.find((t) => t.id === found.taskId);
      const project = task ? projects.find((p) => p.id === task.projectId) : null;
      const author = users.find((u) => u.id === found.authorId);
      return {
        ...found,
        author,
        task: task
          ? {
              ...task,
              project: project ? { ...project, workspace: mainWorkspace } : null,
            }
          : null,
      } as never;
    });

    vi.spyOn(prisma.comment as any, 'findMany').mockImplementation(async (args: any) => {
      const filtered = comments.filter((c) => {
        if (args.where.taskId && c.taskId !== args.where.taskId) return false;
        return true;
      });

      if (args.orderBy?.createdAt === 'desc') {
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else {
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }

      const skip = args.skip || 0;
      const take = args.take !== undefined ? args.take : filtered.length;
      const paginated = filtered.slice(skip, skip + take);

      return paginated.map((c) => ({
        ...c,
        author: users.find((u) => u.id === c.authorId) || null,
      })) as never;
    });

    vi.spyOn(prisma.comment as any, 'count').mockImplementation(async (args: any) => {
      const filtered = comments.filter((c) => {
        if (args.where.taskId && c.taskId !== args.where.taskId) return false;
        return true;
      });
      return filtered.length as never;
    });

    vi.spyOn(prisma.comment as any, 'create').mockImplementation(async (args: any) => {
      const newComment: MockComment = {
        id: randomUUID(),
        taskId: args.data.taskId,
        authorId: args.data.authorId,
        content: args.data.content,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      comments.push(newComment);
      const author = users.find((u) => u.id === newComment.authorId);
      return {
        ...newComment,
        author,
      } as never;
    });

    vi.spyOn(prisma.comment as any, 'update').mockImplementation(async (args: any) => {
      const found = comments.find((c) => c.id === args.where.id);
      if (!found) throw new Error('Comment not found');
      if (args.data.content !== undefined) found.content = args.data.content;
      found.updatedAt = new Date();
      const author = users.find((u) => u.id === found.authorId);
      return {
        ...found,
        author,
      } as never;
    });

    vi.spyOn(prisma.comment as any, 'delete').mockImplementation(async (args: any) => {
      comments = comments.filter((c) => c.id !== args.where.id);
      return {} as never;
    });

    // Mock prisma.activityLog
    vi.spyOn(prisma.activityLog as any, 'create').mockImplementation(async (args: any) => {
      const log: MockActivityLog = {
        id: randomUUID(),
        workspaceId: args.data.workspaceId ?? null,
        projectId: args.data.projectId,
        taskId: args.data.taskId ?? null,
        actorId: args.data.actorId,
        action: args.data.action,
        metadata: args.data.metadata ?? {},
        createdAt: new Date(),
      };
      activityLogs.push(log);
      return { ...log } as never;
    });

    vi.spyOn(prisma.activityLog as any, 'findMany').mockImplementation(async (args: any) => {
      const filtered = activityLogs.filter((a) => {
        if (args.where.taskId && a.taskId !== args.where.taskId) return false;
        if (args.where.projectId && a.projectId !== args.where.projectId) return false;
        return true;
      });

      if (args.orderBy?.createdAt === 'asc') {
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      } else {
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }

      const skip = args.skip || 0;
      const take = args.take !== undefined ? args.take : filtered.length;
      const paginated = filtered.slice(skip, skip + take);

      return paginated.map((a) => ({
        ...a,
        actor: users.find((u) => u.id === a.actorId) || null,
      })) as never;
    });

    vi.spyOn(prisma.activityLog as any, 'count').mockImplementation(async (args: any) => {
      const filtered = activityLogs.filter((a) => {
        if (args.where.taskId && a.taskId !== args.where.taskId) return false;
        if (args.where.projectId && a.projectId !== args.where.projectId) return false;
        return true;
      });
      return filtered.length as never;
    });

    // Mock prisma.$transaction with rollback
    vi.spyOn(prisma as any, '$transaction').mockImplementation(async (cb: any) => {
      const commentSnapshot = comments.map((c) => ({ ...c }));
      const logSnapshot = activityLogs.map((l) => ({ ...l }));
      try {
        const txMock = {
          comment: prisma.comment,
          activityLog: prisma.activityLog,
        };
        return await cb(txMock);
      } catch (err) {
        comments = commentSnapshot;
        activityLogs = logSnapshot;
        throw err;
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Viewers can read but not write comments
  describe('Viewer Permissions on Comments', () => {
    let commentId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/tasks/${testTask.id}/comments`)
        .set('Authorization', createAuthHeader(memberA))
        .send({ content: 'Initial discussion comment' });

      commentId = res.body.comment.id;
    });

    it('denies Viewer from posting a comment (403)', async () => {
      const res = await request(app)
        .post(`/api/tasks/${testTask.id}/comments`)
        .set('Authorization', createAuthHeader(viewerUser))
        .send({ content: 'Viewer trying to write' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Viewer to read comments (200)', async () => {
      const res = await request(app)
        .get(`/api/tasks/${testTask.id}/comments`)
        .set('Authorization', createAuthHeader(viewerUser));

      expect(res.status).toBe(200);
      expect(res.body.comments).toHaveLength(1);
      expect(res.body.comments[0].id).toBe(commentId);
      expect(res.body.comments[0].content).toBe('Initial discussion comment');
      expect(res.body.comments[0].author.name).toBe(memberA.name);
    });

    it('returns 404 when non-member tries to post or read comments', async () => {
      const postRes = await request(app)
        .post(`/api/tasks/${testTask.id}/comments`)
        .set('Authorization', createAuthHeader(outsiderUser))
        .send({ content: 'Outsider comment' });

      expect(postRes.status).toBe(404);

      const getRes = await request(app)
        .get(`/api/tasks/${testTask.id}/comments`)
        .set('Authorization', createAuthHeader(outsiderUser));

      expect(getRes.status).toBe(404);
    });
  });

  // 2. Authors can edit/delete only their own comments; Admin+ can delete any
  describe('Comment Edit and Delete Authorization', () => {
    let memberACommentId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/tasks/${testTask.id}/comments`)
        .set('Authorization', createAuthHeader(memberA))
        .send({ content: 'Comment by Member A' });

      memberACommentId = res.body.comment.id;
    });

    it('allows author to edit their own comment', async () => {
      const res = await request(app)
        .patch(`/api/comments/${memberACommentId}`)
        .set('Authorization', createAuthHeader(memberA))
        .send({ content: 'Updated comment content by Member A' });

      expect(res.status).toBe(200);
      expect(res.body.comment.content).toBe('Updated comment content by Member A');
    });

    it('denies non-author Member from editing another user comment (403)', async () => {
      const res = await request(app)
        .patch(`/api/comments/${memberACommentId}`)
        .set('Authorization', createAuthHeader(memberB))
        .send({ content: 'Member B attempting to edit Member A comment' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/You can only edit your own comments/i);
    });

    it('denies Admin from editing another user comment (403)', async () => {
      const res = await request(app)
        .patch(`/api/comments/${memberACommentId}`)
        .set('Authorization', createAuthHeader(adminUser))
        .send({ content: 'Admin attempting to edit Member A comment' });

      expect(res.status).toBe(403);
    });

    it('allows author to delete their own comment', async () => {
      const res = await request(app)
        .delete(`/api/comments/${memberACommentId}`)
        .set('Authorization', createAuthHeader(memberA));

      expect(res.status).toBe(200);
      expect(comments.find((c) => c.id === memberACommentId)).toBeUndefined();
    });

    it('denies non-author Member from deleting another user comment (403)', async () => {
      const res = await request(app)
        .delete(`/api/comments/${memberACommentId}`)
        .set('Authorization', createAuthHeader(memberB));

      expect(res.status).toBe(403);
      expect(comments.find((c) => c.id === memberACommentId)).toBeDefined();
    });

    it('allows Admin to delete another user comment (200)', async () => {
      const res = await request(app)
        .delete(`/api/comments/${memberACommentId}`)
        .set('Authorization', createAuthHeader(adminUser));

      expect(res.status).toBe(200);
      expect(comments.find((c) => c.id === memberACommentId)).toBeUndefined();
    });

    it('allows Owner to delete another user comment (200)', async () => {
      const res = await request(app)
        .delete(`/api/comments/${memberACommentId}`)
        .set('Authorization', createAuthHeader(ownerUser));

      expect(res.status).toBe(200);
      expect(comments.find((c) => c.id === memberACommentId)).toBeUndefined();
    });
  });

  // 3. Activity entries contain actor, action, and before/after metadata
  describe('Activity Feed & Metadata Tracking', () => {
    it('records activity with before/after metadata and actor on comment create and delete', async () => {
      // 1. Create comment
      const createRes = await request(app)
        .post(`/api/tasks/${testTask.id}/comments`)
        .set('Authorization', createAuthHeader(memberA))
        .send({ content: 'Logging comment test' });

      const commentId = createRes.body.comment.id;

      // 2. Fetch task activity
      const actRes = await request(app)
        .get(`/api/tasks/${testTask.id}/activity`)
        .set('Authorization', createAuthHeader(memberA));

      expect(actRes.status).toBe(200);
      expect(actRes.body.activities).toHaveLength(1);
      const act = actRes.body.activities[0];
      expect(act.action).toBe('COMMENT_CREATED');
      expect(act.actor.name).toBe(memberA.name);
      expect(act.actor.email).toBe(memberA.email);
      expect(act.metadata.commentId).toBe(commentId);
      expect(act.metadata.preview).toBe('Logging comment test');

      // 3. Delete comment by admin
      await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Authorization', createAuthHeader(adminUser));

      const actResAfterDel = await request(app)
        .get(`/api/tasks/${testTask.id}/activity`)
        .set('Authorization', createAuthHeader(memberA));

      expect(actResAfterDel.body.activities).toHaveLength(2);
      const delAct = actResAfterDel.body.activities[0];
      expect(delAct.action).toBe('COMMENT_DELETED');
      expect(delAct.actor.name).toBe(adminUser.name);
      expect(delAct.metadata.deletedByRole).toBe('ADMIN');
    });

    it('returns project activity feed with paginated entries', async () => {
      // Add multiple activity logs to the project
      activityLogs.push(
        {
          id: randomUUID(),
          workspaceId: mainWorkspace.id,
          projectId: testProject.id,
          taskId: testTask.id,
          actorId: memberA.id,
          action: 'TASK_STATUS_CHANGED',
          metadata: { changes: { status: { from: 'TODO', to: 'IN_PROGRESS' } } },
          createdAt: new Date('2026-10-15T10:00:00Z'),
        },
        {
          id: randomUUID(),
          workspaceId: mainWorkspace.id,
          projectId: testProject.id,
          taskId: testTask.id,
          actorId: adminUser.id,
          action: 'TASK_ASSIGNED',
          metadata: { changes: { assigneeId: { from: null, to: memberA.id } } },
          createdAt: new Date('2026-10-15T11:00:00Z'),
        },
      );

      const res = await request(app)
        .get(`/api/projects/${testProject.id}/activity?page=1&limit=10`)
        .set('Authorization', createAuthHeader(viewerUser));

      expect(res.status).toBe(200);
      expect(res.body.activities).toHaveLength(2);
      expect(res.body.activities[0].action).toBe('TASK_ASSIGNED');
      expect(res.body.activities[0].metadata.changes.assigneeId.to).toBe(memberA.id);
      expect(res.body.activities[1].action).toBe('TASK_STATUS_CHANGED');
      expect(res.body.activities[1].metadata.changes.status.from).toBe('TODO');
      expect(res.body.activities[1].metadata.changes.status.to).toBe('IN_PROGRESS');
      expect(res.body.pagination.total).toBe(2);
    });
  });

  // 4. Comment creation and activity row are in one transaction
  describe('Transactional Integrity', () => {
    it('creates comment and activity log in the same transaction and rolls back both on failure', async () => {
      const initialCommentCount = comments.length;
      const initialLogCount = activityLogs.length;

      await expect(
        commentsService.createComment(
          memberA.id,
          testTask.id,
          { content: 'Will fail comment' },
          async () => {
            throw new Error('Simulated transaction crash');
          },
        ),
      ).rejects.toThrow('Simulated transaction crash');

      // Assert rollback
      expect(comments.length).toBe(initialCommentCount);
      expect(activityLogs.length).toBe(initialLogCount);
      expect(comments.some((c) => c.content === 'Will fail comment')).toBe(false);
    });

    it('rolls back comment deletion and activity log on failure', async () => {
      const res = await request(app)
        .post(`/api/tasks/${testTask.id}/comments`)
        .set('Authorization', createAuthHeader(memberA))
        .send({ content: 'Persistent comment' });

      const commentId = res.body.comment.id;
      const initialCommentCount = comments.length;
      const initialLogCount = activityLogs.length;

      await expect(
        commentsService.deleteComment(memberA.id, commentId, async () => {
          throw new Error('Deletion crash');
        }),
      ).rejects.toThrow('Deletion crash');

      expect(comments.length).toBe(initialCommentCount);
      expect(activityLogs.length).toBe(initialLogCount);
      expect(comments.some((c) => c.id === commentId)).toBe(true);
    });
  });

  // 5. Pagination on comments and activity
  describe('Pagination', () => {
    it('paginates task comments correctly with metadata', async () => {
      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post(`/api/tasks/${testTask.id}/comments`)
          .set('Authorization', createAuthHeader(memberA))
          .send({ content: `Comment #${i}` });
      }

      const res = await request(app)
        .get(`/api/tasks/${testTask.id}/comments?page=2&limit=2`)
        .set('Authorization', createAuthHeader(memberA));

      expect(res.status).toBe(200);
      expect(res.body.comments).toHaveLength(2);
      expect(res.body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
      expect(res.body.comments[0].content).toBe('Comment #3');
      expect(res.body.comments[1].content).toBe('Comment #4');
    });

    it('paginates activity logs correctly with metadata', async () => {
      for (let i = 1; i <= 5; i++) {
        activityLogs.push({
          id: randomUUID(),
          workspaceId: mainWorkspace.id,
          projectId: testProject.id,
          taskId: testTask.id,
          actorId: memberA.id,
          action: 'LOG_ITEM',
          metadata: { index: i },
          createdAt: new Date(Date.now() + i * 1000),
        });
      }

      const res = await request(app)
        .get(`/api/tasks/${testTask.id}/activity?page=1&limit=3`)
        .set('Authorization', createAuthHeader(memberA));

      expect(res.status).toBe(200);
      expect(res.body.activities).toHaveLength(3);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 3,
        total: 5,
        totalPages: 2,
      });
    });
  });
});
