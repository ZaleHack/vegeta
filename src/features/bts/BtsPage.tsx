import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Plus, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { useNotifications } from '../../components/NotificationProvider';

export type BtsProvider = 'orange' | 'free' | 'expresso';

type BtsColumn = {
  name: string;
  dataType?: string;
  isNullable?: boolean;
  isPrimary?: boolean;
  isAutoIncrement?: boolean;
};

type BtsTable = {
  name: string;
  columns: BtsColumn[];
};

type BtsTableResponse = {
  table: string;
  columns: BtsColumn[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
};

type BtsMetadataResponse = {
  database: string;
  tables: BtsTable[];
};

type ProviderOption = {
  key: BtsProvider;
  label: string;
  description: string;
  gradient: string;
};

const PROVIDERS: ProviderOption[] = [
  {
    key: 'orange',
    label: 'Orange',
    description: 'Couverture nationale et multi-technologies.',
    gradient: 'from-orange-500 via-amber-500 to-yellow-500'
  },
  {
    key: 'free',
    label: 'Free',
    description: 'Données récentes et sites optimisés.',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500'
  },
  {
    key: 'expresso',
    label: 'Expresso',
    description: 'BTS et zones de couverture dédiées.',
    gradient: 'from-fuchsia-500 via-purple-500 to-indigo-500'
  }
];

const getInputType = (dataType?: string) => {
  if (!dataType) return 'text';
  const normalized = dataType.toLowerCase();
  if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'double'].includes(normalized)) {
    return 'number';
  }
  if (normalized.includes('date') && normalized !== 'datetime' && !normalized.includes('time')) {
    return 'date';
  }
  if (normalized.includes('datetime') || normalized.includes('timestamp')) {
    return 'datetime-local';
  }
  if (normalized.includes('time')) {
    return 'time';
  }
  return 'text';
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

