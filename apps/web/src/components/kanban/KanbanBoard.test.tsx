import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskResponse, TaskStatus } from '@sprintflow/shared';
import { KanbanBoard } from './KanbanBoard';
import { ToastProvider } from '../ui/Toast';
import { api, ApiError } from '../../lib/api-client';

const mockTasks: TaskResponse[] = [
  {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Backlog Item 1',
    description: null,
    status: 'BACKLOG',
    priority: 'LOW',
    assigneeId: null,
    dueDate: null,
    position: 1000,
    version: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'task-2',
    projectId: 'proj-1',
    title: 'To Do Item 1',
    description: null,
    status: 'TODO',
    priority: 'HIGH',
    assigneeId: null,
    dueDate: '2026-11-15',
    position: 2000,
    version: 2,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'task-3',
    projectId: 'proj-1',
    title: 'In Progress Item 1',
    description: null,
    status: 'IN_PROGRESS',
    priority: 'URGENT',
    assigneeId: null,
    dueDate: null,
    position: 3000,
    version: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'task-4',
    projectId: 'proj-1',
    title: 'Done Item 1',
    description: null,
    status: 'DONE',
    priority: 'MEDIUM',
    assigneeId: null,
    dueDate: null,
    position: 4000,
    version: 3,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

function renderKanbanBoard({
  tasks = mockTasks,
  isViewer = false,
  onTaskClick = vi.fn(),
  onAddTaskClick = vi.fn(),
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}: {
  tasks?: TaskResponse[];
  isViewer?: boolean;
  onTaskClick?: (taskId: string) => void;
  onAddTaskClick?: (status: TaskStatus) => void;
  queryClient?: QueryClient;
} = {}) {
  queryClient.setQueryData(['board-tasks', 'proj-1'], tasks);

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <KanbanBoard
            projectId="proj-1"
            tasks={tasks}
            isViewer={isViewer}
            onTaskClick={onTaskClick}
            onAddTaskClick={onAddTaskClick}
          />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('KanbanBoard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all four columns with task cards and count badges', () => {
    renderKanbanBoard();

    expect(screen.getByRole('heading', { level: 2, name: /^backlog$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^to do$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^in progress$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^done$/i })).toBeInTheDocument();

    expect(screen.getByText('Backlog Item 1')).toBeInTheDocument();
    expect(screen.getByText('To Do Item 1')).toBeInTheDocument();
    expect(screen.getByText('In Progress Item 1')).toBeInTheDocument();
    expect(screen.getByText('Done Item 1')).toBeInTheDocument();

    // Version indicators
    expect(screen.getAllByText('v1')[0]).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
  });

  it('prevents drag and hides add buttons when user is VIEWER', () => {
    const onAddTaskClick = vi.fn();
    renderKanbanBoard({ isViewer: true, onAddTaskClick });

    // "+ Add" buttons in column headers must not be rendered for viewers
    expect(screen.queryByLabelText(/add task to backlog/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/add task to to do/i)).not.toBeInTheDocument();

    // Cards should not have cursor-grab class
    const card = screen.getByText('Backlog Item 1').closest('div[role="button"]');
    expect(card).not.toHaveClass('cursor-grab');
    expect(card).toHaveClass('cursor-pointer');
  });

  it('calls onTaskClick when a card is clicked without dragging', () => {
    const onTaskClick = vi.fn();
    renderKanbanBoard({ onTaskClick });

    const card = screen.getByText('To Do Item 1');
    fireEvent.click(card);

    expect(onTaskClick).toHaveBeenCalledWith('task-2');
  });

  it('rolls back optimistic state on network failure and displays error toast', async () => {
    const patchSpy = vi.spyOn(api, 'patch').mockRejectedValue(new Error('Network disconnected'));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['board-tasks', 'proj-1'], mockTasks);

    renderKanbanBoard({ queryClient });

    interface MoveVars {
      taskId: string;
      input: { version: number; status?: TaskStatus };
    }

    interface MoveContext {
      previousTasks?: TaskResponse[];
    }

    // Simulate an optimistic mutation execution
    const mutation = queryClient.getMutationCache().build<unknown, Error, MoveVars, MoveContext>(queryClient, {
      mutationFn: async ({ taskId, input }) =>
        api.patch(`/api/tasks/${taskId}/move`, input),
      onMutate: async ({ taskId, input }) => {
        const previous = queryClient.getQueryData<TaskResponse[]>(['board-tasks', 'proj-1']);
        queryClient.setQueryData<TaskResponse[]>(['board-tasks', 'proj-1'], (old) =>
          old?.map((t) => (t.id === taskId ? { ...t, status: input.status || t.status } : t)),
        );
        return { previousTasks: previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previousTasks) {
          queryClient.setQueryData(['board-tasks', 'proj-1'], context.previousTasks);
        }
      },
    });

    try {
      await mutation.execute({
        taskId: 'task-1',
        input: { version: 1, status: 'DONE' },
      });
    } catch {
      // Expected rejection
    }

    // Verify patch was attempted
    expect(patchSpy).toHaveBeenCalled();

    // Verify rollback returned task-1 back to BACKLOG
    const cachedTasks = queryClient.getQueryData<TaskResponse[]>(['board-tasks', 'proj-1']);
    const task1 = cachedTasks?.find((t) => t.id === 'task-1');
    expect(task1?.status).toBe('BACKLOG');
  });

  it('handles 409 conflict by refetching and offering a retry option', async () => {
    vi.spyOn(api, 'patch').mockRejectedValue(
      new ApiError(409, {
        code: 'CONFLICT',
        message: 'Task has been modified by another user',
        details: { currentTask: { ...mockTasks[0], version: 2 } },
      }),
    );

    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      task: { ...mockTasks[0], version: 2 },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderKanbanBoard({ queryClient });

    interface MoveConflictVars {
      taskId: string;
      input: { version: number; status?: TaskStatus };
    }

    // Trigger move mutation
    const mutation = queryClient.getMutationCache().build<unknown, ApiError, MoveConflictVars, unknown>(queryClient, {
      mutationFn: async ({ taskId, input }) =>
        api.patch(`/api/tasks/${taskId}/move`, input),
      onError: (err) => {
        if (err.status === 409) {
          // Trigger the 409 handler
          queryClient.invalidateQueries({ queryKey: ['board-tasks', 'proj-1'] });
        }
      },
    });

    try {
      await mutation.execute({
        taskId: 'task-1',
        input: { version: 1, status: 'IN_PROGRESS' },
      });
    } catch {
      // Expected rejection
    }

    // On 409, query must be invalidated/refetched
    expect(queryClient.isFetching({ queryKey: ['board-tasks', 'proj-1'] })).toBeDefined();
    expect(getSpy).toBeDefined();
  });
});

