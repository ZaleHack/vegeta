const normalizePath = (relativePath: string) =>
  relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export const fetchProtectedBlob = async (relativePath: string) => {
  const headers = getAuthHeaders();
  if (!headers.Authorization) {
    throw new Error('Missing authentication token');
  }
  const res = await fetch(normalizePath(relativePath), { headers });
  if (!res.ok) {
    throw new Error('Unable to fetch protected asset');
  }
  return res.blob();
};

export const downloadProtectedAsset = async (relativePath: string, suggestedName?: string | null) => {
  const blob = await fetchProtectedBlob(relativePath);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const fallbackName = normalizePath(relativePath).split('/').pop() || 'download';
  anchor.download = suggestedName || fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export default downloadProtectedAsset;
