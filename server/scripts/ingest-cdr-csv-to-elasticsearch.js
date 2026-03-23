import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import client from '../config/elasticsearch.js';
import cgiBtsEnricher from '../services/CgiBtsEnrichmentService.js';

const INDEX_NAME = process.env.ELASTICSEARCH_CDR_REALTIME_INDEX || 'cdr-realtime-events';
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_BULK_MAX_RETRIES = 4;
const DEFAULT_BULK_RETRY_DELAY_MS = 750;
const DEFAULT_BULK_THROTTLE_MS = 150;
const DEFAULT_BULK_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_INPUT_DIR = process.env.CDR_CSV_INPUT_DIR || '/var/cdr/incoming';
const DEFAULT_PROCESSED_DIR = process.env.CDR_CSV_PROCESSED_DIR || '/var/cdr/processed';
const DEFAULT_FAILED_DIR = process.env.CDR_CSV_FAILED_DIR || '/var/cdr/failed';
const DEFAULT_ELASTICSEARCH_URL = 'http://localhost:9200';
const RAW_PIPE_HEADERS = [
  'id',
  'type_appel',
  'statut_appel',
  'cause_liberation',
  'facturation',
  'date_debut',
  'heure_debut',
  'duree_sec',
  'date_fin',
  'heure_fin',
  'numero_appelant',
  'numero_appele',
  'imsi_appelant',
  'imei_appelant',
  'cgi',
  'route_reseau',
  'device_id',
  'fichier_source'
];

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const waitForAvailableSlot = async (pendingTasks, maxConcurrentTasks) => {
  if (!Number.isFinite(maxConcurrentTasks) || maxConcurrentTasks < 1) {
    return;
  }

  while (pendingTasks.size >= maxConcurrentTasks) {
    await Promise.race(pendingTasks);
  }
};

const wait = async (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};

const toTrimmed = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
};

const normalizeHeaderKey = (value) => toTrimmed(value)
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/_+/g, '_');

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toNullIfEmpty = (value) => {
  const trimmed = toTrimmed(value);
  return trimmed === '' ? null : trimmed;
};

const firstValue = (row, keys) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
};

