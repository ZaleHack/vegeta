import React, { useEffect, useState, useCallback } from 'react';
import { X, Paperclip, Download } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import useProtectedFileUrl from '../hooks/useProtectedFileUrl';
import { downloadProtectedAsset } from '../utils/protectedAssets';

interface ProfileAttachment {
  id: number;
  file_path: string;
  original_name: string | null;
}

interface Profile {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  photo_path: string | null;
  extra_fields?: string | null;
  attachments?: ProfileAttachment[];
}

interface ProfileListProps {
  onCreate?: () => void;
  onEdit?: (id: number) => void;
}

interface AvatarProps {
  path?: string | null;
  className?: string;
  fallbackClassName?: string;
}

const Avatar: React.FC<AvatarProps> = ({ path, className, fallbackClassName }) => {
  const photoUrl = useProtectedFileUrl(path);
  if (!photoUrl) {
    return <div className={fallbackClassName || className} />;
  }
  return <img src={photoUrl} alt="profil" className={className} />;
};

const ProfileList: React.FC<ProfileListProps> = ({ onCreate, onEdit }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 6;


  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/profiles?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : ''
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Erreur lors du chargement des profils');
        setProfiles([]);
        setTotal(0);
        return;
      }
      // Ensure the profiles field from the API is always an array and normalize attachments
      const rawProfiles: Profile[] = Array.isArray(data.profiles) ? data.profiles : [];
      const normalized = rawProfiles.map(profile => ({
        ...profile,
        attachments: Array.isArray(profile.attachments) ? profile.attachments : []
      }));
      setProfiles(normalized);
      setTotal(data.total || 0);
    } catch (err) {
      setError('Erreur de réseau');
      setProfiles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: number) => {
    if (!window.confirm('Supprimer ce profil ?')) return;
    const token = localStorage.getItem('token');
    await fetch(`/api/profiles/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: token ? `Bearer ${token}` : ''
      }
    });
    load();
  };

  const exportProfile = async (id: number) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/profiles/${id}/pdf`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : ''
      }
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `profile-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-2 bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-lg">
        <input
          className="border border-gray-300 p-2 rounded-lg flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Recherche"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          onClick={() => {
            setPage(1);
            load();
          }}
        >
          Rechercher
        </button>
        {onCreate && (
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            onClick={onCreate}
          >
            Créer profil
          </button>
        )}
      </div>
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-center text-red-500">{error}</div>
      ) : profiles.length === 0 ? (
        <div className="text-center text-gray-500">Aucun profil trouvé</div>
      ) : (
        <>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map(p => {
              let parsed: any[] = [];
              try {
                parsed = p.extra_fields ? JSON.parse(p.extra_fields) : [];
                // Some records might store extra_fields as an object instead of an array
                parsed = Array.isArray(parsed) ? parsed : [];
              } catch {
                parsed = [];
              }
              const extraFields: { label: string; value: string | null }[] = [];
              parsed.forEach((cat: any) => {
                (cat.fields || []).forEach((f: any) => {
                  extraFields.push({ label: f.key, value: f.value });
                });
              });
              const display = extraFields.length
                ? extraFields.filter(f => f.value).slice(0, 4)
                : [
                    { label: 'First Name', value: p.first_name },
                    { label: 'Last Name', value: p.last_name },
                    { label: 'Phone', value: p.phone },
                    { label: 'Email', value: p.email }
                  ].filter(f => f.value).slice(0, 4);
              return (
                <div
                  key={p.id}
                  className="bg-white/80 backdrop-blur-sm shadow-md rounded-2xl p-6 flex flex-col border border-blue-100 hover:border-blue-300 hover:shadow-xl transition-shadow"
                >
                  <div className="flex items-center space-x-4">
                    <Avatar
                      path={p.photo_path}
                      className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-500"
                      fallbackClassName="w-16 h-16 rounded-full bg-gray-200"
                    />
                    <div className="text-sm text-gray-700 space-y-1">
                      {display.map(f => (
                        <div key={f.label} className="flex items-center">
                          <span className="font-semibold mr-1">{f.label}:</span>
                          <span>{f.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end space-x-4 text-sm">
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() => setSelected(p)}
                    >
                      Aperçu
                    </button>
                    {onEdit && (
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={() => onEdit(p.id)}
                      >
                        Modifier
                      </button>
                    )}
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => remove(p.id)}
                    >
                      Supprimer
                    </button>
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() => exportProfile(p.id)}
                    >
                      Exporter Profil
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-center items-center space-x-2 mt-4">
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Précédent
            </button>
            <span>
              Page {page} / {Math.max(1, Math.ceil(total / limit))}
            </span>
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(total / limit)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
      {selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-2xl max-w-md w-full">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
              onClick={() => setSelected(null)}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex justify-center mb-4">
              <Avatar
                path={selected.photo_path}
                className="w-32 h-32 rounded-full object-cover ring-2 ring-blue-500"
                fallbackClassName="w-32 h-32 rounded-full bg-gray-200"
              />
            </div>
            <h2 className="text-2xl font-semibold text-center mb-4">Détails du profil</h2>
            <div className="space-y-2 text-sm max-h-60 overflow-y-auto p-2 preview-scroll">
              {(() => {
                let parsed: any[] = [];
                try {
                  parsed = selected.extra_fields ? JSON.parse(selected.extra_fields) : [];
                } catch {
                  parsed = [];
                }
                if (parsed.length === 0) {
                  parsed = [
                    {
                      title: 'Informations',
                      fields: [
                        { key: 'First Name', value: selected.first_name },
                        { key: 'Last Name', value: selected.last_name },
                        { key: 'Phone', value: selected.phone },
                        { key: 'Email', value: selected.email }
                      ]
                    }
                  ];
                }
                return (
                  <>
                    {parsed.map((cat, idx) => (
                      <div key={idx} className="mb-2">
                        {cat.title && (
                          <div className="font-semibold mb-1">{cat.title}</div>
                        )}
                        {(cat.fields || [])
                          .filter((f: any) => f.value)
                          .map((f: any, i: number) => (
                            <div key={i} className="flex justify-between">
                              <span className="font-medium mr-2">{f.key}:</span>
                              <span>{f.value}</span>
                            </div>
                          ))}
                      </div>
                    ))}
                    {selected.comment && (
                      <div className="flex justify-between">
                        <span className="font-medium mr-2">Commentaire:</span>
                        <span>{selected.comment}</span>
                      </div>
                    )}
                    {selected.attachments && selected.attachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="font-semibold text-gray-700 flex items-center">
                          <Paperclip className="w-4 h-4 mr-2" /> Pièces jointes
                        </div>
                        <ul className="space-y-2">
                          {selected.attachments.map(att => {
                            const label = att.original_name || att.file_path.split('/').pop();
                            return (
                              <li
                                key={att.id}
                                className="bg-white border border-gray-200 rounded-lg px-3 py-2"
                              >
                                <button
                                  type="button"
                                  className="flex items-center justify-between text-blue-600 hover:underline text-sm w-full text-left"
                                  onClick={async () => {
                                    try {
                                      await downloadProtectedAsset(att.file_path, att.original_name);
                                    } catch (error) {
                                      alert('Impossible de télécharger la pièce jointe');
                                    }
                                  }}
                                >
                                  <span className="flex items-center min-w-0">
                                    <Paperclip className="w-4 h-4 mr-2 text-gray-500" />
                                    <span className="truncate">{label}</span>
                                  </span>
                                  <Download className="w-4 h-4 ml-2 shrink-0" />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileList;
