import React, { useState, useEffect } from 'react';
import {
  TaskResponse,
  TaskStatus,
  TaskPriority,
  WorkspaceMemberResponse,
  CommentListResponse,
  ActivityListResponse,
} from '@sprintflow/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api, ApiError } from '../lib/api-client';
import {
  Drawer,
  Button,
  Input,
  Select,
  Textarea,
  Badge,
  BadgeVariant,
  Avatar,
  Spinner,
  LoadingState,
  EmptyState,
  ErrorState,
  Modal,
  useToast,
} from './ui';

interface TaskDetailDrawerProps {
  taskId: string | null;
  workspaceId: string;
  projectId: string;
  projectKey?: string;
  isOpen: boolean;
  onClose: () => void;
  members: WorkspaceMemberResponse[];
}

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

export function TaskDetailDrawer({
  taskId,
  isOpen,
  onClose,
  members,
}: TaskDetailDrawerProps) {
  const { user } = useAuth();
  const { isViewer, canManageTasks, isAdmin, isOwner } = useWorkspace();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity'>('details');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Comment state
  const [newCommentText, setNewCommentText] = useState('');

  // Fetch Task Details
  const {
    data: taskData,
    isLoading: isTaskLoading,
    error: taskError,
    refetch: refetchTask,
  } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.get<{ task: TaskResponse }>(`/api/tasks/${taskId}`),
    enabled: Boolean(taskId && isOpen),
  });

  const task = taskData?.task;

  // Sync form state when task is fetched or refreshed
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeId(task.assigneeId || '');
      setDueDate(
        task.dueDate
          ? new Date(task.dueDate).toISOString().split('T')[0] || ''
          : '',
      );
    }
  }, [task]);

  // Fetch Comments
  const {
    data: commentsData,
    isLoading: isCommentsLoading,
  } = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () => api.get<CommentListResponse>(`/api/tasks/${taskId}/comments?limit=50`),
    enabled: Boolean(taskId && isOpen && activeTab === 'comments'),
  });

  const comments = commentsData?.comments || [];

  // Fetch Activity
  const {
    data: activityData,
    isLoading: isActivityLoading,
  } = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: () => api.get<ActivityListResponse>(`/api/tasks/${taskId}/activity?limit=50`),
    enabled: Boolean(taskId && isOpen && activeTab === 'activity'),
  });

  const activities = activityData?.activities || [];

  // Update Task Mutation
  const updateMutation = useMutation({
    mutationFn: (payload: {
      version: number;
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeId?: string | null;
      dueDate?: string | null;
    }) => api.patch<{ task: TaskResponse }>(`/api/tasks/${taskId}`, payload),
    onSuccess: (data) => {
      setConflictError(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.setQueryData(['task', taskId], data);
      queryClient.invalidateQueries({ queryKey: ['task-activity', taskId] });
      toast.success('Task updated successfully');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(
          'Conflict: This task was updated by another request. The latest version has been loaded.',
        );
        toast.warning(
          'This task was updated in another session. Latest version reloaded.',
          'Conflict Detected',
        );
        // Force refetch to sync latest task version
        refetchTask();
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      } else if (err instanceof ApiError) {
        toast.error(err.message, 'Update Failed');
      } else {
        toast.error('An unexpected error occurred', 'Update Failed');
      }
    },
  });

  // Delete Task Mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/tasks/${taskId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task deleted');
      setIsDeleteModalOpen(false);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Delete Failed');
      } else {
        toast.error('Failed to delete task', 'Delete Failed');
      }
    },
  });

  // Add Comment Mutation
  const addCommentMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/api/tasks/${taskId}/comments`, { content }),
    onSuccess: () => {
      setNewCommentText('');
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-activity', taskId] });
      toast.success('Comment posted');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Comment Failed');
      } else {
        toast.error('Failed to post comment', 'Comment Failed');
      }
    },
  });

  // Delete Comment Mutation
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => api.delete(`/api/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-activity', taskId] });
      toast.success('Comment deleted');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Delete Comment Failed');
      } else {
        toast.error('Failed to delete comment', 'Delete Comment Failed');
      }
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    if (!title.trim()) {
      toast.error('Task title cannot be empty', 'Validation Error');
      return;
    }

    updateMutation.mutate({
      version: task.version, // Sends current version for optimistic concurrency control!
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      status,
      priority,
      assigneeId: assigneeId.trim() ? assigneeId.trim() : null,
      dueDate: dueDate.trim() ? new Date(dueDate).toISOString() : null,
    });
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    addCommentMutation.mutate(newCommentText.trim());
  };

  // Build assignee options
  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({
      value: m.userId,
      label: `${m.user?.name || m.user?.email} (${m.role})`,
    })),
  ];

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        title={task ? `Task: ${task.title}` : 'Task Details'}
      >
        {isTaskLoading ? (
          <div className="py-12">
            <LoadingState message="Loading task details..." />
          </div>
        ) : taskError || !task ? (
          <div className="py-8">
            <ErrorState
              title="Failed to load task"
              message={(taskError as Error)?.message || 'Task not found'}
              retry={() => refetchTask()}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Conflict banner if 409 occurred */}
            {conflictError && (
              <div
                role="alert"
                className="p-3 rounded-md bg-warning/10 border border-warning text-xs text-text-primary flex items-start justify-between gap-2"
              >
                <div>
                  <strong className="font-semibold block">Concurrency Conflict (409)</strong>
                  <span>{conflictError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConflictError(null)}
                  className="text-text-muted hover:text-text-primary text-xs"
                >
                  &times;
                </button>
              </div>
            )}

            {/* Read-only banner for Viewer role */}
            {isViewer && (
              <div className="p-2.5 rounded-md bg-surface-hover border border-border text-xs text-text-muted flex items-center gap-2">
                <span className="font-semibold text-text-primary">Viewer mode:</span>
                <span>You have read-only access to this workspace and its tasks.</span>
              </div>
            )}

            {/* Header info bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Badge variant={getStatusBadgeVariant(task.status)}>
                  {task.status.replace('_', ' ')}
                </Badge>
                <Badge variant={getPriorityBadgeVariant(task.priority)}>
                  {task.priority}
                </Badge>
                <span className="text-xs text-text-muted font-mono bg-surface-hover px-1.5 py-0.5 rounded border border-border">
                  v{task.version}
                </span>
              </div>

              <span className="text-xs text-text-muted">
                Created {new Date(task.createdAt).toLocaleDateString()}
              </span>
            </div>

            {/* Sub-navigation tabs */}
            <div className="flex items-center gap-2 border-b border-border text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`pb-2 px-1 border-b-2 transition-colors ${
                  activeTab === 'details'
                    ? 'border-accent text-accent font-semibold'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                Details &amp; Edit
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('comments')}
                className={`pb-2 px-1 border-b-2 transition-colors ${
                  activeTab === 'comments'
                    ? 'border-accent text-accent font-semibold'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                Comments
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('activity')}
                className={`pb-2 px-1 border-b-2 transition-colors ${
                  activeTab === 'activity'
                    ? 'border-accent text-accent font-semibold'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                Activity Timeline
              </button>
            </div>

            {/* Tab 1: Details & Edit Form */}
            {activeTab === 'details' && (
              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <Input
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isViewer || updateMutation.isPending}
                  required
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    disabled={isViewer || updateMutation.isPending}
                    options={[
                      { value: 'BACKLOG', label: 'Backlog' },
                      { value: 'TODO', label: 'To Do' },
                      { value: 'IN_PROGRESS', label: 'In Progress' },
                      { value: 'DONE', label: 'Done' },
                    ]}
                  />

                  <Select
                    label="Priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    disabled={isViewer || updateMutation.isPending}
                    options={[
                      { value: 'LOW', label: 'Low' },
                      { value: 'MEDIUM', label: 'Medium' },
                      { value: 'HIGH', label: 'High' },
                      { value: 'URGENT', label: 'Urgent' },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Assignee"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    disabled={isViewer || updateMutation.isPending}
                    options={assigneeOptions}
                  />

                  <Input
                    label="Due Date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={isViewer || updateMutation.isPending}
                  />
                </div>

                <Textarea
                  label="Description"
                  rows={4}
                  placeholder="Add details, acceptance criteria, or links..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isViewer || updateMutation.isPending}
                />

                {/* Form Action Buttons */}
                {!isViewer && (
                  <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
                    {canManageTasks && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="text-danger hover:text-danger hover:bg-danger/10 text-xs"
                      >
                        Delete Task
                      </Button>
                    )}

                    <div className="flex items-center gap-2 ml-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        isLoading={updateMutation.isPending}
                      >
                        Save Changes
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            )}

            {/* Tab 2: Comments */}
            {activeTab === 'comments' && (
              <div className="flex flex-col gap-4">
                {/* New Comment Input */}
                {!isViewer ? (
                  <form onSubmit={handlePostComment} className="flex flex-col gap-2">
                    <Textarea
                      rows={2}
                      placeholder="Write a comment..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      disabled={addCommentMutation.isPending}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!newCommentText.trim()}
                        isLoading={addCommentMutation.isPending}
                      >
                        Comment
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-xs text-text-muted italic">
                    Commenting is disabled for viewers.
                  </p>
                )}

                {/* Comments List */}
                {isCommentsLoading ? (
                  <div className="py-6 flex justify-center">
                    <Spinner size="md" />
                  </div>
                ) : comments.length === 0 ? (
                  <EmptyState
                    title="No comments yet"
                    description="Discuss this task and keep updates organized."
                  />
                ) : (
                  <div className="flex flex-col gap-3 divide-y divide-border pt-2">
                    {comments.map((c) => {
                      const canDelete =
                        user?.id === c.authorId || isAdmin || isOwner;

                      return (
                        <div key={c.id} className="pt-3 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Avatar
                                name={c.author?.name || c.author?.email || 'User'}
                                size="xs"
                              />
                              <span className="text-xs font-semibold text-text-primary">
                                {c.author?.name || c.author?.email}
                              </span>
                              <span className="text-[11px] text-text-muted">
                                {new Date(c.createdAt).toLocaleString()}
                              </span>
                            </div>

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => deleteCommentMutation.mutate(c.id)}
                                disabled={deleteCommentMutation.isPending}
                                className="text-[11px] text-danger hover:underline ml-2"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-text-primary whitespace-pre-wrap pl-6">
                            {c.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Activity Timeline */}
            {activeTab === 'activity' && (
              <div className="flex flex-col gap-4">
                {isActivityLoading ? (
                  <div className="py-6 flex justify-center">
                    <Spinner size="md" />
                  </div>
                ) : activities.length === 0 ? (
                  <EmptyState
                    title="No activity recorded"
                    description="Changes to this task will appear here."
                  />
                ) : (
                  <div className="relative border-l border-border ml-3 pl-4 flex flex-col gap-4 py-2">
                    {activities.map((act) => (
                      <div key={act.id} className="relative flex flex-col gap-1 text-xs">
                        <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-accent" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-text-primary">
                            {act.actor?.name || 'Someone'}
                          </span>
                          <span className="text-text-muted">{act.action}</span>
                          <span className="text-[11px] text-text-muted ml-auto">
                            {new Date(act.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {/* Metadata diff details */}
                        {act.metadata && Object.keys(act.metadata).length > 0 && (
                          <div className="text-[11px] text-text-muted font-mono bg-surface-hover/60 p-1.5 rounded border border-border mt-0.5">
                            {JSON.stringify(act.metadata)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Delete Task Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteMutation.mutate()}
              isLoading={deleteMutation.isPending}
            >
              Delete Task
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          All associated comments and sub-activities will be permanently removed.
        </p>
      </Modal>
    </>
  );
}
