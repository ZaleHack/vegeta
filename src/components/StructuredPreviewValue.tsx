import React, { useMemo } from 'react';

interface StructuredPreviewValueProps {
  value: string;
}

const prettifyKey = (key: string) => {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => {
      if (!part) {
        return part;
      }
      if (/^[0-9]+$/.test(part)) {
        return part;
      }
      if (part.length <= 3 && /^[a-zA-Z]+$/.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
};

const parseStructuredValue = (rawValue: string): unknown | null => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  const firstChar = trimmed.charAt(0);
  if (firstChar !== '{' && firstChar !== '[') {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch (error) {
    console.warn('Impossible de parser la valeur JSON du résultat de recherche:', error);
    return null;
  }
};

const renderStructuredContent = (value: unknown, depth = 0): React.ReactNode => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return (
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
        {String(value)}
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-xs text-slate-400 dark:text-slate-500">Aucune donnée</span>;
    }

    const hasComplexValues = value.some(
      (item) => Array.isArray(item) || (item && typeof item === 'object')
    );

    if (!hasComplexValues) {
      return (
        <div className="flex flex-wrap gap-2">
          {value.map((item, index) => (
            <span
              key={index}
              className="inline-flex items-center rounded-full bg-blue-100/70 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm dark:bg-blue-500/20 dark:text-blue-200"
            >
              {String(item)}
            </span>
          ))}
        </div>
      );
    }

    if (depth >= 3) {
      return (
        <span className="text-xs text-slate-500 dark:text-slate-400 break-words">
          {JSON.stringify(value)}
        </span>
      );
    }

    return (
      <div className="space-y-3">
        {value.map((item, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40"
          >
            {renderStructuredContent(item, depth + 1)}
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-xs text-slate-400 dark:text-slate-500">Aucune donnée</span>;
    }

    if (depth >= 3) {
      return (
        <span className="text-xs text-slate-500 dark:text-slate-400 break-words">
          {JSON.stringify(value)}
        </span>
      );
    }

    return (
      <div className="space-y-2">
        {entries.map(([key, nestedValue]) => (
          <div
            key={key}
            className="rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-2 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40"
          >
            <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {prettifyKey(key)}
            </div>
            <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">
              {renderStructuredContent(nestedValue, depth + 1)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
      {String(value)}
    </span>
  );
};

const StructuredPreviewValue: React.FC<StructuredPreviewValueProps> = ({ value }) => {
  const structuredValue = useMemo(() => parseStructuredValue(value), [value]);

  if (structuredValue === null) {
    return (
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
        {value}
      </div>
    );
  }

  return <div className="space-y-2">{renderStructuredContent(structuredValue)}</div>;
};

export default StructuredPreviewValue;
