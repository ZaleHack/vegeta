import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  PlusCircle,
  UploadCloud,
  X
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import StructuredPreviewValue from './StructuredPreviewValue';
import { SearchHit } from '../utils/search';

export interface BulkProfilePrefillData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  comment?: string;
  extra_fields?: Record<string, string>;
}

interface BulkProfileImportModalProps {
  open: boolean;
  onClose: () => void;
  runSearch: (query: string) => Promise<SearchHit[]>;
}

type ImportStatus = 'pending' | 'searching' | 'creating' | 'created' | 'not_found' | 'error';

interface ImportEntry {
  id: string;
  number: string;
  status: ImportStatus;
  hits: SearchHit[];
  error?: string;
  prefill?: BulkProfilePrefillData;
  profileId?: number;
}

const sanitizeNumber = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed
    .replace(/[^0-9+]/g, '')
    .replace(/(?!^)\+/g, '')
    .replace(/-/g, '')
    .replace(/\s+/g, '');
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('00')) {
    return `+${normalized.slice(2)}`;
  }
  return normalized;
};

const extractNumbers = (value: string): string[] => {
  if (!value) return [];
  const rawTokens = value
    .split(/[\n\r;,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const numbers = rawTokens
    .flatMap((token) => token.split(/\s+/))
    .map((token) => sanitizeNumber(token))
    .filter((token) => token.length >= 3);
  const unique = Array.from(new Set(numbers));
  return unique;
};

const buildPrefillFromHits = (number: string, hits: SearchHit[]): BulkProfilePrefillData => {
  const fieldMap = new Map<string, string>();
  hits.forEach((hit) => {
    hit.previewEntries.forEach((entry) => {
      const label = (entry.label || entry.key || '').trim();
      if (!label) {
        return;
      }
      if (!fieldMap.has(label)) {
        fieldMap.set(label, entry.value);
      }
    });
  });

  const findBy = (predicate: (label: string, value: string) => boolean): string | undefined => {
    for (const [label, value] of fieldMap.entries()) {
      if (predicate(label.toLowerCase(), value)) {
        return value;
      }
    }
    return undefined;
  };

  const email = findBy((label) => /email/.test(label));
  const phone = findBy((label) => /(téléphone|telephone|phone|mobile|numero|numéro)/.test(label));
  const firstName = findBy((label) => /(prénom|prenom|first\s?name)/.test(label));
  const lastName = findBy((label) =>
    /(nom|last\s?name)/.test(label) && !/(prénom|prenom|first\s?name)/.test(label)
  );

  const extraFields: Record<string, string> = {};
  fieldMap.forEach((value, label) => {
    extraFields[label] = value;
  });

  if (phone && !extraFields['Téléphone']) {
    extraFields['Téléphone'] = phone;
  }
  if (email && !extraFields['Email']) {
    extraFields['Email'] = email;
  }
  if (firstName && !extraFields['Prénom']) {
    extraFields['Prénom'] = firstName;
  }
  if (lastName && !extraFields['Nom']) {
    extraFields['Nom'] = lastName;
  }

  return {
    email,
    phone,
    first_name: firstName,
    last_name: lastName,
    comment: `Profil généré à partir de l'import du numéro ${number}`,
    extra_fields: extraFields
  };
};

const formatExtraFieldsForSubmission = (prefill: BulkProfilePrefillData) => {
  const initialEntries = Object.entries(prefill.extra_fields || {}).filter(
    ([key, value]) => Boolean(key) && typeof value === 'string'
  );

  const normalizedKeys = new Set(initialEntries.map(([key]) => key.trim().toLowerCase()));

  const ensureField = (label: string, value?: string) => {
    if (!value) {
      return;
    }
    const normalized = label.trim().toLowerCase();
    if (normalizedKeys.has(normalized)) {
      return;
    }
    normalizedKeys.add(normalized);
    initialEntries.push([label, value]);
  };

  ensureField('Téléphone', prefill.phone);
  ensureField('Email', prefill.email);
  ensureField('Prénom', prefill.first_name);
  ensureField('Nom', prefill.last_name);

  if (!initialEntries.length) {
    return [];
  }

  return [
    {
      title: "Données d'import",
      fields: initialEntries.map(([key, value]) => ({ key, value }))
    }
  ];
};

const autoCreateProfile = async (prefill: BulkProfilePrefillData) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const form = new FormData();
  if (prefill.email) form.append('email', prefill.email);
  if (prefill.phone) form.append('phone', prefill.phone);
  if (prefill.first_name) form.append('first_name', prefill.first_name);
  if (prefill.last_name) form.append('last_name', prefill.last_name);
  if (prefill.comment) form.append('comment', prefill.comment);

  const extraFields = formatExtraFieldsForSubmission(prefill);
  form.append('extra_fields', JSON.stringify(extraFields));

  const response = await fetch('/api/profiles', {
    method: 'POST',
    headers: {
      Authorization: token ? `Bearer ${token}` : ''
    },
    body: form
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data && typeof data.error === 'string'
        ? data.error
        : "Erreur lors de la création automatique du profil";
    throw new Error(message);
  }

  const profileId =
    data && typeof data === 'object' && data.profile && typeof data.profile.id === 'number'
      ? data.profile.id
      : undefined;

  return profileId;
};

const BulkProfileImportModal: React.FC<BulkProfileImportModalProps> = ({ open, onClose, runSearch }) => {
  const [manualInput, setManualInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) {
      setManualInput('');
      setFile(null);
      setEntries([]);
      setError('');
      setProcessing(false);
    }
  }, [open]);

  const handleClose = () => {
    if (processing) {
      return;
    }
    onClose();
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
  };

  const hasSearchingEntries = useMemo(
    () =>
      entries.some((entry) =>
        entry.status === 'searching' || entry.status === 'pending' || entry.status === 'creating'
      ),
    [entries]
  );

  const handleSubmit = useCallback(async () => {
    setError('');

    let numbers: string[] = extractNumbers(manualInput);

    if (file) {
      try {
        const content = await file.text();
        numbers = [...numbers, ...extractNumbers(content)];
      } catch (err) {
        console.error('Failed to read file', err);
        setError("Impossible de lire le fichier fourni.");
        return;
      }
    }

    const uniqueNumbers = Array.from(new Set(numbers));

    if (!uniqueNumbers.length) {
      setError('Veuillez saisir ou importer au moins un numéro valide.');
      return;
    }

    if (uniqueNumbers.length > 20) {
      setError('Vous pouvez importer au maximum 20 numéros par opération.');
      return;
    }

    const initialEntries: ImportEntry[] = uniqueNumbers.map((number, index) => ({
      id: `${Date.now()}-${index}`,
      number,
      status: 'pending',
      hits: []
    }));

    setEntries(initialEntries);
    setProcessing(true);

    for (const entry of initialEntries) {
      setEntries((prev) =>
        prev.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                status: 'searching',
                error: undefined,
                hits: [],
                prefill: undefined
              }
            : item
        )
      );

      try {
        const hits = await runSearch(entry.number);
        if (!hits.length) {
          setEntries((prev) =>
            prev.map((item) =>
              item.id === entry.id
                ? { ...item, status: 'not_found', hits: [] }
                : item
            )
          );
          continue;
        }

        const prefill = buildPrefillFromHits(entry.number, hits);
        setEntries((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  status: 'creating',
                  hits,
                  prefill,
                  error: undefined
                }
              : item
          )
        );

        try {
          const profileId = await autoCreateProfile(prefill);

          setEntries((prev) =>
            prev.map((item) =>
              item.id === entry.id
                ? {
                    ...item,
                    status: 'created',
                    hits,
                    prefill,
                    profileId,
                    error: undefined
                  }
                : item
            )
          );
        } catch (creationError) {
          const message =
            creationError instanceof Error
              ? creationError.message
              : 'Erreur inattendue lors de la création du profil';

          setEntries((prev) =>
            prev.map((item) =>
              item.id === entry.id
                ? {
                    ...item,
                    status: 'error',
                    hits,
                    prefill,
                    error: message
                  }
                : item
            )
          );
        }
      } catch (err) {
        console.error('Bulk profile import search error', err);
        setEntries((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  status: 'error',
                  hits: [],
                  error: err instanceof Error ? err.message : 'Erreur inattendue lors de la recherche'
                }
              : item
          )
        );
      }
    }

    setProcessing(false);
  }, [file, manualInput, runSearch]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-900/80 px-4 py-6 backdrop-blur">
      <div className="relative flex w-full max-w-5xl flex-col gap-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/95 p-8 shadow-2xl dark:border-slate-700/60 dark:bg-slate-900/90">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-md transition hover:-translate-y-0.5 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:bg-slate-800/70 dark:text-slate-200"
          aria-label="Fermer l'import de profils"
          disabled={processing}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-2 pr-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/20 dark:text-blue-100">
            Import intelligent
          </span>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Créez plusieurs fiches de profil à partir d'une liste de numéros
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Importez un fichier CSV ou TXT contenant vos numéros, ou saisissez-les manuellement (20 maximum). Chaque numéro est recherché automatiquement et les fiches identifiées sont créées instantanément.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-inner dark:border-slate-700/70 dark:bg-slate-900/70">
              <label className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                    <UploadCloud className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Importer un fichier</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Formats acceptés : CSV, TXT (jusqu'à 20 numéros)</p>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-slate-300/70 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 dark:border-slate-600/70 dark:text-slate-300 dark:hover:border-blue-400/60 dark:hover:text-blue-300">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                  <FileSpreadsheet className="h-4 w-4" />
                  {file ? 'Changer de fichier' : 'Sélectionner un fichier'}
                </label>
              </label>
              {file && (
                <p className="mt-3 rounded-xl bg-slate-100/80 px-3 py-2 text-xs font-medium text-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
                  Fichier sélectionné : <span className="font-semibold">{file.name}</span>
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-inner dark:border-slate-700/70 dark:bg-slate-900/70">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Saisie manuelle</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Séparez les numéros par un retour à la ligne, une virgule ou un point-virgule.</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                  <PlusCircle className="h-5 w-5" />
                </span>
              </div>
              <textarea
                value={manualInput}
                onChange={(event) => setManualInput(event.target.value)}
                placeholder={'+221770000000\n+221780000000\n+221760000000'}
                className="h-36 w-full resize-none rounded-2xl border border-slate-200/70 bg-white/95 px-4 py-3 text-sm text-slate-700 shadow-inner focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-100"
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Astuce : copiez-collez directement depuis votre tableur ou une liste textuelle.
                </p>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={processing}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {processing ? 'Analyse en cours…' : 'Lancer l’import'}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm font-medium text-rose-700 shadow-inner dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-inner dark:border-slate-700/70 dark:bg-slate-900/70">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Progression</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Chaque numéro est analysé via la recherche unifiée. Les fiches identifiées sont créées automatiquement.
              </p>
              {processing || hasSearchingEntries ? <LoadingSpinner /> : null}
              {entries.length === 0 && !processing && (
                <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                  Lancez un import pour visualiser ici l’avancement et les fiches préremplies.
                </p>
              )}
            </div>
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {entries.map((entry) => {
                if (entry.status === 'created' && entry.prefill) {
                  const firstHit = entry.hits[0];
                  const previewEntries = firstHit?.previewEntries?.slice(0, 6) || [];
                  return (
                    <div
                      key={entry.id}
                      className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 shadow-lg shadow-emerald-200/50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-200">
                            {entry.number}
                          </p>
                          <h4 className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            Profil créé automatiquement
                          </h4>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      </div>
                      {previewEntries.length > 0 && (
                        <dl className="mt-4 grid grid-cols-1 gap-3 text-xs text-slate-600 dark:text-slate-300">
                          {previewEntries.map((entryItem) => (
                            <div
                              key={`${entry.id}-${entryItem.key}`}
                              className="rounded-xl border border-white/80 bg-white/70 p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70"
                            >
                              <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {entryItem.label}
                              </dt>
                              <dd className="mt-1 text-[0.75rem] text-slate-700 dark:text-slate-200">
                                <StructuredPreviewValue value={entryItem.value} />
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {typeof entry.profileId === 'number' && (
                        <p className="mt-4 text-xs font-medium text-emerald-700 dark:text-emerald-200">
                          Identifiant du profil : {entry.profileId}
                        </p>
                      )}
                    </div>
                  );
                }

                if (entry.status === 'searching' || entry.status === 'pending') {
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                          {entry.number}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Analyse en cours…</p>
                      </div>
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    </div>
                  );
                }

                if (entry.status === 'creating') {
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-indigo-200/70 bg-indigo-50/80 p-4 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/10"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-200">
                          {entry.number}
                        </p>
                        <p className="text-sm text-indigo-700 dark:text-indigo-100">
                          Création automatique de la fiche…
                        </p>
                      </div>
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    </div>
                  );
                }

                if (entry.status === 'not_found') {
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-600 dark:text-amber-200">
                          {entry.number}
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-100">Non identifié</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/80 p-4 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-600 dark:text-rose-200">
                        {entry.number}
                      </p>
                      <p className="text-sm text-rose-700 dark:text-rose-100">
                        {entry.error || 'Une erreur est survenue lors de la recherche.'}
                      </p>
                    </div>
                    <AlertCircle className="h-5 w-5 text-rose-500" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkProfileImportModal;
