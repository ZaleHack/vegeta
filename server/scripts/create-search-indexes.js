import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import database from '../config/database.js';
import baseCatalog from '../config/tables-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const catalogPath = path.join(__dirname, '../config/tables-catalog.json');

const TABLE_EXCLUSIONS = [
  'blacklist',
  'divisions',
  'profiles',
  'profile_attachments',
  'profile_shares',
  'structuresanctions',
  'search_sync_events',
  'upload_history',
  'users',
  'users_log',
  'user_sessions',
  'search_logs',
  'cdr_temps_reel'
].reduce((set, entry) => {
  const normalized = entry.toLowerCase();
  set.add(normalized);
  set.add(`autres.${normalized}`);
  return set;
}, new Set());

const TEXT_TYPES = new Set(['text', 'mediumtext', 'longtext', 'tinytext']);
const BLOB_TYPES = new Set(['blob', 'mediumblob', 'longblob', 'tinyblob']);
const UNSUPPORTED_TYPES = new Set(['json']);

function loadCatalog() {
  let catalog = { ...baseCatalog };

  try {
    if (fs.existsSync(catalogPath)) {
      const raw = fs.readFileSync(catalogPath, 'utf-8');
      const json = JSON.parse(raw);

      for (const [key, value] of Object.entries(json)) {
        let db;
        let tableKey;

        if (key.includes('.')) {
          const [schema, ...tableParts] = key.split('.');
          if (!schema || tableParts.length === 0) {
            console.warn(`⚠️ Entrée de catalogue invalide ignorée: ${key}`);
            continue;
          }

          db = schema;
          tableKey = tableParts.join('.');
        } else {
          const [schema, ...tableParts] = key.split('_');
          if (!schema || tableParts.length === 0) {
            console.warn(`⚠️ Entrée de catalogue invalide ignorée: ${key}`);
            continue;
          }

          db = schema;
          tableKey = tableParts.join('_');
        }

        const tableName = `${db}.${tableKey}`;
        const existing = catalog[tableName] || {};
        const merged = { ...existing, ...value };

        if (!merged.database) {
          merged.database = db;
        }

        catalog[tableName] = merged;
      }
    }
  } catch (error) {
    console.error('❌ Erreur chargement catalogue:', error);
  }

  return catalog;
}

function sanitizeIdentifier(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

async function indexExists(schema, table, indexName) {
  const existingIndex = await database.queryOne(
    `
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [schema, table, indexName]
  );

  return Boolean(existingIndex);
}

async function columnExists(schema, table, columnName) {
  const existingColumn = await database.queryOne(
    `
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [schema, table, columnName]
  );

  return Boolean(existingColumn);
}

async function getTableColumns(schema, table) {
  const columns = await database.query(
    `
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
    [schema, table]
  );

  return columns.map((column) => ({
    name: column.column_name,
    dataType: column.data_type,
    maxLength: column.character_maximum_length
  }));
}

async function isColumnIndexed(schema, table, columnName) {
  const existing = await database.queryOne(
    `
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [schema, table, columnName]
  );

  return Boolean(existing);
}

function isTableExcluded(schema, table) {
  const normalizedSchema = (schema || '').toLowerCase();
  const normalizedTable = (table || '').toLowerCase();
  const fullName = `${normalizedSchema}.${normalizedTable}`;

  return TABLE_EXCLUSIONS.has(normalizedTable) || TABLE_EXCLUSIONS.has(fullName);
}

function getColumnIndexExpression(column) {
  const type = column.dataType?.toLowerCase();

  if (UNSUPPORTED_TYPES.has(type)) {
    return null;
  }

  if (TEXT_TYPES.has(type) || BLOB_TYPES.has(type)) {
    const length = column.maxLength && Number.isFinite(Number(column.maxLength))
      ? Math.min(Number(column.maxLength), 255)
      : 255;
    return `\`${column.name}\`(${length})`;
  }

  return `\`${column.name}\``;
}

async function createIndexes() {
  const catalog = loadCatalog();

  for (const [tableKey, config] of Object.entries(catalog)) {
    const [defaultSchema, defaultTable] = tableKey.split('.');
    const schema = config.database || defaultSchema || 'autres';
    const table = defaultTable || tableKey;

    if (isTableExcluded(schema, table)) {
      console.log(`ℹ️ Table ${schema}.${table} ignorée (liste d'exclusion)`);
      continue;
    }

    let columns = [];

    try {
      columns = await getTableColumns(schema, table);
    } catch (error) {
      console.log(`❌ Impossible de récupérer les colonnes pour ${schema}.${table}: ${error.message}`);
      continue;
    }

    if (!columns.length) {
      console.log(`ℹ️ Aucune colonne détectée pour ${schema}.${table}, aucun index créé`);
      continue;
    }

    for (const column of columns) {
      const indexExpression = getColumnIndexExpression(column);

      if (!indexExpression) {
        console.log(`⚠️ Colonne ${column.name} (${column.dataType}) ignorée pour ${schema}.${table} (type non pris en charge)`);
        continue;
      }

      const indexName = `idx_${sanitizeIdentifier(schema)}_${sanitizeIdentifier(table)}_${sanitizeIdentifier(column.name)}`.slice(0, 63);

      try {
        const hasColumn = await columnExists(schema, table, column.name);
        if (!hasColumn) {
          console.log(
            `⚠️ Colonne ${column.name} introuvable dans ${schema}.${table}, index ${indexName} ignoré`
          );
          continue;
        }

        const alreadyIndexed = await isColumnIndexed(schema, table, column.name);
        if (alreadyIndexed) {
          console.log(`ℹ️ Colonne ${column.name} déjà indexée dans ${schema}.${table}`);
          continue;
        }

        const exists = await indexExists(schema, table, indexName);
        if (exists) {
          console.log(`ℹ️ Index ${indexName} déjà présent`);
          continue;
        }

        await database.query(
          `CREATE INDEX \`${indexName}\` ON \`${schema}\`.\`${table}\` (${indexExpression})`
        );
        console.log(`✅ Index ${indexName} créé`);
      } catch (err) {
        console.log(`❌ Échec création index ${indexName}: ${err.message}`);
      }
    }
  }

  process.exit(0);
}

createIndexes().catch((err) => {
  console.error('❌ Erreur création index:', err);
  process.exit(1);
});
