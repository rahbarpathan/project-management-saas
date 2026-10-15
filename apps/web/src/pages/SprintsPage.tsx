import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SprintResponse,
  SprintListResponse,
  TaskListResponse,
  ProjectResponse,
  TaskResponse,
  TaskStatus,
  TaskPriority,
} from '@sprintflow/shared';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../lib/api-client';
import {
  Button,
  Input,
  Card,
  Badge,
  BadgeVariant,
  Modal,
  LoadingState,
  EmptyState,
  ErrorState,
  useToast,
} from '../components/ui';
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

export function SprintsPage() {
  const { workspaceId: paramWorkspaceId, projectId } = useParams<{
    workspaceId: string;
    projectId: string;
  }>();
  const { activeWorkspace, canManageTasks } = useWorkspace();
  const workspaceId = paramWorkspaceId || activeWorkspace?.id;
  const queryClient = useQueryClient();
  const toast = useToast();

  // Real-time socket & presence
  const { presenceUsers } = useProjectSocket(projectId);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSprintName, setNewSprintName] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [completingSprint, setCompletingSprint] = useState<SprintResponse | null>(null);
  const [addingTaskToSprint, setAddingTaskToSprint] = useState<SprintResponse | null>(null);

  // Fetch Project details
  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<{ project: ProjectResponse }>(`/api/projects/${projectId}`),
    enabled: !!projectId,
  });
  const project = projectData?.project;

  // Fetch Sprints
  const {
    data: sprintsData,
    isLoading: isSprintsLoading,
    error: sprintsError,
  } = useQuery({
    queryKey: ['project-sprints', projectId],
    queryFn: () => api.get<SprintListResponse>(`/api/projects/${projectId}/sprints`),
    enabled: !!projectId,
  });

  const sprints = sprintsData?.sprints || [];
  const activeSprint = sprints.find((s) => s.status === 'ACTIVE');
  const plannedSprints = sprints.filter((s) => s.status === 'PLANNED');
  const completedSprints = sprints.filter((s) => s.status === 'COMPLETED');

  // Fetch all tasks in project (for backlog tasks selection)
  const { data: allTasksData } = useQuery({
    queryKey: ['board-tasks', projectId],
    queryFn: async () => {
      const res = await api.get<TaskListResponse>(
        `/api/projects/${projectId}/tasks?limit=100&sortBy=position&sortOrder=asc`,
      );
      return res.tasks;
    },
    enabled: Boolean(projectId && addingTaskToSprint),
  });

  const allTasks = allTasksData || [];
  // Backlog tasks (tasks not in any sprint, or not in this specific sprint)
  const availableBacklogTasks = allTasks.filter(
    (t) => !addingTaskToSprint?.tasks?.some((st) => st.id === t.id),
  );

  // Mutations
  const createSprintMutation = useMutation({
    mutationFn: (data: { name: string; startDate?: string; endDate?: string }) =>
      api.post<{ sprint: SprintResponse }>(`/api/projects/${projectId}/sprints`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      toast.success('Sprint created successfully');
      setIsCreateModalOpen(false);
      setNewSprintName('');
      setNewStartDate('');
      setNewEndDate('');
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to create sprint');
    },
  });

  const updateSprintMutation = useMutation({
    mutationFn: ({ sprintId, status }: { sprintId: string; status: 'ACTIVE' | 'COMPLETED' }) =>
      api.patch<{ sprint: SprintResponse }>(`/api/sprints/${sprintId}`, { status }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['board-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      toast.success(
        vars.status === 'ACTIVE'
          ? 'Sprint started successfully'
          : 'Sprint completed! Unfinished tasks moved to backlog.',
      );
      setCompletingSprint(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update sprint');
    },
  });

  const deleteSprintMutation = useMutation({
    mutationFn: (sprintId: string) => api.delete(`/api/sprints/${sprintId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      toast.success('Sprint deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete sprint');
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: ({ sprintId, taskId }: { sprintId: string; taskId: string }) =>
      api.post<{ sprint: SprintResponse }>(`/api/sprints/${sprintId}/tasks`, { taskId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['board-tasks', projectId] });
      toast.success('Task added to sprint');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add task to sprint');
    },
  });

  const removeTaskMutation = useMutation({
    mutationFn: ({ sprintId, taskId }: { sprintId: string; taskId: string }) =>
      api.delete<{ sprint: SprintResponse }>(`/api/sprints/${sprintId}/tasks/${taskId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['board-tasks', projectId] });
      toast.success('Task removed from sprint');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove task from sprint');
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSprintName.trim()) {
      setFormError('Sprint name is required');
      return;
    }
    if (newStartDate && newEndDate) {
      if (new Date(newEndDate).getTime() <= new Date(newStartDate).getTime()) {
        setFormError('End date must be strictly after start date');
        return;
      }
    }
    setFormError(null);
    createSprintMutation.mutate({
      name: newSprintName.trim(),
      startDate: newStartDate ? new Date(newStartDate).toISOString() : undefined,
      endDate: newEndDate ? new Date(newEndDate).toISOString() : undefined,
    });
  };

  const formatDateRange = (start?: string | Date | null, end?: string | Date | null) => {
    if (!start && !end) return 'No dates set';
    const s = start ? new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'TBD';
    const e = end ? new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
    return `${s} – ${e}`;
  };

  const renderProgressBar = (done: number, total: number) => {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div className="space-y-1.5 w-full">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{done} of {total} tasks done</span>
          <span className="font-semibold text-text-primary">{percent}%</span>
        </div>
        <div
          className="w-full h-2 rounded-full bg-surface-hover overflow-hidden border border-border"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  };

  const renderSprintTasks = (sprint: SprintResponse) => {
    const tasksList = sprint.tasks || [];
    if (tasksList.length === 0) {
      return (
        <div className="text-center py-6 text-sm text-text-muted border border-dashed border-border rounded-lg bg-surface/50">
          No tasks in this sprint yet.
          {canManageTasks && (
            <div className="mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAddingTaskToSprint(sprint)}
              >
                Add Tasks from Backlog
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2 mt-3">
        {tasksList.map((task: TaskResponse) => (
          <div
            key={task.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface hover:bg-surface-hover/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Badge variant={getStatusBadgeVariant(task.status)} size="sm">
                {task.status.replace('_', ' ')}
              </Badge>
              <span className="text-sm font-medium text-text-primary truncate">
                {task.title}
              </span>
              <Badge variant={getPriorityBadgeVariant(task.priority)} size="sm">
                {task.priority}
              </Badge>
            </div>

            {canManageTasks && sprint.status !== 'COMPLETED' && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-danger hover:bg-danger/10"
                onClick={() =>
                  removeTaskMutation.mutate({ sprintId: sprint.id, taskId: task.id })
                }
                title="Remove task from sprint"
              >
                Remove
              </Button>
            )}
          </div>
        ))}

        {canManageTasks && sprint.status !== 'COMPLETED' && (
          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddingTaskToSprint(sprint)}
            >
              + Add More Tasks
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
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
              {project?.name || 'Project Sprints'}
            </h1>
            {project?.key && (
              <Badge variant="accent" size="md">
                {project.key}
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Organize iterations, track progress toward goals, and manage sprint lifecycles.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Presence */}
          <PresenceAvatars users={presenceUsers} />

          {/* View Mode Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 text-xs font-medium">
            <Link
              to={`/workspaces/${workspaceId}/projects/${projectId}/tasks`}
              className="px-3 py-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors"
            >
              List View
            </Link>
            <Link
              to={`/workspaces/${workspaceId}/projects/${projectId}/board`}
              className="px-3 py-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors"
            >
              Kanban Board
            </Link>
            <span className="px-3 py-1.5 rounded-md bg-surface-hover text-text-primary font-semibold shadow-xs">
              Sprints
            </span>
          </div>

          {canManageTasks && (
            <Button
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
              id="create-sprint-button"
            >
              Create Sprint
            </Button>
          )}
        </div>
      </div>

      {/* Main Content States */}
      {isSprintsLoading ? (
        <LoadingState message="Loading project sprints..." />
      ) : sprintsError ? (
        <ErrorState
          title="Failed to load sprints"
          message={sprintsError instanceof Error ? sprintsError.message : 'An error occurred'}
        />
      ) : sprints.length === 0 ? (
        <EmptyState
          title="No sprints created yet"
          description="Sprints help your team plan iterations, establish commitments, and monitor velocity."
          action={
            canManageTasks ? (
              <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                Create First Sprint
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {/* Active Sprint Section */}
          <div>
            <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
              Active Sprint
              {activeSprint && (
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              )}
            </h2>

            {activeSprint ? (
              <Card className="p-5 border-2 border-accent/20 bg-surface shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-text-primary">
                        {activeSprint.name}
                      </h3>
                      <Badge variant="success" size="sm">ACTIVE</Badge>
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {formatDateRange(activeSprint.startDate, activeSprint.endDate)}
                    </p>
                  </div>

                  {canManageTasks && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setCompletingSprint(activeSprint)}
                      id="complete-sprint-button"
                    >
                      Complete Sprint
                    </Button>
                  )}
                </div>

                {/* Progress Bar */}
                {renderProgressBar(
                  activeSprint.completedTasksCount || 0,
                  activeSprint.tasksCount || 0,
                )}

                {/* Tasks List */}
                {renderSprintTasks(activeSprint)}
              </Card>
            ) : (
              <Card className="p-6 text-center border-dashed bg-surface/50">
                <p className="text-sm text-text-muted">No sprint is currently active.</p>
                {canManageTasks && plannedSprints.length > 0 && (
                  <p className="text-xs text-text-muted mt-1">
                    Select a planned sprint below and click "Start Sprint" to begin an iteration.
                  </p>
                )}
              </Card>
            )}
          </div>

          {/* Planned Sprints Section */}
          {plannedSprints.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-text-primary mb-3">Planned Sprints</h2>
              <div className="space-y-4">
                {plannedSprints.map((sprint) => (
                  <Card key={sprint.id} className="p-5 bg-surface space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-semibold text-text-primary">
                            {sprint.name}
                          </h3>
                          <Badge variant="neutral" size="sm">PLANNED</Badge>
                        </div>
                        <p className="text-xs text-text-muted mt-1">
                          {formatDateRange(sprint.startDate, sprint.endDate)} · {sprint.tasksCount || 0} tasks
                        </p>
                      </div>

                      {canManageTasks && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={Boolean(activeSprint)}
                            title={
                              activeSprint
                                ? 'An active sprint is already running. Complete it before starting another.'
                                : 'Start this sprint'
                            }
                            onClick={() =>
                              updateSprintMutation.mutate({
                                sprintId: sprint.id,
                                status: 'ACTIVE',
                              })
                            }
                          >
                            Start Sprint
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-danger hover:bg-danger/10"
                            onClick={() => deleteSprintMutation.mutate(sprint.id)}
                            title="Delete planned sprint"
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>

                    {renderSprintTasks(sprint)}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Completed Sprints Section */}
          {completedSprints.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-text-primary mb-3">Completed Sprints</h2>
              <div className="space-y-3">
                {completedSprints.map((sprint) => (
                  <Card key={sprint.id} className="p-4 bg-surface/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-text-primary">
                            {sprint.name}
                          </h4>
                          <Badge variant="neutral" size="sm">COMPLETED</Badge>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {formatDateRange(sprint.startDate, sprint.endDate)}
                        </p>
                      </div>
                      <div className="text-xs font-semibold text-text-muted">
                        {sprint.completedTasksCount || 0} / {sprint.tasksCount || 0} tasks finished
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Sprint Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Sprint"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 text-xs text-danger bg-danger/10 border border-danger/20 rounded-md">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="sprint-name-input" className="block text-xs font-medium text-text-primary mb-1">
              Sprint Name *
            </label>
            <Input
              id="sprint-name-input"
              value={newSprintName}
              onChange={(e) => setNewSprintName(e.target.value)}
              placeholder="e.g. Sprint 1 - Core Flow"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sprint-start-date" className="block text-xs font-medium text-text-primary mb-1">
                Start Date
              </label>
              <Input
                id="sprint-start-date"
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="sprint-end-date" className="block text-xs font-medium text-text-primary mb-1">
                End Date
              </label>
              <Input
                id="sprint-end-date"
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              id="submit-create-sprint-button"
              disabled={createSprintMutation.isPending}
            >
              {createSprintMutation.isPending ? 'Creating...' : 'Create Sprint'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Complete Sprint Confirmation Modal */}
      <Modal
        isOpen={Boolean(completingSprint)}
        onClose={() => setCompletingSprint(null)}
        title={`Complete ${completingSprint?.name || 'Sprint'}?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Are you sure you want to complete this sprint?
          </p>

          <div className="p-3 bg-surface-hover border border-border rounded-lg text-xs space-y-1 text-text-muted">
            <p className="font-semibold text-text-primary">Sprint Completion Behavior:</p>
            <p>• Completed tasks will remain archived in this sprint iteration.</p>
            <p>• Any <strong>unfinished tasks</strong> will be automatically moved back to the backlog.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setCompletingSprint(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              id="confirm-complete-sprint-button"
              disabled={updateSprintMutation.isPending}
              onClick={() => {
                if (completingSprint) {
                  updateSprintMutation.mutate({
                    sprintId: completingSprint.id,
                    status: 'COMPLETED',
                  });
                }
              }}
            >
              {updateSprintMutation.isPending ? 'Completing...' : 'Confirm & Complete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Tasks from Backlog Modal */}
      <Modal
        isOpen={Boolean(addingTaskToSprint)}
        onClose={() => setAddingTaskToSprint(null)}
        title={`Add Tasks to ${addingTaskToSprint?.name || 'Sprint'}`}
      >
        <div className="space-y-4 max-h-[70vh] flex flex-col">
          <p className="text-xs text-text-muted">
            Select tasks from your backlog to include in this sprint:
          </p>

          <div className="overflow-y-auto space-y-2 flex-1 pr-1">
            {availableBacklogTasks.length === 0 ? (
              <p className="text-center text-sm text-text-muted py-6">
                No backlog tasks available to add.
              </p>
            ) : (
              availableBacklogTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-hover/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <Badge variant={getStatusBadgeVariant(task.status)} size="sm">
                      {task.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs font-medium text-text-primary truncate">
                      {task.title}
                    </span>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={() => {
                      if (addingTaskToSprint) {
                        addTaskMutation.mutate({
                          sprintId: addingTaskToSprint.id,
                          taskId: task.id,
                        });
                      }
                    }}
                  >
                    + Add
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => setAddingTaskToSprint(null)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
