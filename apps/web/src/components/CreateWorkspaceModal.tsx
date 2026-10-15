import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWorkspaceSchema, WorkspaceResponse } from '@sprintflow/shared';
import { useWorkspace } from '../context/WorkspaceContext';
import { api, ApiError } from '../lib/api-client';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

export function CreateWorkspaceModal() {
  const { isCreateModalOpen, setIsCreateModalOpen, setActiveWorkspaceId } = useWorkspace();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug?: string }) =>
      api.post<{ workspace: WorkspaceResponse }>('/api/workspaces', data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setActiveWorkspaceId(data.workspace.id);
      setIsCreateModalOpen(false);
      setName('');
      setSlug('');
      setErrors({});
      toast.success(`Workspace "${data.workspace.name}" created!`);
      navigate(`/workspaces/${data.workspace.id}/projects`);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Create Workspace Failed');
      } else {
        toast.error('An unexpected error occurred', 'Create Workspace Failed');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const payload: { name: string; slug?: string } = {
      name: name.trim(),
    };
    if (slug.trim()) {
      payload.slug = slug.trim().toLowerCase();
    }

    const validation = createWorkspaceSchema.safeParse(payload);
    if (!validation.success) {
      const fieldErrors: { name?: string; slug?: string } = {};
      validation.error.issues.forEach((issue) => {
        const path = issue.path[0] as 'name' | 'slug';
        if (path) fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    createMutation.mutate(validation.data);
  };

  const handleClose = () => {
    setIsCreateModalOpen(false);
    setErrors({});
  };

  return (
    <Modal
      isOpen={isCreateModalOpen}
      onClose={handleClose}
      title="Create New Workspace"
      description="Workspaces group projects, tasks, and team members together."
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
            Create Workspace
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Workspace Name"
          placeholder="e.g. Acme Corp or Mobile App"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slug && e.target.value) {
              // auto-suggest slug
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
                  .slice(0, 50),
              );
            }
          }}
          error={errors.name}
          required
          autoFocus
        />

        <Input
          label="Slug (URL identifier)"
          placeholder="e.g. acme-corp"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          error={errors.slug}
          helperText="Lowercase letters, numbers, and hyphens only (optional)."
        />
      </form>
    </Modal>
  );
}
