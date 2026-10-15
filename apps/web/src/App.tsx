import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicRoute } from './components/PublicRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { DesignSystemPage } from './pages/DesignSystemPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectTasksPage } from './pages/ProjectTasksPage';
import { MembersPage } from './pages/MembersPage';
import { KanbanBoardPage } from './pages/KanbanBoardPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                {/* Public Auth Routes */}
                <Route element={<PublicRoute />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                </Route>

                {/* Protected Application Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route
                    element={
                      <WorkspaceProvider>
                        <AppShell />
                      </WorkspaceProvider>
                    }
                  >
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/workspaces/:workspaceId/projects" element={<ProjectsPage />} />
                    <Route
                      path="/workspaces/:workspaceId/projects/:projectId/tasks"
                      element={<ProjectTasksPage />}
                    />
                    <Route
                      path="/workspaces/:workspaceId/projects/:projectId/board"
                      element={<KanbanBoardPage />}
                    />
                    <Route
                      path="/projects/:projectId/tasks"
                      element={<ProjectTasksPage />}
                    />
                    <Route
                      path="/projects/:projectId/board"
                      element={<KanbanBoardPage />}
                    />
                    <Route path="/workspaces/:workspaceId/members" element={<MembersPage />} />
                    <Route path="/design" element={<DesignSystemPage />} />
                  </Route>
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
