import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type AppPage =
  | 'login'
  | 'dashboard'
  | 'search'
  | 'annuaire'
  | 'ong'
  | 'entreprises'
  | 'vehicules'
  | 'cdr'
  | 'cdr-case'
  | 'fraud-detection'
  | 'requests'
  | 'profiles'
  | 'blacklist'
  | 'logs'
  | 'users'
  | 'upload';

export const pageToPath: Record<AppPage, string> = {
  login: '/login',
  dashboard: '/',
  search: '/search',
  annuaire: '/directory',
  ong: '/ngo',
  entreprises: '/businesses',
  vehicules: '/vehicles',
  cdr: '/cdr',
  'cdr-case': '/cdr/case',
  'fraud-detection': '/fraud-detection',
  requests: '/requests',
  profiles: '/profiles',
  blacklist: '/blacklist',
  logs: '/logs',
  users: '/users',
  upload: '/upload'
};

const normalizePathname = (pathname: string) => {
  if (!pathname) return '/';
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

export const pathToPage = (pathname: string): AppPage => {
  const normalized = normalizePathname(pathname);
  const entry = (Object.entries(pageToPath) as [AppPage, string][]).find(([, path]) => path === normalized);
  return entry ? entry[0] : 'dashboard';
};

export const usePageNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const currentPage = useMemo<AppPage>(() => pathToPage(location.pathname), [location.pathname]);

  const navigateToPage = useCallback(
    (page: AppPage, options?: { replace?: boolean }) => {
      const targetPath = pageToPath[page];
      if (!targetPath) return;
      navigate(targetPath, { replace: options?.replace });
    },
    [navigate]
  );

  return { currentPage, navigateToPage } as const;
};
