import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { WorkspaceResponse, Role } from '@sprintflow/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuth } from './AuthContext';

interface WorkspaceContextType {
  workspaces: WorkspaceResponse[];
  activeWorkspace: WorkspaceResponse | null;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
  refetchWorkspaces: () => Promise<unknown>;
  // Permissions derived from active workspace role
  role: Role | null;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canManageProjects: boolean;
  canManageTasks: boolean;
  canComment: boolean;
  canDeleteWorkspace: boolean;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const ACTIVE_WORKSPACE_KEY = 'sprintflow-active-workspace-id';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch: refetchWorkspaces,
  } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.get<{ workspaces: WorkspaceResponse[] }>('/api/workspaces'),
    enabled: !!user,
  });

  const workspaces = useMemo(() => data?.workspaces || [], [data?.workspaces]);

  // Sync active workspace
  useEffect(() => {
    if (!user) {
      setActiveWorkspaceIdState(null);
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      return;
    }

    if (workspaces.length > 0) {
      const exists = workspaces.some((w) => w.id === activeWorkspaceId);
      if (!activeWorkspaceId || !exists) {
        const defaultId = workspaces[0]?.id;
        if (defaultId) {
          setActiveWorkspaceIdState(defaultId);
          localStorage.setItem(ACTIVE_WORKSPACE_KEY, defaultId);
        }
      }
    }
  }, [workspaces, activeWorkspaceId, user]);

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
    // Invalidate project/task caches on workspace switch
    queryClient.invalidateQueries({ queryKey: ['projects', id] });
  };

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0] || null;
  }, [workspaces, activeWorkspaceId]);

  const role: Role | null = activeWorkspace?.currentUserRole || null;
  const isOwner = role === 'OWNER';
  const isAdmin = role === 'ADMIN';
  const isMember = role === 'MEMBER';
  const isViewer = role === 'VIEWER';

  const canManageMembers = isOwner || isAdmin;
  const canManageProjects = isOwner || isAdmin;
  const canManageTasks = isOwner || isAdmin || isMember;
  const canComment = isOwner || isAdmin || isMember;
  const canDeleteWorkspace = isOwner;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        activeWorkspaceId,
        setActiveWorkspaceId,
        isLoading,
        error: error as Error | null,
        refetchWorkspaces,
        role,
        isOwner,
        isAdmin,
        isMember,
        isViewer,
        canManageMembers,
        canManageProjects,
        canManageTasks,
        canComment,
        canDeleteWorkspace,
        isCreateModalOpen,
        setIsCreateModalOpen,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
