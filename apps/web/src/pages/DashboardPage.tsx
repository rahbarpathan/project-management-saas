import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Welcome, {user?.name}</h1>
          <p className="text-sm text-text-muted mt-0.5">SprintFlow real-time project management dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success" dot>
            Connected
          </Badge>
          <Link to="/design">
            <Button variant="secondary" size="sm">
              View Design System
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Session Info</CardTitle>
            <CardDescription>Your authenticated account credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-2">
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">User ID</span>
                <span className="font-mono text-xs text-text-primary truncate max-w-[180px]">{user?.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-text-muted">Email</span>
                <span className="font-medium text-text-primary">{user?.email}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-muted">Status</span>
                <span className="text-success font-medium">Active</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Design System</CardTitle>
            <CardDescription>Preview UI primitives in light and dark mode</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted mb-4">
              Explore the minimalist design system with buttons, inputs, modals, toasts, badges, and feedback states.
            </p>
            <Link to="/design">
              <Button variant="primary" size="sm" className="w-full">
                Open /design Page
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
