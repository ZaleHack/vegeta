import React from 'react';
import { User, Activity } from 'lucide-react';

interface SearchResult {
  table: string;
  database: string;
  preview: Record<string, any>;
  score: number;
}

interface ProfilesProps {
  hits: SearchResult[];
  query: string;
  onCreateProfile?: (data: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    extra_fields?: Record<string, string>;
  }) => void;
}

const SearchResultProfiles: React.FC<ProfilesProps> = ({ hits, query, onCreateProfile }) => {
  if (hits.length === 0) {
    return (
      <div className="text-center text-gray-500">Aucun résultat pour {query}</div>
    );
  }

  return (
    <div className="space-y-8">
      {hits.map((hit, idx) => (
        <div key={idx} className="bg-white shadow-lg rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-blue-500 p-4 flex items-center">
            <User className="w-8 h-8 text-white mr-3" />
            <div>
              <h3 className="text-xl font-semibold text-white">{hit.table}</h3>
              <p className="text-indigo-100 text-sm">{hit.database}</p>
            </div>
            <span className="ml-auto inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/20 text-white">
              <Activity className="w-3 h-3 mr-1" />
              {hit.score.toFixed(1)}
            </span>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(hit.preview).map(([key, value]) => {
              if (!value) return null;
              return (
                <div key={key} className="flex flex-col">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-gray-900 break-words">
                    {String(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="text-center">
        <button
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          onClick={() => {
            const firstHit = hits[0];
            const { first_name, last_name, phone, email, ...extra } = firstHit.preview || {};
            const data = {
              first_name: String(first_name || ''),
              last_name: String(last_name || ''),
              phone: String(phone || ''),
              email: String(email || ''),
              extra_fields: Object.fromEntries(
                Object.entries(extra).map(([k, v]) => [k, String(v ?? '')])
              )
            };
            if (onCreateProfile) {
              onCreateProfile(data);
            } else {
              const params = new URLSearchParams(data as any);
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
