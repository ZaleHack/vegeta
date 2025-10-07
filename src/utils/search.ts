export interface BaseSearchHit {
  table?: string;
  table_name?: string;
  database?: string;
  preview?: Record<string, unknown> | null;
  primary_keys?: Record<string, unknown> | null;
  score?: number;
  [key: string]: unknown;
}

export interface NormalizedPreviewEntry {
  key: string;
  label: string;
  value: string;
}

export interface SearchHit extends BaseSearchHit {
  previewEntries: NormalizedPreviewEntry[];
}

const FALLBACK_EXCLUDED_FIELDS = new Set([
  'preview',
  'table',
  'table_name',
  'database',
  'primary_keys',
  'score',
  'previewEntries'
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const formatLabel = (key: string): string => {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isEmptyValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isEmptyValue);
  }

  return false;
};

const stringifyValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => stringifyValue(item))
      .filter((item) => item !== '');
    return normalized.join(', ');
  }
  if (isRecord(value)) {
    return JSON.stringify(value);
  }
  return String(value ?? '');
};

export const normalizePreview = (hit: BaseSearchHit): NormalizedPreviewEntry[] => {
  const entries: NormalizedPreviewEntry[] = [];
  const seenKeys = new Set<string>();

  const pushEntry = (key: string, rawValue: unknown) => {
    if (isEmptyValue(rawValue)) {
      return;
    }
    const normalizedKey = key;
    if (seenKeys.has(normalizedKey)) {
      return;
    }
    const value = stringifyValue(rawValue);
    if (value === '') {
      return;
    }
    const label = formatLabel(normalizedKey) || normalizedKey;
    entries.push({
      key: normalizedKey,
      label,
      value
    });
    seenKeys.add(normalizedKey);
  };

  const source: Record<string, unknown> = {};
  if (isRecord(hit.preview)) {
    Object.assign(source, hit.preview as Record<string, unknown>);
  } else {
    Object.entries(hit).forEach(([key, value]) => {
      if (FALLBACK_EXCLUDED_FIELDS.has(key)) {
        return;
      }
      source[key] = value;
    });
  }

  Object.entries(source).forEach(([key, value]) => {
    if (key === 'data') {
      let parsed: unknown = value;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          // Ignore parse errors and use raw string value
        }
      }

      if (isRecord(parsed)) {
        Object.entries(parsed).forEach(([nestedKey, nestedValue]) => {
          pushEntry(nestedKey, nestedValue);
        });
        return;
      }

      if (Array.isArray(parsed)) {
        pushEntry(key, parsed.map((item) => (isRecord(item) ? JSON.stringify(item) : item)));
        return;
      }

      pushEntry(key, parsed);
      return;
    }

    pushEntry(key, value);
  });

  return entries;
};
