import { useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TaskListResponse,
  ProjectResponse,
  WorkspaceMemberResponse,
  SprintListResponse,
  TaskPriority,
  TaskStatus,
} from '@sprintflow/shared';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../lib/api-client';
import {
  Button,
  Input,
  Select,
  Badge,
  LoadingState,
  EmptyState,
  ErrorState,
} from '../components/ui';
import { KanbanBoard } from '../components/kanban/KanbanBoard';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { TaskDetailDrawer } from '../components/TaskDetailDrawer';
import { useProjectSocket } from '../hooks/useProjectSocket';
import { PresenceAvatars } from '../components/PresenceAvatars';

export function KanbanBoardPage() {
  const { workspaceId: paramWorkspaceId, projectId } = useParams<{
    workspaceId: string;
    projectId: string;
  }>();
  const { activeWorkspace, isViewer, canManageTasks } = useWorkspace();
  const workspaceId = paramWorkspaceId || activeWorkspace?.id;

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const priority = (searchParams.get('priority') || 'ALL') as TaskPriority | 'ALL';
  const assigneeId = searchParams.get('assigneeId') || 'ALL';
  const sprintId = searchParams.get('sprintId') || 'ALL';
  const selectedTaskId = searchParams.get('taskId');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<TaskStatus>('TODO');

  // Real-time Socket & Presence
  const { presenceUsers } = useProjectSocket(projectId);

  // Fetch Project details
  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<{ project: ProjectResponse }>(`/api/projects/${projectId}`),
    enabled: !!projectId,
  });
  const project = projectData?.project;

  // Fetch Workspace Members (for assignees)
  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api.get<{ members: WorkspaceMemberResponse[] }>(`/api/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  });
  const members = membersData?.members || [];

  // Fetch Sprints for the project
  const { data: sprintsData } = useQuery({
    queryKey: ['project-sprints', projectId],
    queryFn: () => api.get<SprintListResponse>(`/api/projects/${projectId}/sprints`),
    enabled: !!projectId,
  });
  const sprints = sprintsData?.sprints || [];
  const activeSprint = sprints.find((s) => s.status === 'ACTIVE');

  // Fetch Tasks for the Kanban board (all tasks ordered by position)
  const {
    data: tasksData,
    isLoading: isTasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: ['board-tasks', projectId],
    queryFn: async () => {
      const res = await api.get<TaskListResponse>(
        `/api/projects/${projectId}/tasks?limit=100&sortBy=position&sortOrder=asc`,
      );
      return res.tasks;
    },
    enabled: !!projectId,
  });

  const rawTasks = tasksData || [];

  // Client-side search and filtering for the board view
  const filteredTasks = useMemo(() => {
    return rawTasks.filter((task) => {
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDesc = task.description?.toLowerCase().includes(query) || false;
        if (!matchesTitle && !matchesDesc) return false;
      }
      if (priority !== 'ALL' && task.priority !== priority) {
        return false;
      }
      if (assigneeId !== 'ALL' && task.assigneeId !== assigneeId) {
        return false;
      }
      if (sprintId !== 'ALL') {
        if (sprintId === 'ACTIVE') {
          if (!activeSprint || task.sprintId !== activeSprint.id) return false;
        } else if (sprintId === 'BACKLOG') {
          if (task.sprintId) return false;
        } else {
          if (task.sprintId !== sprintId) return false;
        }
      }
      return true;
    });
  }, [rawTasks, search, priority, assigneeId, sprintId, activeSprint]);

  const updateQueryParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'ALL') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next);
  };

  const handleClearFilters = () => {
    const next = new URLSearchParams();
    if (selectedTaskId) next.set('taskId', selectedTaskId);
    setSearchParams(next);
  };

  const hasActiveFilters =
    Boolean(search.trim()) || priority !== 'ALL' || assigneeId !== 'ALL' || sprintId !== 'ALL';

  const handleOpenTask = (taskId: string) => {
    updateQueryParam('taskId', taskId);
  };

  const handleCloseTaskDrawer = () => {
    updateQueryParam('taskId', null);
  };

  const handleAddTaskForStatus = (status: TaskStatus) => {
    setCreateInitialStatus(status);
    setIsCreateModalOpen(true);
  };

  if (!projectId || !workspaceId) {
    return <ErrorState title="Missing Workspace or Project" message="Invalid project URL" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb & Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-text-muted">
        <Link
          to={`/workspaces/${workspaceId}/projects`}
          className="hover:text-text-primary transition-colors"
        >
          {activeWorkspace?.name || 'Workspace'}
        </Link>
        <span>/</span>
        <span className="font-semibold text-text-primary">
          {project ? `${project.name} (${project.key})` : 'Project'}
        </span>
      </nav>

      {/* Page Header with List / Board View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {project?.name || 'Project Board'}
            </h1>
            {project?.key && (
              <Badge variant="accent" size="md">
                {project.key}
              </Badge>
            )}
          </div>
          {project?.description && (
            <p className="text-sm text-text-muted mt-1 max-w-2xl">{project.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Real-time Project Presence */}
          <PresenceAvatars users={presenceUsers} />

          {/* View Mode Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 text-xs font-medium">
            <Link
              to={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}
              className="px-3 py-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors"
            >
              List View
            </Link>
            <span className="px-3 py-1.5 rounded-md bg-surface-hover text-text-primary font-semibold shadow-xs">
              Kanban Board
            </span>
            <Link
              to={`/workspaces/${workspaceId}/projects/${projectId}/sprints`}
              className="px-3 py-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors"
            >
              Sprints
            </Link>
          </div>

          {canManageTasks && (
            <Button
              variant="primary"
              onClick={() => {
                setCreateInitialStatus('TODO');
                setIsCreateModalOpen(true);
              }}
              id="create-task-board-button"
            >
              New Task
            </Button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:w-72">
          <Input
            placeholder="Search board tasks..."
            value={search}
            onChange={(e) => updateQueryParam('search', e.target.value)}
            leftAddon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>

        <div className="w-full sm:w-44">
          <Select
            value={priority}
            onChange={(e) => updateQueryParam('priority', e.target.value)}
            options={[
              { value: 'ALL', label: 'All Priorities' },
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
              { value: 'URGENT', label: 'Urgent' },
            ]}
          />
        </div>

        <div className="w-full sm:w-48">
          <Select
            value={assigneeId}
            onChange={(e) => updateQueryParam('assigneeId', e.target.value)}
            options={[
              { value: 'ALL', label: 'All Assignees' },
              ...members.map((m) => ({
                value: m.userId,
                label: m.user?.name || m.user?.email || 'Member',
              })),
            ]}
          />
        </div>

        {/* Sprint Filter */}
        <div className="w-full sm:w-52">
          <Select
            value={sprintId}
            onChange={(e) => updateQueryParam('sprintId', e.target.value)}
            aria-label="Filter tasks by sprint"
            options={[
              { value: 'ALL', label: 'All Sprints' },
              ...(activeSprint ? [{ value: 'ACTIVE', label: `Active: ${activeSprint.name}` }] : []),
              { value: 'BACKLOG', label: 'No Sprint (Backlog)' },
              ...sprints
                .filter((s) => s.id !== activeSprint?.id)
                .map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.status.toLowerCase()})`,
                })),
            ]}
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Reset Filters
          </Button>
        )}
      </div>

      {/* Kanban Board View */}
      {isTasksLoading ? (
        <LoadingState message="Loading Kanban board..." />
      ) : tasksError ? (
        <ErrorState
          title="Failed to load tasks"
          message={(tasksError as Error)?.message || 'Unable to retrieve tasks'}
          onRetry={() => refetchTasks()}
        />
      ) : rawTasks.length === 0 ? (
        <EmptyState
          title="No tasks in this project yet"
          description="Create your first task to start organizing work across the Kanban columns."
          action={
            canManageTasks ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setCreateInitialStatus('TODO');
                  setIsCreateModalOpen(true);
                }}
              >
                Create First Task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <KanbanBoard
          projectId={projectId}
          tasks={filteredTasks}
          isViewer={isViewer}
          onTaskClick={handleOpenTask}
          onAddTaskClick={handleAddTaskForStatus}
        />
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={projectId}
        members={members}
        initialStatus={createInitialStatus}
      />

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        taskId={selectedTaskId}
        workspaceId={workspaceId}
        projectId={projectId}
        projectKey={project?.key}
        isOpen={Boolean(selectedTaskId)}
        onClose={handleCloseTaskDrawer}
        members={members}
      />
    </div>
  );
}
