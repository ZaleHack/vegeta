import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { X, Paperclip, Download, Search, Users, Eye, PencilLine, Trash2, Share2 } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import PaginationControls from './PaginationControls';
import ConfirmDialog, { ConfirmDialogOptions } from './ConfirmDialog';

interface ProfileAttachment {
  id: number;
  file_path: string;
  original_name: string | null;
}

export interface ProfileListItem {
  id: number;
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  photo_path: string | null;
  extra_fields?: string | null;
  attachments?: ProfileAttachment[];
  archived_at?: string | null;
  owner_login?: string | null;
  owner_division_id?: number | null;
  created_at?: string;
  shared_with_me?: boolean;
  shared_user_ids?: number[];
  is_owner?: boolean;
}

interface ProfileListProps {
  onCreate?: () => void;
  onEdit?: (id: number) => void;
  currentUser?: { id: number } | null;
  isAdmin?: boolean;
  onShare?: (profile: ProfileListItem) => void;
  refreshKey?: number;
  focusedProfileId?: number | null;
  onFocusedProfileHandled?: () => void;
}

const ProfileList: React.FC<ProfileListProps> = ({
  onCreate,
  onEdit,
  currentUser,
  isAdmin,
  onShare,
  refreshKey = 0,
  focusedProfileId = null,
  onFocusedProfileHandled
}) => {
  const [profiles, setProfiles] = useState<ProfileListItem[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<ProfileListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
  const limit = 6;
  const isAdminUser = Boolean(isAdmin);

  const parseFieldCategories = useCallback((profile: ProfileListItem) => {
    const raw = profile.extra_fields as unknown;
    if (!raw) return [] as any[];
    if (Array.isArray(raw)) {
      return raw as any[];
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
        if (parsed && typeof parsed === 'object') {
          return [
            {
              title: 'Informations',
              fields: Object.entries(parsed).map(([key, value]) => ({
                key,
                value
              }))
            }
          ];
        }
      } catch (_) {
        return [] as any[];
      }
    }
    if (raw && typeof raw === 'object') {
      return [
        {
          title: 'Informations',
          fields: Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
            key,
            value
          }))
        }
      ];
    }
    return [] as any[];
  }, []);

  const getPreviewFields = useCallback(
    (profile: ProfileListItem) => {
      const values: { label: string; value: string | null }[] = [];
      const categories = parseFieldCategories(profile);
      categories.forEach(cat => {
        (cat?.fields || []).forEach((f: any) => {
          values.push({
            label: typeof f.key === 'string' ? f.key : 'Champ',
            value:
              f.value === null || f.value === undefined
                ? null
                : typeof f.value === 'string'
                ? f.value
                : String(f.value)
          });
        });
      });
      const fallback = [
        { label: 'Prénom', value: profile.first_name },
        { label: 'Nom', value: profile.last_name },
        { label: 'Téléphone', value: profile.phone },
        { label: 'Email', value: profile.email }
      ];
      const filtered = values.filter(f => f.value && `${f.value}`.trim().length > 0);
      const source = filtered.length > 0 ? filtered : fallback.filter(f => f.value);
      return source.slice(0, 4);
    },
    [parseFieldCategories]
  );

  const buildCategories = useCallback(
    (profile: ProfileListItem) => {
      const categories = parseFieldCategories(profile);
      if (!categories || categories.length === 0) {
        return [
          {
            title: 'Informations',
            fields: [
              { key: 'Prénom', value: profile.first_name },
              { key: 'Nom', value: profile.last_name },
              { key: 'Téléphone', value: profile.phone },
              { key: 'Email', value: profile.email }
            ]
          }
        ];
      }
      return categories;
    },
    [parseFieldCategories]
  );

  const isOwner = useCallback((profile: ProfileListItem) => currentUser?.id === profile.user_id, [currentUser]);

  const canEditProfile = useCallback(
    (profile: ProfileListItem) =>
      Boolean(onEdit) && (isAdminUser || isOwner(profile) || Boolean(profile.shared_with_me)),
    [isAdminUser, isOwner, onEdit]
  );

  const canDeleteProfile = useCallback((profile: ProfileListItem) => isOwner(profile), [isOwner]);

  const canShareProfile = useCallback(
    (profile: ProfileListItem) => Boolean(onShare) && (isAdminUser || isOwner(profile)),
    [isAdminUser, isOwner, onShare]
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total]);

  const emptyMessage = useMemo(() => {
    const trimmed = query.trim();
    return trimmed
      ? "Aucun profil ne correspond à votre recherche."
      : 'Aucune fiche de profil disponible pour le moment.';
  }, [query]);

  useEffect(() => {
    setPage(prev => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const normalizeSharedWithMe = useCallback((value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      return trimmed === '1' || trimmed === 'true';
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    return value === true;
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        params.set('q', trimmedQuery);
      }
      const res = await fetch(`/api/profiles?${params.toString()}`, {
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
      const rawProfiles: ProfileListItem[] = Array.isArray(data.profiles) ? data.profiles : [];
      const normalized = rawProfiles.map(profile => ({
        ...profile,
        attachments: Array.isArray(profile.attachments) ? profile.attachments : [],
        shared_with_me: normalizeSharedWithMe(profile.shared_with_me)
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
  }, [normalizeSharedWithMe, query, page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!focusedProfileId) return;
    const existing = profiles.find(profile => profile.id === focusedProfileId);
    if (existing) {
      setSelected(existing);
      onFocusedProfileHandled?.();
      return;
    }
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/profiles/${focusedProfileId}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : ''
          }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.profile || cancelled) {
          return;
        }
        const fetchedProfile: ProfileListItem = {
          ...data.profile,
          attachments: Array.isArray(data.profile.attachments) ? data.profile.attachments : [],
          shared_with_me: normalizeSharedWithMe(data.profile.shared_with_me)
        };
        setSelected(fetchedProfile);
      } catch (_) {
        // Ignore focus errors
      } finally {
        if (!cancelled) {
          onFocusedProfileHandled?.();
        }
      }
    };
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [focusedProfileId, normalizeSharedWithMe, onFocusedProfileHandled, profiles]);

  const handleSearch = useCallback(() => {
    if (page !== 1) {
      setPage(1);
    } else {
      load();
    }
  }, [load, page]);

  const buildProtectedUrl = (relativePath?: string | null) => {
    if (!relativePath) return null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    if (!token) return normalized;
    const separator = normalized.includes('?') ? '&' : '?';
    return `${normalized}${separator}token=${encodeURIComponent(token)}`;
  };

  const selectedPhotoUrl = selected ? buildProtectedUrl(selected.photo_path) : null;

  const remove = (id: number) => {
    setConfirmDialog({
      title: 'Supprimer le profil',
      description: 'Supprimer définitivement ce profil et ses informations associées ?',
      confirmLabel: 'Supprimer',
      tone: 'danger',
      icon: <Trash2 className="h-5 w-5" />,
      onConfirm: async () => {
        const token = localStorage.getItem('token');
        try {
          const res = await fetch(`/api/profiles/${id}`, {
            method: 'DELETE',
            headers: {
              Authorization: token ? `Bearer ${token}` : ''
            }
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error || 'Impossible de supprimer le profil');
            return;
          }
          await load();
        } catch (_) {
          setError('Erreur lors de la suppression du profil');
        }
      }
    });
  };

  const handleCreateClick = useCallback(() => {
    setPage(1);
    onCreate?.();
  }, [onCreate]);

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
    <>
      <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-blue-50 via-white to-white/60 p-6 shadow-inner shadow-blue-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:shadow-slate-900/70">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-slate-200 transition-all focus-within:ring-2 focus-within:ring-blue-500 dark:bg-white/5 dark:ring-slate-700/60 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] dark:focus-within:ring-blue-500/60">
            <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            <input
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Rechercher par nom, téléphone ou email"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSearch();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSearch}
              className="hidden items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-300 transition hover:-translate-y-0.5 hover:bg-blue-700 md:inline-flex"
            >
              <Search className="h-4 w-4" />
              Rechercher
            </button>
          </div>
          {onCreate && (
            <button
              type="button"
              onClick={handleCreateClick}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-red-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-2xl"
            >
              Créer une fiche
            </button>
          )}
        </div>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Partagez vos fiches avec les membres actifs de votre division pour faciliter la collaboration.
        </p>
        <button
          type="button"
          onClick={handleSearch}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-300 transition hover:-translate-y-0.5 hover:bg-blue-700 md:hidden"
        >
          <Search className="h-4 w-4" />
          Rechercher
        </button>
      </div>
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm shadow-red-200 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 dark:shadow-red-900/30">
          {error}
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center text-sm font-medium text-slate-500 shadow-inner dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400 dark:shadow-none">
          {emptyMessage}
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {profiles.map(p => {
              const photoUrl = buildProtectedUrl(p.photo_path);
              const previewFields = getPreviewFields(p);
              const displayName =
                [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Profil sans nom';
              const sharedCount = Array.isArray(p.shared_user_ids) ? p.shared_user_ids.length : 0;
              return (
                <div
                  key={p.id}
                  className="group relative overflow-hidden rounded-3xl bg-white/90 p-6 shadow-lg ring-1 ring-slate-200 transition-all hover:-translate-y-1 hover:shadow-2xl dark:bg-slate-900/70 dark:ring-slate-700"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 shadow-inner shadow-blue-100 ring-2 ring-blue-100 dark:from-slate-800 dark:to-slate-700 dark:shadow-slate-900 dark:ring-slate-700">
                      {photoUrl ? (
                        <img src={photoUrl} alt="profil" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500">
                          <Users className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{displayName}</h3>
                          <p className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <Users className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                            {isOwner(p)
                              ? 'Créé par vous'
                              : `Partagé par ${p.owner_login || 'un membre de la division'}`}
                          </p>
                        </div>
                      </div>
                      <dl className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                        {previewFields.map(field => (
                          <div
                            key={field.label}
                            className="rounded-2xl bg-slate-50/80 px-3 py-2 shadow-inner shadow-slate-200 dark:bg-slate-800/70 dark:shadow-slate-900"
                          >
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              {field.label}
                            </dt>
                            <dd className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                      {p.comment && (
                        <p className="rounded-2xl bg-blue-50/70 px-3 py-2 text-sm text-blue-800 shadow-inner dark:bg-blue-500/10 dark:text-blue-200 dark:shadow-blue-900/20">
                          {p.comment}
                        </p>
                      )}
                      {(p.shared_with_me || (p.is_owner && sharedCount > 0)) && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          {p.shared_with_me && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                              <Share2 className="h-3.5 w-3.5" /> Partagé avec vous
                            </span>
                          )}
                          {p.is_owner && sharedCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                              <Users className="h-3.5 w-3.5" /> Partagé avec {sharedCount}{' '}
                              {sharedCount > 1 ? 'membres' : 'membre'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Eye className="h-4 w-4" /> Aperçu
                    </button>
                    {canShareProfile(p) && (
                      <button
                        type="button"
                        onClick={() => onShare?.(p)}
                        className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                      >
                        <Share2 className="h-4 w-4" /> Partager
                      </button>
                    )}
                    {canEditProfile(p) && (
                      <button
                        type="button"
                        onClick={() => onEdit?.(p.id)}
                        className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-300 transition hover:-translate-y-0.5 hover:bg-blue-700"
                      >
                        <PencilLine className="h-4 w-4" /> Modifier
                      </button>
                    )}
                    {canDeleteProfile(p) && (
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                      >
                        <Trash2 className="h-4 w-4" /> Supprimer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => exportProfile(p.id)}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Download className="h-4 w-4" /> Exporter
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-200/70 pt-4 dark:border-slate-700/60">
            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Page {page} / {totalPages}
              </span>
              <PaginationControls
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onLoadMore={() => setPage(prev => Math.min(prev + 1, totalPages))}
                canLoadMore={page < totalPages}
              />
            </div>
          </div>
        </>
      )}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900 dark:shadow-slate-900/60">
            <div className="bg-gradient-to-r from-red-600 via-red-500 to-red-700 px-6 py-5 text-white">
              <h2 className="text-2xl font-semibold">Détails du profil</h2>
              <p className="mt-1 text-sm text-white/80">
                {selected.owner_login
                  ? `Partagé par ${selected.owner_login}`
                  : 'Profil partagé dans votre division'}
              </p>
            </div>
            <button
              className="absolute right-5 top-5 rounded-full bg-white/20 p-2 text-white transition hover:bg-white/40"
              onClick={() => setSelected(null)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="space-y-6 p-6 text-sm text-slate-700 dark:text-slate-200">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                {selectedPhotoUrl ? (
                  <img
                    src={selectedPhotoUrl}
                    alt="profil"
                    className="h-32 w-32 rounded-2xl object-cover shadow-lg ring-2 ring-blue-500"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 shadow-inner dark:bg-slate-800 dark:text-slate-500">
                    <Users className="h-10 w-10" />
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-slate-700 shadow-inner dark:bg-slate-800 dark:text-slate-200">
                    <p className="text-sm font-medium">
                      {selected.first_name || selected.last_name
                        ? `${selected.first_name ?? ''} ${selected.last_name ?? ''}`.trim() || 'Profil sans nom'
                        : 'Profil sans nom'}
                    </p>
                    {selected.email && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{selected.email}</p>
                    )}
                    {selected.phone && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{selected.phone}</p>
                    )}
                    {selected.shared_with_me && (
                      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                        <Share2 className="h-3.5 w-3.5" /> Partagé avec vous
                      </p>
                    )}
                    {selected.is_owner && Array.isArray(selected.shared_user_ids) && selected.shared_user_ids.length > 0 && (
                      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                        <Users className="h-3.5 w-3.5" /> Partagé avec {selected.shared_user_ids.length}{' '}
                        {selected.shared_user_ids.length > 1 ? 'membres' : 'membre'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="max-h-72 space-y-4 overflow-y-auto pr-2">
                {buildCategories(selected).map((cat, idx) => (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    {cat.title && (
                      <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{cat.title}</div>
                    )}
                    <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                      {(cat.fields || [])
                        .filter((f: any) => f.value)
                        .map((f: any, i: number) => (
                          <div key={i} className="flex justify-between gap-3">
                            <span className="font-medium text-slate-500 dark:text-slate-400">{f.key}</span>
                            <span className="text-right text-slate-700 dark:text-slate-200">{f.value}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
                {selected.comment && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-slate-700 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-slate-200">
                    <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">Commentaire</div>
                    <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">{selected.comment}</p>
                  </div>
                )}
                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      <Paperclip className="h-4 w-4" /> Pièces jointes
                    </div>
                    <ul className="space-y-2">
                      {selected.attachments.map(att => {
                        const label = att.original_name || att.file_path.split('/').pop();
                        const href = buildProtectedUrl(att.file_path);
                        return (
                          <li
                            key={att.id}
                            className="flex rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-blue-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-blue-300"
                          >
                            <a
                              href={href || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex w-full items-center justify-between gap-2 overflow-hidden hover:underline"
                            >
                              <span className="flex items-center gap-2 overflow-hidden">
                                <Paperclip className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                                <span className="truncate">{label}</span>
                              </span>
                              <Download className="h-4 w-4 flex-shrink-0" />
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      {confirmDialog && (
        <ConfirmDialog
          open
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          tone={confirmDialog.tone}
          icon={confirmDialog.icon}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
};

export default ProfileList;
