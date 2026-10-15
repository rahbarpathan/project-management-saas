import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema, RegisterInput, APP_NAME } from '@sprintflow/shared';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { ThemeToggle } from '../components/ThemeToggle';
import { ApiError } from '../lib/api-client';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterInput, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    const result = registerSchema.safeParse({ name, email, password });
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof RegisterInput, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof RegisterInput;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await register(result.data);
      toast.success('Account created successfully! Welcome to SprintFlow.');
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message, 'Registration Failed');
      } else {
        toast.error('An unexpected network error occurred', 'Registration Failed');
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
          <p className="text-sm text-text-muted mt-1">Create your team workspace account</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>Enter your details below to create your SprintFlow account</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit} noValidate>
            <CardContent>
              <Input
                label="Full Name"
                type="text"
                name="name"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                autoComplete="name"
                required
              />

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
                helperText="Must be at least 8 characters with uppercase, lowercase, and a number"
                autoComplete="new-password"
                required
              />

              <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isSubmitting}>
                Create Account
              </Button>
            </CardContent>

            <CardFooter className="justify-center">
              <p className="text-sm text-text-muted">
                Already have an account?{' '}
                <Link to="/login" className="text-accent font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
