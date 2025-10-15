import React, { useMemo, useState } from 'react';
import { Building2, Phone, Filter } from 'lucide-react';
import { DirectoryEntry, MOCK_DIRECTORY } from './data/mockDirectory';

const categories: { value: DirectoryEntry['category'] | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous les résultats' },
  { value: 'gendarmerie', label: 'Unités de gendarmerie' },
  { value: 'ong', label: 'Organisations partenaires' },
  { value: 'entreprise', label: 'Entreprises référencées' }
];

const DirectoryPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<typeof categories[number]['value']>('all');

  const entries = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return MOCK_DIRECTORY.filter((entry) => {
      const matchesCategory = category === 'all' || entry.category === category;
      const haystack = `${entry.name} ${entry.phone} ${entry.city}`.toLowerCase();
      const matchesQuery = normalized.length === 0 || haystack.includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [search, category]);

  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Annuaire de référence</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Accédez rapidement aux points de contact stratégiques : brigades territoriales, organisations partenaires et
          entreprises identifiées.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-inner dark:border-slate-800 dark:bg-slate-900">
            <Phone className="h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Recherche par nom, numéro ou ville"
              className="flex-1 bg-transparent outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-inner dark:border-slate-800 dark:bg-slate-900">
            <Filter className="h-4 w-4 text-slate-500" />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as typeof category)}
              className="bg-transparent text-sm outline-none"
            >
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {entries.map((entry) => (
          <article
            key={entry.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950/80 dark:hover:border-blue-500"
          >
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{entry.name}</h3>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">{entry.id}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow dark:bg-white dark:text-slate-900">
                <Building2 className="h-3.5 w-3.5" /> {entry.city}
              </span>
            </header>
            <p className="text-sm text-slate-600 dark:text-slate-300">{entry.phone}</p>
            <footer className="mt-4 border-t border-dashed border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {entry.category === 'gendarmerie' && 'Unité territoriale de gendarmerie'}
              {entry.category === 'ong' && 'Organisation non gouvernementale'}
              {entry.category === 'entreprise' && 'Entreprise référencée'}
            </footer>
          </article>
        ))}
        {entries.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
            Aucun contact ne correspond à votre recherche.
          </div>
        )}
      </div>
    </section>
  );
};

export default DirectoryPage;
