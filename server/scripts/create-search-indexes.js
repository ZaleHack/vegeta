import database from '../config/database.js';
import catalog from '../config/tables-catalog.js';

async function createIndexes() {
  for (const [table, config] of Object.entries(catalog)) {
    const fields = config.searchable || [];
    for (const field of fields) {
      const indexName = `idx_${table.replace(/\./g, '_')}_${field}`;
      try {
        await database.query(`CREATE INDEX ${indexName} ON ${table} (${field})`);
        console.log(`✅ Index ${indexName} créé`);
      } catch (err) {
        console.log(`ℹ️ Index ${indexName} ignoré: ${err.message}`);
      }
    }
  }
  process.exit(0);
}

createIndexes().catch(err => {
  console.error('❌ Erreur création index:', err);
  process.exit(1);
});
