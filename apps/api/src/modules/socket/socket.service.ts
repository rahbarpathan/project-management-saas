import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import {
  TaskResponse,
  CommentResponse,
  PresenceUser,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskMovedEvent,
  TaskDeletedEvent,
  CommentCreatedEvent,
} from '@sprintflow/shared';
import { getEnv } from '../../config/env';
import { prisma } from '../../db/prisma';
import { logger } from '../../common/logger';
import { projectsService } from '../projects/projects.service';
import { JwtAccessPayload } from '../../common/middleware/authenticate';

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

export class SocketService {
  private io: SocketIOServer | null = null;
  // projectId -> Map<socketId, PresenceUser>
  private projectPresence: Map<string, Map<string, PresenceUser>> = new Map();
  // socketId -> Set<projectId>
  private socketProjects: Map<string, Set<string>> = new Map();

  public init(httpServer: HttpServer): SocketIOServer {
    const env = getEnv();

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: [env.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: true,
      },
      pingTimeout: 20000,
      pingInterval: 10000,
    });

    // Authentication middleware
    this.io.use(async (socket: Socket, next) => {
      try {
        const cookieHeader = socket.handshake.headers.cookie;
        const cookies = parseCookies(cookieHeader);
        const token = cookies.access_token || socket.handshake.auth?.token;

        if (!token) {
          return next(new Error('Authentication required'));
        }

        let payload: JwtAccessPayload;
        try {
          payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessPayload;
        } catch {
          return next(new Error('Authentication required'));
        }

        if (!payload || !payload.userId) {
          return next(new Error('Invalid token payload'));
        }

        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.data.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
        };

        next();
      } catch (err) {
        logger.error({ err }, 'Socket authentication error');
        next(new Error('Authentication required'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    logger.info('Socket.IO real-time server initialized');
    return this.io;
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }

  private handleConnection(socket: Socket) {
    const user = socket.data.user as PresenceUser;
    logger.debug({ socketId: socket.id, userId: user?.id }, 'Socket connected');

    socket.on(
      'join:project',
      async (
        { projectId }: { projectId: string },
        callback?: (res: { success: boolean; error?: string; presence?: PresenceUser[] }) => void,
      ) => {
        try {
          if (!projectId) {
            callback?.({ success: false, error: 'Project ID required' });
            return;
          }

          // Authorization check: verify user is a member of the workspace owning this project
          await projectsService.getProjectAndMembershipOrThrow(user.id, projectId);

          const room = `project:${projectId}`;
          socket.join(room);

          // Track presence
          if (!this.projectPresence.has(projectId)) {
            this.projectPresence.set(projectId, new Map());
          }
          this.projectPresence.get(projectId)!.set(socket.id, user);

          if (!this.socketProjects.has(socket.id)) {
            this.socketProjects.set(socket.id, new Set());
          }
          this.socketProjects.get(socket.id)!.add(projectId);

          const presenceList = this.getUniquePresence(projectId);

          // Broadcast presence update to project room
          this.io?.to(room).emit('presence:update', {
            projectId,
            users: presenceList,
          });

          callback?.({ success: true, presence: presenceList });
        } catch (err) {
          logger.warn({ err, userId: user?.id, projectId }, 'Failed to join project room');
          callback?.({
            success: false,
            error: 'Forbidden: user is not a member of this project',
          });
        }
      },
    );

    socket.on('leave:project', ({ projectId }: { projectId: string }) => {
      this.leaveProject(socket, projectId);
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
  }

  private leaveProject(socket: Socket, projectId: string) {
    const room = `project:${projectId}`;
    socket.leave(room);

    const presenceMap = this.projectPresence.get(projectId);
    if (presenceMap) {
      presenceMap.delete(socket.id);
      if (presenceMap.size === 0) {
        this.projectPresence.delete(projectId);
      } else {
        this.io?.to(room).emit('presence:update', {
          projectId,
          users: this.getUniquePresence(projectId),
        });
      }
    }

    this.socketProjects.get(socket.id)?.delete(projectId);
  }

  private handleDisconnect(socket: Socket) {
    const joinedProjects = this.socketProjects.get(socket.id);
    if (joinedProjects) {
      for (const projectId of joinedProjects) {
        const presenceMap = this.projectPresence.get(projectId);
        if (presenceMap) {
          presenceMap.delete(socket.id);
          const room = `project:${projectId}`;
          if (presenceMap.size === 0) {
            this.projectPresence.delete(projectId);
          } else {
            this.io?.to(room).emit('presence:update', {
              projectId,
              users: this.getUniquePresence(projectId),
            });
          }
        }
      }
      this.socketProjects.delete(socket.id);
    }
  }

  public getUniquePresence(projectId: string): PresenceUser[] {
    const map = this.projectPresence.get(projectId);
    if (!map) return [];

    const seen = new Set<string>();
    const users: PresenceUser[] = [];

    for (const u of map.values()) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        users.push(u);
      }
    }

    return users;
  }

  // --- Real-time Mutation Event Emitters ---

  public emitTaskCreated(projectId: string, task: TaskResponse) {
    if (!this.io) return;
    const event: TaskCreatedEvent = {
      eventId: randomUUID(),
      projectId,
      entityId: task.id,
      version: task.version,
      task,
    };
    this.io.to(`project:${projectId}`).emit('task:created', event);
  }

  public emitTaskUpdated(projectId: string, task: TaskResponse) {
    if (!this.io) return;
    const event: TaskUpdatedEvent = {
      eventId: randomUUID(),
      projectId,
      entityId: task.id,
      version: task.version,
      task,
    };
    this.io.to(`project:${projectId}`).emit('task:updated', event);
  }

  public emitTaskMoved(projectId: string, task: TaskResponse) {
    if (!this.io) return;
    const event: TaskMovedEvent = {
      eventId: randomUUID(),
      projectId,
      entityId: task.id,
      version: task.version,
      task,
    };
    this.io.to(`project:${projectId}`).emit('task:moved', event);
  }

  public emitTaskDeleted(projectId: string, taskId: string, version: number) {
    if (!this.io) return;
    const event: TaskDeletedEvent = {
      eventId: randomUUID(),
      projectId,
      entityId: taskId,
      version,
    };
    this.io.to(`project:${projectId}`).emit('task:deleted', event);
  }

  public emitCommentCreated(
    projectId: string,
    taskId: string,
    comment: CommentResponse,
  ) {
    if (!this.io) return;
    const event: CommentCreatedEvent = {
      eventId: randomUUID(),
      projectId,
      entityId: comment.id,
      version: 1,
      taskId,
      comment,
    };
    this.io.to(`project:${projectId}`).emit('comment:created', event);
  }
}

export const socketService = new SocketService();
