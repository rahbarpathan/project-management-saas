import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TaskListResponse,
  ProjectResponse,
  WorkspaceMemberResponse,
  TaskStatus,
  TaskPriority,
  TaskSortBy,
  SortOrder,
} from '@sprintflow/shared';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../lib/api-client';
import {
  Button,
  Input,
  Select,
  Card,
  Badge,
  BadgeVariant,
  Avatar,
  LoadingState,
  EmptyState,
  ErrorState,
} from '../components/ui';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { TaskDetailDrawer } from '../components/TaskDetailDrawer';
import { useProjectSocket } from '../hooks/useProjectSocket';
import { PresenceAvatars } from '../components/PresenceAvatars';

function getStatusBadgeVariant(status: TaskStatus): BadgeVariant {
  switch (status) {
    case 'DONE':
      return 'success';
    case 'IN_PROGRESS':
      return 'accent';
    case 'TODO':
      return 'warning';
    case 'BACKLOG':
    default:
      return 'neutral';
  }
}

function getPriorityBadgeVariant(priority: TaskPriority): BadgeVariant {
  switch (priority) {
    case 'URGENT':
      return 'danger';
    case 'HIGH':
      return 'warning';
    case 'MEDIUM':
      return 'neutral';
    case 'LOW':
    default:
      return 'neutral';
  }
}

