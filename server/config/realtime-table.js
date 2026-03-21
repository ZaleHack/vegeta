const DEFAULT_REALTIME_CDR_TABLES = ['autres.cdr_realtime'];

const EMPTY_REALTIME_CDR_TABLE_METADATA = {
  raw: null,
  schema: null,
  table: null,
  formatted: null,
  normalizedQualified: null,
  normalizedUnqualified: null
};

const quoteIdentifier = (segment) => `\`${segment.replace(/`/g, '``')}\``;

const normalizeInput = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/`/g, '').trim();
};

const parseTableName = (value) => {
  const sanitized = normalizeInput(value);
  if (!sanitized) {
    return null;
  }

  const parts = sanitized
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return null;
  }

  let schema = null;
  let table = null;

  if (parts.length === 1) {
    [table] = parts;
  } else {
    [schema] = parts;
    table = parts.slice(1).join('.');
  }

  if (!table) {
    return null;
  }

  const raw = schema ? `${schema}.${table}` : table;
  const formatted = [schema, table]
    .filter((segment) => segment !== null)
    .map((segment) => quoteIdentifier(segment))
    .join('.');

  const normalizedQualified = raw.toLowerCase();
  const normalizedUnqualified = table.toLowerCase();

  return {
    raw,
    schema,
    table,
    formatted,
    normalizedQualified,
    normalizedUnqualified
  };
};

const parseRealtimeTables = () => {
  const candidates = [];

  if (typeof process.env.REALTIME_CDR_TABLES === 'string' && process.env.REALTIME_CDR_TABLES.trim()) {
    candidates.push(
      ...process.env.REALTIME_CDR_TABLES.split(',').map((entry) => entry.trim())
    );
  }

  if (typeof process.env.REALTIME_CDR_TABLE === 'string' && process.env.REALTIME_CDR_TABLE.trim()) {
    candidates.push(process.env.REALTIME_CDR_TABLE.trim());
  }

  if (candidates.length === 0) {
    candidates.push(...DEFAULT_REALTIME_CDR_TABLES);
  }

  const parsedTables = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const parsed = parseTableName(candidate);
    if (!parsed) {
      continue;
    }

    const dedupeKey = parsed.raw.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    parsedTables.push(parsed);
  }

  return parsedTables;
};

const resolvedTables = parseRealtimeTables();
const resolvedMetadata = resolvedTables[0] || EMPTY_REALTIME_CDR_TABLE_METADATA;

export const REALTIME_CDR_TABLE_METADATA = resolvedMetadata;
export const REALTIME_CDR_TABLE_SQL = resolvedMetadata.formatted;
export const REALTIME_CDR_TABLE_RAW = resolvedMetadata.raw;
export const REALTIME_CDR_TABLE_SCHEMA = resolvedMetadata.schema;
export const REALTIME_CDR_TABLE_NAME = resolvedMetadata.table;
export const REALTIME_CDR_TABLES_METADATA = resolvedTables;
export const REALTIME_CDR_TABLES_SQL = resolvedTables.map((table) => table.formatted);
export const REALTIME_CDR_TABLES_RAW = resolvedTables.map((table) => table.raw);
export const REALTIME_CDR_TABLE_IDENTIFIERS = new Set(
  resolvedTables
    .flatMap((table) => [table.normalizedQualified, table.normalizedUnqualified, table.raw?.toLowerCase()])
    .filter(Boolean)
);

export const getRealtimeCdrTableSql = () => REALTIME_CDR_TABLE_SQL;
export const getRealtimeCdrTableMetadata = () => REALTIME_CDR_TABLE_METADATA;
export const getRealtimeCdrTableIdentifiers = () => new Set(REALTIME_CDR_TABLE_IDENTIFIERS);
export const getRealtimeCdrTablesMetadata = () => [...REALTIME_CDR_TABLES_METADATA];
export const getRealtimeCdrTablesSql = () => [...REALTIME_CDR_TABLES_SQL];

export default {
  REALTIME_CDR_TABLE_METADATA,
  REALTIME_CDR_TABLE_SQL,
  REALTIME_CDR_TABLE_RAW,
  REALTIME_CDR_TABLE_SCHEMA,
  REALTIME_CDR_TABLE_NAME,
  REALTIME_CDR_TABLES_METADATA,
  REALTIME_CDR_TABLES_SQL,
  REALTIME_CDR_TABLES_RAW
};
