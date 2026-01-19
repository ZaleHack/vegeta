import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type AppPage =
  | 'login'
  | 'dashboard'
  | 'search'
  | 'imei-check'
  | 'annuaire'
  | 'ong'
  | 'entreprises'
  | 'vehicules'
  | 'cdr'
  | 'cdr-export'
  | 'target-report'
  | 'link-diagram'
  | 'phone-identifier'
  | 'cdr-case'
  | 'fraud-detection-form'
  | 'fraud-monitoring'
  | 'requests'
  | 'profiles'
  | 'blacklist'
  | 'logs'
  | 'users'
  | 'upload'
  | 'bts';

export const pageToPath: Record<AppPage, string> = {
  login: '/login',
  dashboard: '/',
  search: '/recherche',
  'imei-check': '/imei-check',
  annuaire: '/annuaire',
  ong: '/ong',
  entreprises: '/entreprises',
  vehicules: '/vehicules',
  cdr: '/cdr',
  'cdr-export': '/cdr/export-donnees',
  'target-report': '/cdr/rapport-cible',
  'link-diagram': '/diagramme-liens',
  'phone-identifier': '/identifier-telephone',
  'cdr-case': '/cdr/dossier',
  'fraud-detection-form': '/fraude',
  'fraud-monitoring': '/fraude/monitoring',
  requests: '/demandes',
  profiles: '/fiches-profil',
  blacklist: '/liste-blanche',
  logs: '/journaux',
  users: '/utilisateurs',
  upload: '/import',
  bts: '/bts'
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
