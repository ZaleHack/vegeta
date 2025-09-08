import database from '../config/database.js';
import catalog from '../config/tables-catalog.js';
import logger from '../utils/logger.js';

async function createIndexes() {
  for (const [table, config] of Object.entries(catalog)) {
    const fields = config.searchable || [];
    for (const field of fields) {
      const indexName = `idx_${table.replace(/\./g, '_')}_${field}`;
      try {
        await database.query(
          `CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} (${field})`
        );
        logger.info(`Index ${indexName} créé`);
      } catch (err) {
        logger.info(`Index ${indexName} ignoré: ${err.message}`);
      }
    }
  }
  process.exit(0);
}

createIndexes().catch(err => {
  logger.error('Erreur création index', err);
  process.exit(1);
});