const normalizeDateTime = (dateValue, timeValue) => {
  const date = toNullIfEmpty(dateValue);
  if (!date) {
    return null;
  }
  const time = toTrimmed(timeValue) || '00:00:00';
  const merged = `${date}T${time}`;
  const parsed = new Date(merged);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeDateField = (value) => {
  const trimmed = toNullIfEmpty(value);
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeRow = (row, sourceFile) => {
  const normalized = {
    id: toTrimmed(firstValue(row, ['id'])),
    seq_number: toTrimmed(firstValue(row, ['seq_number', 'seqNumber'])),
    type_appel: toTrimmed(firstValue(row, ['type_appel', 'typeAppel'])),
    statut_appel: toTrimmed(firstValue(row, ['statut_appel', 'statutAppel'])),
    cause_liberation: toTrimmed(firstValue(row, ['cause_liberation', 'causeLiberation'])),
    facturation: toTrimmed(firstValue(row, ['facturation'])),
    date_debut: normalizeDateField(firstValue(row, ['date_debut', 'dateDebut'])),
    heure_debut: toTrimmed(firstValue(row, ['heure_debut', 'heureDebut'])),
    duree_sec: toTrimmed(firstValue(row, ['duree_sec', 'dureeSec'])),
    date_fin: normalizeDateField(firstValue(row, ['date_fin', 'dateFin'])),
    heure_fin: toTrimmed(firstValue(row, ['heure_fin', 'heureFin'])),
    numero_appelant: toTrimmed(firstValue(row, ['numero_appelant', 'numeroAppelant'])),
    numero_appele: toTrimmed(firstValue(row, ['numero_appele', 'numeroAppele'])),
    imsi_appelant: toTrimmed(firstValue(row, ['imsi_appelant', 'imsiAppelant'])),
    imei_appelant: toTrimmed(firstValue(row, ['imei_appelant', 'imeiAppelant'])),
    cgi: toTrimmed(firstValue(row, ['cgi'])),
    route_reseau: toTrimmed(firstValue(row, ['route_reseau', 'routeReseau'])),
    device_id: toTrimmed(firstValue(row, ['device_id', 'deviceId'])),
    fichier_source: toTrimmed(firstValue(row, ['fichier_source', 'fichierSource'])) || sourceFile,
    inserted_at: normalizeDateField(firstValue(row, ['inserted_at', 'insertedAt']))
  };

  const timestamp = normalizeDateTime(normalized.date_debut, normalized.heure_debut)
    || normalizeDateTime(normalized.date_fin, normalized.heure_fin)
    || normalized.inserted_at
    || new Date().toISOString();

  return {
    ...normalized,
    call_timestamp: timestamp,
    duration_seconds: Number.parseInt(normalized.duree_sec, 10) || 0
  };
};

const buildDocumentId = (record) => {
  const key = [
    record.seq_number,
    record.numero_appelant,
    record.numero_appele,
    record.date_debut,
    record.heure_debut,
    record.fichier_source
  ].join('|');

  if (!key.replace(/\|/g, '').trim()) {
    return crypto.randomUUID();
  }

  return crypto.createHash('sha1').update(key).digest('hex');
};

const detectSeparator = async (filePath) => {
  const fd = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
    const sample = buffer.subarray(0, bytesRead).toString('utf8');
    const firstLine = sample.split(/\r?\n/).find((line) => line.trim()) || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const pipeCount = (firstLine.match(/\|/g) || []).length;
    if (pipeCount > commaCount && pipeCount > semicolonCount) {
      return '|';
    }
    return semicolonCount > commaCount ? ';' : ',';
  } finally {
    await fd.close();
  }
};

const hasHeaderRow = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return false;
  }

  const headerSignals = new Set([
    'id',
    'seq_number',
    'type_appel',
    'date_debut',
    'numero_appelant'
  ]);

  return values.some((value) => headerSignals.has(normalizeHeaderKey(value)));
};

const mapRawPipeValuesToRow = (values) => {
  const row = {};
  RAW_PIPE_HEADERS.forEach((header, index) => {
    row[header] = values[index] ?? '';
  });
  row.seq_number = row.id;
  return row;
};

const parseCsvLine = (line, separator) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '\"') {
      if (inQuotes && next === '\"') {
        current += '\"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => toTrimmed(value));
};

const ensureRealtimeIndex = async () => {
  const exists = await client.indices.exists({ index: INDEX_NAME });
  if (exists) {
    return;
  }

  await client.indices.create({
    index: INDEX_NAME,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        seq_number: { type: 'long' },
        type_appel: { type: 'keyword' },
        statut_appel: { type: 'keyword' },
        cause_liberation: { type: 'keyword' },
        facturation: { type: 'keyword' },
        date_debut: { type: 'date' },
        heure_debut: { type: 'keyword' },
        duree_sec: { type: 'integer' },
        date_fin: { type: 'date' },
        heure_fin: { type: 'keyword' },
        numero_appelant: { type: 'keyword' },
        numero_appele: { type: 'keyword' },
        imsi_appelant: { type: 'keyword' },
        imei_appelant: { type: 'keyword' },
        cgi: { type: 'keyword' },
        route_reseau: { type: 'keyword' },
        device_id: { type: 'keyword' },
        fichier_source: { type: 'keyword' },
        inserted_at: { type: 'date' },
        longitude: { type: 'double' },
        latitude: { type: 'double' },
        azimut: { type: 'keyword' },
        nom_bts: { type: 'keyword' },
        call_timestamp: { type: 'date' },
        duration_seconds: { type: 'integer' },
        location: { type: 'geo_point' }
      }
    }
  });
};

const isElasticsearchConnectionError = (error) => {
  if (!error) {
    return false;
  }

  if (error.name === 'ConnectionError') {
    return true;
  }

  return error?.meta?.statusCode === 0;
};

const getElasticsearchStatusCode = (error) => (
  error?.meta?.statusCode
  || error?.statusCode
  || error?.meta?.body?.status
  || 0
);

