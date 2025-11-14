import DatabaseIndexingService from '../services/DatabaseIndexingService.js';
import database from '../config/database.js';

async function run() {
  const service = new DatabaseIndexingService();
  const summary = await service.ensureIndexes();

  console.log(
    `📊 Indexation terminée: ${summary.indexesCreated} index créés, ${summary.indexesSkipped} index ignorés.`
  );

  if (summary.errors.length > 0) {
    console.log(`⚠️ ${summary.errors.length} erreurs rencontrées lors de la création des index.`);
  }
}

run()
  .catch((error) => {
    console.error('❌ Erreur création index:', error);
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
