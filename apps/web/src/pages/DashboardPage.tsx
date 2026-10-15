import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { LoadingState, EmptyState, Button } from '../components/ui';

export function DashboardPage() {
  const { workspaces, activeWorkspace, isLoading, setIsCreateModalOpen } = useWorkspace();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && activeWorkspace) {
      navigate(`/workspaces/${activeWorkspace.id}/projects`, { replace: true });
    }
  }, [isLoading, activeWorkspace, navigate]);

  if (isLoading) {
    return <LoadingState message="Loading your workspaces..." />;
  }

  if (workspaces.length === 0) {
    return (
      <div className="py-16 max-w-lg mx-auto">
        <EmptyState
          title="Welcome to SprintFlow"
          description="You are not a member of any workspace yet. Create your first workspace to start organizing projects and tasks."
          action={
            <Button
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
              id="get-started-create-workspace"
            >
              + Create Your First Workspace
            </Button>
          }
        />
      </div>
    );
  }

  return <LoadingState message="Redirecting to workspace..." />;
}
