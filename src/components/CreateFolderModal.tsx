import React from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';

interface CreateFolderModalProps {
  open: boolean;
  name: string;
  error: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  open,
  name,
  error,
  loading,
  onClose,
  onSubmit,
  onNameChange,
  inputRef
}) => {
  if (!open) {
    return null;
  }

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-900/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-folder-modal-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-8 shadow-2xl shadow-blue-100/40 backdrop-blur-xl dark:border-slate-700/60 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:shadow-slate-950/60">
        <div className="pointer-events-none absolute -left-32 top-10 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/30" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/30" />
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-lg transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label="Fermer la fenêtre de création de dossier"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="relative">
          <div className="mb-6 flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-xl shadow-blue-400/40">
              <Sparkles className="h-6 w-6" />
            </span>
            <div>
              <h2 id="create-folder-modal-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Créer un nouveau dossier
              </h2>
              <p className="text-sm text-slate-500 dark:text-blue-100/90">
                Donnez un nom inspirant pour organiser vos fiches en toute simplicité.
              </p>
            </div>
          </div>
          <form className="relative space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-blue-100/80">
                Nom du dossier
              </label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={event => onNameChange(event.target.value)}
                placeholder="Ex. Dossiers sensibles"
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-inner shadow-blue-100/40 transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-slate-950/40"
              />
              <p className="text-xs text-slate-500 dark:text-blue-100/80">
                Ce nom sera visible par tous les membres ayant accès au dossier.
              </p>
            </div>
            {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-200">{error}</p>}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 shadow-inner shadow-blue-100/40 transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:shadow-slate-950/40 dark:hover:bg-slate-900"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {loading ? 'Création…' : 'Créer le dossier'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateFolderModal;
