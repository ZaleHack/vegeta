import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import client from '../config/elasticsearch.js';
import cgiBtsEnricher from '../services/CgiBtsEnrichmentService.js';

const INDEX_NAME = process.env.ELASTICSEARCH_CDR_REALTIME_INDEX || 'cdr-realtime-events';
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_INPUT_DIR = process.env.CDR_CSV_INPUT_DIR || '/var/cdr/incoming';
const DEFAULT_PROCESSED_DIR = process.env.CDR_CSV_PROCESSED_DIR || '/var/cdr/processed';
const DEFAULT_FAILED_DIR = process.env.CDR_CSV_FAILED_DIR || '/var/cdr/failed';

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const toTrimmed = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
};

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const sanitizeNumber = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value).trim();
  if (!text) {
    return '';
  }
  text = text.replace(/\s+/g, '');
  if (text.startsWith('+')) {
    text = text.slice(1);
  }
  while (text.startsWith('00')) {
    text = text.slice(2);
  }
  return text.replace(/[^0-9]/g, '');
};

const normalizePhoneNumber = (value) => {
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return '';
  }
  if (sanitized.length === 8) {
    return `216${sanitized}`;
  }
  if (sanitized.length === 11 && sanitized.startsWith('216')) {
    return sanitized;
  }
  return sanitized;
};

const buildIdentifierVariants = (value) => {
  const variants = new Set();
  const trimmed = toTrimmed(value);
  if (!trimmed) {
    return variants;
  }

  variants.add(trimmed);
  const sanitized = sanitizeNumber(trimmed);
  if (sanitized) {
    variants.add(sanitized);
  }
  const normalized = normalizePhoneNumber(trimmed);
  if (normalized) {
    variants.add(normalized);
  }
  return variants;
};

const normalizeDateInput = (value) => {
  const trimmed = toTrimmed(value);
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/');
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
};