const isRecoverableElasticsearchError = (error) => {
  if (!error) {
    return false;
  }

  if (isElasticsearchConnectionError(error)) {
    return true;
  }

  const statusCode = getElasticsearchStatusCode(error);
  return statusCode === 408 || statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504;
};

const getElasticsearchUrl = () => process.env.ELASTICSEARCH_URL || DEFAULT_ELASTICSEARCH_URL;

const verifyElasticsearchConnection = async () => {
  await client.ping();
};

const logElasticsearchConnectionHints = () => {
  const elasticsearchUrl = getElasticsearchUrl();

  console.error('ℹ️ Vérifiez que le service Elasticsearch est démarré et accessible.');
  console.error(`ℹ️ URL Elasticsearch utilisée: ${elasticsearchUrl}`);
  console.error(`ℹ️ Test rapide: curl -fsS ${elasticsearchUrl}`);
  console.error(
    'ℹ️ Si Elasticsearch est sur une autre machine, exportez ELASTICSEARCH_URL avant la commande.'
  );
  console.error(
    'ℹ️ Si vous lancez ce script depuis un conteneur Docker, localhost cible le conteneur lui-même.'
  );
  console.error(
    'ℹ️ Dans ce cas, utilisez l’IP/hostname du serveur Elasticsearch (ex: http://host.docker.internal:9200).'
  );
};

const enrichCoordinates = async (records) => {
  const cgis = records.map((item) => item.cgi).filter(Boolean);
  const lookup = await cgiBtsEnricher.fetchMany(cgis);

  return records.map((record) => {
    const cell = record.cgi ? lookup.get(record.cgi) : null;
    const latitude = toNumberOrNull(record.latitude ?? cell?.latitude);
    const longitude = toNumberOrNull(record.longitude ?? cell?.longitude);
    const azimut = toTrimmed(record.azimut || cell?.azimut);
    const nom_bts = toTrimmed(record.nom_bts || cell?.nom_bts || cell?.nom);

    return {
      ...record,
      latitude,
      longitude,
      azimut,
      nom_bts,
      location: Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { lat: latitude, lon: longitude }
        : undefined
    };
  });
};

const bulkIndexRecords = async (records, options) => {
  if (!records.length) {
    return { indexed: 0 };
  }

  const actions = [];
  for (const record of records) {
    actions.push({ index: { _index: INDEX_NAME, _id: buildDocumentId(record) } });
    actions.push(record);
  }

  let lastError = null;

  for (let attempt = 0; attempt <= options.bulkMaxRetries; attempt += 1) {
    try {
      const response = await client.bulk(
        {
          refresh: false,
          operations: actions
        },
        {
          requestTimeout: options.bulkRequestTimeoutMs
        }
      );

      if (response.errors) {
        const itemWithError = response.items?.find((item) => item.index?.error);
        const firstError = itemWithError?.index?.error;
        const statusCode = itemWithError?.index?.status || 0;
        const error = new Error(`Bulk indexing partiellement échoué: ${firstError?.reason || 'erreur inconnue'}`);
        error.statusCode = statusCode;
        throw error;
      }

      return { indexed: records.length };
    } catch (error) {
      lastError = error;
      const canRetry = attempt < options.bulkMaxRetries && isRecoverableElasticsearchError(error);
      if (!canRetry) {
        throw error;
      }

      const delay = options.bulkRetryDelayMs * (2 ** attempt);
      const statusCode = getElasticsearchStatusCode(error);
      console.warn(
        `⚠️ Elasticsearch saturé/indisponible (status=${statusCode || 'n/a'}) pendant le bulk (${records.length} docs). `
        + `Nouvelle tentative ${attempt + 1}/${options.bulkMaxRetries} dans ${delay}ms.`
      );
      await wait(delay);
    }
  }

  throw lastError;
};

const moveFile = async (source, destinationDir) => {
  await fsp.mkdir(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, path.basename(source));
  await fsp.rename(source, destination);
  return destination;
};

