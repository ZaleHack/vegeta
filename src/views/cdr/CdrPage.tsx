import React from 'react';
import { Activity, MapPin } from 'lucide-react';
import CallGraphSummary from './components/CallGraphSummary';
import { MOCK_CALL_EDGES, MOCK_CALL_NODES } from './data/mockCallGraph';

const CdrPage: React.FC = () => {
  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Analyse CDR</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Visualisation synthétique des communications téléphoniques. Les données sont simulées pour illustrer la structure
          attendue de la page et tester les composants indépendamment.
        </p>
      </header>

      <CallGraphSummary nodes={MOCK_CALL_NODES} edges={MOCK_CALL_EDGES} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <header className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <Activity className="h-4 w-4" /> Indicateurs clés
          </header>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-500 dark:text-slate-400">Durée moyenne</dt>
              <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">2 min 30 s</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500 dark:text-slate-400">Période analysée</dt>
              <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">7 derniers jours</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500 dark:text-slate-400">Contacts uniques</dt>
              <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">12</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500 dark:text-slate-400">Volumes SMS</dt>
              <dd className="text-lg font-semibold text-slate-900 dark:text-slate-100">32</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <header className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <MapPin className="h-4 w-4" /> Dernières localisations
          </header>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex items-center justify-between">
              <span>Dakar Plateau</span>
              <span className="text-xs font-semibold text-slate-400">08:42</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Guédiawaye</span>
              <span className="text-xs font-semibold text-slate-400">07:15</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Thiès</span>
              <span className="text-xs font-semibold text-slate-400">Hier 18:37</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
};

export default CdrPage;
