import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, Loader2, Mail, Phone, Search, Users, X } from 'lucide-react';

interface ExportFolderProfileOption {
  id: number;
  displayName: string;
  email: string | null;
  phone: string | null;
}

interface ExportFolderModalProps {
  open: boolean;
  folderName?: string;
  profiles: ExportFolderProfileOption[];
  selectedIds: number[];
  loading: boolean;
  error: string;
  exporting: boolean;
  onClose: () => void;
  onToggleProfile: (id: number) => void;
  onToggleAll: () => void;
  onConfirm: () => void;
}

const ExportFolderModal: React.FC<ExportFolderModalProps> = ({
  open,
  folderName,
  profiles,
  selectedIds,
  loading,
  error,
  exporting,
  onClose,
  onToggleProfile,
  onToggleAll,
  onConfirm
}) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  const normalizedQuery = search.trim().toLowerCase();
  const filteredProfiles = useMemo(() => {
    if (!normalizedQuery) {
      return profiles;
    }
    return profiles.filter(profile => {
      const haystacks = [profile.displayName, profile.email, profile.phone]
        .map(value => (typeof value === 'string' ? value.toLowerCase() : ''))
        .filter(Boolean);
      return haystacks.some(value => value.includes(normalizedQuery));
    });
  }, [normalizedQuery, profiles]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const totalSelected = selectedIds.length;
  const allSelected = profiles.length > 0 && totalSelected === profiles.length;

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (exporting) {
      return;
    }
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1350] flex items-center justify-center bg-slate-900/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-folder-modal-title"
      onClick={handleOverlayClick}
    >
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-8 shadow-2xl shadow-blue-100/50 dark:border-slate-700/60 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:shadow-slate-950/70">
        <div className="pointer-events-none absolute -left-24 top-12 h-56 w-56 rounded-full bg-blue-200/50 blur-3xl dark:bg-blue-500/30" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/30" />
        <button
          type="button"
          onClick={onClose}
          disabled={exporting}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-lg transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800/70 dark:text-slate-200"
          aria-label="Fermer la fenêtre d'export"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="relative space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-500 text-white shadow-xl shadow-blue-400/40">
                <Download className="h-6 w-6" />
              </span>
              <div>
                <h2 id="export-folder-modal-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Exporter le dossier
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Sélectionnez les fiches à inclure dans le PDF pour «
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {folderName || 'Dossier'}
                  </span>
                  ».
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 shadow-inner shadow-blue-100/40 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200">
              {totalSelected} sélectionnée{totalSelected > 1 ? 's' : ''} / {profiles.length}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-slate-200/70 bg-white/80 p-4 shadow-inner shadow-blue-100/40 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-3 py-2 shadow-inner shadow-blue-100/40 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-300/40 dark:border-slate-700/60 dark:bg-slate-950/60 dark:shadow-slate-950/40">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Rechercher par nom, email ou téléphone"
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
              <button
                type="button"
                onClick={onToggleAll}
                disabled={profiles.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-100/70 bg-white/80 px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400/40 dark:bg-slate-900/60 dark:text-blue-200"
              >
                {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-500 dark:text-slate-300">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement des profils…
                </div>
              ) : filteredProfiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200/70 bg-white/80 px-4 py-10 text-center text-sm text-slate-500 shadow-inner shadow-blue-100/40 dark:border-slate-700/60 dark:bg-slate-950/40 dark:text-slate-300">
                  {profiles.length === 0
                    ? 'Aucun profil disponible pour ce dossier.'
                    : 'Aucun profil ne correspond à votre recherche.'}
                </div>
              ) : (
                filteredProfiles.map(profile => {
                  const checked = selectedSet.has(profile.id);
                  return (
                    <label
                      key={profile.id}
                      className={`group flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700/60 dark:bg-slate-950/40 ${
                        checked ? 'border-blue-300/70 shadow-blue-200/50 dark:border-blue-400/60' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleProfile(profile.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{profile.displayName}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
                                <Users className="h-3.5 w-3.5" /> Fiche #{profile.id}
                              </span>
                              {profile.email && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                                  <Mail className="h-3 w-3" /> {profile.email}
                                </span>
                              )}
                              {profile.phone && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                                  <Phone className="h-3 w-3" /> {profile.phone}
                                </span>
                              )}
                            </div>
                          </div>
                          {checked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                              <Check className="h-3 w-3" /> Sélectionné
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {error && (
              <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-600 shadow-inner shadow-rose-100/60 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                {error}
              </div>
            )}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={exporting}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 shadow-inner shadow-blue-100/40 transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={exporting || totalSelected === 0}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? 'Export en cours…' : 'Exporter en PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportFolderModal;
