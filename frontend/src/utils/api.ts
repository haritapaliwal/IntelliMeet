const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface FetchOptions extends RequestInit {
  bodyData?: any;
}

export const request = async <T = any>(
  path: string,
  options: FetchOptions = {}
): Promise<T> => {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});

  // Automatically inject JSON Content-Type and Authorization Bearer token
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Generate trace ID locally for client-side logging correlation
  const traceId = Math.random().toString(36).substring(2, 15);
  headers.set('X-Trace-ID', traceId);

  const config: RequestInit = {
    ...options,
    headers,
  };

  if (options.bodyData) {
    config.body = JSON.stringify(options.bodyData);
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, config);
    const data = await response.json();

    if (!response.ok || data.success === false) {
      // Throw formatted error matching unified Hintro schema
      const errorMsg = data.error?.message || response.statusText || 'An error occurred';
      const errorCode = data.error?.code || 'API_ERROR';
      const errorDetails = data.error?.details;
      
      const error = new Error(errorMsg) as any;
      error.code = errorCode;
      error.status = response.status;
      error.details = errorDetails;
      error.traceId = data.traceId || traceId;
      throw error;
    }

    // Return the response data payload
    return data.data as T;
  } catch (error: any) {
    if (error.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
      // Clear invalid credentials and redirect
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-logout'));
    }
    throw error;
  }
};

export const api = {
  get: <T = any>(path: string, headers?: any) => request<T>(path, { method: 'GET', headers }),
  post: <T = any>(path: string, bodyData?: any, headers?: any) => request<T>(path, { method: 'POST', bodyData, headers }),
  patch: <T = any>(path: string, bodyData?: any, headers?: any) => request<T>(path, { method: 'PATCH', bodyData, headers }),
  delete: <T = any>(path: string, headers?: any) => request<T>(path, { method: 'DELETE', headers }),
};

export default api;
