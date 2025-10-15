import React, { PropsWithChildren, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Search,
  Database,
  PhoneCall,
  Users,
  Settings
} from 'lucide-react';

interface NavigationLink {
  to: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
}

const NAVIGATION_LINKS: NavigationLink[] = [
  {
    to: '/recherche',
    label: 'Recherche',
    icon: Search,
    description: 'Rechercher dans les sources de données disponibles'
  },
  {
    to: '/cdr',
    label: 'CDR',
    icon: PhoneCall,
    description: 'Analyse des relevés d’appels et messages'
  },
  {
    to: '/annuaire',
    label: 'Annuaire',
    icon: Users,
    description: 'Référentiels et contacts clés'
  },
  {
    to: '/administration',
    label: 'Administration',
    icon: Settings,
    description: 'Gestion des utilisateurs et des synchronisations'
  }
];

const Branding: React.FC = () => (
  <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200/80 dark:border-slate-800">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
      <Database className="h-5 w-5" />
    </div>
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sora Intelligence</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">Plateforme analytique</p>
    </div>
  </div>
);

const AppSidebar: React.FC<PropsWithChildren<{ isOpen: boolean }>> = ({ isOpen, children }) => (
  <aside
    className={`relative flex w-64 flex-col border-r border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-sm transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-950/90 ${
      isOpen ? 'w-64' : 'w-20'
    }`}
  >
    <Branding />
    <nav className="flex-1 overflow-y-auto py-4">
      <ul className="space-y-1 px-3">
        {NAVIGATION_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900/60 dark:hover:text-white'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {isOpen && (
                  <div className="flex flex-col text-left">
                    <span>{link.label}</span>
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{link.description}</span>
                  </div>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
    {children}
  </aside>
);

const AppHeader: React.FC<{ onToggleSidebar(): void }> = ({ onToggleSidebar }) => (
  <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
    <button
      type="button"
      onClick={onToggleSidebar}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
    >
      <span className="sr-only">Basculer la navigation</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="h-5 w-5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 12h16.5M3.75 18.75h16.5" />
      </svg>
    </button>
    <div className="flex flex-col text-right">
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Jean Dupont</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">Division Cyber Sécurité</span>
    </div>
  </header>
);

const AppLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        <AppSidebar isOpen={isSidebarOpen}>
          <div className="border-t border-slate-200/80 px-6 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Connecté en tant qu’administrateur
          </div>
        </AppSidebar>
        <div className="flex flex-1 flex-col">
          <AppHeader onToggleSidebar={() => setIsSidebarOpen((value) => !value)} />
          <main className="flex-1 overflow-y-auto bg-white/60 px-6 py-8 dark:bg-slate-950/50">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
