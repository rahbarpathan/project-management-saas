import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createProjectSchema,
  ProjectListResponse,
  ProjectResponse,
} from '@sprintflow/shared';
import { useWorkspace } from '../context/WorkspaceContext';
import { api, ApiError } from '../lib/api-client';
import {
  Button,
  Input,
  Textarea,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Modal,
  LoadingState,
  EmptyState,
  ErrorState,
  useToast,
} from '../components/ui';

export function ProjectsPage() {
  const { workspaceId: paramWorkspaceId } = useParams<{ workspaceId: string }>();
  const { activeWorkspace, canManageProjects } = useWorkspace();
  const workspaceId = paramWorkspaceId || activeWorkspace?.id;

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 12;

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string; key?: string; description?: string }>({});

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const queryParams = new URLSearchParams();
  queryParams.set('page', page.toString());
  queryParams.set('limit', limit.toString());
  if (search.trim()) {
    queryParams.set('search', search.trim());
  }

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['projects', workspaceId, page, search],
    queryFn: () =>
      api.get<ProjectListResponse>(`/api/workspaces/${workspaceId}/projects?${queryParams.toString()}`),
    enabled: !!workspaceId,
  });

  const projects = data?.projects || [];
  const pagination = data?.pagination || { page: 1, limit, total: 0, totalPages: 1 };

  const handleSearchChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val.trim()) {
      next.set('search', val);
    } else {
      next.delete('search');
    }
    next.set('page', '1'); // reset page on new search
    setSearchParams(next);
  };

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', newPage.toString());
    setSearchParams(next);
  };

  const createMutation = useMutation({
    mutationFn: (body: { name: string; key: string; description?: string | null }) =>
      api.post<{ project: ProjectResponse }>(`/api/workspaces/${workspaceId}/projects`, body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      toast.success(`Project "${res.project.name}" created!`);
      setIsCreateModalOpen(false);
      setName('');
      setKey('');
      setDescription('');
      setErrors({});
      navigate(`/workspaces/${workspaceId}/projects/${res.project.id}/tasks`);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Create Project Failed');
      } else {
        toast.error('An unexpected error occurred', 'Create Project Failed');
      }
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const payload = {
      name: name.trim(),
      key: key.trim().toUpperCase(),
      description: description.trim() ? description.trim() : null,
    };

    const validation = createProjectSchema.safeParse(payload);
    if (!validation.success) {
      const fieldErrors: { name?: string; key?: string; description?: string } = {};
      validation.error.issues.forEach((issue) => {
        const path = issue.path[0] as 'name' | 'key' | 'description';
        if (path) fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    createMutation.mutate(payload);
  };

  if (isLoading) {
    return <LoadingState message="Loading projects..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load projects"
        message={(error as Error).message || 'Unable to retrieve projects'}
        retry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Projects</h1>
          <p className="text-sm text-text-muted mt-1">
            Projects hold issues, tasks, and backlogs for {activeWorkspace?.name || 'this workspace'}.
          </p>
        </div>

        {canManageProjects && (
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
            id="create-project-button"
            className="self-start sm:self-auto"
          >
            Create Project
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search projects by name..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            leftAddon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>

        {search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSearchChange('')}
            className="text-xs text-text-muted hover:text-text-primary self-start sm:self-auto"
          >
            Clear Search
          </Button>
        )}
      </div>

      {/* Projects Grid / List */}
      {projects.length === 0 ? (
        <EmptyState
          title={search ? 'No projects match your search' : 'No projects yet'}
          description={
            search
              ? `No projects found for query "${search}". Try searching for something else.`
              : 'Create your first project to start tracking tasks and sprints.'
          }
          action={
            search ? (
              <Button variant="secondary" size="sm" onClick={() => handleSearchChange('')}>
                Clear Search
              </Button>
            ) : canManageProjects ? (
              <Button variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
                Create Project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() =>
                navigate(`/workspaces/${workspaceId}/projects/${project.id}/tasks`)
              }
              className="cursor-pointer group"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(`/workspaces/${workspaceId}/projects/${project.id}/tasks`);
                }
              }}
            >
              <Card className="h-full transition-all duration-150 hover:border-text-muted hover:shadow-md group-hover:border-accent/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="accent" size="sm">
                      {project.key}
                    </Badge>
                    <span className="text-xs text-text-muted">
                      {project.tasksCount !== undefined
                        ? `${project.tasksCount} ${project.tasksCount === 1 ? 'task' : 'tasks'}`
                        : '0 tasks'}
                    </span>
                  </div>
                  <CardTitle className="text-base group-hover:text-accent transition-colors mt-2">
                    {project.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 mt-1 min-h-[2.5rem]">
                    {project.description || 'No description provided.'}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 text-xs text-text-muted flex items-center justify-between">
                  <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                  <span className="text-accent group-hover:translate-x-0.5 transition-transform font-medium flex items-center gap-1">
                    View Tasks &rarr;
                  </span>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Bar */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-text-muted">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setErrors({});
        }}
        title="Create New Project"
        description="Projects contain tasks, issues, and team activity."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSubmit}
              isLoading={createMutation.isPending}
            >
              Create Project
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
          <Input
            label="Project Name"
            placeholder="e.g. Website Redesign"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!key && e.target.value) {
                // Auto generate uppercase key (2-5 chars)
                const autoKey = e.target.value
                  .trim()
                  .replace(/[^a-zA-Z0-9]/g, '')
                  .toUpperCase()
                  .slice(0, 4);
                if (autoKey.length >= 2) {
                  setKey(autoKey);
                }
              }
            }}
            error={errors.name}
            required
            autoFocus
          />

          <Input
            label="Project Key (2-5 letters/digits)"
            placeholder="e.g. WEB or PRJ"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase().slice(0, 5))}
            error={errors.key}
            helperText="Used as issue prefix, e.g. WEB-123. Must be uppercase."
            required
          />

          <Textarea
            label="Description"
            placeholder="Brief overview of project goals..."
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={errors.description}
            helperText="Optional, max 500 characters."
          />
        </form>
      </Modal>
    </div>
  );
}
