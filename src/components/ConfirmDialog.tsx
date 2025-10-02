import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export type ConfirmDialogTone = 'default' | 'danger';

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  icon?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
  open: boolean;
  onClose: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'default',
  icon,
  onConfirm,
  onCancel,
  onClose
}) => {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleCancel = async () => {
    if (submitting) return;
    try {
      await onCancel?.();
    } finally {
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      await onConfirm?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmButtonClasses =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-500 shadow-rose-500/30'
      : 'bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-500 shadow-blue-500/30';

  const iconContainerClasses =
    tone === 'danger'
      ? 'bg-rose-500/10 text-rose-500 ring-rose-500/30'
      : 'bg-blue-500/10 text-blue-600 ring-blue-500/30';

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-white/95 p-6 shadow-2xl shadow-slate-900/20 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/60 text-slate-500 shadow-sm transition hover:bg-white/80 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700"
          aria-label="Fermer la fenêtre de confirmation"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-4 ${iconContainerClasses}`}>
            {icon ?? <AlertTriangle className="h-6 w-6" />}
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            {description && (
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${confirmButtonClasses}`}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{submitting ? 'Veuillez patienter' : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
