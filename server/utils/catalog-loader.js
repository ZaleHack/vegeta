import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import database from '../config/database.js';
import baseCatalog from '../config/tables-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const catalogOverridesPath = path.join(
  __dirname,
  '../config/tables-catalog.json'
);

const SYSTEM_DATABASES = new Set([
  'information_schema',
  'mysql',
  'performance_schema',
  'sys'
]);

// Tables qui ne doivent jamais être indexées ou accessibles via la recherche
const EXCLUDED_TABLES = new Set([
  'autres.search_logs',
  'autres.profile_attachments',
  'autres.profile_shares',
  'autres.sanctions',
  'autres.sde_clients',
  'autres.tresor',
  'autres.upload_history',
  'autres.users',
  'autres.user_logs',
  'autres.user_sessions',
  'autres.uvs'
]);

function collectConfiguredDatabases(catalog = {}) {
  const databases = new Set();

  for (const [key, value] of Object.entries(catalog || {})) {
    if (!key) {
      continue;
    }

    const normalizedKey = normalizeKey(key);
    let databaseName =
      typeof value?.database === 'string' ? value.database.trim() : '';

    if (!databaseName && typeof normalizedKey === 'string') {
      if (normalizedKey.includes('.')) {
        databaseName = normalizedKey.split('.')[0];
      } else {
        const [potentialDatabase] = normalizedKey.split('_');
        databaseName = potentialDatabase || '';
      }
    }

    if (databaseName && !SYSTEM_DATABASES.has(databaseName)) {
      databases.add(databaseName);
    }
  }

  return databases;
}

const BASE_CATALOG_DATABASES = collectConfiguredDatabases(baseCatalog);

const TEXT_SEARCH_TYPES = [
  'char',
  'varchar',
  'text',
  'tinytext',
  'mediumtext',
  'longtext',
  'enum',
  'set',
  'json'
];

const NUMERIC_TYPES = [
  'int',
  'integer',
  'smallint',
  'mediumint',
  'bigint',
  'tinyint',
  'decimal',
  'numeric',
  'float',
  'double',
  'real'
];

const DATE_TYPES = ['date', 'datetime', 'timestamp', 'time', 'year'];

function normalizeKey(key) {
  if (!key) {
    return key;
  }
  if (key.includes('.')) {
    return key;
  }
  const [schema, ...tableParts] = key.split('_');
  if (!schema || tableParts.length === 0) {
    return key;
  }
  return `${schema}.${tableParts.join('_')}`;
}

function isSearchableType(dataType = '') {
  const normalized = dataType.toLowerCase();
  if (!normalized) {
    return false;
  }
  if (TEXT_SEARCH_TYPES.some((type) => normalized.includes(type))) {
    return true;
  }
  if (NUMERIC_TYPES.some((type) => normalized.includes(type))) {
    return true;
  }
  if (DATE_TYPES.some((type) => normalized.includes(type))) {
    return true;
  }
  return false;
}

function resolveFilterType(dataType = '') {
  const normalized = dataType.toLowerCase();
  if (!normalized) {
    return null;
  }
  if (NUMERIC_TYPES.some((type) => normalized.includes(type))) {
    return 'number';
  }
  if (DATE_TYPES.some((type) => normalized.includes(type))) {
    return 'date';
  }
  if (normalized.includes('enum') || normalized.includes('set')) {
    return 'enum';
  }
  return 'string';
}

function deduplicateArray(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => (value && typeof value === 'string' ? value.trim() : value))
        .filter((value) => value !== null && value !== undefined && value !== '')
    )
  );
}

