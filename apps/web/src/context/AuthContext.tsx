import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserResponse, LoginInput, RegisterInput } from '@sprintflow/shared';
import { api, setStoredToken } from '../lib/api-client';

interface AuthContextType {
  user: UserResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const queryClient = useQueryClient();

  // Hydrate user session on mount
  const checkAuth = useCallback(async () => {
    try {
      const response = await api.get<{ user: UserResponse }>('/api/auth/me');
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const handleUnauthorized = () => {
      setStoredToken(null);
      setUser(null);
      queryClient.clear();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [checkAuth, queryClient]);

  const login = async (credentials: LoginInput) => {
    const res = await api.post<{ user: UserResponse; accessToken?: string }>('/api/auth/login', credentials);
    if (res.accessToken) {
      setStoredToken(res.accessToken);
    }
    setUser(res.user);
    queryClient.clear();
  };

  const register = async (data: RegisterInput) => {
    const res = await api.post<{ user: UserResponse; accessToken?: string }>('/api/auth/register', data);
    if (res.accessToken) {
      setStoredToken(res.accessToken);
    }
    setUser(res.user);
    queryClient.clear();
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      setStoredToken(null);
      setUser(null);
      queryClient.clear();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
