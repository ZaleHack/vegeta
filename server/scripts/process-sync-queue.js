import IncrementalSyncService from '../services/IncrementalSyncService.js';
import database from '../config/database.js';

async function run() {
  const service = new IncrementalSyncService();
  const processed = await service.processBatch();
  console.log(`✅ Événements synchronisés: ${processed}`);
}

run()
  .then(async () => {
    await database.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Erreur lors du traitement incrémental:', error);
    try {
      await database.close();
    } catch (_) {}
    process.exit(1);
  });
