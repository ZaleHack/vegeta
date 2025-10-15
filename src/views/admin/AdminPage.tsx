import React from 'react';
import { Shield, UserPlus, RefreshCw } from 'lucide-react';

const AdminPage: React.FC = () => {
  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Administration</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Gérez les accès utilisateurs, suivez les synchronisations de données et configurez les intégrations de la plateforme.
          Cette page repose sur des données de démonstration afin de permettre des tests unitaires indépendants.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <header className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Shield className="h-3.5 w-3.5" /> Comptes actifs
          </header>
          <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">24</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dont 5 administrateurs</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <header className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <UserPlus className="h-3.5 w-3.5" /> Invitations en attente
          </header>
          <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">3</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dernière invitation envoyée il y a 2 jours</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <header className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <RefreshCw className="h-3.5 w-3.5" /> Synchronisations
          </header>
          <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">12</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dernier import : 14 avril 2024</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Journal des opérations</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Historique synthétique des actions administrateur.</p>
        <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <li>
            <span className="font-medium text-slate-900 dark:text-slate-100">14/04/2024 09:17</span> · Import du référentiel ONG
          </li>
          <li>
            <span className="font-medium text-slate-900 dark:text-slate-100">13/04/2024 19:45</span> · Réinitialisation du mot de passe « analyste01 »
          </li>
          <li>
            <span className="font-medium text-slate-900 dark:text-slate-100">12/04/2024 11:32</span> · Ajout d’un compte administrateur « supervision »
          </li>
        </ul>
      </div>
    </section>
  );
};

export default AdminPage;
