import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskResponse, Role } from '@sprintflow/shared';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { ToastProvider } from './ui/Toast';
import { AuthContext } from '../context/AuthContext';
import { api, ApiError } from '../lib/api-client';

const mockTask: TaskResponse = {
  id: 'task-123',
  projectId: 'proj-456',
  title: 'Implement OAuth Authentication',
  description: 'Need to add GitHub and Google providers',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  assigneeId: 'user-789',
  dueDate: '2026-11-01T00:00:00.000Z',
  position: 1000,
  version: 3,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T12:00:00.000Z',
  assignee: {
    id: 'user-789',
    name: 'Jane Doe',
    email: 'jane@example.com',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
};

const mockMembers = [
  {
    id: 'mem-1',
    workspaceId: 'ws-1',
    userId: 'user-789',
    role: 'MEMBER' as const,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    user: {
      id: 'user-789',
      name: 'Jane Doe',
      email: 'jane@example.com',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  },
];

const mockWorkspaceContextValue = {
  workspaces: [],
  activeWorkspace: {
    id: 'ws-1',
    name: 'Acme Workspace',
    slug: 'acme',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    currentUserRole: 'MEMBER' as const,
  },
  activeWorkspaceId: 'ws-1',
  setActiveWorkspaceId: vi.fn(),
  isLoading: false,
  error: null,
  refetchWorkspaces: vi.fn(),
  role: 'MEMBER' as Role | null,
  isOwner: false,
  isAdmin: false,
  isMember: true,
  isViewer: false,
  canManageMembers: false,
  canManageProjects: false,
  canManageTasks: true,
  canComment: true,
  canDeleteWorkspace: false,
  isCreateModalOpen: false,
  setIsCreateModalOpen: vi.fn(),
};

vi.mock('../context/WorkspaceContext', () => ({
  useWorkspace: () => mockWorkspaceContextValue,
}));

function renderTaskDetailDrawer({
  isViewer = false,
  onClose = vi.fn(),
}: {
  isViewer?: boolean;
  onClose?: () => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Temporarily override isViewer and canManageTasks
  mockWorkspaceContextValue.isViewer = isViewer;
  mockWorkspaceContextValue.canManageTasks = !isViewer;
  mockWorkspaceContextValue.role = isViewer ? 'VIEWER' : 'MEMBER';

  const authValue = {
    user: {
      id: 'user-789',
      email: 'jane@example.com',
      name: 'Jane Doe',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    token: 'test-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthContext.Provider value={authValue}>
          <TaskDetailDrawer
            taskId="task-123"
            workspaceId="ws-1"
            projectId="proj-456"
            isOpen={true}
            onClose={onClose}
            members={mockMembers}
          />
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TaskDetailDrawer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/api/tasks/task-123')) {
        return { task: mockTask };
      }
      if (url.includes('/comments')) {
        return { comments: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } };
      }
      if (url.includes('/activity')) {
        return { activities: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } };
      }
      return {};
    });
  });

  it('renders task details with current version badge', async () => {
    renderTaskDetailDrawer();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Implement OAuth Authentication')).toBeInTheDocument();
    });

    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Need to add GitHub and Google providers')).toBeInTheDocument();
    expect(screen.getByDisplayValue('In Progress')).toBeInTheDocument();
    expect(screen.getByDisplayValue('High')).toBeInTheDocument();
  });

  it('submits edit form sending the current version for concurrency control', async () => {
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({
      task: { ...mockTask, version: 4, title: 'Updated OAuth Task' },
    });

    renderTaskDetailDrawer();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Implement OAuth Authentication')).toBeInTheDocument();
    });

    const titleInput = screen.getByDisplayValue('Implement OAuth Authentication');
    fireEvent.change(titleInput, { target: { value: 'Updated OAuth Task' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('/api/tasks/task-123', expect.objectContaining({
        version: 3, // Current version must be included!
        title: 'Updated OAuth Task',
      }));
    });
  });

  it('displays conflict message and refetches when receiving 409 Conflict', async () => {
    const getSpy = vi.spyOn(api, 'get');
    vi.spyOn(api, 'patch').mockRejectedValue(
      new ApiError(409, {
        code: 'CONFLICT',
        message: 'Task has been modified by another user',
        details: { currentTask: { ...mockTask, version: 4, title: 'Title Modified Elsewhere' } },
      }),
    );

    renderTaskDetailDrawer();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Implement OAuth Authentication')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    // Conflict banner should be rendered
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/conflict/i);
    });

    // api.get should have been called again to refetch
    expect(getSpy).toHaveBeenCalledWith('/api/tasks/task-123');
  });

  it('renders read-only UI for VIEWER role with disabled inputs and no save button', async () => {
    renderTaskDetailDrawer({ isViewer: true });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Implement OAuth Authentication')).toBeInTheDocument();
    });

    // Inputs must be disabled
    expect(screen.getByLabelText(/title/i)).toBeDisabled();
    expect(screen.getByLabelText(/status/i)).toBeDisabled();
    expect(screen.getByLabelText(/priority/i)).toBeDisabled();

    // Viewer banner shown
    expect(screen.getByText(/viewer mode/i)).toBeInTheDocument();

    // Save Changes and Delete Task buttons should not exist
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete task/i })).not.toBeInTheDocument();
  });
});
