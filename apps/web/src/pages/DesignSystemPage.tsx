import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Modal,
  Drawer,
  Avatar,
  Spinner,
  Skeleton,
  LoadingState,
  EmptyState,
  ErrorState,
  useToast,
} from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../context/ThemeContext';

export function DesignSystemPage() {
  const { theme, resolvedTheme } = useTheme();
  const toast = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');

  return (
    <div className="space-y-12 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Design System</h1>
          <p className="text-sm text-text-muted mt-1">
            SprintFlow minimal design system primitives with light & dark theme token mapping.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="accent" dot>
            Theme: {theme} ({resolvedTheme})
          </Badge>
          <ThemeToggle />
        </div>
      </div>

      {/* Cards */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">1. Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Composed Card Title</CardTitle>
              <CardDescription>Subtle description explaining card context</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted">
                Standard container for dashboard widgets, project boards, and member summaries.
              </p>
            </CardContent>
            <CardFooter>
              <span className="text-xs text-text-muted">Updated 2m ago</span>
              <Button size="sm" variant="secondary">View Action</Button>
            </CardFooter>
          </Card>

          <Card variant="subtle">
            <CardHeader>
              <CardTitle>Subtle Card</CardTitle>
              <CardDescription>Secondary styling for inset modules</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted">Used for nested blocks and background highlights.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">1. Buttons</h2>
        <Card>
          <CardContent className="space-y-6">
            <div>
              <h4 className="text-xs uppercase font-semibold text-text-muted mb-3">Variants</h4>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primary Button</Button>
                <Button variant="secondary">Secondary Button</Button>
                <Button variant="ghost">Ghost Button</Button>
                <Button variant="danger">Danger Button</Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase font-semibold text-text-muted mb-3">Sizes</h4>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small (sm)</Button>
                <Button size="md">Medium (md)</Button>
                <Button size="lg">Large (lg)</Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase font-semibold text-text-muted mb-3">States</h4>
              <div className="flex flex-wrap items-center gap-3">
                <Button isLoading>Loading State</Button>
                <Button disabled>Disabled Button</Button>
                <Button
                  leftIcon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  }
                >
                  With Left Icon
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Inputs & Form Controls */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">2. Inputs & Select</h2>
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Standard Input"
              placeholder="Enter some text..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              helperText="Helper text provides additional guidance"
            />

            <Input
              label="Input with Error"
              placeholder="name@example.com"
              value={inputError}
              onChange={(e) => setInputError(e.target.value)}
              error="Invalid email format"
            />

            <Input
              label="Disabled Input"
              value="Immutable value"
              disabled
              helperText="Field is non-editable"
            />

            <Select
              label="Select Dropdown"
              options={[
                { value: 'active', label: 'Active status' },
                { value: 'pending', label: 'Pending approval' },
                { value: 'archived', label: 'Archived project' },
              ]}
              helperText="Choose an option from the list"
            />
          </CardContent>
        </Card>
      </section>

      {/* Badges */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">3. Badges</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge variant="default">Default</Badge>
            <Badge variant="accent" dot>
              Accent Active
            </Badge>
            <Badge variant="success" dot>
              Success Online
            </Badge>
            <Badge variant="warning" dot>
              Warning Degraded
            </Badge>
            <Badge variant="danger" dot>
              Danger Outage
            </Badge>
            <Badge variant="muted">Muted Archived</Badge>
          </CardContent>
        </Card>
      </section>

      {/* Avatars */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">4. Avatars</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Avatar name="Sarah Connor" size="sm" />
              <Avatar name="John Doe" size="md" />
              <Avatar name="Alexander Hamilton" size="lg" />
            </div>
            <div className="flex items-center gap-3">
              <Avatar src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" name="Valid Image" size="md" />
              <Avatar src="https://invalid-url.fake/image.png" name="Fallback Image" size="md" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Toast Notifications */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">5. Toasts</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => toast.success('Task created successfully!', 'Success')}
            >
              Trigger Success Toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.error('Failed to update task position. Conflict detected.', 'Server Error')}
            >
              Trigger Error Toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.info('A new member joined the workspace.', 'Notification')}
            >
              Trigger Info Toast
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Modal & Drawer */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">6. Dialogs & Overlays</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              Open Modal Dialog
            </Button>
            <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
              Open Slide Drawer
            </Button>
          </CardContent>
        </Card>

        {/* Modal Instance */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Create New Project"
          description="Projects organize tasks and sprints within your workspace."
          footer={
            <>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setIsModalOpen(false)}>
                Confirm & Create
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input label="Project Name" placeholder="e.g. Core Engine" defaultValue="API Gateway" />
            <Input label="Project Key" placeholder="e.g. CORE" defaultValue="GATE" />
          </div>
        </Modal>

        {/* Drawer Instance */}
        <Drawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title="Task Details Drawer"
        >
          <div className="space-y-4">
            <div>
              <h4 className="text-xs uppercase font-semibold text-text-muted mb-1">Title</h4>
              <p className="text-sm font-medium text-text-primary">Implement optimistic locking for task reordering</p>
            </div>
            <div>
              <h4 className="text-xs uppercase font-semibold text-text-muted mb-1">Status</h4>
              <Badge variant="accent" dot>In Progress</Badge>
            </div>
            <div>
              <h4 className="text-xs uppercase font-semibold text-text-muted mb-1">Assignee</h4>
              <div className="flex items-center gap-2 mt-1">
                <Avatar name="Alex Rivera" size="sm" />
                <span className="text-sm text-text-primary">Alex Rivera</span>
              </div>
            </div>
          </div>
        </Drawer>
      </section>

      {/* Skeletons & Spinners */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">7. Skeletons & Spinners</h2>
        <Card>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Spinner size="sm" />
              <Spinner size="md" color="accent" />
              <Spinner size="lg" color="muted" />
            </div>

            <div className="space-y-2 max-w-sm">
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" />
              <Skeleton variant="text" width="80%" />
              <div className="flex items-center gap-3 pt-2">
                <Skeleton variant="circular" width={36} height={36} />
                <div className="space-y-1.5 flex-1">
                  <Skeleton variant="text" width="50%" />
                  <Skeleton variant="text" width="30%" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Feedback States */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text-primary">8. Feedback States</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <LoadingState message="Syncing workspace data..." />
          </Card>
          <Card>
            <EmptyState
              title="No tasks found"
              description="Create your first task to get started."
              action={{
                label: 'New Task',
                onClick: () => toast.info('New Task clicked'),
              }}
            />
          </Card>
          <Card>
            <ErrorState
              title="Connection error"
              message="Failed to connect to the backend server."
              onRetry={() => toast.info('Retrying connection...')}
            />
          </Card>
        </div>
      </section>
    </div>
  );
}
