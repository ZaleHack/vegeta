import React, { useMemo, useState } from 'react';
import { Search as SearchIcon, Tag, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMockSearch } from './hooks/useMockSearch';

const AVAILABLE_TAGS = ['fraude', 'banque', 'messagerie', 'western union'];

const formatRelativeDate = (input: string) =>
  formatDistanceToNow(new Date(input), { addSuffix: true, locale: fr });

const SearchPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { results, total } = useMockSearch({ query, tags: selectedTags });

  const toggleTag = (tag: string) => {
    setSelectedTags((previous) =>
      previous.includes(tag) ? previous.filter((value) => value !== tag) : [...previous, tag]
    );
  };

  const resultLabel = useMemo(() => {
    if (query.trim().length === 0) {
      return `Derniers rapports (${total})`;
    }
    return `${total} résultat${total > 1 ? 's' : ''}`;
  }, [total, query]);

  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Recherche transversale</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Interrogez simultanément les profils, demandes d’identification et dossiers CDR. La recherche est entièrement locale
          dans cette implémentation de démonstration.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-inner dark:border-slate-800 dark:bg-slate-900">
          <SearchIcon className="h-5 w-5 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, numéro de téléphone, division, mot-clé…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {AVAILABLE_TAGS.map((tag) => {
            const isActive = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-200'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">{resultLabel}</h2>
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-300"
            >
              Réinitialiser les filtres ({selectedTags.length})
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {results.map((result) => (
            <article
              key={result.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950/80 dark:hover:border-blue-500"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{result.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{result.phone}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow dark:bg-white dark:text-slate-900">
                  {result.id}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                Dernière activité {formatRelativeDate(result.lastSeen)}
              </div>
              <div className="flex flex-wrap gap-2">
                {result.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-medium text-slate-600 dark:bg-slate-900/70 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <footer className="mt-auto flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>{result.division}</span>
                <button type="button" className="font-medium text-blue-600 hover:underline dark:text-blue-300">
                  Ouvrir le rapport
                </button>
              </footer>
            </article>
          ))}
          {results.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/60 p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              Aucun résultat ne correspond à la requête. Essayez un autre terme ou supprimez certains filtres.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SearchPage;
