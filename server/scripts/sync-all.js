import logger from '../utils/logger.js';
import SyncService from '../services/SyncService.js';
async function run() {
  const service = new SyncService();
  await service.syncAllTables();
  process.exit(0);
}

run().catch(err => {
  logger.error('Erreur lors de la synchronisation générale:', err);
  process.exit(1);
});

