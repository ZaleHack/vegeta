import React from 'react';
import { User } from 'lucide-react';
import { SearchHit, NormalizedPreviewEntry } from '../utils/search';
import StructuredPreviewValue from './StructuredPreviewValue';

interface ProfilesProps {
  hits: SearchHit[];
  query: string;
  onCreateProfile?: (data: {
    email: string;
    comment?: string;
    extra_fields?: Record<string, string>;
  }) => void;
}

const formatScore = (score?: number) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return null;
  }
  if (Math.abs(score) >= 10) {
    return score.toFixed(1);
  }
  return score.toFixed(3);
};

const SearchResultProfiles: React.FC<ProfilesProps> = ({ hits, query, onCreateProfile }) => {
  if (hits.length === 0) {
    return (
      <div className="text-center text-gray-500">Aucun résultat pour {query}</div>
    );
  }

  return (
    <div className="space-y-8">
      {hits.map((hit, idx) => {
        const previewEntries = hit.previewEntries;
        const tableLabel = hit.table_name || hit.table;
        const databaseLabel = hit.database || 'Elasticsearch';
        const formattedScore = formatScore(hit.score);

        return (
          <div key={idx} className="bg-white shadow-lg rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-700 p-4 flex items-center justify-between">
              <div className="flex items-center">
                <User className="w-8 h-8 text-white mr-3" />
                <div>
                  <h3 className="text-xl font-semibold text-white">Résultat {idx + 1}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-blue-100">
                    {tableLabel && (
                      <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 font-medium text-white">
                        {tableLabel}
                      </span>
                    )}
                    {databaseLabel && (
                      <span className="inline-flex items-center rounded-full bg-blue-900/40 px-2 py-0.5 font-medium text-blue-50">
                        {databaseLabel}
                      </span>
                    )}
                    {formattedScore && (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/30 px-2 py-0.5 font-semibold text-white">
                        Score {formattedScore}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {previewEntries.map((entry) => (
                  <div
                    key={entry.key}
                    className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4 shadow-sm transition-colors dark:border-slate-700/70 dark:bg-slate-800/60"
                  >
                    <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      {entry.label}
                    </dt>
                    <dd className="mt-2 text-sm text-slate-900 dark:text-slate-100">
                      <StructuredPreviewValue value={entry.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        );
      })}
      <div className="text-center">
        <button
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          onClick={() => {
            const combined: Record<string, string> = {};
            const mergeEntry = (entry: NormalizedPreviewEntry) => {
              const key = entry.key || entry.label;
              if (combined[key] === undefined) {
                combined[key] = entry.value;
              }
            };

            hits.forEach((h) => {
              h.previewEntries.forEach(mergeEntry);
            });
            const { email, ...extra } = combined;
            const data = {
              email: String(email || ''),
              extra_fields: Object.fromEntries(
                Object.entries(extra).map(([k, v]) => [k, String(v ?? '')])
              )
            };
            if (onCreateProfile) {
              onCreateProfile(data);
            } else {
              const params = new URLSearchParams({
                email: data.email,
                extra_fields: JSON.stringify(data.extra_fields || {})
              });
              window.location.href = `/profiles/new?${params.toString()}`;
            }
          }}
        >
          Créer profil
        </button>
      </div>
    </div>
  );
};

export default SearchResultProfiles;
