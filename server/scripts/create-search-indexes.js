import database from '../config/database.js';
import { buildCatalog, isSearchEnabled } from '../utils/catalog-loader.js';

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

const tableColumnsCache = new Map();

async function getTableColumns(schema, table) {
  const cacheKey = `${schema}.${table}`;
  if (tableColumnsCache.has(cacheKey)) {
    return tableColumnsCache.get(cacheKey);
  }

  try {
    const rows = await database.query(
      `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
      `,
      [schema, table]
    );

    const columns = rows.map((row) => row.COLUMN_NAME);
    tableColumnsCache.set(cacheKey, columns);
    return columns;
  } catch (error) {
    console.warn(
      `⚠️ Impossible de récupérer les colonnes pour ${schema}.${table}: ${error.message}`
    );
    tableColumnsCache.set(cacheKey, []);
    return [];
  }
}

async function createIndexes() {
  const catalog = await buildCatalog();

  for (const [tableKey, config] of Object.entries(catalog)) {
    if (!isSearchEnabled(config)) {
      continue;
    }

    const fields = config.searchable || [];
    if (!fields.length) {
      continue;
    }

    const [defaultSchema, defaultTable] = tableKey.split('.');
    const schema = config.database || defaultSchema || 'autres';
    const table = defaultTable || tableKey;

    const columns = await getTableColumns(schema, table);
    if (!columns.length) {
      console.log(`⚠️ Table ${schema}.${table} introuvable - indexation ignorée`);
      continue;
    }

    for (const field of fields) {
      if (!columns.includes(field)) {
        console.log(
          `⚠️ Colonne ${schema}.${table}.${field} introuvable - indexation ignorée`
        );
        continue;
      }

      const indexName = `idx_${sanitizeIdentifier(schema)}_${sanitizeIdentifier(table)}_${sanitizeIdentifier(field)}`.slice(0, 63);

      try {
        const exists = await indexExists(schema, table, indexName);
        if (exists) {
          console.log(`ℹ️ Index ${indexName} déjà présent`);
          continue;
        }

        await database.query(
          `CREATE INDEX \`${indexName}\` ON \`${schema}\`.\`${table}\` (\`${field}\`)`
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