export function ProjectTasksPage() {
  const { workspaceId: paramWorkspaceId, projectId } = useParams<{
    workspaceId: string;
    projectId: string;
  }>();
  const { activeWorkspace, canManageTasks } = useWorkspace();
  const workspaceId = paramWorkspaceId || activeWorkspace?.id;

  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query params
  const search = searchParams.get('search') || '';
  const status = (searchParams.get('status') || 'ALL') as TaskStatus | 'ALL';
  const priority = (searchParams.get('priority') || 'ALL') as TaskPriority | 'ALL';
  const assigneeId = searchParams.get('assigneeId') || 'ALL';
  const sortBy = (searchParams.get('sortBy') || 'position') as TaskSortBy;
  const sortOrder = (searchParams.get('sortOrder') || 'asc') as SortOrder;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const selectedTaskId = searchParams.get('taskId');
  const limit = 20;

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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

  // Build task query string
  const taskQuery = new URLSearchParams();
  taskQuery.set('page', page.toString());
  taskQuery.set('limit', limit.toString());
  if (search.trim()) taskQuery.set('search', search.trim());
  if (status !== 'ALL') taskQuery.set('status', status);
  if (priority !== 'ALL') taskQuery.set('priority', priority);
  if (assigneeId !== 'ALL') taskQuery.set('assigneeId', assigneeId);
  taskQuery.set('sortBy', sortBy);
  taskQuery.set('sortOrder', sortOrder);

  // Fetch Tasks with filters
  const {
    data: tasksData,
    isLoading: isTasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: [
      'tasks',
      projectId,
      page,
      search,
      status,
      priority,
      assigneeId,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      api.get<TaskListResponse>(`/api/projects/${projectId}/tasks?${taskQuery.toString()}`),
    enabled: !!projectId,
  });

  const tasks = tasksData?.tasks || [];
  const pagination = tasksData?.pagination || { page: 1, limit, total: 0, totalPages: 1 };

  // Helper to update query string parameters
  const updateQueryParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'ALL') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== 'page' && key !== 'taskId') {
      next.set('page', '1'); // reset page whenever a filter changes
    }
    setSearchParams(next);
  };

  const handleClearFilters = () => {
    const next = new URLSearchParams();
    if (selectedTaskId) next.set('taskId', selectedTaskId);
    setSearchParams(next);
  };

  const hasActiveFilters =
    Boolean(search.trim()) ||
    status !== 'ALL' ||
    priority !== 'ALL' ||
    assigneeId !== 'ALL' ||
    sortBy !== 'position' ||
    sortOrder !== 'asc';

  const handleOpenTask = (taskId: string) => {
    updateQueryParam('taskId', taskId);
  };

  const handleCloseTaskDrawer = () => {
    updateQueryParam('taskId', null);
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

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {project?.name || 'Project Tasks'}
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
            <span className="px-3 py-1.5 rounded-md bg-surface-hover text-text-primary font-semibold shadow-xs">
              List View
            </span>
            <Link
              to={`/workspaces/${workspaceId}/projects/${projectId}/board`}
              className="px-3 py-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors"
            >
              Kanban Board
            </Link>
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
              onClick={() => setIsCreateModalOpen(true)}
              id="create-task-button"
            >
              New Task
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Control Bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          {/* Top row: search + sort */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6">
              <Input
                placeholder="Search tasks by title..."
                value={search}
                onChange={(e) => updateQueryParam('search', e.target.value)}
                leftAddon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
              />
            </div>

            <div className="sm:col-span-4">
              <Select
                value={sortBy}
                onChange={(e) => updateQueryParam('sortBy', e.target.value)}
                options={[
                  { value: 'position', label: 'Sort: Position' },
                  { value: 'createdAt', label: 'Sort: Created Date' },
                  { value: 'dueDate', label: 'Sort: Due Date' },
                  { value: 'priority', label: 'Sort: Priority' },
                  { value: 'title', label: 'Sort: Title' },
                ]}
              />
            </div>

            <div className="sm:col-span-2">
              <Button
                variant="secondary"
                onClick={() =>
                  updateQueryParam('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')
                }
                className="w-full h-full text-xs font-medium"
                aria-label={`Sort order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                {sortOrder === 'asc' ? 'Order: Asc' : 'Order: Desc'}
              </Button>
            </div>
          </div>

          {/* Bottom row: status, priority, assignee, clear */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
            <Select
              value={status}
              onChange={(e) => updateQueryParam('status', e.target.value)}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'BACKLOG', label: 'Backlog' },
                { value: 'TODO', label: 'To Do' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'DONE', label: 'Done' },
              ]}
            />

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

            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                Reset Filters
              </Button>
            ) : (
              <div />
            )}
          </div>
        </div>
      </Card>

      {/* Task List / Table */}
      {isTasksLoading ? (
        <LoadingState message="Loading tasks..." />
      ) : tasksError ? (
        <ErrorState
          title="Failed to load tasks"
          message={(tasksError as Error)?.message || 'Unable to retrieve tasks'}
          retry={() => refetchTasks()}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? 'No tasks match your filters' : 'No tasks in this project yet'}
          description={
            hasActiveFilters
              ? 'Try widening your filters or clearing search criteria to see more tasks.'
              : 'Create your first task to start planning and tracking work.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : canManageTasks ? (
              <Button variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
                New Task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
            <table className="w-full text-left text-sm" role="table">
              <thead className="border-b border-border bg-surface-hover/50 text-xs font-semibold text-text-muted uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">Task Title</th>
                  <th scope="col" className="px-6 py-3">Priority</th>
                  <th scope="col" className="px-6 py-3">Assignee</th>
                  <th scope="col" className="px-6 py-3">Due Date</th>
                  <th scope="col" className="px-6 py-3 text-right">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => handleOpenTask(task.id)}
                    className="hover:bg-surface-hover/60 cursor-pointer transition-colors group"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleOpenTask(task.id);
                      }
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(task.status)} size="sm">
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-medium text-text-primary group-hover:text-accent transition-colors line-clamp-1">
                        {task.title}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getPriorityBadgeVariant(task.priority)} size="sm">
                        {task.priority}
                      </Badge>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      {task.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={task.assignee.name || task.assignee.email} size="xs" />
                          <span className="text-xs text-text-primary">
                            {task.assignee.name || task.assignee.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted italic">Unassigned</span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-xs text-text-muted">
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString()
                        : '-'}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-xs text-text-muted">
                      v{task.version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden flex flex-col gap-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleOpenTask(task.id)}
                className="p-4 rounded-lg border border-border bg-surface hover:border-text-muted cursor-pointer transition-all flex flex-col gap-2.5"
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(task.status)} size="sm">
                      {task.status.replace('_', ' ')}
                    </Badge>
                    <Badge variant={getPriorityBadgeVariant(task.priority)} size="sm">
                      {task.priority}
                    </Badge>
                  </div>
                  <span className="text-[11px] font-mono text-text-muted">v{task.version}</span>
                </div>

                <div className="font-medium text-sm text-text-primary">{task.title}</div>

                <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-border">
                  <span>
                    {task.assignee
                      ? task.assignee.name || task.assignee.email
                      : 'Unassigned'}
                  </span>
                  <span>
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination Bar */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-text-muted">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total tasks)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => updateQueryParam('page', (pagination.page - 1).toString())}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => updateQueryParam('page', (pagination.page + 1).toString())}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={projectId}
        members={members}
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
