const DEFAULT_REALTIME_CDR_TABLES = ['autres.cdr_temps_reel', 'autres.cdr_temps_reel_live'];

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

const parseTableList = (value) => {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((entry) => parseTableName(entry))
    .filter(Boolean);
};

const configuredTables = parseTableList(process.env.REALTIME_CDR_TABLES);
const legacyConfiguredTable = parseTableName(process.env.REALTIME_CDR_TABLE);

if (legacyConfiguredTable && configuredTables.length === 0) {
  configuredTables.push(legacyConfiguredTable);
}

if (configuredTables.length === 0) {
  for (const table of DEFAULT_REALTIME_CDR_TABLES) {
    const parsed = parseTableName(table);
    if (parsed) {
      configuredTables.push(parsed);
    }
  }
}

const uniqueTables = [];
const seenTables = new Set();

for (const table of configuredTables) {
  if (seenTables.has(table.normalizedQualified)) {
    continue;
  }
  seenTables.add(table.normalizedQualified);
  uniqueTables.push(table);
}

const [resolvedMetadata] = uniqueTables;

const buildRealtimeTableSql = (tables) => {
  if (!Array.isArray(tables) || tables.length === 0) {
    return '';
  }

  if (tables.length === 1) {
    return tables[0].formatted;
  }

  const selectStatements = tables
    .map((table) => `SELECT * FROM ${table.formatted}`)
    .join('\nUNION ALL\n');

  return `(\n${selectStatements}\n)`;
};

export const REALTIME_CDR_TABLE_METADATA = resolvedMetadata;
export const REALTIME_CDR_TABLES_METADATA = Object.freeze(uniqueTables.map((table) => ({ ...table })));
export const REALTIME_CDR_TABLE_SQL = buildRealtimeTableSql(uniqueTables);
export const REALTIME_CDR_TABLE_RAW = resolvedMetadata.raw;
export const REALTIME_CDR_TABLE_SCHEMA = resolvedMetadata.schema;
export const REALTIME_CDR_TABLE_NAME = resolvedMetadata.table;
export const REALTIME_CDR_TABLE_IDENTIFIERS = new Set(
  uniqueTables.flatMap((table) =>
    [table.normalizedQualified, table.normalizedUnqualified, table.raw?.toLowerCase()].filter(Boolean)
  )
);

export const getRealtimeCdrTableSql = () => REALTIME_CDR_TABLE_SQL;
export const getRealtimeCdrTableMetadata = () => REALTIME_CDR_TABLE_METADATA;
export const getRealtimeCdrTableIdentifiers = () => new Set(REALTIME_CDR_TABLE_IDENTIFIERS);
export const getRealtimeCdrTablesMetadata = () =>
  REALTIME_CDR_TABLES_METADATA.map((table) => ({ ...table }));

export default {
  REALTIME_CDR_TABLE_METADATA,
  REALTIME_CDR_TABLE_SQL,
  REALTIME_CDR_TABLE_RAW,
  REALTIME_CDR_TABLE_SCHEMA,
  REALTIME_CDR_TABLE_NAME
};
