import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectTasksPage } from './ProjectTasksPage';
import { ToastProvider } from '../components/ui/Toast';
import { AuthContext } from '../context/AuthContext';
import { api } from '../lib/api-client';

const mockProject = {
  id: 'proj-1',
  workspaceId: 'ws-1',
  name: 'Mobile Client',
  key: 'MC',
  description: 'iOS and Android apps',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const mockTasks = [
  {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Fix crash on startup',
    description: 'Crash reported on Android 14',
    status: 'IN_PROGRESS' as const,
    priority: 'URGENT' as const,
    assigneeId: null,
    dueDate: '2026-10-30',
    position: 1000,
    version: 1,
    createdAt: '2026-10-15',
    updatedAt: '2026-10-15',
  },
  {
    id: 'task-2',
    projectId: 'proj-1',
    title: 'Add dark mode support',
    description: 'Support OLED dark mode',
    status: 'DONE' as const,
    priority: 'MEDIUM' as const,
    assigneeId: null,
    dueDate: null,
    position: 2000,
    version: 2,
    createdAt: '2026-10-14',
    updatedAt: '2026-10-14',
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
  role: 'MEMBER' as const,
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

function renderProjectTasksPage(initialUrl = '/workspaces/ws-1/projects/proj-1/tasks') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const authValue = {
    user: {
      id: 'user-1',
      email: 'alex@example.com',
      name: 'Alex Developer',
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
          <MemoryRouter initialEntries={[initialUrl]}>
            <Routes>
              <Route
                path="/workspaces/:workspaceId/projects/:projectId/tasks"
                element={<ProjectTasksPage />}
              />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ProjectTasksPage Filters & Tasks List', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/api/projects/proj-1/tasks')) {
        return {
          tasks: mockTasks,
          pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
        };
      }
      if (url.includes('/api/projects/proj-1')) {
        return { project: mockProject };
      }
      if (url.includes('/members')) {
        return { members: [] };
      }
      return {};
    });
  });

  it('renders project tasks and key badge', async () => {
    renderProjectTasksPage();

    await waitFor(() => {
      expect(screen.getByText('Mobile Client')).toBeInTheDocument();
    });

    expect(screen.getByText('MC')).toBeInTheDocument();
    expect(screen.getAllByText('Fix crash on startup')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Add dark mode support')[0]).toBeInTheDocument();
  });

  it('reflects search filter in API queries and URL', async () => {
    const getSpy = vi.spyOn(api, 'get');
    renderProjectTasksPage();

    await waitFor(() => {
      expect(screen.getAllByText('Fix crash on startup')[0]).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search tasks by title/i);
    fireEvent.change(searchInput, { target: { value: 'crash' } });

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('search=crash'));
    });
  });

  it('filters by status and reflects in query string', async () => {
    const getSpy = vi.spyOn(api, 'get');
    renderProjectTasksPage();

    await waitFor(() => {
      expect(screen.getAllByText('Fix crash on startup')[0]).toBeInTheDocument();
    });

    const statusSelect = screen.getByDisplayValue('All Statuses');
    fireEvent.change(statusSelect, { target: { value: 'IN_PROGRESS' } });

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('status=IN_PROGRESS'));
    });
  });

  it('renders empty state when no tasks match filters', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/api/projects/proj-1/tasks')) {
        return {
          tasks: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        };
      }
      if (url.includes('/api/projects/proj-1')) {
        return { project: mockProject };
      }
      return { members: [] };
    });

    renderProjectTasksPage('/workspaces/ws-1/projects/proj-1/tasks?search=nonexistent');

    await waitFor(() => {
      expect(screen.getByText(/no tasks match your filters/i)).toBeInTheDocument();
    });
  });
});
