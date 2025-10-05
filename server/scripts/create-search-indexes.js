import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import database from '../config/database.js';
import baseCatalog from '../config/tables-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const catalogPath = path.join(__dirname, '../config/tables-catalog.json');

function loadCatalog() {
  let catalog = { ...baseCatalog };

  try {
    if (fs.existsSync(catalogPath)) {
      const raw = fs.readFileSync(catalogPath, 'utf-8');
      const json = JSON.parse(raw);

      for (const [key, value] of Object.entries(json)) {
        const [db, ...tableParts] = key.split('_');

        if (!db || tableParts.length === 0) {
          console.warn(`⚠️ Entrée de catalogue invalide ignorée: ${key}`);
          continue;
        }

        const tableName = `${db}.${tableParts.join('_')}`;
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

async function createIndexes() {
  const catalog = loadCatalog();

  for (const [tableKey, config] of Object.entries(catalog)) {
    const fields = config.searchable || [];
    if (!fields.length) {
      continue;
    }

    const [defaultSchema, defaultTable] = tableKey.split('.');
    const schema = config.database || defaultSchema || 'autres';
    const table = defaultTable || tableKey;

    for (const field of fields) {
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
