import { useEffect, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  PresenceUser,
  PresenceUpdateEvent,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskMovedEvent,
  TaskDeletedEvent,
  CommentCreatedEvent,
  TaskResponse,
  CommentListResponse,
} from '@sprintflow/shared';
import { getSocket } from '../lib/socket';

export interface UseProjectSocketReturn {
  presenceUsers: PresenceUser[];
  isConnected: boolean;
}

export function useProjectSocket(projectId: string | undefined): UseProjectSocketReturn {
  const queryClient = useQueryClient();
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Set to track processed event IDs (bounded to prevent unbounded memory growth)
  const processedEvents = useRef<Set<string>>(new Set());

  const isDuplicate = useCallback((eventId?: string) => {
    if (!eventId) return false;
    if (processedEvents.current.has(eventId)) {
      return true;
    }
    processedEvents.current.add(eventId);
    if (processedEvents.current.size > 1000) {
      const iter = processedEvents.current.values();
      for (let i = 0; i < 200; i++) {
        const val = iter.next().value;
        if (val) processedEvents.current.delete(val);
      }
    }
    return false;
  }, []);

  useEffect(() => {
    if (!projectId) {
      setPresenceUsers([]);
      return;
    }

    const socket = getSocket();

    const joinRoom = () => {
      socket.emit(
        'join:project',
        { projectId },
        (res?: { success: boolean; presence?: PresenceUser[]; error?: string }) => {
          if (res?.success && res.presence) {
            setPresenceUsers(res.presence);
          }
        },
      );
    };

    const handleConnect = () => {
      setIsConnected(true);
      joinRoom();
      // On connect/reconnect, resync state from API
      queryClient.invalidateQueries({ queryKey: ['board-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handlePresence = (data: PresenceUpdateEvent) => {
      if (data.projectId === projectId) {
        setPresenceUsers(data.users);
      }
    };

    const handleTaskCreated = (event: TaskCreatedEvent) => {
      if (event.projectId !== projectId) return;
      if (isDuplicate(event.eventId)) return;

      // 1. Update board tasks cache
      queryClient.setQueryData<TaskResponse[]>(['board-tasks', projectId], (old) => {
        if (!old) return [event.task];
        if (old.some((t) => t.id === event.task.id)) return old;
        const next = [...old, event.task];
        return next.sort((a, b) => a.position - b.position);
      });

      // 2. Invalidate task list queries
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    };

    const handleTaskUpdated = (event: TaskUpdatedEvent) => {
      if (event.projectId !== projectId) return;
      if (isDuplicate(event.eventId)) return;

      // 1. Update board tasks cache (ignore stale versions)
      queryClient.setQueryData<TaskResponse[]>(['board-tasks', projectId], (old) => {
        if (!old) return old;
        return old.map((t) => {
          if (t.id === event.task.id) {
            if (t.version >= event.task.version) {
              return t; // Stale event ignored
            }
            return event.task;
          }
          return t;
        });
      });

      // 2. Update single task query cache if loaded
      queryClient.setQueryData<{ task: TaskResponse }>(['task', event.task.id], (old) => {
        if (!old?.task) return old;
        if (old.task.version >= event.task.version) {
          return old;
        }
        return { task: event.task };
      });

      // 3. Invalidate task list query
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    };

    const handleTaskMoved = (event: TaskMovedEvent) => {
      if (event.projectId !== projectId) return;
      if (isDuplicate(event.eventId)) return;

      // 1. Update board tasks cache and resort
      queryClient.setQueryData<TaskResponse[]>(['board-tasks', projectId], (old) => {
        if (!old) return old;
        const updated = old.map((t) => {
          if (t.id === event.task.id) {
            if (t.version >= event.task.version) {
              return t;
            }
            return event.task;
          }
          return t;
        });
        return updated.sort((a, b) => a.position - b.position);
      });

      // 2. Update single task query cache if loaded
      queryClient.setQueryData<{ task: TaskResponse }>(['task', event.task.id], (old) => {
        if (!old?.task) return old;
        if (old.task.version >= event.task.version) {
          return old;
        }
        return { task: event.task };
      });

      // 3. Invalidate task list query
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    };

    const handleTaskDeleted = (event: TaskDeletedEvent) => {
      if (event.projectId !== projectId) return;
      if (isDuplicate(event.eventId)) return;

      // 1. Remove from board tasks cache
      queryClient.setQueryData<TaskResponse[]>(['board-tasks', projectId], (old) => {
        if (!old) return old;
        return old.filter((t) => t.id !== event.entityId);
      });

      // 2. Remove single task query
      queryClient.removeQueries({ queryKey: ['task', event.entityId] });

      // 3. Invalidate task list query
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    };

    const handleCommentCreated = (event: CommentCreatedEvent) => {
      if (event.projectId !== projectId) return;
      if (isDuplicate(event.eventId)) return;

      // Update task comments cache
      queryClient.setQueryData<CommentListResponse>(['task-comments', event.taskId], (old) => {
        if (!old) return old;
        if (old.comments.some((c) => c.id === event.comment.id)) return old;
        return {
          ...old,
          comments: [...old.comments, event.comment],
          pagination: {
            ...old.pagination,
            total: old.pagination.total + 1,
          },
        };
      });

      // Also invalidate activity for the task
      queryClient.invalidateQueries({ queryKey: ['task-activity', event.taskId] });
    };

    // If already connected when effect runs, join room
    if (socket.connected) {
      setIsConnected(true);
      joinRoom();
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('presence:update', handlePresence);
    socket.on('task:created', handleTaskCreated);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('task:moved', handleTaskMoved);
    socket.on('task:deleted', handleTaskDeleted);
    socket.on('comment:created', handleCommentCreated);

    return () => {
      socket.emit('leave:project', { projectId });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('presence:update', handlePresence);
      socket.off('task:created', handleTaskCreated);
      socket.off('task:updated', handleTaskUpdated);
      socket.off('task:moved', handleTaskMoved);
      socket.off('task:deleted', handleTaskDeleted);
      socket.off('comment:created', handleCommentCreated);
    };
  }, [projectId, queryClient, isDuplicate]);

  return { presenceUsers, isConnected };
}
