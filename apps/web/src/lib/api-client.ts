export interface ApiErrorData {
  code: string;
  message: string;
  details?: Record<string, unknown> | Array<unknown>;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown> | Array<unknown>;

  constructor(status: number, data?: Partial<ApiErrorData>) {
    super(data?.message || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = data?.code || 'UNKNOWN_ERROR';
    this.details = data?.details;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let isRefreshing = false;
let refreshSubscribers: Array<(success: boolean) => void> = [];

function onRefreshed(success: boolean) {
  refreshSubscribers.forEach((callback) => callback(success));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (success: boolean) => void) {
  refreshSubscribers.push(callback);
}

export interface RequestOptions extends RequestInit {
  skipAuthRefresh?: boolean;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Automatically passes and receives httpOnly cookies
  };

  const response = await fetch(url, config);

  // If request succeeded (2xx)
  if (response.ok) {
    if (response.status === 204) {
      return {} as T;
    }
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return {} as T;
  }

  // Handle 401 Unauthorized with one-time token refresh
  const isAuthEndpoint =
    endpoint.includes('/api/auth/login') ||
    endpoint.includes('/api/auth/refresh') ||
    endpoint.includes('/api/auth/register');

  if (response.status === 401 && !options.skipAuthRefresh && !isAuthEndpoint) {
    if (!isRefreshing) {
      isRefreshing = true;

      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (refreshResponse.ok) {
          isRefreshing = false;
          onRefreshed(true);
          // Retry the original request
          return apiRequest<T>(endpoint, { ...options, skipAuthRefresh: true });
        } else {
          isRefreshing = false;
          onRefreshed(false);
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      } catch {
        isRefreshing = false;
        onRefreshed(false);
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
    } else {
      // Queue until refresh resolves
      return new Promise<T>((resolve, reject) => {
        addRefreshSubscriber((success: boolean) => {
          if (success) {
            resolve(apiRequest<T>(endpoint, { ...options, skipAuthRefresh: true }));
          } else {
            reject(new ApiError(401, { code: 'UNAUTHORIZED', message: 'Session expired' }));
          }
        });
      });
    }
  }

  // Parse error payload
  let errorPayload: Partial<ApiErrorData> = {};
  try {
    const json = await response.json();
    if (json.error) {
      errorPayload = json.error;
    } else {
      errorPayload = json;
    }
  } catch {
    errorPayload = {
      code: 'HTTP_ERROR',
      message: response.statusText || 'An unexpected server error occurred',
    };
  }

  throw new ApiError(response.status, errorPayload);
}

export const api = {
  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return apiRequest<T>(endpoint, { ...options, method: 'GET' });
  },
  post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return apiRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return apiRequest<T>(endpoint, { ...options, method: 'DELETE' });
  },
};
