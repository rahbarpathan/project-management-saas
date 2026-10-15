import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Role, addMemberSchema, WorkspaceMemberResponse } from '@sprintflow/shared';
import { useWorkspace } from '../context/WorkspaceContext';
import { api, ApiError } from '../lib/api-client';
import {
  Button,
  Input,
  Select,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  BadgeVariant,
  Modal,
  Avatar,
  LoadingState,
  EmptyState,
  ErrorState,
  useToast,
} from '../components/ui';

function getRoleBadgeVariant(role: Role): BadgeVariant {
  switch (role) {
    case 'OWNER':
      return 'accent';
    case 'ADMIN':
      return 'warning';
    case 'MEMBER':
      return 'success';
    case 'VIEWER':
    default:
      return 'neutral';
  }
}

export function MembersPage() {
  const { workspaceId: paramWorkspaceId } = useParams<{ workspaceId: string }>();
  const { activeWorkspace, canManageMembers, isOwner } = useWorkspace();
  const workspaceId = paramWorkspaceId || activeWorkspace?.id;

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMemberResponse | null>(null);

  // Form state for adding member
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<Role>('MEMBER');
  const [addError, setAddError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api.get<{ members: WorkspaceMemberResponse[] }>(`/api/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  });

  const members = data?.members || [];
  const ownersCount = members.filter((m) => m.role === 'OWNER').length;

  // Add Member Mutation
  const addMutation = useMutation({
    mutationFn: (body: { email: string; role: Role }) =>
      api.post<{ member: WorkspaceMemberResponse }>(`/api/workspaces/${workspaceId}/members`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      toast.success('Member added successfully');
      setIsAddModalOpen(false);
      setAddEmail('');
      setAddRole('MEMBER');
      setAddError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setAddError(err.message);
        toast.error(err.message, 'Failed to add member');
      } else {
        setAddError('An unexpected error occurred');
        toast.error('An unexpected error occurred', 'Failed to add member');
      }
    },
  });

  // Update Member Role Mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      api.patch<{ member: WorkspaceMemberResponse }>(
        `/api/workspaces/${workspaceId}/members/${memberId}`,
        { role },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      toast.success('Member role updated');
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      if (err instanceof ApiError) {
        toast.error(err.message, 'Update Role Failed');
      } else {
        toast.error('Failed to update role', 'Update Role Failed');
      }
    },
  });

  // Remove Member Mutation
  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/api/workspaces/${workspaceId}/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      toast.success('Member removed');
      setMemberToRemove(null);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Remove Member Failed');
      } else {
        toast.error('Failed to remove member', 'Remove Member Failed');
      }
      setMemberToRemove(null);
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const validation = addMemberSchema.safeParse({ email: addEmail, role: addRole });
    if (!validation.success) {
      setAddError(validation.error.issues[0]?.message || 'Invalid input');
      return;
    }

    addMutation.mutate(validation.data);
  };

  if (isLoading) {
    return <LoadingState message="Loading workspace members..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load members"
        message={(error as Error).message || 'Unable to retrieve workspace members'}
        retry={() => refetch()}
      />
    );
  }

  // Determine allowed roles for adding a member
  const roleOptions = [
    { value: 'VIEWER', label: 'Viewer (Read-only)' },
    { value: 'MEMBER', label: 'Member (Manage tasks)' },
    { value: 'ADMIN', label: 'Admin (Manage members & projects)' },
    ...(isOwner ? [{ value: 'OWNER', label: 'Owner (Full control)' }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Workspace Members
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Manage who has access to {activeWorkspace?.name || 'this workspace'} and their permission levels.
          </p>
        </div>

        {canManageMembers && (
          <Button
            variant="primary"
            onClick={() => setIsAddModalOpen(true)}
            id="add-member-button"
            className="self-start sm:self-auto"
          >
            Add Member
          </Button>
        )}
      </div>

      {/* Members List Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                {members.length} {members.length === 1 ? 'member' : 'members'} with access
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="py-8">
              <EmptyState
                title="No members found"
                description="Invite team members to collaborate on projects."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" role="table">
                <thead className="border-b border-border bg-surface-hover/50 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3">Member</th>
                    <th scope="col" className="px-6 py-3">Email</th>
                    <th scope="col" className="px-6 py-3">Role</th>
                    <th scope="col" className="px-6 py-3">Joined</th>
                    {canManageMembers && <th scope="col" className="px-6 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((member) => {
                    const isLastOwner = member.role === 'OWNER' && ownersCount <= 1;
                    const isTargetOwner = member.role === 'OWNER';
                    // Admin cannot modify an Owner
                    const canEditThisMember =
                      canManageMembers &&
                      (isOwner || !isTargetOwner) &&
                      !isLastOwner;

                    return (
                      <tr key={member.id} className="hover:bg-surface-hover/40 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={member.user?.name || member.user?.email || 'User'}
                              size="sm"
                            />
                            <div>
                              <div className="font-medium text-text-primary">
                                {member.user?.name || 'Unknown'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-text-muted">
                          {member.user?.email}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {canEditThisMember ? (
                            <select
                              aria-label={`Change role for ${member.user?.name || member.user?.email}`}
                              value={member.role}
                              onChange={(e) => {
                                const newRole = e.target.value as Role;
                                updateRoleMutation.mutate({
                                  memberId: member.id,
                                  role: newRole,
                                });
                              }}
                              disabled={updateRoleMutation.isPending}
                              className="text-xs font-medium rounded border border-border bg-surface px-2.5 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
                            >
                              <option value="VIEWER">Viewer</option>
                              <option value="MEMBER">Member</option>
                              <option value="ADMIN">Admin</option>
                              {isOwner && <option value="OWNER">Owner</option>}
                            </select>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Badge variant={getRoleBadgeVariant(member.role)} size="sm">
                                {member.role}
                              </Badge>
                              {isLastOwner && (
                                <span className="text-[10px] text-text-muted italic">
                                  (Primary Owner)
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-xs text-text-muted">
                          {new Date(member.createdAt).toLocaleDateString()}
                        </td>

                        {canManageMembers && (
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            {canEditThisMember ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMemberToRemove(member)}
                                className="text-danger hover:text-danger hover:bg-danger/10 text-xs px-2.5 py-1"
                              >
                                Remove
                              </Button>
                            ) : (
                              <span className="text-xs text-text-muted italic">Protected</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddError(null);
        }}
        title="Add Team Member"
        description="Add a registered user to this workspace by their email address."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsAddModalOpen(false)}
              disabled={addMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddSubmit}
              isLoading={addMutation.isPending}
            >
              Add Member
            </Button>
          </div>
        }
      >
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="colleague@example.com"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            error={addError || undefined}
            required
            autoFocus
          />

          <Select
            label="Role"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as Role)}
            options={roleOptions}
            helperText={
              addRole === 'VIEWER'
                ? 'Can read tasks, comments, and project details.'
                : addRole === 'MEMBER'
                ? 'Can create and update tasks, move statuses, and post comments.'
                : addRole === 'ADMIN'
                ? 'Can manage workspace members, projects, and tasks.'
                : 'Full ownership and administrative control.'
            }
          />
        </form>
      </Modal>

      {/* Remove Member Confirmation Modal */}
      <Modal
        isOpen={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        title="Remove Member"
        description={`Are you sure you want to remove ${
          memberToRemove?.user?.name || memberToRemove?.user?.email
        } from this workspace? They will lose access to all projects and tasks.`}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setMemberToRemove(null)}
              disabled={removeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (memberToRemove) {
                  removeMutation.mutate(memberToRemove.id);
                }
              }}
              isLoading={removeMutation.isPending}
            >
              Remove Member
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          This action will immediately revoke their access. You can invite them back at any time.
        </p>
      </Modal>
    </div>
  );
}
