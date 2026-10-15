import React, { useState } from 'react';
import {
  createTaskSchema,
  TaskStatus,
  TaskPriority,
  WorkspaceMemberResponse,
  TaskResponse,
} from '@sprintflow/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api-client';
import {
  Modal,
  Button,
  Input,
  Select,
  Textarea,
  useToast,
} from './ui';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  members: WorkspaceMemberResponse[];
  initialStatus?: TaskStatus;
}

export function CreateTaskModal({
  isOpen,
  onClose,
  projectId,
  members,
  initialStatus = 'TODO',
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<{ title?: string }>({});

  React.useEffect(() => {
    if (isOpen) {
      setStatus(initialStatus);
    }
  }, [isOpen, initialStatus]);

  const queryClient = useQueryClient();
  const toast = useToast();

  const createMutation = useMutation({
    mutationFn: (body: {
      title: string;
      description?: string | null;
      status: TaskStatus;
      priority: TaskPriority;
      assigneeId?: string | null;
      dueDate?: string | null;
    }) => api.post<{ task: TaskResponse }>(`/api/projects/${projectId}/tasks`, body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(`Task "${data.task.title}" created!`);
      handleClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Create Task Failed');
      } else {
        toast.error('An unexpected error occurred', 'Create Task Failed');
      }
    },
  });

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setStatus('TODO');
    setPriority('MEDIUM');
    setAssigneeId('');
    setDueDate('');
    setErrors({});
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const payload = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      status,
      priority,
      assigneeId: assigneeId.trim() ? assigneeId.trim() : null,
      dueDate: dueDate.trim() ? new Date(dueDate).toISOString() : null,
    };

    const validation = createTaskSchema.safeParse(payload);
    if (!validation.success) {
      const fieldErrors: { title?: string } = {};
      validation.error.issues.forEach((issue) => {
        if (issue.path[0] === 'title') fieldErrors.title = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    createMutation.mutate(payload);
  };

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({
      value: m.userId,
      label: `${m.user?.name || m.user?.email} (${m.role})`,
    })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Task"
      description="Add an issue or task to this project backlog or sprint."
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={createMutation.isPending}
          >
            Create Task
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Title"
          placeholder="e.g. Implement user authentication flow"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
          autoFocus
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Initial Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
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
            options={assigneeOptions}
          />

          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <Textarea
          label="Description"
          rows={3}
          placeholder="Optional description, context, or acceptance criteria..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </form>
    </Modal>
  );
}
