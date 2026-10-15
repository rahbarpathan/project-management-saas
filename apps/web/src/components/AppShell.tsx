import { Link, Outlet, useLocation } from 'react-router-dom';
import { APP_NAME } from '@sprintflow/shared';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { ThemeToggle } from './ThemeToggle';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';

export function AppShell() {
  const { user, logout } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const location = useLocation();

  const isProjectsActive = location.pathname.includes('/projects');
  const isMembersActive = location.pathname.includes('/members');

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary transition-colors">
      {/* Slim Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Link
              to="/"
              className="flex items-center gap-2 font-bold text-base sm:text-lg text-text-primary hover:opacity-90 flex-shrink-0"
            >
              <span className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white text-xs font-extrabold shadow-sm">
                SF
              </span>
              <span className="hidden sm:inline">{APP_NAME}</span>
            </Link>

            {/* Workspace Switcher */}
            <WorkspaceSwitcher />

            {/* Navigation links for active workspace */}
            {activeWorkspace && (
              <nav className="hidden md:flex items-center gap-1 text-xs font-medium pl-2 border-l border-border">
                <Link
                  to={`/workspaces/${activeWorkspace.id}/projects`}
                  className={`px-2.5 py-1.5 rounded-md transition-colors ${
                    isProjectsActive
                      ? 'bg-surface-hover text-text-primary font-semibold'
                      : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  Projects
                </Link>
                <Link
                  to={`/workspaces/${activeWorkspace.id}/members`}
                  className={`px-2.5 py-1.5 rounded-md transition-colors ${
                    isMembersActive
                      ? 'bg-surface-hover text-text-primary font-semibold'
                      : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                  }`}
                >
                  Members
                </Link>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Link
              to="/design"
              className="hidden lg:inline-flex text-text-muted hover:text-text-primary transition-colors text-xs px-2 py-1 rounded bg-surface border border-border"
            >
              Design Primitives
            </Link>

            <ThemeToggle />

            {user && (
              <div className="flex items-center gap-2 sm:gap-3 pl-2 border-l border-border">
                <div className="flex items-center gap-2">
                  <Avatar name={user.name} size="sm" />
                  <span className="hidden lg:inline-block text-xs font-medium text-text-primary max-w-[120px] truncate">
                    {user.name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logout()}
                  aria-label="Sign out"
                  className="px-2 sm:px-3 text-xs"
                >
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        {activeWorkspace && (
          <div className="md:hidden flex items-center gap-2 px-4 py-1.5 border-t border-border bg-surface text-xs font-medium overflow-x-auto">
            <Link
              to={`/workspaces/${activeWorkspace.id}/projects`}
              className={`px-3 py-1 rounded transition-colors whitespace-nowrap ${
                isProjectsActive
                  ? 'bg-surface-hover text-text-primary font-semibold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Projects
            </Link>
            <Link
              to={`/workspaces/${activeWorkspace.id}/members`}
              className={`px-3 py-1 rounded transition-colors whitespace-nowrap ${
                isMembersActive
                  ? 'bg-surface-hover text-text-primary font-semibold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Members
            </Link>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <CreateWorkspaceModal />
    </div>
  );
}
