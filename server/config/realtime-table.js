const DEFAULT_REALTIME_CDR_TABLE = 'autres.cdr_temps_reel';

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

const resolvedMetadata =
  parseTableName(process.env.REALTIME_CDR_TABLE) ||
  parseTableName(DEFAULT_REALTIME_CDR_TABLE);

export const REALTIME_CDR_TABLE_METADATA = resolvedMetadata;
export const REALTIME_CDR_TABLE_SQL = resolvedMetadata.formatted;
export const REALTIME_CDR_TABLE_RAW = resolvedMetadata.raw;
export const REALTIME_CDR_TABLE_SCHEMA = resolvedMetadata.schema;
export const REALTIME_CDR_TABLE_NAME = resolvedMetadata.table;
export const REALTIME_CDR_TABLE_IDENTIFIERS = new Set(
  [
    resolvedMetadata.normalizedQualified,
    resolvedMetadata.normalizedUnqualified,
    resolvedMetadata.raw?.toLowerCase()
  ].filter(Boolean)
);

export const getRealtimeCdrTableSql = () => REALTIME_CDR_TABLE_SQL;
export const getRealtimeCdrTableMetadata = () => REALTIME_CDR_TABLE_METADATA;
export const getRealtimeCdrTableIdentifiers = () => new Set(REALTIME_CDR_TABLE_IDENTIFIERS);

export default {
  REALTIME_CDR_TABLE_METADATA,
  REALTIME_CDR_TABLE_SQL,
  REALTIME_CDR_TABLE_RAW,
  REALTIME_CDR_TABLE_SCHEMA,
  REALTIME_CDR_TABLE_NAME
};
