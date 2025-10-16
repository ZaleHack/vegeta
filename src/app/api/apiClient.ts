/* eslint-disable @typescript-eslint/no-explicit-any */
export class ApiError extends Error {
  public readonly status: number;
  public readonly data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export type ApiClientParams = Record<string, string | number | boolean | undefined | null>;

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  params?: ApiClientParams;
  headers?: Record<string, string>;
  json?: unknown;
  skipAuth?: boolean;
  responseType?: 'json' | 'blob' | 'text';
  body?: BodyInit | null;
}

const buildUrl = (input: string, params?: ApiClientParams) => {
  if (!params) return input;
  const url = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    url.searchParams.set(key, String(value));
  });
  if (typeof window === 'undefined') {
    return `${url.pathname}${url.search}`;
  }
  return url.toString();
};

const parseJsonSafely = async (response: Response) => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
};

export class ApiClient {
  async request<T = unknown>(input: string, options: ApiRequestOptions = {}): Promise<T> {
    const {
      params,
      headers = {},
      json,
      skipAuth = false,
      responseType = 'json',
      signal,
      ...init
    } = options;

    const url = buildUrl(input, params);
    const requestHeaders = new Headers(headers);

    if (!skipAuth && typeof window !== 'undefined') {
      const token = window.localStorage.getItem('token');
      if (token) {
        requestHeaders.set('Authorization', `Bearer ${token}`);
      }
    }

    let body: BodyInit | undefined = init.body as BodyInit | undefined;
    if (json !== undefined) {
      body = JSON.stringify(json);
      if (!requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
      }
    }

    const response = await fetch(url, {
      ...init,
      body,
      headers: requestHeaders,
      signal
    });

    if (!response.ok) {
      let data: any = undefined;
      try {
        if (responseType === 'blob') {
          data = await response.blob();
        } else if (responseType === 'text') {
          data = await response.text();
        } else {
          data = await parseJsonSafely(response);
        }
      } catch (_) {
        data = undefined;
      }
      const message = (data as any)?.error || (data as any)?.message || response.statusText || 'Erreur réseau';
      throw new ApiError(message, response.status, data);
    }

    if (responseType === 'blob') {
      return (await response.blob()) as T;
    }

    if (responseType === 'text') {
      return (await response.text()) as T;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await parseJsonSafely(response);
    return data as T;
  }

  get<T = unknown>(input: string, options: ApiRequestOptions = {}) {
    return this.request<T>(input, { ...options, method: options.method ?? 'GET' });
  }

  post<T = unknown>(input: string, options: ApiRequestOptions = {}) {
    return this.request<T>(input, { ...options, method: 'POST' });
  }

  patch<T = unknown>(input: string, options: ApiRequestOptions = {}) {
    return this.request<T>(input, { ...options, method: 'PATCH' });
  }

  put<T = unknown>(input: string, options: ApiRequestOptions = {}) {
    return this.request<T>(input, { ...options, method: 'PUT' });
  }

  delete<T = unknown>(input: string, options: ApiRequestOptions = {}) {
    return this.request<T>(input, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
