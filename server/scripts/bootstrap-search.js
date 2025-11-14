import DatabaseIndexingService from '../services/DatabaseIndexingService.js';
import SyncService from '../services/SyncService.js';
import database from '../config/database.js';
import { syncRealtimeCdr } from './sync-realtime-cdr.js';

async function bootstrapSearch() {
  const indexService = new DatabaseIndexingService();
  const indexSummary = await indexService.ensureIndexes();

  console.log(
    `🗂️ Indexation SQL: ${indexSummary.indexesCreated} créés, ${indexSummary.indexesSkipped} ignorés, ${indexSummary.errors.length} erreurs.`
  );

  if (indexSummary.errors.length > 0) {
    for (const { table, column, index, error } of indexSummary.errors) {
      const details = [table, column, index].filter(Boolean).join(' · ');
      const message = error?.message || String(error);
      console.error(`  • ${details}: ${message}`);
    }
  }

  const syncService = new SyncService();
  await syncService.syncAllTables();

  const realtimeResult = await syncRealtimeCdr({ reset: true, quiet: true });
  if (realtimeResult.error) {
    throw realtimeResult.error instanceof Error
      ? realtimeResult.error
      : new Error(String(realtimeResult.error));
  }

  return {
    indexSummary,
    realtime: realtimeResult
  };
}

bootstrapSearch()
  .then(async (result) => {
    console.log(
      `✅ Recherche initialisée. ${result.indexSummary.tablesProcessed} tables inspectées, ${result.realtime.indexed ?? 0} CDR temps réel indexés.`
    );
  })
  .catch((error) => {
    console.error('❌ Erreur lors de la préparation de la recherche unifiée:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await database.close();
    } catch (closeError) {
      if (closeError) {
        console.error('⚠️ Erreur lors de la fermeture de la base de données:', closeError.message);
      }
    }

    const exitCode = Number.isInteger(process.exitCode) ? process.exitCode : 0;
    process.exit(exitCode);
  });
