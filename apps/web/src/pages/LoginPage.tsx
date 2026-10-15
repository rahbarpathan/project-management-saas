import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginSchema, LoginInput, APP_NAME } from '@sprintflow/shared';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { ThemeToggle } from '../components/ThemeToggle';
import { ApiError } from '../lib/api-client';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof LoginInput, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginInput, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof LoginInput;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(result.data);
      toast.success('Successfully logged in');
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Login Failed');
      } else {
        toast.error('An unexpected network error occurred', 'Login Failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-background transition-colors">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent text-white font-extrabold text-lg mb-3 shadow-sm">
            SF
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">{APP_NAME}</h1>
          <p className="text-sm text-text-muted mt-1">Sign in to your account</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Enter your credentials below to access your workspace</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit} noValidate>
            <CardContent>
              <Input
                label="Email Address"
                type="email"
                name="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                autoComplete="email"
                required
              />

              <Input
                label="Password"
                type="password"
                name="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                autoComplete="current-password"
                required
              />

              <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isSubmitting}>
                Sign In
              </Button>
            </CardContent>

            <CardFooter className="justify-center">
              <p className="text-sm text-text-muted">
                Don&apos;t have an account?{' '}
                <Link to="/register" className="text-accent font-medium hover:underline">
                  Create one
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