const normalizeTimeBound = (value) => {
  const trimmed = toTrimmed(value);
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const [hours, minutes, secondsRaw = '00'] = parts;
  const hh = Number(hours);
  const mm = Number(minutes);
  const ss = Number(secondsRaw);
  if (![hh, mm, ss].every((n) => Number.isFinite(n))) {
    return null;
  }

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const buildCallTimestampValue = (dateValue, timeValue) => {
  if (!dateValue) {
    return null;
  }
  const safeTime = timeValue || '00:00:00';
  const parsed = new Date(`${dateValue}T${safeTime}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const timeToSeconds = (value) => {
  if (!value) {
    return null;
  }
  const [hours, minutes, seconds] = value.split(':').map((part) => Number(part));
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) {
    return null;
  }
  return (hours * 3600) + (minutes * 60) + seconds;
};

const parseDurationSeconds = (value) => {
  const text = toTrimmed(value);
  if (!text) {
    return 0;
  }

  if (/^\d+$/.test(text)) {
    return Number.parseInt(text, 10) || 0;
  }

  const parsedTime = normalizeTimeBound(text);
  return timeToSeconds(parsedTime) || 0;
};

const resolveEventType = (value) => {
  const text = toTrimmed(value).toLowerCase();
  if (!text) {
    return 'call';
  }
  if (text.includes('ussd')) {
    return 'ussd';
  }
  if (text.includes('sms')) {
    return 'sms';
  }
  if (text.includes('data') || text.includes('gprs') || text.includes('web')) {
    return 'web';
  }
  if (text.includes('position')) {
    return 'position';
  }
  return 'call';
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
  const date = toTrimmed(dateValue);
  if (!date) {
    return null;
  }
  const time = toTrimmed(timeValue) || '00:00:00';
  const merged = `${date}T${time}`;
  const parsed = new Date(merged);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeDateTimeInput = (value) => {
  const trimmed = toTrimmed(value);
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeRow = (row, sourceFile) => {
  const base = {
    id: toTrimmed(firstValue(row, ['id'])),
    seq_number: toTrimmed(firstValue(row, ['seq_number', 'seqNumber'])),
    type_appel: toTrimmed(firstValue(row, ['type_appel', 'typeAppel'])),
    statut_appel: toTrimmed(firstValue(row, ['statut_appel', 'statutAppel'])),
    cause_liberation: toTrimmed(firstValue(row, ['cause_liberation', 'causeLiberation'])),
    facturation: toTrimmed(firstValue(row, ['facturation'])),
    date_debut: toTrimmed(firstValue(row, ['date_debut', 'dateDebut'])),
    heure_debut: toTrimmed(firstValue(row, ['heure_debut', 'heureDebut'])),
    duree_sec: toTrimmed(firstValue(row, ['duree_sec', 'dureeSec'])),
    date_fin: toTrimmed(firstValue(row, ['date_fin', 'dateFin'])),
    heure_fin: toTrimmed(firstValue(row, ['heure_fin', 'heureFin'])),
    numero_appelant: toTrimmed(firstValue(row, ['numero_appelant', 'numeroAppelant'])),
    numero_appele: toTrimmed(firstValue(row, ['numero_appele', 'numeroAppele'])),
    imsi_appelant: toTrimmed(firstValue(row, ['imsi_appelant', 'imsiAppelant'])),
    imei_appelant: toTrimmed(firstValue(row, ['imei_appelant', 'imeiAppelant'])),
    cgi: toTrimmed(firstValue(row, ['cgi'])),
    route_reseau: toTrimmed(firstValue(row, ['route_reseau', 'routeReseau'])),
    device_id: toTrimmed(firstValue(row, ['device_id', 'deviceId'])),
    source_file: toTrimmed(firstValue(row, ['source_file', 'fichier_source', 'fichierSource'])) || sourceFile,
    inserted_at: toTrimmed(firstValue(row, ['inserted_at', 'insertedAt']))
  };

  const rawCaller = base.numero_appelant;
  const rawCallee = base.numero_appele;
  const callerVariants = buildIdentifierVariants(rawCaller);
  const calleeVariants = buildIdentifierVariants(rawCallee);
  const dateStart = normalizeDateInput(base.date_debut);
  const dateEnd = normalizeDateInput(base.date_fin);
  const timeStart = normalizeTimeBound(base.heure_debut);
  const timeEnd = normalizeTimeBound(base.heure_fin);
  const insertedAt = normalizeDateTimeInput(base.inserted_at) || new Date().toISOString();
  const callTimestamp = buildCallTimestampValue(dateStart, timeStart)
    || normalizeDateTime(base.date_fin, base.heure_fin)
    || insertedAt;

  return {
    ...base,
    event_type: resolveEventType(base.type_appel),
    date_debut_appel: dateStart,
    date_fin_appel: dateEnd,
    heure_debut_appel: timeStart,
    heure_fin_appel: timeEnd,
    duree_appel: base.duree_sec,
    duration_seconds: parseDurationSeconds(base.duree_sec),
    numero_appelant_sanitized: sanitizeNumber(rawCaller) || null,
    numero_appelant_normalized: normalizePhoneNumber(rawCaller) || null,
    numero_appele_sanitized: sanitizeNumber(rawCallee) || null,
    numero_appele_normalized: normalizePhoneNumber(rawCallee) || null,
    caller_variants: Array.from(callerVariants),
    callee_variants: Array.from(calleeVariants),
    identifiers: Array.from(new Set([...callerVariants, ...calleeVariants])),
    inserted_at: insertedAt,
    call_timestamp: callTimestamp,
    start_time_seconds: timeToSeconds(timeStart),
    end_time_seconds: timeToSeconds(timeEnd)
  };
};

const buildDocumentId = (record) => {
  const key = [
    record.seq_number,
    record.numero_appelant,
    record.numero_appele,
    record.date_debut,
    record.heure_debut,
    record.source_file
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
    return semicolonCount > commaCount ? ';' : ',';
  } finally {
    await fd.close();
  }
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
        record_id: { type: 'long' },
        source_record_id: { type: 'long' },
        source_table: { type: 'keyword' },
        seq_number: { type: 'long' },
        type_appel: { type: 'keyword' },
        event_type: { type: 'keyword' },
        statut_appel: { type: 'keyword' },
        cause_liberation: { type: 'keyword' },
        facturation: { type: 'keyword' },
        date_debut: { type: 'date' },
        heure_debut: { type: 'keyword' },
        date_debut_appel: { type: 'date' },
        heure_debut_appel: { type: 'keyword' },
        duree_sec: { type: 'integer' },
        duree_appel: { type: 'keyword' },
        date_fin: { type: 'date' },
        heure_fin: { type: 'keyword' },
        date_fin_appel: { type: 'date' },
        heure_fin_appel: { type: 'keyword' },
        numero_appelant: { type: 'keyword' },
        numero_appelant_sanitized: { type: 'keyword' },
        numero_appelant_normalized: { type: 'keyword' },
        numero_appele: { type: 'keyword' },
        numero_appele_sanitized: { type: 'keyword' },
        numero_appele_normalized: { type: 'keyword' },
        caller_variants: { type: 'keyword' },
        callee_variants: { type: 'keyword' },
        identifiers: { type: 'keyword' },
        imsi_appelant: { type: 'keyword' },
        imei_appelant: { type: 'keyword' },
        cgi: { type: 'keyword' },
        route_reseau: { type: 'keyword' },
        device_id: { type: 'keyword' },
        fichier_source: { type: 'keyword' },
        source_file: { type: 'keyword' },
        inserted_at: { type: 'date' },
        longitude: { type: 'double' },
        latitude: { type: 'double' },
        azimut: { type: 'keyword' },
        nom_bts: { type: 'keyword' },
        call_timestamp: { type: 'date' },
        duration_seconds: { type: 'integer' },
        start_time_seconds: { type: 'integer' },
        end_time_seconds: { type: 'integer' },
        location: { type: 'geo_point' }
      }
    }
  });
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

const bulkIndexRecords = async (records) => {
  if (!records.length) {
    return { indexed: 0 };
  }

  const actions = [];
  for (const record of records) {
    actions.push({ index: { _index: INDEX_NAME, _id: buildDocumentId(record) } });
    actions.push(record);
  }

  const response = await client.bulk({
    refresh: false,
    operations: actions
  });

  if (response.errors) {
    const firstError = response.items?.find((item) => item.index?.error)?.index?.error;
    throw new Error(`Bulk indexing partiellement échoué: ${firstError?.reason || 'erreur inconnue'}`);
  }

  return { indexed: records.length };
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

  const flushBatch = async (batch) => {
    if (!batch.length) {
      return;
    }
    const enriched = await enrichCoordinates(batch);
    const result = await bulkIndexRecords(enriched);
    indexedTotal += result.indexed;
  };

  const batch = [];
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;

  for await (const rawLine of rl) {
    const line = toTrimmed(rawLine);
    if (!line) {
      continue;
    }

    if (!headers) {
      headers = parseCsvLine(line, separator);
      continue;
    }

    const values = parseCsvLine(line, separator);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });

    const normalized = normalizeRow(row, sourceFile);
    batch.push(normalized);

    if (batch.length >= options.batchSize) {
      const toFlush = batch.splice(0, batch.length);
      await flushBatch(toFlush);
    }
  }

  if (batch.length) {
    await flushBatch(batch);
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
    const summary = await processCsvFile(filePath, options);
    console.log(`✅ ${path.basename(filePath)} traité: ${summary.indexed} documents indexés (${summary.target}).`);
  } catch (error) {
    console.error(`❌ Échec traitement ${path.basename(filePath)}:`, error.message);
    try {
      const moved = await moveFile(filePath, options.failedDir);
      console.error(`➡️ Fichier déplacé vers ${moved}`);
    } catch (moveError) {
      console.error(`⚠️ Impossible de déplacer le fichier en échec: ${moveError.message}`);
    }
  }
};

const run = async () => {
  const options = parseArgs(process.argv.slice(2));
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
  fs.watch(options.inputDir, async (_eventType, filename) => {
    if (!filename || !filename.toLowerCase().endsWith('.csv')) {
      return;
    }
    const filePath = path.join(options.inputDir, filename);
    try {
      await fsp.access(filePath, fs.constants.F_OK);
      await processSingleFile(filePath, options);
    } catch (_error) {
      // Le fichier peut avoir été déplacé/supprimé entre temps.
    }
  });
};

run().catch((error) => {
  console.error('❌ Erreur ingestion CSV CDR:', error);
  process.exit(1);
});