const BtsPage: React.FC<{
  provider: BtsProvider;
  onProviderChange?: (provider: BtsProvider) => void;
}> = ({ provider, onProviderChange }) => {
  const { notifyError, notifySuccess, notifyWarning } = useNotifications();
  const [tables, setTables] = useState<BtsTable[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<BtsColumn[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  const createAuthHeaders = useCallback((headers: Record<string, string> = {}) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const next = { ...headers };
    if (token) {
      next.Authorization = `Bearer ${token}`;
    }
    return next;
  }, []);

  const providerMeta = useMemo(
    () => PROVIDERS.find((entry) => entry.key === provider) ?? PROVIDERS[0],
    [provider]
  );

  const editableColumns = useMemo(
    () => columns.filter((column) => !column.isAutoIncrement),
    [columns]
  );

  const fetchMetadata = useCallback(async () => {
    setMetadataLoading(true);
    setTableError('');
    try {
      const response = await fetch(`/api/bts/${provider}/metadata`, {
        headers: createAuthHeaders()
      });
      const data: BtsMetadataResponse = await response.json();
      if (!response.ok) {
        throw new Error(data?.tables ? 'Erreur serveur BTS' : 'Impossible de récupérer les tables BTS.');
      }
      const nextTables = Array.isArray(data.tables) ? data.tables : [];
      setTables(nextTables);
      setSelectedTable((prev) => {
        if (prev && nextTables.some((table) => table.name === prev)) {
          return prev;
        }
        return nextTables[0]?.name ?? '';
      });
    } catch (error) {
      console.error('Erreur chargement metadata BTS:', error);
      setTableError('Impossible de charger les tables BTS pour cet opérateur.');
    } finally {
      setMetadataLoading(false);
    }
  }, [createAuthHeaders, provider]);

  const fetchTableData = useCallback(
    async (tableName: string) => {
      if (!tableName) return;
      setTableLoading(true);
      setTableError('');
      try {
        const response = await fetch(
          `/api/bts/${provider}/tables/${encodeURIComponent(tableName)}?limit=50&page=1`,
          {
            headers: createAuthHeaders()
          }
        );
        const data: BtsTableResponse = await response.json();
        if (!response.ok) {
          throw new Error('Erreur serveur BTS');
        }
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setColumns(Array.isArray(data.columns) ? data.columns : []);
      } catch (error) {
        console.error('Erreur chargement BTS:', error);
        setTableError('Impossible de charger les données BTS.');
        setRows([]);
        setColumns([]);
      } finally {
        setTableLoading(false);
      }
    },
    [createAuthHeaders, provider]
  );

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    if (selectedTable) {
      fetchTableData(selectedTable);
    }
  }, [selectedTable, fetchTableData]);

  useEffect(() => {
    const nextValues = editableColumns.reduce<Record<string, string>>((acc, column) => {
      acc[column.name] = '';
      return acc;
    }, {});
    setFormValues(nextValues);
  }, [editableColumns]);

  const handleFormChange = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTable) {
      notifyWarning('Sélectionnez une table BTS avant de soumettre.');
      return;
    }

    const payload = editableColumns.reduce<Record<string, string>>((acc, column) => {
      const value = formValues[column.name];
      if (value !== undefined && value !== '') {
        acc[column.name] = value;
      }
      return acc;
    }, {});

    if (Object.keys(payload).length === 0) {
      notifyWarning('Renseignez au moins un champ avant de soumettre.');
      return;
    }

    setFormSubmitting(true);
    try {
      const response = await fetch(
        `/api/bts/${provider}/tables/${encodeURIComponent(selectedTable)}`,
        {
          method: 'POST',
          headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Erreur lors de l'ajout BTS.");
      }
      notifySuccess('Entrée BTS ajoutée avec succès.');
      setFormValues((prev) =>
        Object.keys(prev).reduce<Record<string, string>>((acc, key) => {
          acc[key] = '';
          return acc;
        }, {})
      );
      fetchTableData(selectedTable);
    } catch (error) {
      console.error('Erreur ajout BTS:', error);
      notifyError("Impossible d'ajouter l'entrée BTS.");
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        icon={<Database className="h-6 w-6" />}
        title="BTS"
        subtitle="Consultez et alimentez les données BTS par opérateur et technologie."
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Opérateur
                </p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {providerMeta.label}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  {providerMeta.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PROVIDERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onProviderChange?.(item.key)}
                    className={`group relative overflow-hidden rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                      provider === item.key
                        ? 'border-transparent text-white shadow-lg shadow-slate-300/40'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span
                      className={`absolute inset-0 bg-gradient-to-r ${item.gradient} transition-opacity ${
                        provider === item.key ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
                      }`}
                    />
                    <span className="relative">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Tables technologiques
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Sélectionnez une technologie BTS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => selectedTable && fetchTableData(selectedTable)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
              >
                <RefreshCw className="h-4 w-4" />
                Rafraîchir
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <select
                value={selectedTable}
                onChange={(event) => setSelectedTable(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                disabled={metadataLoading || tables.length === 0}
              >
                {tables.length === 0 ? (
                  <option value="">Aucune table disponible</option>
                ) : (
                  tables.map((table) => (
                    <option key={table.name} value={table.name}>
                      {table.name}
                    </option>
                  ))
                )}
              </select>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                {tables.length} table{tables.length > 1 ? 's' : ''} disponibles
              </div>
            </div>

            {tableError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {tableError}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white/90 shadow-lg shadow-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/70">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-6 py-4 dark:border-slate-800/60">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Données BTS
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedTable || 'Aucune table sélectionnée'}
                </h3>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
                {rows.length} lignes
              </span>
            </div>

            {tableLoading ? (
              <div className="flex items-center justify-center gap-3 px-6 py-10 text-sm text-slate-500">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Chargement des données...
              </div>
            ) : rows.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">
                Aucune donnée disponible pour cette table.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/70">
                    <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                      {columns.map((column) => (
                        <th key={column.name} className="px-6 py-3">
                          {column.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                    {rows.map((row, rowIndex) => (
                      <tr
                        key={`${rowIndex}-${selectedTable}`}
                        className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900/50 dark:even:bg-slate-800/60"
                      >
                        {columns.map((column) => (
                          <td key={column.name} className="px-6 py-4 whitespace-nowrap">
                            {formatValue((row as Record<string, unknown>)[column.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/70">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/30">
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Ajout BTS
                </p>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Ajouter une ligne dans {selectedTable || 'la table'}
                </h3>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {editableColumns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                  Sélectionnez une table avec des colonnes modifiables.
                </div>
              ) : (
                <div className="grid gap-4">
                  {editableColumns.map((column) => (
                    <label key={column.name} className="space-y-2 text-sm font-semibold text-slate-600 dark:text-slate-200">
                      <span className="flex items-center gap-2">
                        {column.name}
                        {column.isNullable ? (
                          <span className="text-xs font-medium text-slate-400">(optionnel)</span>
                        ) : (
                          <span className="text-xs font-medium text-rose-500">(requis)</span>
                        )}
                      </span>
                      <input
                        type={getInputType(column.dataType)}
                        value={formValues[column.name] ?? ''}
                        onChange={(event) => handleFormChange(column.name, event.target.value)}
                        placeholder={`Saisir ${column.name}`}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      />
                    </label>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={formSubmitting || editableColumns.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {formSubmitting ? 'Ajout en cours...' : 'Ajouter la ligne BTS'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BtsPage;
