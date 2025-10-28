export function normalizeExtraFields(value) {
  if (value === null || value === undefined || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed === null || parsed === undefined) {
        return [];
      }
      return [parsed];
    } catch (_) {
      return [trimmed];
    }
  }

  if (typeof value === 'object') {
    return [value];
  }

  return [value];
}

function ensureArray(value) {
  if (value === null || value === undefined || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      return ensureArray(parsed);
    } catch (_) {
      return [trimmed];
    }
  }
  if (typeof value === 'object') {
    return [value];
  }
  return [value];
}

export function serializeExtraFields(value) {
  const arrayValue = ensureArray(value);
  if (arrayValue.length === 0) {
    return JSON.stringify([]);
  }
  return JSON.stringify(arrayValue);
}

export function normalizeProfileRecord(record) {
  if (!record) {
    return record;
  }
  return {
    ...record,
    comment: record.comment ?? '',
    extra_fields: normalizeExtraFields(record.extra_fields),
    folder_id:
      record.folder_id === undefined || record.folder_id === null
        ? null
        : Number(record.folder_id),
    folder_name: record.folder_name ?? null
  };
}

export function normalizeProfileRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }
  return rows.map((row) => normalizeProfileRecord(row));
}
