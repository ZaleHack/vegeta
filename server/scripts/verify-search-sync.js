import client from '../config/elasticsearch.js';
import database from '../config/database.js';
import { loadCatalog } from '../utils/catalog.js';
import SyncService from '../services/SyncService.js';

async function verify() {
  const catalog = loadCatalog();
  const syncService = new SyncService();
  const report = [];
  let hasMismatch = false;

  for (const [tableName, config] of Object.entries(catalog)) {
    const syncConfig = config?.sync || {};
    if (syncConfig.disabled || syncConfig.enabled === false) {
      continue;
    }

    const indexName = syncConfig.elasticsearchIndex || syncService.defaultIndex;
    const qualifiedName = syncService.formatTableName(tableName);
    const dbCountRow = await database.queryOne(
      `SELECT COUNT(*) AS total FROM ${qualifiedName}`
    );
    const dbCount = Number(dbCountRow?.total || 0);

    let esCount = 0;
    try {
      const response = await client.count({
        index: indexName,
        query: {
          term: {
            table_name: tableName
          }
        }
      });
      esCount = Number(response.count || 0);
    } catch (error) {
      console.error(`⚠️ Impossible de compter les documents pour ${tableName}:`, error.message);
      hasMismatch = true;
      continue;
    }

    const delta = dbCount - esCount;
    if (delta !== 0) {
      hasMismatch = true;
    }

    report.push({ tableName, indexName, dbCount, esCount, delta });
  }

  report.forEach((entry) => {
    const status = entry.delta === 0 ? '✅' : '❌';
    console.log(
      `${status} ${entry.tableName} -> MySQL=${entry.dbCount} / Elasticsearch=${entry.esCount} (Δ=${entry.delta})`
    );
  });

  if (hasMismatch) {
    throw new Error('Des divergences ont été détectées entre MySQL et Elasticsearch.');
  }
}

verify()
  .then(async () => {
    await database.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Vérification synchronisation échouée:', error.message);
    try {
      await database.close();
    } catch (_) {}
    process.exit(1);
  });