function loadOverrides() {
  if (!fs.existsSync(catalogOverridesPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(catalogOverridesPath, 'utf-8');
    const json = JSON.parse(raw);
    const overrides = {};

    for (const [key, value] of Object.entries(json)) {
      const normalizedKey = normalizeKey(key);
      overrides[normalizedKey] = value;
    }

    return overrides;
  } catch (error) {
    console.error('❌ Impossible de lire le fichier tables-catalog.json:', error);
    return {};
  }
}

async function introspectDatabaseCatalog(overrides = {}) {
  try {
    await database.ensureInitialized();
  } catch (error) {
    console.warn(
      '⚠️ Impossible de vérifier la structure des bases de données (initialisation échouée):',
      error.message
    );
    return {};
  }

  const overrideDatabases = collectConfiguredDatabases(overrides);
  const allowedDatabaseSet = new Set([
    ...BASE_CATALOG_DATABASES,
    ...overrideDatabases
  ]);

  for (const databaseName of Array.from(allowedDatabaseSet)) {
    if (SYSTEM_DATABASES.has(databaseName)) {
      allowedDatabaseSet.delete(databaseName);
    }
  }

  const allowedDatabases = Array.from(allowedDatabaseSet);

  if (allowedDatabases.length === 0) {
    console.warn(
      "⚠️ Aucun schéma défini dans tables-catalog.js ou tables-catalog.json; l'introspection sera effectuée sans filtre explicite"
    );
  }

  let rows = [];
  try {
    const parameters = [];
    let query = `
        SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
        FROM information_schema.COLUMNS
        WHERE 1 = 1
      `;

    if (allowedDatabases.length > 0) {
      query += ` AND TABLE_SCHEMA IN (${allowedDatabases
        .map(() => '?')
        .join(', ')})`;
      parameters.push(...allowedDatabases);
    }

    const systemDatabases = Array.from(SYSTEM_DATABASES);
    if (systemDatabases.length > 0) {
      query += ` AND TABLE_SCHEMA NOT IN (${systemDatabases
        .map(() => '?')
        .join(', ')})`;
      parameters.push(...systemDatabases);
    }

    query += ' ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION';

    rows = await database.query(query, parameters);
  } catch (error) {
    console.warn('⚠️ Impossible de récupérer les métadonnées des tables:', error.message);
    return {};
  }

  const tables = new Map();

  for (const row of rows) {
    const schema = row.TABLE_SCHEMA;
    const table = row.TABLE_NAME;
    if (!schema || !table) {
      continue;
    }
    if (allowedDatabases.length > 0 && !allowedDatabaseSet.has(schema)) {
      continue;
    }
    const key = `${schema}.${table}`;
    if (EXCLUDED_TABLES.has(key)) {
      continue;
    }
    if (!tables.has(key)) {
      tables.set(key, []);
    }
    tables.get(key).push({
      name: row.COLUMN_NAME,
      dataType: row.DATA_TYPE
    });
  }

  const catalog = {};

  for (const [key, columns] of tables.entries()) {
    if (!Array.isArray(columns) || columns.length === 0) {
      continue;
    }

    const searchable = deduplicateArray(
      columns
        .filter((column) => isSearchableType(column.dataType))
        .map((column) => column.name)
    );

    if (searchable.length === 0) {
      continue;
    }

    const filters = {};
    for (const column of columns) {
      const filterType = resolveFilterType(column.dataType);
      if (filterType) {
        filters[column.name] = filterType;
      }
    }

    const [schema, table] = key.split('.');
    catalog[key] = {
      display: table,
      database: schema,
      searchable,
      preview: searchable.slice(0, Math.min(4, searchable.length)),
      filters,
      linkedFields: [],
      theme: 'general'
    };
  }

  return catalog;
}

function mergeCatalogs(base = {}, overrides = {}) {
  const merged = { ...base };

  for (const [key, overrideValue] of Object.entries(overrides)) {
    const normalizedKey = normalizeKey(key);
    if (EXCLUDED_TABLES.has(normalizedKey)) {
      continue;
    }
    const existing = merged[normalizedKey] || {};
    merged[normalizedKey] = {
      ...existing,
      ...overrideValue,
      database:
        overrideValue.database || existing.database || normalizedKey.split('.')[0] || 'autres'
    };
  }

  return merged;
}

function finalizeCatalogEntry(key, value, fallback = {}) {
  const combined = { ...fallback, ...value };

  const entry = {
    ...combined,
    display: combined.display || key.split('.').pop(),
    database: combined.database || key.split('.')[0] || 'autres',
    searchable: deduplicateArray(
      value.searchable?.length ? value.searchable : fallback.searchable || combined.searchable
    ),
    preview: deduplicateArray(
      value.preview?.length
        ? value.preview
        : fallback.preview || value.searchable || combined.searchable || []
    ),
    filters: { ...(fallback.filters || {}), ...(value.filters || {}) },
    linkedFields: deduplicateArray([
      ...(fallback.linkedFields || []),
      ...(value.linkedFields || [])
    ]),
    theme: combined.theme || 'general'
  };

  if (!entry.searchable || entry.searchable.length === 0) {
    entry.searchable = deduplicateArray(entry.preview || fallback.searchable || []);
  }

  if (!entry.preview || entry.preview.length === 0) {
    entry.preview = deduplicateArray(entry.searchable.slice(0, 4));
  }

  return entry;
}

export async function buildCatalog() {
  const overrides = loadOverrides();
  let dynamicCatalog = {};

  try {
    dynamicCatalog = await introspectDatabaseCatalog(overrides);
  } catch (error) {
    console.warn('⚠️ Impossible d\'introspecter le catalogue des tables:', error.message);
    dynamicCatalog = {};
  }

  const mergedBase = mergeCatalogs(dynamicCatalog, baseCatalog);
  const catalogWithOverrides = mergeCatalogs(mergedBase, overrides);

  const finalCatalog = {};

  for (const [key, value] of Object.entries(catalogWithOverrides)) {
    const normalizedKey = normalizeKey(key);
    if (EXCLUDED_TABLES.has(normalizedKey)) {
      continue;
    }
    const fallback = dynamicCatalog[normalizedKey] || {};
    const entry = finalizeCatalogEntry(normalizedKey, value, fallback);

    if (!entry.searchable || entry.searchable.length === 0) {
      continue;
    }

    finalCatalog[normalizedKey] = entry;
  }

  return finalCatalog;
}
