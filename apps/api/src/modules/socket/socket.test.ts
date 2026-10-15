/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../db/prisma';
import { getEnv } from '../../config/env';
import { socketService } from './socket.service';
import { tasksService } from '../tasks/tasks.service';
import { commentsService } from '../comments/comments.service';
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

describe('Socket.IO Real-time & Presence Integration Tests', () => {
  let server: http.Server;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  let users: MockUser[] = [];
  let members: MockWorkspaceMember[] = [];
  let projects: MockProject[] = [];
  let tasks: MockTask[] = [];
  let comments: any[] = [];
  let activityLogs: any[] = [];

  const memberUser: MockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'alice@sprintflow.dev',
    name: 'Alice Member',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const outsiderUser: MockUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'outsider@sprintflow.dev',
    name: 'Bob Outsider',
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
    name: 'Realtime Project',
    key: 'REAL',
    description: 'Testing realtime updates',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function createCookie(user: { id: string; email: string }): string {
    const env = getEnv();
    const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_ACCESS_SECRET, {
      expiresIn: '1h',
    });
    return `access_token=${token}`;
  }

  function createClientSocket(cookie?: string): ClientSocket {
    const socket = Client(`http://localhost:${port}`, {
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
      transports: ['websocket'],
      forceNew: true,
      autoConnect: false,
    });
    clientSockets.push(socket);
    return socket;
  }

  beforeEach(async () => {
    users = [{ ...memberUser }, { ...outsiderUser }];
    projects = [{ ...testProject }];
    tasks = [];
    comments = [];
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
      if (!found) return null;
      return {
        ...found,
        workspace: mainWorkspace,
      };
    });

    // Mock prisma.task
    vi.spyOn(prisma.task as any, 'findFirst').mockImplementation(async () => null);

    vi.spyOn(prisma.task as any, 'findUnique').mockImplementation(async (args: any) => {
      const found = tasks.find((t) => t.id === args.where.id);
      if (!found) return null;
      return {
        ...found,
        assignee: found.assigneeId ? users.find((u) => u.id === found.assigneeId) : null,
        project: { ...testProject, workspace: mainWorkspace },
      };
    });

    vi.spyOn(prisma.task as any, 'findUniqueOrThrow').mockImplementation(async (args: any) => {
      const found = tasks.find((t) => t.id === args.where.id);
      if (!found) throw new Error('Task not found');
      return {
        ...found,
        assignee: found.assigneeId ? users.find((u) => u.id === found.assigneeId) : null,
        project: { ...testProject, workspace: mainWorkspace },
      };
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
      };
    });

    vi.spyOn(prisma.task as any, 'updateMany').mockImplementation(async (args: any) => {
      const { id, version } = args.where;
      const target = tasks.find((t) => t.id === id && t.version === version);
      if (!target) return { count: 0 };
      if (args.data.version?.increment) target.version += args.data.version.increment;
      if (args.data.title !== undefined) target.title = args.data.title;
      if (args.data.status !== undefined) target.status = args.data.status;
      target.updatedAt = new Date();
      return { count: 1 };
    });

    vi.spyOn(prisma.task as any, 'delete').mockImplementation(async (args: any) => {
      tasks = tasks.filter((t) => t.id !== args.where.id);
      return {};
    });

    vi.spyOn(prisma.comment as any, 'create').mockImplementation(async (args: any) => {
      const newComment = {
        id: randomUUID(),
        taskId: args.data.taskId,
        authorId: args.data.authorId,
        content: args.data.content,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: users.find((u) => u.id === args.data.authorId) || null,
      };
      comments.push(newComment);
      return newComment;
    });

    vi.spyOn(prisma.comment as any, 'deleteMany').mockResolvedValue({ count: 0 });
    vi.spyOn(prisma.sprintTask as any, 'deleteMany').mockResolvedValue({ count: 0 });

    vi.spyOn(prisma.activityLog as any, 'create').mockImplementation(async (args: any) => {
      const log = {
        id: `act-${activityLogs.length + 1}`,
        ...args.data,
        createdAt: new Date(),
      };
      activityLogs.push(log);
      return log;
    });

    // Mock prisma.$transaction
    vi.spyOn(prisma as any, '$transaction').mockImplementation(async (cb: any) => {
      const taskSnapshot = tasks.map((t) => ({ ...t }));
      const commentSnapshot = comments.map((c) => ({ ...c }));
      try {
        const txMock = {
          task: prisma.task,
          comment: prisma.comment,
          sprintTask: prisma.sprintTask,
          activityLog: prisma.activityLog,
        };
        return await cb(txMock);
      } catch (err) {
        tasks = taskSnapshot;
        comments = commentSnapshot;
        throw err;
      }
    });

    // Setup HTTP and Socket.IO server
    const app = createApp();
    server = http.createServer(app);
    socketService.init(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    clientSockets.length = 0;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    vi.restoreAllMocks();
  });

  it('unauthenticated socket connection is rejected', async () => {
    const socket = createClientSocket(); // No cookie header

    const errorPromise = new Promise<string>((resolve) => {
      socket.on('connect_error', (err) => {
        resolve(err.message);
      });
    });

    socket.connect();

    const errorMessage = await errorPromise;
    expect(errorMessage).toBe('Authentication required');
    expect(socket.connected).toBe(false);
  });

  it('authenticated socket connection succeeds with cookie', async () => {
    const cookie = createCookie(memberUser);
    const socket = createClientSocket(cookie);

    const connectPromise = new Promise<void>((resolve) => {
      socket.on('connect', () => {
        resolve();
      });
    });

    socket.connect();
    await connectPromise;

    expect(socket.connected).toBe(true);
  });

  it('joining a room of a project you are not a member of is rejected', async () => {
    const cookie = createCookie(outsiderUser);
    const socket = createClientSocket(cookie);

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
      socket.connect();
    });

    const joinResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      socket.emit('join:project', { projectId: testProject.id }, (res: any) => {
        resolve(res);
      });
    });

    expect(joinResult.success).toBe(false);
    expect(joinResult.error).toContain('Forbidden');
  });

  it('joining a room of a project you are a member of succeeds and receives presence', async () => {
    const cookie = createCookie(memberUser);
    const socket = createClientSocket(cookie);

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
      socket.connect();
    });

    const joinResult = await new Promise<{ success: boolean; presence?: any[] }>((resolve) => {
      socket.emit('join:project', { projectId: testProject.id }, (res: any) => {
        resolve(res);
      });
    });

    expect(joinResult.success).toBe(true);
    expect(joinResult.presence).toHaveLength(1);
    expect(joinResult.presence![0].id).toBe(memberUser.id);
  });

  it('presence updates when user leaves or disconnects', async () => {
    const cookie = createCookie(memberUser);
    const socket1 = createClientSocket(cookie);
    const socket2 = createClientSocket(cookie);

    await new Promise<void>((resolve) => {
      socket1.on('connect', () => resolve());
      socket1.connect();
    });

    await new Promise<void>((resolve) => {
      socket2.on('connect', () => resolve());
      socket2.connect();
    });

    // Join room with socket1
    await new Promise<void>((resolve) => {
      socket1.emit('join:project', { projectId: testProject.id }, () => resolve());
    });

    // Join room with socket2
    await new Promise<void>((resolve) => {
      socket2.emit('join:project', { projectId: testProject.id }, () => resolve());
    });

    expect(socketService.getUniquePresence(testProject.id)).toHaveLength(1);

    // Leave with socket2
    socket2.emit('leave:project', { projectId: testProject.id });

    // socket1 is still there
    expect(socketService.getUniquePresence(testProject.id)).toHaveLength(1);

    // Disconnect socket1
    socket1.disconnect();
    // Wait briefly for disconnect handler
    await new Promise((r) => setTimeout(r, 50));

    expect(socketService.getUniquePresence(testProject.id)).toHaveLength(0);
  });

  it('emits task:created, task:updated, task:deleted, and comment:created with version and unique eventId', async () => {
    const cookie = createCookie(memberUser);
    const socket = createClientSocket(cookie);

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
      socket.connect();
    });

    await new Promise<void>((resolve) => {
      socket.emit('join:project', { projectId: testProject.id }, () => resolve());
    });

    // 1. Test task:created
    const taskCreatedPromise = new Promise<any>((resolve) => {
      socket.on('task:created', (data) => resolve(data));
    });

    const createdTask = await tasksService.createTask(memberUser.id, testProject.id, {
      title: 'Realtime task',
      status: 'BACKLOG',
      priority: 'HIGH',
    });

    const createdEvent = await taskCreatedPromise;
    expect(createdEvent).toBeDefined();
    expect(createdEvent.projectId).toBe(testProject.id);
    expect(createdEvent.entityId).toBe(createdTask.id);
    expect(createdEvent.version).toBe(1);
    expect(createdEvent.eventId).toBeDefined();
    expect(typeof createdEvent.eventId).toBe('string');
    expect(createdEvent.task.title).toBe('Realtime task');

    // 2. Test task:updated
    const taskUpdatedPromise = new Promise<any>((resolve) => {
      socket.on('task:updated', (data) => resolve(data));
    });

    await tasksService.updateTask(memberUser.id, createdTask.id, {
      version: 1,
      title: 'Updated title',
    });

    const updatedEvent = await taskUpdatedPromise;
    expect(updatedEvent.entityId).toBe(createdTask.id);
    expect(updatedEvent.version).toBe(2);
    expect(updatedEvent.eventId).toBeDefined();
    expect(updatedEvent.eventId).not.toBe(createdEvent.eventId);
    expect(updatedEvent.task.title).toBe('Updated title');

    // 3. Test comment:created
    const commentCreatedPromise = new Promise<any>((resolve) => {
      socket.on('comment:created', (data) => resolve(data));
    });

    const comment = await commentsService.createComment(memberUser.id, createdTask.id, {
      content: 'Here is a new comment',
    });

    const commentEvent = await commentCreatedPromise;
    expect(commentEvent.entityId).toBe(comment.id);
    expect(commentEvent.taskId).toBe(createdTask.id);
    expect(commentEvent.eventId).toBeDefined();

    // 4. Test task:deleted
    const taskDeletedPromise = new Promise<any>((resolve) => {
      socket.on('task:deleted', (data) => resolve(data));
    });

    await tasksService.deleteTask(memberUser.id, createdTask.id);

    const deletedEvent = await taskDeletedPromise;
    expect(deletedEvent.entityId).toBe(createdTask.id);
    expect(deletedEvent.version).toBe(2);
    expect(deletedEvent.eventId).toBeDefined();
  });

  it('failed DB write emits nothing (tested)', async () => {
    const cookie = createCookie(memberUser);
    const socket = createClientSocket(cookie);

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
      socket.connect();
    });

    await new Promise<void>((resolve) => {
      socket.emit('join:project', { projectId: testProject.id }, () => resolve());
    });

    let eventEmitted = false;
    socket.on('task:created', () => {
      eventEmitted = true;
    });

    // Execute createTask with a transaction hook that throws to trigger transaction rollback
    await expect(
      tasksService.createTask(
        memberUser.id,
        testProject.id,
        { title: 'Doomed task' },
        async () => {
          throw new Error('Database constraint violation failure');
        },
      ),
    ).rejects.toThrow('Database constraint violation failure');

    // Wait a brief tick to ensure no events were pushed through the socket
    await new Promise((r) => setTimeout(r, 100));
    expect(eventEmitted).toBe(false);
  });
});
