/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SprintsPage } from './SprintsPage';
import { ToastProvider } from '../components/ui/Toast';
import { AuthContext } from '../context/AuthContext';
import { api } from '../lib/api-client';
import { Role } from '@sprintflow/shared';

const mockProject = {
  id: 'proj-1',
  workspaceId: 'ws-1',
  name: 'Core Engine',
  key: 'CORE',
  description: 'Main engine project',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const mockSprints = [
  {
    id: 'sprint-active',
    projectId: 'proj-1',
    name: 'Sprint 1 - In Flight',
    startDate: '2026-10-01T00:00:00Z',
    endDate: '2026-10-15T00:00:00Z',
    status: 'ACTIVE' as const,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    tasksCount: 2,
    completedTasksCount: 1,
    tasks: [
      {
        id: 'task-1',
        projectId: 'proj-1',
        title: 'Complete authorization guard',
        status: 'DONE' as const,
        priority: 'HIGH' as const,
        position: 1000,
        version: 1,
        createdAt: '2026-10-02',
        updatedAt: '2026-10-02',
      },
      {
        id: 'task-2',
        projectId: 'proj-1',
        title: 'Implement socket emitters',
        status: 'IN_PROGRESS' as const,
        priority: 'URGENT' as const,
        position: 2000,
        version: 1,
        createdAt: '2026-10-02',
        updatedAt: '2026-10-02',
      },
    ],
  },
  {
    id: 'sprint-planned',
    projectId: 'proj-1',
    name: 'Sprint 2 - Future Planning',
    startDate: '2026-10-16T00:00:00Z',
    endDate: '2026-10-30T00:00:00Z',
    status: 'PLANNED' as const,
    createdAt: '2026-10-05',
    updatedAt: '2026-10-05',
    tasksCount: 0,
    completedTasksCount: 0,
    tasks: [],
  },
];

let mockWorkspaceContextValue = {
  workspaces: [],
  activeWorkspace: {
    id: 'ws-1',
    name: 'Acme Workspace',
    slug: 'acme',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    currentUserRole: 'MEMBER' as Role,
  },
  activeWorkspaceId: 'ws-1',
  setActiveWorkspaceId: vi.fn(),
  isLoading: false,
  error: null,
  refetchWorkspaces: vi.fn(),
  role: 'MEMBER' as Role,
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

vi.mock('../hooks/useProjectSocket', () => ({
  useProjectSocket: () => ({
    presenceUsers: [{ id: 'u-1', name: 'Alice', email: 'alice@example.com', avatarUrl: null }],
    isConnected: true,
  }),
}));

function renderSprintsPage(initialUrl = '/workspaces/ws-1/projects/proj-1/sprints') {
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
                path="/workspaces/:workspaceId/projects/:projectId/sprints"
                element={<SprintsPage />}
              />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('SprintsPage Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    mockWorkspaceContextValue = {
      ...mockWorkspaceContextValue,
      role: 'MEMBER',
      isViewer: false,
      canManageTasks: true,
    };

    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/projects/proj-1') {
        return { project: mockProject };
      }
      if (url === '/api/projects/proj-1/sprints') {
        return { sprints: mockSprints };
      }
      if (url.includes('/api/projects/proj-1/tasks')) {
        return { tasks: [] };
      }
      throw new Error(`Unhandled GET url: ${url}`);
    });

    vi.spyOn(api, 'post').mockResolvedValue({} as any);
    vi.spyOn(api, 'patch').mockResolvedValue({} as any);
    vi.spyOn(api, 'delete').mockResolvedValue({} as any);
  });

  it('renders active sprint with progress bar and task items', async () => {
    renderSprintsPage();

    await waitFor(() => {
      expect(screen.getByText('Sprint 1 - In Flight')).toBeInTheDocument();
    });

    expect(screen.getByText('1 of 2 tasks done')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    expect(screen.getByText('Complete authorization guard')).toBeInTheDocument();
    expect(screen.getByText('Implement socket emitters')).toBeInTheDocument();
    expect(screen.getByText('Sprint 2 - Future Planning')).toBeInTheDocument();
  });

  it('opens create sprint modal and validates dates', async () => {
    renderSprintsPage();

    await waitFor(() => {
      expect(screen.getByText('Sprint 1 - In Flight')).toBeInTheDocument();
    });

    const createBtn = screen.getByRole('button', { name: /create sprint/i });
    fireEvent.click(createBtn);

    expect(screen.getByText('Create New Sprint')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/sprint name/i);
    const startDateInput = screen.getByLabelText(/start date/i);
    const endDateInput = screen.getByLabelText(/end date/i);

    fireEvent.change(nameInput, { target: { value: 'Sprint 3' } });
    fireEvent.change(startDateInput, { target: { value: '2026-11-10' } });
    fireEvent.change(endDateInput, { target: { value: '2026-11-05' } }); // invalid: end before start

    const submitBtn = document.getElementById('submit-create-sprint-button')!;
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText('End date must be strictly after start date'),
    ).toBeInTheDocument();
  });

  it('opens confirmation modal and triggers complete sprint mutation', async () => {
    renderSprintsPage();

    await waitFor(() => {
      expect(screen.getByText('Sprint 1 - In Flight')).toBeInTheDocument();
    });

    const completeBtn = screen.getByRole('button', { name: /complete sprint/i });
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Are you sure you want to complete this sprint/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/unfinished tasks/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /confirm & complete/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/sprints/sprint-active', {
        status: 'COMPLETED',
      });
    });
  });

  it('disables or hides sprint modification buttons for viewer role', async () => {
    mockWorkspaceContextValue = {
      ...mockWorkspaceContextValue,
      role: 'VIEWER',
      isViewer: true,
      canManageTasks: false,
    };

    renderSprintsPage();

    await waitFor(() => {
      expect(screen.getByText('Sprint 1 - In Flight')).toBeInTheDocument();
    });

    // Create Sprint button should not be present
    expect(screen.queryByRole('button', { name: /create sprint/i })).not.toBeInTheDocument();

    // Complete Sprint button should not be present
    expect(screen.queryByRole('button', { name: /complete sprint/i })).not.toBeInTheDocument();

    // Start Sprint button should not be present
    expect(screen.queryByRole('button', { name: /start sprint/i })).not.toBeInTheDocument();
  });
});
