export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem('token');
};

export const getAuthHeaders = (
  headers: HeadersInit = {},
  includeJsonContentType = false
): Record<string, string> => {
  const token = getAuthToken();
  const normalizedHeaders: Record<string, string> = {
    ...(headers as Record<string, string>)
  };

  if (includeJsonContentType && !normalizedHeaders['Content-Type']) {
    normalizedHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    normalizedHeaders.Authorization = `Bearer ${token}`;
  }

  return normalizedHeaders;
};

export const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const mergedHeaders = getAuthHeaders(init.headers ?? {});
  return fetch(input, {
    ...init,
    headers: mergedHeaders
  });
};
