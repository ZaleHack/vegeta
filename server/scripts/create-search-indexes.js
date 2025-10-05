import database from '../config/database.js';
import catalog from '../config/tables-catalog.js';

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
