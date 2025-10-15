import React from 'react';
import { BarChart3, TrendingUp, Clock } from 'lucide-react';

const DashboardPage: React.FC = () => {
  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Tableau de bord</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Synthèse rapide de l’activité de la plateforme. Les métriques suivantes servent de base à des tests unitaires et
          peuvent être remplacées par des données dynamiques ultérieurement.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <header className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <BarChart3 className="h-3.5 w-3.5" /> Requêtes
          </header>
          <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">1 245</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Depuis le début du mois</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <header className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <TrendingUp className="h-3.5 w-3.5" /> Ratio d’identification
          </header>
          <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">68%</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">+4 points vs dernier mois</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <header className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Clock className="h-3.5 w-3.5" /> Latence moyenne
          </header>
          <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">420 ms</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Traitement des requêtes de recherche</p>
        </div>
      </div>
    </section>
  );
};

export default DashboardPage;
