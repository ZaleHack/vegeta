import SyncService from '../services/SyncService.js';
import database from '../config/database.js';
import { syncRealtimeCdr } from './sync-realtime-cdr.js';

async function run() {
  const service = new SyncService();
  await service.syncAllTables();

  const realtimeResult = await syncRealtimeCdr({ reset: true, quiet: true });
  if (realtimeResult.error) {
    throw realtimeResult.error instanceof Error
      ? realtimeResult.error
      : new Error(String(realtimeResult.error));
  }
}

run()
  .then(async () => {
    try {
      await database.close();
    } catch (error) {
      if (error) {
        console.error('⚠️ Erreur lors de la fermeture de la base de données:', error.message);
      }
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Erreur lors de la synchronisation générale:', err);
    try {
      await database.close();
    } catch (_) {}
    process.exit(1);
  });
