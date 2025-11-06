import database from '../config/database.js';
import { RealtimeCdrService } from '../services/RealtimeCdrService.js';
import { fileURLToPath } from 'url';
import path from 'path';

function parseArgs(argv = []) {
  const options = {
    batchSize: null,
    limit: null,
    dryRun: false,
    quiet: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg.startsWith('--batch-size=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.batchSize = Math.floor(value);
      }
    } else if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1]);
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.floor(value);
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

export async function enrichRealtimeCdr(options = {}) {
  const { quiet = false, ...serviceOptions } = options;
  const service = new RealtimeCdrService({ autoStart: false });
  const startedAt = Date.now();

  const result = await service.enrichMissingCoordinates({
    ...serviceOptions,
    onBatchComplete: quiet
      ? null
      : ({ batch, fetched, candidates, updated, lastId }) => {
          const safeFetched = Number.isFinite(fetched) ? fetched : 0;
          const safeCandidates = Number.isFinite(candidates) ? candidates : 0;
          const safeUpdated = Number.isFinite(updated) ? updated : 0;
          const safeLastId = Number.isFinite(lastId) ? lastId : 'inconnu';
          console.log(
            `📦 Lot #${batch}: ${safeUpdated}/${safeCandidates} lignes mises à jour (sur ${safeFetched} examinées, dernier id ${safeLastId})`
          );
        }
  });

  const elapsedMs = Date.now() - startedAt;

  if (!quiet) {
    if (result.dryRun) {
      console.log(
        `ℹ️ Mode simulation : ${result.updated} lignes seraient mises à jour (analysées ${result.scanned}) en ${formatDuration(elapsedMs)}.`
      );
    } else {
      console.log(
        `✅ Enrichissement terminé : ${result.updated} lignes mises à jour (analysées ${result.scanned}) en ${formatDuration(elapsedMs)}.`
      );
    }
  }

  return { ...result, elapsedMs };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));

  try {
    const result = await enrichRealtimeCdr(args);
    if (result.dryRun) {
      process.exitCode = 0;
    }
  } catch (error) {
    console.error('❌ Erreur lors de l\'enrichissement des CDR temps réel:', error);
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
