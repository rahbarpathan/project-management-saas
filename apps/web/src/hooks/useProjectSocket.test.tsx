/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useProjectSocket } from './useProjectSocket';
import * as socketLib from '../lib/socket';
import {
  TaskResponse,
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  PresenceUser,
} from '@sprintflow/shared';

describe('useProjectSocket Hook', () => {
  let queryClient: QueryClient;
  let mockSocket: any;
  let eventHandlers: Record<string, ((...args: any[]) => void)[]>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    eventHandlers = {};

    mockSocket = {
      connected: true,
      emit: vi.fn((event: string, _data: any, callback?: any) => {
        if (event === 'join:project' && callback) {
          callback({
            success: true,
            presence: [
              {
                id: 'u-1',
                name: 'Alice',
                email: 'alice@example.com',
                avatarUrl: null,
              },
            ],
          });
        }
      }),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = [];
        }
        eventHandlers[event].push(handler);
      }),
      off: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (eventHandlers[event]) {
          eventHandlers[event] = eventHandlers[event].filter((h) => h !== handler);
        }
      }),
    };

    vi.spyOn(socketLib, 'getSocket').mockReturnValue(mockSocket);
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const triggerEvent = (event: string, data: any) => {
    act(() => {
      const handlers = eventHandlers[event] || [];
      handlers.forEach((h) => h(data));
    });
  };

  it('joins project room on mount and leaves on unmount', () => {
    const { unmount } = renderHook(() => useProjectSocket('proj-123'), { wrapper });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'join:project',
      { projectId: 'proj-123' },
      expect.any(Function),
    );

    unmount();

    expect(mockSocket.emit).toHaveBeenCalledWith('leave:project', { projectId: 'proj-123' });
  });

  it('updates presenceUsers on presence:update event', () => {
    const { result } = renderHook(() => useProjectSocket('proj-123'), { wrapper });

    expect(result.current.presenceUsers).toHaveLength(1);
    expect(result.current.presenceUsers[0]?.name).toBe('Alice');

    const updatedUsers: PresenceUser[] = [
      { id: 'u-1', name: 'Alice', email: 'alice@example.com', avatarUrl: null },
      { id: 'u-2', name: 'Bob', email: 'bob@example.com', avatarUrl: null },
    ];

    triggerEvent('presence:update', {
      projectId: 'proj-123',
      users: updatedUsers,
    });

    expect(result.current.presenceUsers).toHaveLength(2);
    expect(result.current.presenceUsers[1]?.name).toBe('Bob');
  });

  it('applies task:created event to board-tasks cache', () => {
    const initialTasks: TaskResponse[] = [
      {
        id: 't-1',
        projectId: 'proj-123',
        title: 'Task 1',
        status: 'BACKLOG',
        priority: 'MEDIUM',
        position: 1000,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    queryClient.setQueryData(['board-tasks', 'proj-123'], initialTasks);

    renderHook(() => useProjectSocket('proj-123'), { wrapper });

    const newTask: TaskResponse = {
      id: 't-2',
      projectId: 'proj-123',
      title: 'Task 2',
      status: 'TODO',
      priority: 'HIGH',
      position: 500,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const createdEvent: TaskCreatedEvent = {
      eventId: 'evt-100',
      projectId: 'proj-123',
      entityId: 't-2',
      version: 1,
      task: newTask,
    };

    triggerEvent('task:created', createdEvent);

    const cached = queryClient.getQueryData<TaskResponse[]>(['board-tasks', 'proj-123']);
    expect(cached).toHaveLength(2);
    // Should be sorted by position (500 comes before 1000)
    expect(cached?.[0]?.id).toBe('t-2');
    expect(cached?.[1]?.id).toBe('t-1');
  });

  it('ignores duplicate events with the same eventId', () => {
    const initialTasks: TaskResponse[] = [];
    queryClient.setQueryData(['board-tasks', 'proj-123'], initialTasks);

    renderHook(() => useProjectSocket('proj-123'), { wrapper });

    const newTask: TaskResponse = {
      id: 't-1',
      projectId: 'proj-123',
      title: 'Duplicate test',
      status: 'TODO',
      priority: 'HIGH',
      position: 1000,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const event: TaskCreatedEvent = {
      eventId: 'evt-dup-1',
      projectId: 'proj-123',
      entityId: 't-1',
      version: 1,
      task: newTask,
    };

    // Emit twice with identical eventId
    triggerEvent('task:created', event);
    triggerEvent('task:created', event);

    const cached = queryClient.getQueryData<TaskResponse[]>(['board-tasks', 'proj-123']);
    expect(cached).toHaveLength(1);
  });

  it('ignores stale task updates where cached task version is >= event version', () => {
    const existingTask: TaskResponse = {
      id: 't-1',
      projectId: 'proj-123',
      title: 'Current Version Task',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      position: 1000,
      version: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    queryClient.setQueryData(['board-tasks', 'proj-123'], [existingTask]);

    renderHook(() => useProjectSocket('proj-123'), { wrapper });

    // Stale event with version 2 (cached is version 3)
    const staleEvent: TaskUpdatedEvent = {
      eventId: 'evt-stale-1',
      projectId: 'proj-123',
      entityId: 't-1',
      version: 2,
      task: {
        ...existingTask,
        title: 'Stale Title Overwrite',
        version: 2,
      },
    };

    triggerEvent('task:updated', staleEvent);

    const cached = queryClient.getQueryData<TaskResponse[]>(['board-tasks', 'proj-123']);
    expect(cached?.[0]?.title).toBe('Current Version Task');
    expect(cached?.[0]?.version).toBe(3);

    // Fresh event with version 4
    const freshEvent: TaskUpdatedEvent = {
      eventId: 'evt-fresh-1',
      projectId: 'proj-123',
      entityId: 't-1',
      version: 4,
      task: {
        ...existingTask,
        title: 'Fresh Title Overwrite',
        version: 4,
      },
    };

    triggerEvent('task:updated', freshEvent);

    const updatedCached = queryClient.getQueryData<TaskResponse[]>(['board-tasks', 'proj-123']);
    expect(updatedCached?.[0]?.title).toBe('Fresh Title Overwrite');
    expect(updatedCached?.[0]?.version).toBe(4);
  });

  it('removes task on task:deleted event', () => {
    const task: TaskResponse = {
      id: 't-del',
      projectId: 'proj-123',
      title: 'Task to Delete',
      status: 'TODO',
      priority: 'LOW',
      position: 1000,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    queryClient.setQueryData(['board-tasks', 'proj-123'], [task]);

    renderHook(() => useProjectSocket('proj-123'), { wrapper });

    const deleteEvent: TaskDeletedEvent = {
      eventId: 'evt-del-1',
      projectId: 'proj-123',
      entityId: 't-del',
      version: 1,
    };

    triggerEvent('task:deleted', deleteEvent);

    const cached = queryClient.getQueryData<TaskResponse[]>(['board-tasks', 'proj-123']);
    expect(cached).toHaveLength(0);
  });

  it('resyncs board from API on reconnect', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useProjectSocket('proj-123'), { wrapper });

    // Trigger connect event (e.g. after disconnect reconnect)
    triggerEvent('connect', undefined);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['board-tasks', 'proj-123'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'proj-123'] });
  });
});