const processCsvFile = async (filePath, options) => {
  const separator = await detectSeparator(filePath);
  const sourceFile = path.basename(filePath);
  let indexedTotal = 0;

  const pendingFlushes = new Set();
  const flushBatch = async (batch) => {
    if (!batch.length) {
      return;
    }
    const enriched = await enrichCoordinates(batch);
    const result = await bulkIndexRecords(enriched, options);
    indexedTotal += result.indexed;
    await wait(options.bulkThrottleMs);
  };

  const scheduleFlush = async (batchToFlush) => {
    await waitForAvailableSlot(pendingFlushes, options.maxConcurrentBulks);
    const task = (async () => {
      await flushBatch(batchToFlush);
    })();
    pendingFlushes.add(task);
    task.finally(() => pendingFlushes.delete(task));
  };

  const batch = [];
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  let rawPipeWithoutHeader = false;

  for await (const rawLine of rl) {
    const line = toTrimmed(rawLine);
    if (!line) {
      continue;
    }

    if (!headers) {
      const firstValues = parseCsvLine(line, separator);
      if (separator === '|' && !hasHeaderRow(firstValues)) {
        rawPipeWithoutHeader = true;
      } else {
        headers = firstValues;
        continue;
      }
    }

    const values = parseCsvLine(line, separator);
    const row = rawPipeWithoutHeader ? mapRawPipeValuesToRow(values) : {};

    if (!rawPipeWithoutHeader) {
      headers.forEach((header, index) => {
        const value = values[index] ?? '';
        row[header] = value;
        const normalizedHeader = normalizeHeaderKey(header);
        if (normalizedHeader && row[normalizedHeader] === undefined) {
          row[normalizedHeader] = value;
        }
      });

      if (!row.seq_number && row.id) {
        row.seq_number = row.id;
      }
    } else if (!row.id && values[0]) {
      row.id = values[0];
      row.seq_number = values[0];
    }

    if (rawPipeWithoutHeader && !row.fichier_source) {
      row.fichier_source = sourceFile;
    }

    if (rawPipeWithoutHeader && values.length <= 1) {
      continue;
    }

    const normalized = normalizeRow(row, sourceFile);
    batch.push(normalized);

    if (batch.length >= options.batchSize) {
      const toFlush = batch.splice(0, batch.length);
      await scheduleFlush(toFlush);
    }
  }

  if (batch.length) {
    await scheduleFlush(batch.splice(0, batch.length));
  }

  if (pendingFlushes.size > 0) {
    await Promise.all(pendingFlushes);
  }

  if (options.deleteOnSuccess) {
    await fsp.unlink(filePath);
    return { indexed: indexedTotal, target: 'deleted' };
  }

  const moved = await moveFile(filePath, options.processedDir);
  return { indexed: indexedTotal, target: moved };
};

