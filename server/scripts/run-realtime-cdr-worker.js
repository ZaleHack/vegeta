import database from '../config/database.js';
import { RealtimeCdrService } from '../services/RealtimeCdrService.js';

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const parseArgs = (argv = []) => {
  const options = {
    bootstrap: false,
    reset: false,
    batchSize: null,
    heartbeatMs: 30000
  };

  for (const arg of argv) {
    if (arg === '--bootstrap') {
      options.bootstrap = true;
    } else if (arg === '--reset') {
      options.reset = true;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parsePositiveInteger(arg.split('=')[1], null);
    } else if (arg.startsWith('--heartbeat-ms=')) {
      options.heartbeatMs = parsePositiveInteger(arg.split('=')[1], 30000);
    }
  }

  return options;
};

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const service = new RealtimeCdrService({ autoStart: true });

  if (options.bootstrap) {
    const result = await service.bootstrapIndex({
      reset: options.reset,
      batchSize: options.batchSize,
      onBatchComplete: ({ batch, indexed, lastId }) => {
        console.log(`📦 Bootstrap lot #${batch}: ${indexed} indexés (dernier id ${lastId})`);
      }
    });

    if (result.error) {
      throw result.error instanceof Error ? result.error : new Error(String(result.error));
    }

    console.log(`✅ Bootstrap terminé (${result.indexed ?? 0} documents indexés).`);
  }

  console.log('🚀 Worker CDR temps réel démarré (indexation continue vers Elasticsearch).');

  const heartbeat = setInterval(() => {
    const state = {
      elasticEnabled: service.elasticEnabled,
      indexReady: service.indexReady,
      lastIndexedId: service.lastIndexedId,
      batchSize: service.batchSize,
      pollInterval: service.pollInterval
    };
    console.log(`💓 Worker actif: ${JSON.stringify(state)}`);
  }, options.heartbeatMs);

  const shutdown = async (signal) => {
    console.log(`🛑 Arrêt demandé (${signal}). Fermeture en cours...`);
    clearInterval(heartbeat);
    try {
      await database.close();
    } catch (error) {
      console.error('⚠️ Erreur fermeture base:', error.message);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

run().catch(async (error) => {
  console.error('❌ Erreur worker CDR temps réel:', error);
  try {
    await database.close();
  } catch (_error) {
    // ignore
  }
  process.exit(1);
});
