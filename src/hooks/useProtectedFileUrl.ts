import { useEffect, useState } from 'react';

const normalizePath = (relativePath: string) =>
  relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

export const useProtectedFileUrl = (relativePath?: string | null) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let currentUrl: string | null = null;

    const load = async () => {
      if (!relativePath) {
        setObjectUrl(null);
        return;
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setObjectUrl(null);
        return;
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`
      };

      try {
        const res = await fetch(normalizePath(relativePath), { headers });
        if (!res.ok) {
          throw new Error('Failed to fetch protected asset');
        }
        const blob = await res.blob();
        if (!isActive) {
          return;
        }
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      } catch (error) {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
          currentUrl = null;
        }
        if (isActive) {
          setObjectUrl(null);
        }
      }
    };

    load();

    return () => {
      isActive = false;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [relativePath]);

  return objectUrl;
};

export default useProtectedFileUrl;
