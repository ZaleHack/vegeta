import database from '../config/database.js';
import { RealtimeCdrService } from '../services/RealtimeCdrService.js';
import { fileURLToPath } from 'url';
import path from 'path';

function parseArgs(argv = []) {
  const options = {
    reset: false,
    batchSize: null,
    quiet: false
  };

  for (const arg of argv) {
    if (arg === '--reset' || arg === '--recreate') {
      options.reset = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg.startsWith('--batch-size=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.batchSize = value;
      }
    }
  }

  return options;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return 'inconnu';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  if (seconds === 0) {
    return `${minutes} min`;
  }
  return `${minutes} min ${seconds}s`;
}

export async function syncRealtimeCdr(options = {}) {
  const { reset = false, batchSize = null, quiet = false } = options;
  const service = new RealtimeCdrService({ autoStart: false });
  const startedAt = Date.now();

  const result = await service.bootstrapIndex({
    reset,
    batchSize,
    onBatchComplete: quiet
      ? null
      : ({ batch, indexed, lastId }) => {
          const safeIndexed = Number.isFinite(indexed) ? indexed : 0;
          console.log(
            `📦 Lot #${batch}: ${safeIndexed} enregistrements indexés (dernier id ${lastId})`
          );
        }
  });

  const elapsedMs = Date.now() - startedAt;

  if (result.skipped) {
    console.log("ℹ️ Indexation CDR temps réel ignorée (Elasticsearch indisponible).");
  } else if (result.error) {
    const message = result.error?.message || result.error;
    console.error(`❌ Échec indexation CDR temps réel: ${message}`);
  } else {
    console.log(
      `✅ Indexation CDR temps réel terminée: ${result.indexed} documents indexés en ${formatDuration(elapsedMs)} (dernier id ${result.lastId}).`
    );
  }

  return { ...result, elapsedMs };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await syncRealtimeCdr(args);
    if (result.error) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation CDR temps réel:', error);
    process.exitCode = 1;
  } finally {
    try {
      await database.close();
    } catch (closeError) {
      if (closeError) {
        console.error('⚠️ Erreur lors de la fermeture de la base de données:', closeError.message);
      }
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isCli) {
  runCli();
}
