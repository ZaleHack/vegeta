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
  const sanitized = key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return key;
  }

  return sanitized
    .split(' ')
    .map((word) => {
      if (!word) {
        return word;
      }

      const alphaNumeric = word.replace(/[^a-zA-Z0-9]/g, '');
      if (!alphaNumeric) {
        return word;
      }

      if (/^[0-9]+$/.test(alphaNumeric)) {
        return word;
      }

      if (/^[a-zA-Z]+$/.test(alphaNumeric) && alphaNumeric.length <= 3) {
        return word.toUpperCase();
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
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

  const pushEntry = (
    key: string,
    rawValue: unknown,
    options: { label?: string; dedupeKey?: string } = {}
  ) => {
    const normalizedKey = typeof key === 'string' ? key.trim() : String(key);
    const dedupeKey = (options.dedupeKey ?? normalizedKey).toLowerCase();

    if (dedupeKey === 'id') {
      return;
    }
    if (isEmptyValue(rawValue)) {
      return;
    }
    if (seenKeys.has(dedupeKey)) {
      return;
    }
    const value = stringifyValue(rawValue);
    if (value === '') {
      return;
    }
    const label = options.label || formatLabel(normalizedKey) || normalizedKey;
    entries.push({
      key: normalizedKey,
      label,
      value
    });
    seenKeys.add(dedupeKey);
  };

  const handleExtraFields = (rawValue: unknown): boolean => {
    let value = rawValue;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        // Ignore parse errors and let the default handler stringify the value
      }
    }

    if (!Array.isArray(value)) {
      return false;
    }

    let handled = false;

    value.forEach((category, categoryIndex) => {
      if (!category || typeof category !== 'object') {
        return;
      }

      const group = category as Record<string, unknown>;
      const rawTitle = typeof group.title === 'string' ? group.title.trim() : '';
      const title = rawTitle || `Section ${categoryIndex + 1}`;
      const fields = Array.isArray(group.fields) ? group.fields : [];

      fields.forEach((field, fieldIndex) => {
        if (!field || typeof field !== 'object') {
          return;
        }

        const fieldRecord = field as Record<string, unknown>;
        const rawKey = typeof fieldRecord.key === 'string' ? fieldRecord.key.trim() : '';
        const keyLabel = rawKey || `Champ ${fieldIndex + 1}`;
        const fieldValue = fieldRecord.value;

        if (isEmptyValue(fieldValue)) {
          return;
        }

        const labelParts = title ? [title, keyLabel] : [keyLabel];
        const label = labelParts.join(' — ');
        const dedupeKey = `extra_fields:${title}:${keyLabel}`;

        pushEntry(label, fieldValue, { label, dedupeKey });
        handled = true;
      });
    });

    return handled;
  };

  const processEntry = (key: string, value: unknown) => {
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
          processEntry(nestedKey, nestedValue);
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

    if (key === 'extra_fields') {
      if (handleExtraFields(value)) {
        return;
      }
    }

    pushEntry(key, value);
  };

  if (isRecord(hit.preview)) {
    Object.entries(hit.preview).forEach(([key, value]) => {
      processEntry(key, value);
    });
  }

  Object.entries(hit).forEach(([key, value]) => {
    if (FALLBACK_EXCLUDED_FIELDS.has(key)) {
      return;
    }
    processEntry(key, value);
  });

  return entries;
};
