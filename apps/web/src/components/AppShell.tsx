import { Link, Outlet } from 'react-router-dom';
import { APP_NAME } from '@sprintflow/shared';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary transition-colors">
      {/* Slim Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 font-bold text-lg text-text-primary hover:opacity-90">
              <span className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white text-sm font-extrabold shadow-sm">
                SF
              </span>
              <span>{APP_NAME}</span>
            </Link>

            <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
              <Link to="/" className="text-text-muted hover:text-text-primary transition-colors">
                Workspaces
              </Link>
              <Link to="/design" className="text-text-muted hover:text-text-primary transition-colors text-xs px-2 py-0.5 rounded bg-surface-hover border border-border">
                Design System
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            {user && (
              <div className="flex items-center gap-3 pl-2 border-l border-border">
                <div className="flex items-center gap-2">
                  <Avatar name={user.name} size="sm" />
                  <span className="hidden sm:inline-block text-xs font-medium text-text-primary max-w-[120px] truncate">
                    {user.name}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => logout()} aria-label="Sign out">
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
