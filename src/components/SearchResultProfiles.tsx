import React from 'react';
import { User } from 'lucide-react';

interface SearchResult {
  table?: string;
  table_name?: string;
  database?: string;
  preview?: Record<string, any>;
  score?: number;
}

interface ProfilesProps {
  hits: SearchResult[];
  query: string;
  onCreateProfile?: (data: {
    email: string;
    comment?: string;
    extra_fields?: Record<string, string>;
  }) => void;
}

const sanitizePreview = (result: SearchResult): Record<string, any> => {
  if (result.preview && typeof result.preview === 'object') {
    return result.preview;
  }
  const fallback = { ...result } as Record<string, any>;
  delete fallback.preview;
  delete fallback.table;
  delete fallback.table_name;
  delete fallback.database;
  delete fallback.score;
  return fallback;
};

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
        const preview = sanitizePreview(hit);
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
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(preview).flatMap(([key, value]) => {
                if (!value) return [];

                if (key === 'data') {
                  try {
                    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return Object.entries(parsed).map(([k, v]) => (
                      <div key={`${key}-${k}`} className="flex flex-col">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {k.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-gray-100 break-words">
                          {String(v)}
                        </span>
                      </div>
                    ));
                  }
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 break-words">
                        {String(parsed)}
                      </span>
                    </div>
                  );
                } catch {
                  // Si le parsing échoue, afficher la valeur brute
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 break-words">
                        {String(value)}
                      </span>
                    </div>
                  );
                }
              }

                return (
                  <div key={key} className="flex flex-col">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100 break-words">
                      {String(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="text-center">
        <button
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          onClick={() => {
            const combined: Record<string, any> = {};
            const mergeEntry = (target: Record<string, any>, key: string, value: any) => {
              if (value === null || value === undefined) {
                return;
              }
              if (key === 'data') {
                let parsed = value;
                if (typeof parsed === 'string') {
                  try {
                    parsed = JSON.parse(parsed);
                  } catch {
                    parsed = value;
                  }
                }
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  Object.entries(parsed).forEach(([nestedKey, nestedValue]) => {
                    if (nestedValue === null || nestedValue === undefined) {
                      return;
                    }
                    const normalizedKey = typeof nestedKey === 'string' ? nestedKey : String(nestedKey);
                    if (target[normalizedKey] === undefined) {
                      target[normalizedKey] = nestedValue;
                    }
                  });
                  return;
                }
              }
              const normalizedKey = typeof key === 'string' ? key : String(key);
              if (target[normalizedKey] === undefined) {
                target[normalizedKey] = value;
              }
            };

            hits.forEach(h => {
              const previewData = sanitizePreview(h);
              Object.entries(previewData).forEach(([k, v]) => {
                mergeEntry(combined, k, v);
              });
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