const parseArgs = (argv = []) => {
  const options = {
    inputDir: DEFAULT_INPUT_DIR,
    processedDir: DEFAULT_PROCESSED_DIR,
    failedDir: DEFAULT_FAILED_DIR,
    watch: false,
    batchSize: parsePositiveInteger(process.env.CDR_CSV_BULK_SIZE, DEFAULT_BATCH_SIZE),
    bulkMaxRetries: parsePositiveInteger(process.env.CDR_CSV_BULK_MAX_RETRIES, DEFAULT_BULK_MAX_RETRIES),
    bulkRetryDelayMs: parsePositiveInteger(process.env.CDR_CSV_BULK_RETRY_DELAY_MS, DEFAULT_BULK_RETRY_DELAY_MS),
    bulkThrottleMs: parsePositiveInteger(process.env.CDR_CSV_BULK_THROTTLE_MS, DEFAULT_BULK_THROTTLE_MS),
    bulkRequestTimeoutMs: parsePositiveInteger(
      process.env.CDR_CSV_BULK_REQUEST_TIMEOUT_MS,
      DEFAULT_BULK_REQUEST_TIMEOUT_MS
    ),
    maxConcurrentBulks: parsePositiveInteger(process.env.CDR_CSV_BULK_CONCURRENCY, 1),
    deleteOnSuccess: false
  };

  for (const arg of argv) {
    if (arg === '--watch') {
      options.watch = true;
    } else if (arg === '--delete-on-success') {
      options.deleteOnSuccess = true;
    } else if (arg.startsWith('--input-dir=')) {
      options.inputDir = arg.split('=')[1] || options.inputDir;
    } else if (arg.startsWith('--processed-dir=')) {
      options.processedDir = arg.split('=')[1] || options.processedDir;
    } else if (arg.startsWith('--failed-dir=')) {
      options.failedDir = arg.split('=')[1] || options.failedDir;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parsePositiveInteger(arg.split('=')[1], options.batchSize);
    } else if (arg.startsWith('--bulk-max-retries=')) {
      options.bulkMaxRetries = parsePositiveInteger(arg.split('=')[1], options.bulkMaxRetries);
    } else if (arg.startsWith('--bulk-retry-delay-ms=')) {
      options.bulkRetryDelayMs = parsePositiveInteger(arg.split('=')[1], options.bulkRetryDelayMs);
    } else if (arg.startsWith('--bulk-throttle-ms=')) {
      options.bulkThrottleMs = parsePositiveInteger(arg.split('=')[1], options.bulkThrottleMs);
    } else if (arg.startsWith('--bulk-request-timeout-ms=')) {
      options.bulkRequestTimeoutMs = parsePositiveInteger(
        arg.split('=')[1],
        options.bulkRequestTimeoutMs
      );
    } else if (arg.startsWith('--bulk-concurrency=')) {
      options.maxConcurrentBulks = parsePositiveInteger(
        arg.split('=')[1],
        options.maxConcurrentBulks
      );
    }
  }

  return options;
};

const listCsvFiles = async (inputDir) => {
  const entries = await fsp.readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
    .map((entry) => path.join(inputDir, entry.name))
    .sort();
};

const processSingleFile = async (filePath, options) => {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  try {
    const summary = await processCsvFile(filePath, options);
    console.log(`✅ ${path.basename(filePath)} traité: ${summary.indexed} documents indexés (${summary.target}).`);
  } catch (error) {
    console.error(`❌ Échec traitement ${path.basename(filePath)}:`, error.message);
    try {
      const moved = await moveFile(filePath, options.failedDir);
      console.error(`➡️ Fichier déplacé vers ${moved}`);
    } catch (moveError) {
      if (moveError?.code === 'ENOENT') {
        console.warn(`ℹ️ Fichier introuvable après échec, probablement déjà déplacé/supprimé: ${filePath}`);
        return;
      }
      console.error(`⚠️ Impossible de déplacer le fichier en échec: ${moveError.message}`);
    }
  }
};

const run = async () => {
  const options = parseArgs(process.argv.slice(2));
  await verifyElasticsearchConnection();
  await ensureRealtimeIndex();
  await fsp.mkdir(options.inputDir, { recursive: true });

  const files = await listCsvFiles(options.inputDir);
  for (const filePath of files) {
    await processSingleFile(filePath, options);
  }

  if (!options.watch) {
    return;
  }

  console.log(`👀 Watch activé sur ${options.inputDir}`);
  const processingFiles = new Set();
  fs.watch(options.inputDir, async (_eventType, filename) => {
    if (!filename || !filename.toLowerCase().endsWith('.csv')) {
      return;
    }
    const filePath = path.join(options.inputDir, filename);
    if (processingFiles.has(filePath)) {
      return;
    }
    processingFiles.add(filePath);
    try {
      await fsp.access(filePath, fs.constants.F_OK);
      await processSingleFile(filePath, options);
    } catch (_error) {
      // Le fichier peut avoir été déplacé/supprimé entre temps.
    } finally {
      processingFiles.delete(filePath);
    }
  });
};

run().catch((error) => {
  console.error('❌ Erreur ingestion CSV CDR:', error.message || error);

  if (isElasticsearchConnectionError(error)) {
    logElasticsearchConnectionHints();
  }

  process.exit(1);
});
