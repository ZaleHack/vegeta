import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  X,
  Paperclip,
  Download,
  Search,
  Users,
  Eye,
  PencilLine,
  Trash2,
  Share2,
  FolderPlus,
  Folder,
  Sparkles,
  Check,
  Loader2,
  Mail,
  Phone,
  UserPlus,
  Tag
} from 'lucide-react';
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
  folder_id?: number | null;
  folder_name?: string | null;
}

export interface ProfileFolderSummary {
  id: number;
  name: string;
  profiles_count?: number;
  is_owner?: boolean;
  shared_with_me?: boolean;
  shared_user_ids?: number[];
}

interface ProfileListProps {
  onCreate?: (folderId: number) => void;
  onEdit?: (id: number) => void;
  currentUser?: { id: number } | null;
  isAdmin?: boolean;
  onShareFolder?: (folder: ProfileFolderSummary) => void;
  refreshKey?: number;
  focusedProfileId?: number | null;
  onFocusedProfileHandled?: () => void;
  focusedFolderId?: number | null;
  onFocusedFolderHandled?: () => void;
}

const ProfileList: React.FC<ProfileListProps> = ({
  onCreate,
  onEdit,
  currentUser,
  isAdmin,
  onShareFolder,
  refreshKey = 0,
  focusedProfileId = null,
  onFocusedProfileHandled,
  focusedFolderId = null,
  onFocusedFolderHandled
}) => {
  const [profiles, setProfiles] = useState<ProfileListItem[]>([]);
  const [folders, setFolders] = useState<ProfileFolderSummary[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState<'all' | 'owned' | 'shared'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<ProfileListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [error, setError] = useState('');
  const [folderError, setFolderError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showCreateFolderForm, setShowCreateFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState('');
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement | null>(null);
  const [readyFolderId, setReadyFolderId] = useState<number | null>(null);
  const selectedFolderIdRef = useRef<number | null>(null);
  const limit = 6;
  const isAdminUser = Boolean(isAdmin);
  const filteredFolders = useMemo(() => {
    if (folderFilter === 'owned') {
      return folders.filter(folder => Boolean(folder.is_owner));
    }
    if (folderFilter === 'shared') {
      return folders.filter(
        folder => !folder.is_owner && (folder.shared_with_me || (Array.isArray(folder.shared_user_ids) && folder.shared_user_ids.length > 0))
      );
    }
    return folders;
  }, [folderFilter, folders]);
  const selectedFolder = useMemo(
    () => (selectedFolderId ? folders.find(folder => folder.id === selectedFolderId) ?? null : null),
    [folders, selectedFolderId]
  );

  const loadFolders = useCallback(async (): Promise<ProfileFolderSummary[]> => {
    try {
      setFoldersLoading(true);
      setFolderError('');
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile-folders', {
        headers: {
          Authorization: token ? `Bearer ${token}` : ''
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFolderError(data.error || 'Erreur lors du chargement des dossiers');
        setFolders([]);
        return [];
      }
      const folderList: ProfileFolderSummary[] = Array.isArray(data.folders) ? data.folders : [];
      setFolders(folderList);
      return folderList;
    } catch (_) {
      setFolderError('Erreur de réseau');
      setFolders([]);
      return [];
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders, refreshKey]);

  useEffect(() => {
    selectedFolderIdRef.current = selectedFolderId;
  }, [selectedFolderId]);

  const toggleCreateFolderForm = useCallback(() => {
    setShowCreateFolderForm(prev => !prev);
  }, []);

  const handleSubmitNewFolder = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmed = newFolderName.trim();
      if (!trimmed) {
        setNewFolderError('Nom du dossier requis');
        return;
      }
      setCreatingFolder(true);
      setNewFolderError('');
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/profile-folders', {
          method: 'POST',
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: trimmed })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNewFolderError(data.error || 'Erreur lors de la création du dossier');
          return;
        }
        const updated = await loadFolders();
        if (data?.folder?.id) {
          setSelectedFolderId(data.folder.id);
        } else if (Array.isArray(updated) && updated.length > 0) {
          setSelectedFolderId(updated[0].id);
        }
        setShowCreateFolderForm(false);
      } catch (_) {
        setNewFolderError('Erreur lors de la création du dossier');
      } finally {
        setCreatingFolder(false);
      }
    },
    [loadFolders, newFolderName]
  );

  const handleDeleteFolder = useCallback(
    (folder: ProfileFolderSummary) => {
      setConfirmDialog({
        title: 'Supprimer le dossier',
        description:
          "Supprimer définitivement ce dossier et toutes les fiches qu'il contient ? Cette action est irréversible.",
        confirmLabel: 'Supprimer',
        cancelLabel: 'Annuler',
        tone: 'danger',
        icon: <Trash2 className="h-5 w-5" />,
        onConfirm: async () => {
          const token = localStorage.getItem('token');
          try {
            const res = await fetch(`/api/profile-folders/${folder.id}`, {
              method: 'DELETE',
              headers: {
                Authorization: token ? `Bearer ${token}` : ''
              }
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
              setFolderError(payload.error || 'Impossible de supprimer le dossier');
              return;
            }
            if (typeof payload.deletedProfiles === 'number') {
              setFolderError(
                payload.deletedProfiles > 0
                  ? `${payload.deletedProfiles} fiche${payload.deletedProfiles > 1 ? 's' : ''} supprimée${
                      payload.deletedProfiles > 1 ? 's' : ''
                    } avec le dossier.`
                  : ''
              );
            } else {
              setFolderError('');
            }
            setSelectedFolderId(current => (current === folder.id ? null : current));
            setProfiles([]);
            setTotal(0);
            setSelected(null);
            await loadFolders();
          } catch (_) {
            setFolderError('Erreur lors de la suppression du dossier');
          }
        }
      });
    },
    [loadFolders]
  );

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

  const getCategoryTags = useCallback(
    (profile: ProfileListItem) => {
      const categories = parseFieldCategories(profile);
      const tags = new Set<string>();
      categories?.forEach((cat: any) => {
        const title = typeof cat?.title === 'string' ? cat.title.trim() : '';
        if (title) {
          tags.add(title);
        }
      });
      if (profile.folder_name) {
        tags.add(profile.folder_name);
      }
      return Array.from(tags);
    },
    [parseFieldCategories]
  );

  const getDisplayName = useCallback((profile: ProfileListItem) => {
    const first = typeof profile.first_name === 'string' ? profile.first_name.trim() : '';
    const last = typeof profile.last_name === 'string' ? profile.last_name.trim() : '';
    const combined = [first, last].filter(Boolean).join(' ').trim();
    if (combined) {
      return combined;
    }
    const email = typeof profile.email === 'string' ? profile.email.trim() : '';
    if (email) {
      return email;
    }
    const phone = typeof profile.phone === 'string' ? profile.phone.trim() : '';
    if (phone) {
      return phone;
    }
    return 'Profil sans nom';
  }, []);

  const isOwner = useCallback((profile: ProfileListItem) => currentUser?.id === profile.user_id, [currentUser]);

  const canEditProfile = useCallback(
    (profile: ProfileListItem) =>
      Boolean(onEdit) && (isAdminUser || isOwner(profile) || Boolean(profile.shared_with_me)),
    [isAdminUser, isOwner, onEdit]
  );

  const canDeleteProfile = useCallback((profile: ProfileListItem) => isOwner(profile), [isOwner]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total]);

  const emptyMessage = useMemo(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed) {
      return "Aucun profil ne correspond à votre recherche.";
    }
    if (!selectedFolderId) {
      return 'Créez un dossier pour ajouter vos fiches.';
    }
    return 'Ce dossier ne contient aucune fiche pour le moment.';
  }, [debouncedQuery, selectedFolderId]);
  const activeQueryValue = useMemo(() => debouncedQuery.trim(), [debouncedQuery]);
  const hasActiveSearch = activeQueryValue.length > 0;
  const folderFilterOptions: { key: 'all' | 'owned' | 'shared'; label: string }[] = useMemo(
    () => [
      { key: 'all', label: 'Tous les dossiers' },
      { key: 'owned', label: 'Mes dossiers' },
      { key: 'shared', label: 'Partagés avec moi' }
    ],
    []
  );

  const canCreateProfileNow = Boolean(
    selectedFolderId && readyFolderId === selectedFolderId && !loading
  );
  const showCreateSelectionHint = !selectedFolderId;
  const showCreateLoadingHint = Boolean(selectedFolderId && !canCreateProfileNow);

  useEffect(() => {
    setPage(prev => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [selectedFolderId]);

  useEffect(() => {
    if (page !== 1) {
      setPage(1);
    }
  }, [debouncedQuery, page]);

  const load = useCallback(async () => {
    const currentFolderId = selectedFolderId;
    try {
      if (!currentFolderId) {
        setProfiles([]);
        setTotal(0);
        setLoading(false);
        setReadyFolderId(null);
        return;
      }
      setLoading(true);
      setError('');
      setReadyFolderId(null);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        folderId: String(currentFolderId)
      });
      const trimmedQuery = debouncedQuery.trim();
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
        if (selectedFolderIdRef.current === currentFolderId) {
          setReadyFolderId(currentFolderId);
        }
        return;
      }
      // Ensure the profiles field from the API is always an array and normalize attachments
      const rawProfiles: ProfileListItem[] = Array.isArray(data.profiles) ? data.profiles : [];
      const normalized = rawProfiles.map(profile => ({
        ...profile,
        attachments: Array.isArray(profile.attachments) ? profile.attachments : []
      }));
      setProfiles(normalized);
      setTotal(data.total || 0);
      if (selectedFolderIdRef.current === currentFolderId) {
        setReadyFolderId(currentFolderId);
      }
    } catch (err) {
      setError('Erreur de réseau');
      setProfiles([]);
      setTotal(0);
      if (selectedFolderIdRef.current === currentFolderId) {
        setReadyFolderId(currentFolderId);
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, limit, page, selectedFolderId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (showCreateFolderForm) {
      newFolderInputRef.current?.focus();
    } else {
      setNewFolderName('');
      setNewFolderError('');
    }
  }, [showCreateFolderForm]);

  useEffect(() => {
    if (!folders.length) {
      setSelectedFolderId(null);
      return;
    }
    if (focusedFolderId) {
      const match = folders.find(folder => folder.id === focusedFolderId);
      if (match) {
        if (folderFilter !== 'all' && !filteredFolders.some(folder => folder.id === focusedFolderId)) {
          setFolderFilter('all');
        }
        setSelectedFolderId(match.id);
        onFocusedFolderHandled?.();
        return;
      }
    }
    if (!filteredFolders.length) {
      setSelectedFolderId(null);
      return;
    }
    if (!selectedFolderId || !filteredFolders.some(folder => folder.id === selectedFolderId)) {
      setSelectedFolderId(filteredFolders[0].id);
    }
  }, [filteredFolders, folderFilter, focusedFolderId, folders, onFocusedFolderHandled, selectedFolderId]);

  useEffect(() => {
    if (!focusedProfileId) return;
    const existing = profiles.find(profile => profile.id === focusedProfileId);
    if (existing) {
      if (existing.folder_id && existing.folder_id !== selectedFolderId) {
        setSelectedFolderId(existing.folder_id);
        return;
      }
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
          attachments: Array.isArray(data.profile.attachments) ? data.profile.attachments : []
        };
        if (fetchedProfile.folder_id && fetchedProfile.folder_id !== selectedFolderId) {
          setSelectedFolderId(fetchedProfile.folder_id);
        }
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
  }, [focusedProfileId, profiles, onFocusedProfileHandled, selectedFolderId]);

  const handleSearch = useCallback(() => {
    const normalized = query.trim();
    if (normalized !== query) {
      setQuery(normalized);
    }
    if (normalized !== debouncedQuery) {
      setDebouncedQuery(normalized);
      return;
    }
    if (page !== 1) {
      setPage(1);
    } else {
      load();
    }
  }, [debouncedQuery, load, page, query]);

  const buildProtectedUrl = (relativePath?: string | null) => {
    if (!relativePath) return null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    if (!token) return normalized;
    const separator = normalized.includes('?') ? '&' : '?';
    return `${normalized}${separator}token=${encodeURIComponent(token)}`;
  };

  const reorderProfiles = useCallback(
    (sourceId: number, targetId: number) => {
      if (sourceId === targetId) {
        return;
      }
      setProfiles(prev => {
        const sourceIndex = prev.findIndex(profile => profile.id === sourceId);
        const targetIndex = prev.findIndex(profile => profile.id === targetId);
        if (sourceIndex === -1 || targetIndex === -1) {
          return prev;
        }
        const updated = [...prev];
        const [moved] = updated.splice(sourceIndex, 1);
        updated.splice(targetIndex, 0, moved);
        return updated;
      });
    },
    [setProfiles]
  );

  const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, id: number) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(id));
    setDraggedId(id);
    setDragOverId(null);
  }, []);

  const handleDragOverCard = useCallback(
    (event: React.DragEvent<HTMLDivElement>, targetId: number) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (draggedId === null || draggedId === targetId) {
        return;
      }
      setDragOverId(targetId);
      reorderProfiles(draggedId, targetId);
    },
    [draggedId, reorderProfiles]
  );

  const handleDragLeaveCard = useCallback(
    (_event: React.DragEvent<HTMLDivElement>, targetId: number) => {
      if (dragOverId === targetId) {
        setDragOverId(null);
      }
    },
    [dragOverId]
  );

  const handleDropCard = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOverId(null);
    setDraggedId(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const selectedPhotoUrl = selected ? buildProtectedUrl(selected.photo_path) : null;
  const selectedDisplayName = selected ? getDisplayName(selected) : 'Profil sans nom';
  const selectedSharedCount = selected && Array.isArray(selected.shared_user_ids) ? selected.shared_user_ids.length : 0;

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
    if (!selectedFolderId) return;
    setPage(1);
    onCreate?.(selectedFolderId);
  }, [onCreate, selectedFolderId]);

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
        <div className="relative overflow-hidden rounded-[32px] border border-white/50 bg-white/50 p-6 shadow-xl shadow-blue-100/70 backdrop-blur-2xl dark:border-slate-800/60 dark:bg-slate-900/40 dark:shadow-slate-950/60">
          <div className="pointer-events-none absolute -top-24 right-12 h-56 w-56 rounded-full bg-blue-400/25 blur-3xl dark:bg-blue-500/20 animate-float-slow" />
          <div className="pointer-events-none absolute -bottom-32 left-0 h-64 w-64 rounded-full bg-purple-400/20 blur-3xl dark:bg-purple-500/20 animate-float-delayed" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-white/5 to-transparent dark:from-white/5" />
          <div className="relative space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/60 bg-white/60 px-4 py-3 shadow-inner shadow-blue-100/70 backdrop-blur-xl transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-400/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:shadow-slate-900/70 dark:focus-within:border-blue-400/60">
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
                  className="hidden items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl md:inline-flex"
                >
                  <Search className="h-4 w-4" />
                  Rechercher
                </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleCreateFolderForm}
                disabled={creatingFolder}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 ${
                  showCreateFolderForm
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-400/40 hover:shadow-2xl'
                    : 'border border-white/70 bg-white/60 text-blue-600 shadow-inner shadow-blue-100/60 hover:bg-white/80 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-blue-200 dark:hover:bg-slate-900/80'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {showCreateFolderForm ? (
                  <>
                    <X className="h-4 w-4" /> Fermer
                  </>
                ) : (
                  <>
                    <FolderPlus className="h-4 w-4" /> Nouveau dossier
                  </>
                )}
              </button>
            </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500/80 dark:text-blue-300/80">Filtres</span>
                <div className="inline-flex items-center gap-1 rounded-2xl border border-white/60 bg-white/50 p-1 shadow-inner shadow-blue-100/60 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/50 dark:shadow-slate-900/70">
                  {folderFilterOptions.map(option => {
                    const isActive = folderFilter === option.key;
                    const iconClass = `${isActive ? 'text-white' : 'text-blue-500 dark:text-blue-200'} h-3.5 w-3.5`;
                    const icon =
                      option.key === 'all' ? (
                        <Folder className={iconClass} />
                      ) : option.key === 'owned' ? (
                        <Sparkles className={iconClass} />
                      ) : (
                        <Share2 className={iconClass} />
                      );
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setFolderFilter(option.key)}
                        aria-pressed={isActive}
                        className={`inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-400/40'
                            : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        {icon}
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-500 dark:bg-slate-900/60 dark:text-blue-200">
                  <Sparkles className="h-3.5 w-3.5" /> Recherche instantanée
                </span>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    loading
                      ? 'animate-pulse bg-blue-50/80 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200'
                      : 'bg-white/60 text-slate-600 shadow-inner shadow-blue-100/60 dark:bg-slate-900/60 dark:text-slate-200'
                  }`}
                >
                  {loading ? 'Chargement…' : `${total} résultat${total > 1 ? 's' : ''}`}
                </span>
                {hasActiveSearch && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-slate-600 shadow-inner shadow-blue-100/60 dark:bg-slate-900/60 dark:text-slate-200">
                    <Search className="h-3.5 w-3.5 text-blue-500 dark:text-blue-300" />
                    « {activeQueryValue} »
                  </span>
                )}
              </div>
            </div>
            {showCreateFolderForm && (
            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-5 shadow-xl shadow-blue-100/60 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-slate-950/50">
              <div className="pointer-events-none absolute -top-16 right-8 h-48 w-48 rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/20 animate-float-delayed" />
              <form className="relative flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={handleSubmitNewFolder}>
                <div className="flex flex-1 items-start gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-500/20 dark:text-blue-200 dark:ring-blue-500/30">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div className="flex-1 space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-100">Nom du dossier</label>
                        <span className="text-xs font-medium uppercase tracking-wide text-blue-500/80 dark:text-blue-300/90">Nouveau</span>
                      </div>
                      <input
                        ref={newFolderInputRef}
                        type="text"
                        value={newFolderName}
                        onChange={event => setNewFolderName(event.target.value)}
                        placeholder="Ex. Dossiers sensibles"
                        className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-inner shadow-blue-100 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:focus:border-blue-400"
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Donnez un nom explicite pour identifier facilement les fiches regroupées.
                    </p>
                    {newFolderError && (
                      <p className="text-sm font-medium text-rose-500 dark:text-rose-300">{newFolderError}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
                  <button
                    type="submit"
                    disabled={creatingFolder}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {creatingFolder ? 'Création...' : 'Créer le dossier'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateFolderForm(false)}
                    disabled={creatingFolder}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-inner shadow-blue-100/60 transition hover:-translate-y-0.5 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          )}
          {onCreate && (
            <div className="relative mt-6 overflow-hidden rounded-3xl border border-blue-200/60 bg-gradient-to-br from-blue-600/80 via-indigo-600/80 to-purple-600/80 p-[1px] shadow-xl shadow-blue-200/50 dark:border-blue-500/50 dark:shadow-blue-900/40">
              <div className="relative flex flex-col gap-5 rounded-[calc(1.5rem-1px)] bg-white/95 p-6 dark:bg-slate-950/85 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/40">
                    <UserPlus className="h-6 w-6" />
                  </span>
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-500 dark:bg-blue-500/10 dark:text-blue-200">
                      Nouvelle fiche
                    </span>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {selectedFolder
                        ? `Créez une fiche dans « ${selectedFolder.name} »`
                        : 'Créez une nouvelle fiche profil'}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedFolder
                        ? 'Ajoutez immédiatement un nouveau profil dans le dossier sélectionné et partagez-le avec votre équipe.'
                        : 'Sélectionnez un dossier pour activer la création de fiches et les regrouper par thématique.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  {canCreateProfileNow && (
                    <button
                      type="button"
                      onClick={handleCreateClick}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-2xl"
                    >
                      Créer une fiche
                    </button>
                  )}
                  {showCreateLoadingHint && (
                    <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-2.5 text-sm font-medium text-slate-600 shadow-inner shadow-blue-100/60 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500 dark:text-blue-200" />
                      Ouverture du dossier…
                    </div>
                  )}
                  {showCreateSelectionHint && (
                    <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">
                      Choisissez un dossier dans la liste pour démarrer la création d’une fiche.
                    </p>
                  )}
                </div>
              </div>
                <div className="pointer-events-none absolute -right-16 top-0 h-44 w-44 rounded-full bg-white/40 blur-3xl dark:bg-white/10 animate-float-slow" />
                <div className="pointer-events-none absolute -left-12 -bottom-12 h-52 w-52 rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/20 animate-float-delayed" />
            </div>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organisez vos fiches par dossier et partagez-les facilement avec les membres de votre division.
          </p>
          <button
            type="button"
            onClick={handleSearch}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-2xl md:hidden"
          >
            <Search className="h-4 w-4" />
            Rechercher
          </button>
          {folderError && (
            <div className="rounded-2xl border border-amber-200/70 bg-amber-100/80 px-4 py-2 text-sm text-amber-700 shadow-inner shadow-amber-200/60 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
              {folderError}
            </div>
          )}
          <div className="space-y-3">
            {foldersLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : filteredFolders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/60 bg-white/60 px-5 py-10 text-center text-sm text-slate-500 shadow-inner shadow-blue-100/60 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-400">
                {folders.length === 0
                  ? 'Créez votre premier dossier pour regrouper vos fiches.'
                  : 'Aucun dossier ne correspond à ce filtre.'}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredFolders.map(folder => {
                  const active = folder.id === selectedFolderId;
                  const sharedCount = Array.isArray(folder.shared_user_ids) ? folder.shared_user_ids.length : 0;
                  const canManage = isAdminUser || folder.is_owner;
                  const handleSelect = () => setSelectedFolderId(folder.id);
                  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelect();
                    }
                  };
                  return (
                    <div
                      key={folder.id}
                      role="button"
                      tabIndex={0}
                      onClick={handleSelect}
                      onKeyDown={handleKeyDown}
                      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/60 p-4 shadow-lg shadow-blue-100/50 backdrop-blur-xl transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500/60 dark:border-slate-700/60 dark:bg-slate-900/50 dark:shadow-slate-950/50 ${
                        active
                          ? 'ring-2 ring-blue-500/60'
                          : 'hover:-translate-y-1 hover:shadow-2xl hover:ring-1 hover:ring-blue-400/40'
                      }`}
                    >
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="relative flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-400/40 ${
                                active ? 'animate-pulse' : ''
                              }`}
                            >
                              <Folder className="h-5 w-5" />
                            </span>
                            <div>
                              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{folder.name}</h3>
                              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                {active ? 'Dossier sélectionné' : 'Dossier'}
                              </p>
                            </div>
                          </div>
                          {canManage && onShareFolder && (
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                onShareFolder(folder);
                              }}
                              className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm transition hover:bg-white dark:bg-slate-900/60 dark:text-blue-200 dark:hover:bg-slate-900"
                            >
                              <Share2 className="h-3.5 w-3.5" /> Partager
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <span className="inline-flex items-center gap-2 rounded-full bg-blue-100/80 px-3 py-1 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                            <Users className="h-3.5 w-3.5" /> {folder.profiles_count ?? 0}{' '}
                            {(folder.profiles_count ?? 0) > 1 ? 'fiches' : 'fiche'}
                          </span>
                          {folder.shared_with_me && (
                            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100/80 px-3 py-1 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                              <Share2 className="h-3.5 w-3.5" /> Partagé avec vous
                            </span>
                          )}
                          {folder.is_owner && sharedCount > 0 && (
                            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100/80 px-3 py-1 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                              <Users className="h-3.5 w-3.5" /> Partagé avec {sharedCount}{' '}
                              {sharedCount > 1 ? 'membres' : 'membre'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            ) : folders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-5 py-10 text-center text-sm text-slate-500 shadow-inner dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                Créez votre premier dossier pour regrouper vos fiches.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {folders.map(folder => {
                  const active = folder.id === selectedFolderId;
                  const sharedCount = Array.isArray(folder.shared_user_ids) ? folder.shared_user_ids.length : 0;
                  const canManage = isAdminUser || folder.is_owner;
                  const handleSelect = () => setSelectedFolderId(folder.id);
                  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelect();
                    }
                  };
                  return (
                    <div
                      key={folder.id}
                      role="button"
                      tabIndex={0}
                      onClick={handleSelect}
                      onKeyDown={handleKeyDown}
                      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border p-4 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                        active
                          ? 'border-blue-500/60 bg-gradient-to-br from-blue-50 via-white to-blue-100 shadow-blue-200/60 dark:border-blue-400/60 dark:from-slate-900/70 dark:via-slate-950 dark:to-blue-900/20'
                          : 'border-slate-200 bg-white/85 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="relative h-14 w-16 shrink-0">
                          <span
                            className={`absolute left-2 top-0 h-3 w-10 rounded-t-lg shadow ${
                              active
                                ? 'bg-gradient-to-r from-amber-300 to-amber-200 shadow-amber-200/60'
                                : 'bg-gradient-to-r from-amber-200 to-amber-100 shadow-amber-100/40'
                            }`}
                          />
                          <span
                            className={`absolute bottom-0 left-0 h-12 w-full rounded-xl border shadow-inner ${
                              active
                                ? 'border-amber-400 bg-gradient-to-br from-amber-200 via-amber-100 to-amber-300'
                                : 'border-amber-200 bg-gradient-to-br from-amber-100 via-amber-50 to-amber-200'
                            }`}
                          />
                          <Folder
                            className={`absolute inset-0 m-auto h-6 w-6 ${
                              active ? 'text-amber-500' : 'text-amber-400'
                            }`}
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{folder.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {folder.profiles_count ?? 0} {folder.profiles_count === 1 ? 'fiche' : 'fiches'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {onShareFolder && canManage && (
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation();
                                    onShareFolder(folder);
                                  }}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 dark:bg-slate-800 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                                  aria-label={`Partager le dossier ${folder.name}`}
                                >
                                  <Share2 className="h-4 w-4" />
                                </button>
                              )}
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation();
                                    handleDeleteFolder(folder);
                                  }}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-rose-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-400/60 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                  aria-label={`Supprimer le dossier ${folder.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {folder.shared_with_me && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                                <Share2 className="h-3.5 w-3.5" /> Partagé avec vous
                              </span>
                            )}
                            {folder.is_owner && sharedCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                                <Users className="h-3.5 w-3.5" /> {sharedCount} partage{sharedCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedFolderId ? (
        loading ? (
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
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3" role="list">
              {profiles.map(p => {
                  const photoUrl = buildProtectedUrl(p.photo_path);
                const previewFields = getPreviewFields(p);
                const displayName = getDisplayName(p);
                const sharedCount = Array.isArray(p.shared_user_ids) ? p.shared_user_ids.length : 0;
                const isOwnerProfile = Boolean(p.is_owner);
                const isSharedWithMe = Boolean(p.shared_with_me);
                const attachmentsCount = Array.isArray(p.attachments) ? p.attachments.length : 0;
                const displayedTags = getCategoryTags(p).slice(0, 3);
                const isDragging = draggedId === p.id;
                const isDropTarget = dragOverId === p.id && draggedId !== null && draggedId !== p.id;
                const cardClasses = [
                  'group relative flex flex-col overflow-hidden rounded-[28px] border border-white/40 bg-white/60 p-6 shadow-xl shadow-blue-100/60 backdrop-blur-2xl transition-all duration-500 dark:border-slate-700/60 dark:bg-slate-900/50 dark:shadow-slate-950/50',
                  isDragging ? 'scale-[1.02] ring-2 ring-blue-500/60' : 'hover:-translate-y-1 hover:shadow-2xl',
                  isDropTarget ? 'ring-2 ring-purple-400/60' : ''
                ]
                  .filter(Boolean)
                  .join(' ');
                const folderLabel = p.folder_name;
                const commentText = typeof p.comment === 'string' ? p.comment.trim() : '';
                return (
                  <div
                    key={p.id}
                    role="listitem"
                    className={cardClasses}
                    draggable
                    onDragStart={event => handleDragStart(event, p.id)}
                    onDragOver={event => handleDragOverCard(event, p.id)}
                    onDragLeave={event => handleDragLeaveCard(event, p.id)}
                    onDrop={handleDropCard}
                    onDragEnd={handleDragEnd}
                    aria-grabbed={isDragging}
                    aria-label={`Fiche profil ${displayName}`}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="absolute right-4 top-4 hidden rounded-full bg-white/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 shadow-inner shadow-blue-100/60 dark:bg-slate-900/60 dark:text-slate-500 sm:flex">
                      Déplacer
                    </div>
                    <div className="relative flex flex-col gap-5">
                      <div className="flex items-start gap-4">
                        <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100/80 to-slate-200/80 shadow-inner shadow-blue-100/60 ring-2 ring-white/70 dark:from-slate-800 dark:to-slate-700 dark:shadow-slate-900/60 dark:ring-slate-700/70">
                          {photoUrl ? (
                            <img src={photoUrl} alt="profil" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500">
                              <Users className="h-8 w-8" />
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/40 dark:border-slate-700/60" />
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{displayName}</h3>
                            <p className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                              <Users className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                              {isOwnerProfile ? 'Créé par vous' : `Partagé par ${p.owner_login || 'un membre de la division'}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                            {folderLabel && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                                <Folder className="h-3.5 w-3.5" /> {folderLabel}
                              </span>
                            )}
                            {isSharedWithMe && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-3 py-1 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                                <Share2 className="h-3.5 w-3.5" /> Partagé avec vous
                              </span>
                            )}
                            {isOwnerProfile && sharedCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                                <Users className="h-3.5 w-3.5" /> Partagé avec {sharedCount}{' '}
                                {sharedCount > 1 ? 'membres' : 'membre'}
                              </span>
                            )}
                            {attachmentsCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/5 px-3 py-1 text-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
                                <Paperclip className="h-3.5 w-3.5" /> {attachmentsCount}{' '}
                                {attachmentsCount > 1 ? 'pièces jointes' : 'pièce jointe'}
                              </span>
                            )}
                          </div>
                          {displayedTags.length > 0 && (
                            <div className="flex flex-wrap gap-2 text-[11px]">
                              {displayedTags.map(tag => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 rounded-full bg-white/60 px-3 py-1 font-semibold uppercase tracking-wide text-blue-500 shadow-inner shadow-blue-100/60 dark:bg-slate-900/60 dark:text-blue-200"
                                >
                                  <Tag className="h-3 w-3" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <dl className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                        {previewFields.map(field => (
                          <div
                            key={field.label}
                            className="rounded-2xl border border-white/60 bg-white/60 px-3 py-2 shadow-inner shadow-blue-100/60 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-slate-950/40"
                          >
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              {field.label}
                            </dt>
                            <dd className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                      {commentText && (
                        <p className="rounded-2xl border border-white/60 bg-blue-500/10 px-3 py-2 text-sm text-blue-700 shadow-inner shadow-blue-100/60 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-200">
                          {commentText}
                        </p>
                      )}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected(p)}
                        className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Eye className="h-4 w-4" /> Aperçu
                      </button>
                      {canEditProfile(p) && (
                        <button
                          type="button"
                          onClick={() => onEdit?.(p.id)}
                          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-2xl"
                        >
                          <PencilLine className="h-4 w-4" /> Modifier
                        </button>
                      )}
                      {canDeleteProfile(p) && (
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:-translate-y-0.5 hover:bg-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" /> Supprimer
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => exportProfile(p.id)}
                        className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
        )
      ) : null}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/20 bg-white/95 shadow-2xl shadow-slate-900/40 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-slate-950/60">
            <div className="relative h-44 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.45),_transparent_60%)]" />
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute right-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                aria-label="Fermer la fiche profil"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="absolute inset-x-6 bottom-6 flex flex-wrap items-end justify-between gap-4 text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Fiche profil</p>
                  <h2 className="mt-1 text-2xl font-semibold leading-tight">{selectedDisplayName}</h2>
                  <p className="mt-1 text-sm text-white/80">
                    {selected.is_owner
                      ? 'Profil créé par vous'
                      : selected.owner_login
                      ? `Partagé par ${selected.owner_login}`
                      : 'Profil partagé dans votre division'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.shared_with_me && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                      <Share2 className="h-3.5 w-3.5" /> Partagé avec vous
                    </span>
                  )}
                  {selected.is_owner && selectedSharedCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                      <Users className="h-3.5 w-3.5" /> Partagé avec {selectedSharedCount}{' '}
                      {selectedSharedCount > 1 ? 'membres' : 'membre'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-8 p-6 text-sm text-slate-700 dark:text-slate-200 lg:grid-cols-[240px_1fr]">
              <div className="space-y-6">
                <div className="relative mx-auto h-40 w-40">
                  <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-slate-100 to-slate-200 shadow-inner shadow-blue-200/40 ring-2 ring-blue-200/60 dark:from-slate-800 dark:to-slate-700 dark:shadow-slate-900/60 dark:ring-blue-500/40" />
                  {selectedPhotoUrl ? (
                    <img
                      src={selectedPhotoUrl}
                      alt="profil"
                      className="relative z-10 h-full w-full rounded-[28px] object-cover"
                    />
                  ) : (
                    <div className="relative z-10 flex h-full w-full items-center justify-center rounded-[28px] bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      <Users className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute inset-x-8 bottom-[-12px] h-10 rounded-full bg-slate-900/10 blur-xl dark:bg-black/40" />
                </div>
                <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Créateur</p>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {selected.is_owner ? 'Vous' : selected.owner_login || 'Un membre de votre division'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {selected.email && (
                      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 text-sm font-medium text-slate-600 shadow-inner shadow-slate-200/40 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                        <Mail className="h-4 w-4 text-blue-500 dark:text-blue-300" />
                        <span className="break-all">{selected.email}</span>
                      </div>
                    )}
                    {selected.phone && (
                      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 text-sm font-medium text-slate-600 shadow-inner shadow-slate-200/40 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                        <Phone className="h-4 w-4 text-blue-500 dark:text-blue-300" />
                        <span className="break-all">{selected.phone}</span>
                      </div>
                    )}
                    {!selected.email && !selected.phone && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Aucune coordonnée renseignée.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-6 overflow-y-auto pr-1 lg:max-h-[28rem]">
                {buildCategories(selected).map((cat, idx) => {
                  const fields = (cat.fields || []).filter((f: any) => f.value);
                  return (
                    <div
                      key={idx}
                      className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70"
                    >
                      {cat.title && (
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {cat.title}
                        </h3>
                      )}
                      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {fields.map((f: any, i: number) => (
                          <div
                            key={i}
                            className="rounded-2xl border border-slate-200/70 bg-white/95 px-3 py-3 shadow-inner shadow-slate-200/40 dark:border-slate-700/60 dark:bg-slate-950/40"
                          >
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              {f.key}
                            </dt>
                            <dd className="mt-1 break-words text-sm font-medium text-slate-700 dark:text-slate-100">{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
                {selected.comment && (
                  <div className="rounded-3xl border border-blue-200/70 bg-blue-50/80 p-5 text-blue-800 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-200">Commentaire</h3>
                    <p className="mt-2 text-sm leading-relaxed">{selected.comment}</p>
                  </div>
                )}
                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                      <Paperclip className="h-4 w-4" /> Pièces jointes
                    </div>
                    <ul className="space-y-2">
                      {selected.attachments.map(att => {
                        const label = att.original_name || att.file_path.split('/').pop();
                        const href = buildProtectedUrl(att.file_path);
                        return (
                          <li key={att.id}>
                            <a
                              href={href || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/85 px-3 py-2 text-sm font-medium text-blue-600 transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700/60 dark:bg-slate-950/40 dark:text-blue-300 dark:hover:border-blue-400"
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
