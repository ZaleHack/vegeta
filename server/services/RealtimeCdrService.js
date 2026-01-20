import database from '../config/database.js';
import client from '../config/elasticsearch.js';
import { isElasticsearchEnabled, isElasticsearchForced } from '../config/environment.js';
import {
  REALTIME_CDR_TABLE_NAME,
  REALTIME_CDR_TABLE_SCHEMA,
  REALTIME_CDR_TABLE_SQL
} from '../config/realtime-table.js';
import cgiBtsEnricher from './CgiBtsEnrichmentService.js';
import { normalizeCgi } from '../utils/cgi.js';

const EMPTY_RESULT = {
  total: 0,
  contacts: [],
  topContacts: [],
  locations: [],
  topLocations: [],
  path: []
};

const REALTIME_INDEX = process.env.ELASTICSEARCH_CDR_REALTIME_INDEX || 'cdr-realtime-events';
const MAX_BATCH_SIZE = 5000;
const DEFAULT_RECONNECT_DELAY_MS = 15000;

const parseNonNegativeInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return fallback;
};

const COORDINATE_FALLBACK_COLUMNS = ['longitude', 'latitude', 'azimut', 'nom_bts'];

const COORDINATE_SELECT_FIELDS = [
  { alias: 'longitude', column: 'longitude' },
  { alias: 'latitude', column: 'latitude' },
  { alias: 'azimut', column: 'azimut' },
  { alias: 'nom_bts', column: 'nom_bts' }
];

const LATITUDE_FIELD_CANDIDATES = [
  'latitude',
  'Latitude',
  'LATITUDE',
  'lat',
  'Lat',
  'LAT',
  'lat_bts',
  'LAT_BTS',
  'latitude_bts',
  'Latitude_BTS'
];

const LONGITUDE_FIELD_CANDIDATES = [
  'longitude',
  'Longitude',
  'LONGITUDE',
  'long',
  'Long',
  'LONG',
  'lon',
  'Lon',
  'LON',
  'lng',
  'Lng',
  'LNG',
  'long_bts',
  'LONG_BTS',
  'longitude_bts',
  'Longitude_BTS'
];

const NOM_FIELD_CANDIDATES = ['nom', 'Nom', 'NOM', 'nom_bts', 'Nom_BTS', 'NOM_BTS'];

const AZIMUT_FIELD_CANDIDATES = ['azimut', 'Azimut', 'AZIMUT', 'azimuth', 'Azimuth', 'AZIMUTH'];

const sanitizeFieldKey = (key = '') =>
  String(key)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const getFirstDefinedValue = (source, keys) => {
  if (!source || typeof source !== 'object' || !Array.isArray(keys)) {
    return undefined;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
  }

  const normalizedKeys = new Map();
  for (const existingKey of Object.keys(source)) {
    const sanitized = sanitizeFieldKey(existingKey);
    if (sanitized && !normalizedKeys.has(sanitized)) {
      normalizedKeys.set(sanitized, existingKey);
    }
  }

  for (const key of keys) {
    const sanitized = sanitizeFieldKey(key);
    const actualKey = sanitized ? normalizedKeys.get(sanitized) : undefined;
    if (!actualKey) {
      continue;
    }
    const value = source[actualKey];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }

  return undefined;
};

const toTrimmedString = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value).trim();
  return text;
};

const buildCoordinateSelectClause = (availableColumns = new Set()) =>
  COORDINATE_SELECT_FIELDS.map(({ alias, column }) => {
    const hasColumn = availableColumns.has(column);
    if (hasColumn) {
      return `        COALESCE(c.${column}, coords.${column}) AS ${alias}`;
    }
    return `        coords.${column} AS ${alias}`;
  }).join(',\n');

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const INDEX_BATCH_SIZE = Math.min(
  parsePositiveInteger(process.env.REALTIME_CDR_INDEX_BATCH_SIZE, 500),
  MAX_BATCH_SIZE
);
const INDEX_POLL_INTERVAL = Math.max(
  1000,
  parsePositiveInteger(process.env.REALTIME_CDR_INDEX_INTERVAL_MS, 5000)
);

const isConnectionError = (error) =>
  error?.name === 'ConnectionError' || error?.meta?.statusCode === 0;

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
  text = text.replace(/[^0-9]/g, '');
  return text;
};

const sanitizeImei = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value).trim();
  if (!text) {
    return '';
  }
  text = text.replace(/\s+/g, '');
  text = text.replace(/[^0-9]/g, '');
  return text;
};

const computeImeiCheckDigit = (imeiBody) => {
  const digits = sanitizeImei(imeiBody);
  if (digits.length !== 14) {
    return '';
  }

  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    if (Number.isNaN(digit)) {
      return '';
    }
    const isEvenPosition = (index + 1) % 2 === 0;
    if (isEvenPosition) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
  }

  return String((10 - (sum % 10)) % 10);
};

const normalizeImeiWithCheckDigit = (value) => {
  const digits = sanitizeImei(value);
  if (digits.length < 14) {
    return digits;
  }
  const base = digits.slice(0, 14);
  const checkDigit = computeImeiCheckDigit(base);
  return checkDigit ? `${base}${checkDigit}` : digits;
};

const normalizeImeiForComparison = (value) => {
  const digits = sanitizeImei(value);
  if (digits.length < 14) {
    return digits;
  }
  const base = digits.slice(0, 14);
  if (digits.length === 15) {
    return digits.slice(0, 15);
  }
  const checkDigit = computeImeiCheckDigit(base);
  return checkDigit ? `${base}${checkDigit}` : digits;
};

const normalizePhoneNumber = (value) => {
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return '';
  }
  if (sanitized.startsWith('221')) {
    return sanitized;
  }
  const trimmed = sanitized.replace(/^0+/, '');
  return trimmed ? `221${trimmed}` : '';
};

const buildIdentifierVariants = (value, type = 'phone') => {
  const variants = new Set();
  if (type === 'imei') {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) {
      variants.add(trimmed);
    }
    const sanitized = sanitizeImei(value);
    if (sanitized) {
      variants.add(sanitized);
    }
    if (sanitized.length >= 14) {
      variants.add(sanitized.slice(0, 14));
    }
    const normalized = normalizeImeiWithCheckDigit(sanitized);
    if (normalized) {
      variants.add(normalized);
    }
    return variants;
  }
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return variants;
  }
  variants.add(sanitized);
  const normalized = normalizePhoneNumber(sanitized);
  if (normalized) {
    variants.add(normalized);
    if (normalized.startsWith('221')) {
      const local = normalized.slice(3);
      if (local) {
        variants.add(local);
      }
    }
  }
  return variants;
};

const normalizeDateValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return text;
};

const matchesIdentifier = (identifierSet, value, type = 'phone') => {
  if (!value) {
    return false;
  }
  if (type === 'imei') {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed && identifierSet.has(trimmed)) {
      return true;
    }
    const sanitized = sanitizeImei(value);
    if (!sanitized) {
      return false;
    }
    const normalized = normalizeImeiWithCheckDigit(sanitized);
    if (normalized && identifierSet.has(normalized)) {
      return true;
    }
    if (identifierSet.has(sanitized)) {
      return true;
    }
    return false;
  }
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return false;
  }
  if (identifierSet.has(sanitized)) {
    return true;
  }
  const normalized = normalizePhoneNumber(sanitized);
  if (normalized && identifierSet.has(normalized)) {
    return true;
  }
  if (normalized.startsWith('221')) {
    const local = normalized.slice(3);
    if (identifierSet.has(local)) {
      return true;
    }
  }
  return false;
};

const normalizeForOutput = (value) => {
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return '';
  }
  const normalized = normalizePhoneNumber(sanitized);
  return normalized || sanitized;
};

const normalizeTimeBound = (value) => {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }
  if (/^\d{2}:\d{2}$/.test(text)) {
    return `${text}:00`;
  }
  return null;
};

const timeToSeconds = (value) => {
  const normalized = normalizeTimeBound(value);
  if (!normalized) {
    return null;
  }
  const parts = normalized.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

const normalizeString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
};

const normalizeCgiKey = (value) => {
  const normalized = normalizeCgi(value);
  return normalized || '';
};

const normalizeDateInput = (value) => {
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return normalizeString(value);
};

const normalizeDateTimeInput = (value) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return normalizeString(value);
};

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseDurationSeconds = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  if (/^\d+$/.test(text)) {
    const parsed = Number.parseInt(text, 10);
    return Number.isNaN(parsed) ? null : Math.max(0, parsed);
  }
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) {
      return null;
    }
    while (parts.length < 3) {
      parts.unshift(0);
    }
    const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return seconds >= 0 ? seconds : null;
  }
  return null;
};

const buildCallTimestampValue = (dateValue, timeValue) => {
  const normalizedDate = normalizeDateInput(dateValue);
  if (!normalizedDate) {
    return null;
  }
  const normalizedTime = normalizeTimeBound(timeValue) || '00:00:00';
  const timestamp = `${normalizedDate}T${normalizedTime}`;
  if (Number.isNaN(new Date(timestamp).getTime())) {
    return null;
  }
  return timestamp;
};

const formatDateValue = (value) => {
  if (!value && value !== 0) {
    return 'N/A';
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return 'N/A';
    }
    return value.toISOString().split('T')[0];
  }
  const text = String(value).trim();
  if (!text) {
    return 'N/A';
  }
  if (text.length >= 10) {
    return text.slice(0, 10);
  }
  return text;
};

const formatTimeValue = (value) => {
  if (!value && value !== 0) {
    return 'N/A';
  }
  const text = String(value).trim();
  if (!text) {
    return 'N/A';
  }
  return text.length === 5 ? `${text}:00` : text;
};

const formatDuration = (value) => {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const seconds = Math.round(value);
    if (seconds <= 0) {
      return 'N/A';
    }
    if (seconds < 60) {
      return `${seconds} s`;
    }
    return `${Math.round(seconds / 60)} min`;
  }
  const text = String(value).trim();
  if (!text) {
    return 'N/A';
  }
  if (/^\d+$/.test(text)) {
    const seconds = Number.parseInt(text, 10);
    if (Number.isNaN(seconds) || seconds <= 0) {
      return 'N/A';
    }
    if (seconds < 60) {
      return `${seconds} s`;
    }
    return `${Math.round(seconds / 60)} min`;
  }
  if (text.includes(':')) {
    const parts = text.split(':').map((p) => Number.parseInt(p, 10));
    if (parts.every((n) => !Number.isNaN(n))) {
      while (parts.length < 3) {
        parts.unshift(0);
      }
      const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (seconds > 0) {
        if (seconds < 60) {
          return `${seconds} s`;
        }
        return `${Math.round(seconds / 60)} min`;
      }
    }
  }
  return text;
};

const resolveEventType = (value) => {
  const text = String(value || '').toLowerCase();
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

class RealtimeCdrService {
  constructor(options = {}) {
    const {
      autoStart = true,
      databaseClient = database,
      cgiEnricher = cgiBtsEnricher
    } = options;

    this.autoStart = autoStart !== false;
    this.database = databaseClient;
    this.cgiEnricher = cgiEnricher;
    this.indexName = REALTIME_INDEX;
    this.elasticEnabled = isElasticsearchEnabled();
    this.batchSize = INDEX_BATCH_SIZE;
    this.pollInterval = INDEX_POLL_INTERVAL;
    const reconnectDelay = parseNonNegativeInteger(
      process.env.ELASTICSEARCH_RETRY_DELAY_MS,
      DEFAULT_RECONNECT_DELAY_MS
    );
    this.reconnectDelayMs = reconnectDelay;
    this.reconnectTimer = null;
    this.initialElasticEnabled = this.elasticEnabled;
    this.indexEnsured = false;
    this.indexReady = false;
    this.lastIndexedId = 0;
    this.indexing = false;
    this.indexTimer = null;
    this.coordinateSelectClausePromise = null;
    this.coordinateFallbackColumns = null;
    this.btsLookupSegmentsPromise = null;
    this.realtimeColumnAvailability = new Map();

    this.initializationPromise = this.elasticEnabled && this.autoStart
      ? this.#initializeElasticsearch().catch((error) => {
          if (isConnectionError(error)) {
            console.error(
              'Erreur initialisation Elasticsearch CDR temps réel:',
              error.message
            );
          } else {
            console.error('Erreur initialisation Elasticsearch CDR temps réel:', error);
          }
          this.#handleConnectionLoss('initialisation', error);
          return false;
        })
      : null;
  }

  async #initializeElasticsearch() {
    const ensured = await this.#ensureElasticsearchIndex();
    if (!ensured) {
      console.warn(
        '⚠️ Elasticsearch indisponible : indexation temps réel des CDR désactivée.'
      );
      return false;
    }

    try {
      await this.#loadLastIndexedId();
    } catch (error) {
      if (isConnectionError(error)) {
        console.error(
          "Erreur lecture du dernier identifiant indexé pour les CDR temps réel:",
          error.message
        );
        this.#handleConnectionLoss('lecture dernier identifiant', error);
        return false;
      }
      throw error;
    }

    this.indexReady = false;
    if (this.autoStart) {
      this.#scheduleIndexing(0);
    }
    return true;
  }

  async search(identifier, options = {}) {
    const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
    if (!trimmedIdentifier) {
      return { ...EMPTY_RESULT };
    }

    const requestedType = typeof options.searchType === 'string' ? options.searchType.toLowerCase() : 'phone';
    const searchType = requestedType === 'imei' ? 'imei' : 'phone';

    const identifierVariants = buildIdentifierVariants(trimmedIdentifier, searchType);
    if (identifierVariants.size === 0) {
      return { ...EMPTY_RESULT };
    }

    const {
      startDate = null,
      endDate = null,
      startTime = null,
      endTime = null,
      limit = 2000
    } = options;

    const startTimeBound = normalizeTimeBound(startTime);
    const endTimeBound = normalizeTimeBound(endTime);
    const limitValue = Math.min(Math.max(Number.parseInt(limit, 10) || 2000, 1), 10000);

    if (this.elasticEnabled && this.initializationPromise) {
      try {
        await this.initializationPromise;
      } catch (error) {
        console.error('Erreur initialisation indexation CDR temps réel:', error);
      }
    }

    if (this.elasticEnabled) {
      const rowsFromElasticsearch = await this.#searchElasticsearch(
        Array.from(identifierVariants),
        {
          startDate,
          endDate,
          startTimeBound,
          endTimeBound,
          limit: limitValue
        },
        searchType
      );

      if (Array.isArray(rowsFromElasticsearch)) {
        return this.#buildResult(rowsFromElasticsearch, identifierVariants, searchType);
      }
    }

    const rows = await this.#searchDatabase(identifierVariants, {
      startDate,
      endDate,
      startTimeBound,
      endTimeBound,
      limit: limitValue,
      searchType
    });
    return this.#buildResult(rows, identifierVariants, searchType);
  }

  async findAssociations(identifier, options = {}) {
    const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
    if (!trimmedIdentifier) {
      return { imeis: [], numbers: [], updatedAt: new Date().toISOString() };
    }

    const sanitizedImei = sanitizeImei(trimmedIdentifier);
    const sanitizedNumber = sanitizeNumber(trimmedIdentifier);
    const searchType = sanitizedImei && sanitizedImei.length >= 14 ? 'imei' : 'phone';
    const normalizedImeiInput = searchType === 'imei' ? normalizeImeiForComparison(trimmedIdentifier) : '';
    const variants = buildIdentifierVariants(trimmedIdentifier, searchType);

    if (variants.size === 0) {
      return { imeis: [], numbers: [], updatedAt: new Date().toISOString() };
    }

    const conditions = [];
    const params = [];
    const variantList = Array.from(variants);

    if (searchType === 'imei') {
      conditions.push(`c.imei_appelant IN (${variantList.map(() => '?').join(', ')})`);
    } else {
      conditions.push(`c.numero_appelant IN (${variantList.map(() => '?').join(', ')})`);
    }
    params.push(...variantList);

    const startDate = typeof options.startDate === 'string' && options.startDate.trim() ? options.startDate.trim() : null;
    const endDate = typeof options.endDate === 'string' && options.endDate.trim() ? options.endDate.trim() : null;

    if (startDate) {
      conditions.push('c.date_debut >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('COALESCE(c.date_fin, c.date_debut) <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = searchType === 'imei'
      ? `
        SELECT
          c.numero_appelant AS number,
          COUNT(*) AS occurrences,
          MIN(CONCAT_WS('T', c.date_debut, COALESCE(c.heure_debut, '00:00:00'))) AS first_seen,
          MAX(CONCAT_WS('T', c.date_debut, COALESCE(c.heure_debut, '00:00:00'))) AS last_seen
        FROM ${REALTIME_CDR_TABLE_SQL} AS c
        ${whereClause}
        GROUP BY c.numero_appelant
        HAVING c.numero_appelant IS NOT NULL AND c.numero_appelant <> ''
        ORDER BY last_seen DESC, occurrences DESC
      `
      : `
        SELECT
          c.imei_appelant AS imei,
          COUNT(*) AS occurrences,
          MIN(CONCAT_WS('T', c.date_debut, COALESCE(c.heure_debut, '00:00:00'))) AS first_seen,
          MAX(CONCAT_WS('T', c.date_debut, COALESCE(c.heure_debut, '00:00:00'))) AS last_seen
        FROM ${REALTIME_CDR_TABLE_SQL} AS c
        ${whereClause}
        GROUP BY c.imei_appelant
        HAVING c.imei_appelant IS NOT NULL AND c.imei_appelant <> ''
        ORDER BY last_seen DESC, occurrences DESC
      `;

    let rows = [];
    try {
      rows = await this.database.query(sql, params, {
        suppressErrorCodes: ['ER_NO_SUCH_TABLE', '42S02'],
        suppressErrorLog: true
      });
    } catch (error) {
      console.error('Erreur recherche associations CDR temps réel:', error);
      return { imeis: [], numbers: [], updatedAt: new Date().toISOString() };
    }

    let imeiEntrantRows = [];
    if (searchType === 'imei' && normalizedImeiInput) {
      const hasImeiEntrant = await this.#hasRealtimeColumn('imei_entrant');
      const imeiEntrantBody = normalizedImeiInput.length >= 14 ? normalizedImeiInput.slice(0, 14) : '';
      if (hasImeiEntrant && imeiEntrantBody) {
        const entrantConditions = [];
        const entrantParams = [];
        entrantConditions.push(`c.imei_entrant IN (${[imeiEntrantBody].map(() => '?').join(', ')})`);
        entrantParams.push(imeiEntrantBody);

        if (startDate) {
          entrantConditions.push('c.date_debut >= ?');
          entrantParams.push(startDate);
        }

        if (endDate) {
          entrantConditions.push('COALESCE(c.date_fin, c.date_debut) <= ?');
          entrantParams.push(endDate);
        }

        const entrantWhereClause = entrantConditions.length ? `WHERE ${entrantConditions.join(' AND ')}` : '';
        const entrantSql = `
          SELECT
            c.numero_appelant AS number,
            c.imei_entrant AS imei_entrant,
            COUNT(*) AS occurrences,
            MIN(CONCAT_WS('T', c.date_debut, COALESCE(c.heure_debut, '00:00:00'))) AS first_seen,
            MAX(CONCAT_WS('T', c.date_debut, COALESCE(c.heure_debut, '00:00:00'))) AS last_seen
          FROM ${REALTIME_CDR_TABLE_SQL} AS c
          ${entrantWhereClause}
          GROUP BY c.numero_appelant, c.imei_entrant
          HAVING c.numero_appelant IS NOT NULL AND c.numero_appelant <> ''
          ORDER BY last_seen DESC, occurrences DESC
        `;

        try {
          imeiEntrantRows = await this.database.query(entrantSql, entrantParams, {
            suppressErrorCodes: ['ER_NO_SUCH_TABLE', '42S02'],
            suppressErrorLog: true
          });
        } catch (error) {
          console.error('Erreur recherche IMEI entrant CDR temps réel:', error);
          imeiEntrantRows = [];
        }
      }
    }

    const updatedAt = new Date().toISOString();

    if (searchType === 'imei') {
      const imeiValue = normalizedImeiInput || sanitizedImei || trimmedIdentifier;
      const numbersMap = new Map();

      const addNumberRow = (row) => {
        const normalizedNumber = normalizePhoneNumber(row.number) || sanitizeNumber(row.number) || '';
        if (!normalizedNumber) {
          return;
        }

        const occurrences = Number(row.occurrences) || 0;
        const firstSeen = normalizeDateValue(row.first_seen);
        const lastSeen = normalizeDateValue(row.last_seen);
        const current = numbersMap.get(normalizedNumber);

        if (!current) {
          numbersMap.set(normalizedNumber, {
            number: normalizedNumber,
            occurrences,
            firstSeen,
            lastSeen,
            roles: [],
            cases: []
          });
          return;
        }

        current.occurrences += occurrences;
        if (!current.firstSeen || (firstSeen && firstSeen < current.firstSeen)) {
          current.firstSeen = firstSeen;
        }
        if (!current.lastSeen || (lastSeen && lastSeen > current.lastSeen)) {
          current.lastSeen = lastSeen;
        }
      };

      rows.forEach(addNumberRow);

      if (Array.isArray(imeiEntrantRows) && imeiEntrantRows.length > 0) {
        imeiEntrantRows.forEach((row) => {
          const normalizedFromEntrant = normalizeImeiWithCheckDigit(row.imei_entrant);
          if (normalizedFromEntrant && normalizedImeiInput && normalizedFromEntrant === normalizedImeiInput) {
            addNumberRow(row);
          }
        });
      }

      const numbers = Array.from(numbersMap.values());

      return {
        imeis: [
          {
            imei: imeiValue,
            numbers,
            roleSummary: { caller: numbers.length, callee: 0 },
            cases: []
          }
        ],
        numbers: [],
        updatedAt
      };
    }

    const normalizedNumber = normalizePhoneNumber(sanitizedNumber) || sanitizedNumber || trimmedIdentifier;
    const imeis = rows
      .map((row) => {
        const imei = row.imei ? String(row.imei).trim() : '';
        if (!imei) {
          return null;
        }

        return {
          imei,
          occurrences: Number(row.occurrences) || 0,
          firstSeen: normalizeDateValue(row.first_seen),
          lastSeen: normalizeDateValue(row.last_seen),
          roles: [],
          cases: []
        };
      })
      .filter(Boolean);

    return {
      imeis: [],
      numbers: [
        {
          number: normalizedNumber,
          imeis,
          roleSummary: { caller: imeis.length, callee: 0 },
          cases: []
        }
      ],
      updatedAt
    };
  }

  async buildLinkDiagram(numbers, options = {}) {
    const normalizedNumbers = Array.isArray(numbers)
      ? numbers
          .map((value) => normalizePhoneNumber(value))
          .filter((value) => value && value.startsWith('221'))
      : [];

    const uniqueNumbers = Array.from(new Set(normalizedNumbers));
    const rootNumber = uniqueNumbers[0] || null;
    const singleSource = uniqueNumbers.length === 1;

    if (uniqueNumbers.length === 0) {
      return { nodes: [], links: [], root: null };
    }

    const startDate = typeof options.startDate === 'string' ? options.startDate.trim() : '';
    const endDate = typeof options.endDate === 'string' ? options.endDate.trim() : '';
    const startTime = typeof options.startTime === 'string' ? options.startTime.trim() : '';
    const endTime = typeof options.endTime === 'string' ? options.endTime.trim() : '';

    const normalizeTimeBound = (value) => {
      if (!value) return null;
      return value.length === 5 ? `${value}:00` : value;
    };

    const startTimeBound = normalizeTimeBound(startTime);
    const endTimeBound = normalizeTimeBound(endTime);

    const placeholders = uniqueNumbers.map(() => '?').join(', ');
    const conditions = [`(c.numero_appelant IN (${placeholders}) OR c.numero_appele IN (${placeholders}))`];
    const params = [...uniqueNumbers, ...uniqueNumbers];

    if (startDate) {
      conditions.push('c.date_debut >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('COALESCE(c.date_fin, c.date_debut) <= ?');
      params.push(endDate);
    }

    if (startTimeBound) {
      conditions.push('c.heure_debut >= ?');
      params.push(startTimeBound);
    }

    if (endTimeBound) {
      conditions.push('c.heure_debut <= ?');
      params.push(endTimeBound);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const schemaName =
      REALTIME_CDR_TABLE_SCHEMA ||
      (await this.database.queryOne('SELECT DATABASE() AS schema_name'))?.schema_name ||
      '';

    let hasCallTimestamp = false;

    if (schemaName) {
      const columnInfo = await this.database.queryOne(
        `
          SELECT 1
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'call_timestamp'
        `,
        [schemaName, REALTIME_CDR_TABLE_NAME]
      );
      hasCallTimestamp = Boolean(columnInfo);
    }

    const selectColumns = [
      'c.numero_appelant AS caller',
      'c.numero_appele AS callee',
      'c.type_appel AS call_type',
      'c.date_debut',
      'c.heure_debut'
    ];

    if (hasCallTimestamp) {
      selectColumns.push('c.call_timestamp');
    }

    const sql = `
      SELECT
        ${selectColumns.join(',\n        ')}
      FROM ${REALTIME_CDR_TABLE_SQL} AS c
      ${whereClause}
      LIMIT 20000
    `;

    let rows = [];

    try {
      rows = await this.database.query(sql, params, {
        suppressErrorCodes: ['ER_NO_SUCH_TABLE', '42S02'],
        suppressErrorLog: true
      });
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === '42S02') {
        return { nodes: [], links: [], root: rootNumber };
      }
      throw error;
    }

    const filteredSet = new Set(uniqueNumbers);
    const contactSources = {};
    const edgeMap = {};

    const withinDateRange = (row) => {
      if (!startDate && !endDate) return true;
      const startTimestamp =
        row.call_timestamp ||
        (row.date_debut ? `${row.date_debut}T${row.heure_debut || '00:00:00'}` : null);
      if (!startTimestamp) return false;
      const startDatePart = String(startTimestamp).slice(0, 10);
      const endDatePart = row.date_fin || row.date_debut || startDatePart;
      if (startDate && startDatePart < startDate) return false;
      if (endDate && endDatePart > endDate) return false;
      return true;
    };

    const withinTimeRange = (row) => {
      if (!startTimeBound && !endTimeBound) return true;
      const timeValue = row.heure_debut || (row.call_timestamp ? String(row.call_timestamp).slice(11, 19) : null);
      if (!timeValue) return false;
      const normalized = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
      if (startTimeBound && normalized < startTimeBound) return false;
      if (endTimeBound && normalized > endTimeBound) return false;
      return true;
    };

    const buildEventType = (row) => {
      const typeStr = (row.call_type || '').toLowerCase();
      if (typeStr.includes('sms')) return 'sms';
      if (typeStr.includes('data')) return 'web';
      return 'call';
    };

    for (const row of rows) {
      if (!withinDateRange(row) || !withinTimeRange(row)) {
        continue;
      }

      const caller = normalizePhoneNumber(row.caller);
      const callee = normalizePhoneNumber(row.callee);

      let source = null;
      let contact = null;

      if (filteredSet.has(caller)) {
        source = caller;
        contact = callee;
      } else if (filteredSet.has(callee)) {
        source = callee;
        contact = caller;
      }

      if (!source || !contact || !contact.startsWith('221')) continue;

      if (!contactSources[contact]) {
        contactSources[contact] = new Set();
      }
      contactSources[contact].add(source);

      const key = `${source}-${contact}`;
      if (!edgeMap[key]) {
        edgeMap[key] = { source, target: contact, callCount: 0, smsCount: 0 };
      }

      const eventType = buildEventType(row);
      if (eventType === 'sms') {
        edgeMap[key].smsCount += 1;
      } else {
        edgeMap[key].callCount += 1;
      }
    }

    const nodes = uniqueNumbers.map((number) => ({
      id: number,
      type: number === rootNumber ? 'root' : 'source'
    }));
    const links = [];

    for (const contact in contactSources) {
      const sourcesSet = contactSources[contact];
      if (singleSource || sourcesSet.size >= 2) {
        nodes.push({ id: contact, type: 'contact' });
        for (const source of sourcesSet) {
          const edgeKey = `${source}-${contact}`;
          if (edgeMap[edgeKey]) {
            links.push(edgeMap[edgeKey]);
          }
        }
      }
    }

    return { nodes, links, root: rootNumber };
  }

  async enrichMissingCoordinates(options = {}) {
    const { dryRun = false } = options;

    return {
      dryRun: Boolean(dryRun),
      scanned: 0,
      updated: 0,
      batches: 0,
      lastId: 0,
      skipped: true
    };
  }

  async #searchDatabase(identifierVariants, filters) {
    const coordinateSelect = await this.#getCoordinateSelectClause();
    const btsSegments = await this.#getBtsLookupSegments();
    const unionSegments = btsSegments.length
      ? btsSegments.join('\n        UNION ALL\n        ')
      : 'SELECT NULL AS CGI, NULL AS NOM_BTS, NULL AS LONGITUDE, NULL AS LATITUDE, NULL AS AZIMUT, 1 AS priority, 1 AS source_rank FROM (SELECT 1) AS empty WHERE 1 = 0';
    const conditions = [];
    const params = [];

    const searchType = typeof filters.searchType === 'string' && filters.searchType.toLowerCase() === 'imei'
      ? 'imei'
      : 'phone';
    const variantList = Array.from(identifierVariants);
    if (variantList.length > 0) {
      if (searchType === 'imei') {
        const imeiConditions = variantList.map(() => 'c.imei_appelant = ?');
        conditions.push(`(${imeiConditions.join(' OR ')})`);
        variantList.forEach((variant) => {
          params.push(variant);
        });
      } else {
        const numberConditions = variantList.map(
          () => '(c.numero_appelant = ? OR c.numero_appele = ?)'
        );
        conditions.push(`(${numberConditions.join(' OR ')})`);
        variantList.forEach((variant) => {
          params.push(variant, variant);
        });
      }
    }

    if (filters.startDate) {
      conditions.push('c.date_debut >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push('c.date_debut <= ?');
      params.push(filters.endDate);
    }

    if (filters.startTimeBound) {
      conditions.push('c.heure_debut >= ?');
      params.push(filters.startTimeBound);
    }
    if (filters.endTimeBound) {
      conditions.push('c.heure_debut <= ?');
      params.push(filters.endTimeBound);
    }

    params.push(filters.limit);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      WITH prioritized_bts AS (
        ${unionSegments}
      ),
      best_bts AS (
        SELECT
          ranked.cgi,
          ranked.nom_bts,
          ranked.longitude,
          ranked.latitude,
          ranked.azimut
        FROM (
          SELECT
            p.CGI AS cgi,
            p.NOM_BTS AS nom_bts,
            p.LONGITUDE AS longitude,
            p.LATITUDE AS latitude,
            p.AZIMUT AS azimut,
            ROW_NUMBER() OVER (PARTITION BY p.CGI ORDER BY p.priority ASC, p.source_rank ASC) AS rn
          FROM prioritized_bts p
        ) ranked
        WHERE ranked.rn = 1
      )
      SELECT
        c.id,
        c.seq_number,
        c.type_appel,
        c.statut_appel,
        c.cause_liberation,
        c.facturation,
        c.date_debut AS date_debut_appel,
        c.date_fin AS date_fin_appel,
        c.heure_debut AS heure_debut_appel,
        c.heure_fin AS heure_fin_appel,
        c.duree_sec AS duree_appel,
        c.numero_appelant,
        c.imei_appelant,
        c.numero_appele,
        c.imsi_appelant,
        c.cgi,
        c.route_reseau,
        c.device_id,
        ${coordinateSelect},
        c.fichier_source AS source_file,
        c.inserted_at
      FROM ${REALTIME_CDR_TABLE_SQL} AS c
      LEFT JOIN best_bts AS coords ON LOWER(coords.cgi) = LOWER(c.cgi)
      ${whereClause}
      ORDER BY c.inserted_at DESC, c.date_debut DESC, c.heure_debut DESC, c.id DESC
      LIMIT ?
    `;

    return this.database.query(sql, params, { logQuery: true });
  }

  async #getCoordinateSelectClause() {
    if (!this.coordinateSelectClausePromise) {
      this.coordinateSelectClausePromise = this.#resolveCoordinateSelectClause().catch(
        (error) => {
          console.warn(
            '⚠️ Impossible de détecter les colonnes de coordonnées des CDR temps réel, utilisation de la clause par défaut.',
            error?.message || error
          );
          return buildCoordinateSelectClause(new Set());
        }
      );
    }

    return this.coordinateSelectClausePromise;
  }

  async #hasRealtimeColumn(columnName) {
    const normalized = columnName ? String(columnName).toLowerCase() : '';
    if (!normalized) {
      return false;
    }

    if (this.realtimeColumnAvailability.has(normalized)) {
      return this.realtimeColumnAvailability.get(normalized);
    }

    const schemaCondition = REALTIME_CDR_TABLE_SCHEMA
      ? 'AND TABLE_SCHEMA = ?'
      : 'AND TABLE_SCHEMA = DATABASE()';

    const sql = `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
        ${schemaCondition}
        AND LOWER(COLUMN_NAME) = ?
      LIMIT 1
    `;

    const params = REALTIME_CDR_TABLE_SCHEMA
      ? [REALTIME_CDR_TABLE_NAME, REALTIME_CDR_TABLE_SCHEMA, normalized]
      : [REALTIME_CDR_TABLE_NAME, normalized];

    let hasColumn = false;

    try {
      const rows = await this.database.query(sql, params, {
        suppressErrorCodes: ['ER_NO_SUCH_TABLE', '42S02'],
        suppressErrorLog: true
      });
      hasColumn = Array.isArray(rows) && rows.length > 0;
    } catch (error) {
      console.warn(
        '⚠️ Impossible de vérifier la présence de la colonne CDR demandée.',
        error?.message || error
      );
    }

    this.realtimeColumnAvailability.set(normalized, hasColumn);
    return hasColumn;
  }

  async #resolveCoordinateSelectClause() {
    const fallbackColumns = await this.#detectCoordinateColumns();
    return buildCoordinateSelectClause(fallbackColumns);
  }

  async #detectCoordinateColumns() {
    if (this.coordinateFallbackColumns instanceof Set) {
      return this.coordinateFallbackColumns;
    }

    const availableColumns = new Set();

    const placeholders = COORDINATE_FALLBACK_COLUMNS.map(() => '?').join(', ');
    const schemaCondition = REALTIME_CDR_TABLE_SCHEMA
      ? 'AND TABLE_SCHEMA = ?'
      : 'AND TABLE_SCHEMA = DATABASE()';

    const sql = `
      SELECT LOWER(COLUMN_NAME) AS column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ?
        ${schemaCondition}
        AND LOWER(COLUMN_NAME) IN (${placeholders})
    `;

    const params = REALTIME_CDR_TABLE_SCHEMA
      ? [REALTIME_CDR_TABLE_NAME, REALTIME_CDR_TABLE_SCHEMA, ...COORDINATE_FALLBACK_COLUMNS]
      : [REALTIME_CDR_TABLE_NAME, ...COORDINATE_FALLBACK_COLUMNS];

    try {
      const rows = await this.database.query(sql, params, {
        suppressErrorCodes: ['ER_NO_SUCH_TABLE', '42S02'],
        suppressErrorLog: true
      });

      for (const row of rows) {
        const name = (row.column_name || row.COLUMN_NAME || '').toString().toLowerCase();
        if (name) {
          availableColumns.add(name);
        }
      }
    } catch (error) {
      console.warn(
        "⚠️ Lecture de la structure de la table CDR temps réel impossible, coordonnées d'origine ignorées.",
        error?.message || error
      );
    }

    this.coordinateFallbackColumns = availableColumns;
    return availableColumns;
  }

  async #getBtsLookupSegments() {
    if (!this.btsLookupSegmentsPromise) {
      this.btsLookupSegmentsPromise = this.#resolveBtsLookupSegments().catch((error) => {
        console.warn(
          '⚠️ Impossible de détecter les tables BTS pour la jointure directe, enrichissement par défaut utilisé.',
          error?.message || error
        );
        return [];
      });
    }

    return this.btsLookupSegmentsPromise;
  }

  async #resolveBtsLookupSegments() {
    if (this.cgiEnricher && typeof this.cgiEnricher.listLookupSources === 'function') {
      const sources = await this.cgiEnricher.listLookupSources();
      if (Array.isArray(sources) && sources.length > 0) {
        const segments = [];
        sources.forEach((source, index) => {
          if (!source || !source.tableSql) {
            return;
          }
          const priority = Number.isFinite(source.priority)
            ? Math.floor(source.priority)
            : index + 1;
          segments.push(
            `SELECT CGI, NOM_BTS, LONGITUDE, LATITUDE, AZIMUT, ${priority} AS priority, ${index + 1} AS source_rank FROM ${source.tableSql}`
          );
        });

        if (segments.length > 0) {
          return segments;
        }
      }
    }

    return [];
  }

  #hasCoordinateValue(value) {
    return !(value === null || value === undefined || value === '');
  }

  async #applyCgiEnrichment(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }

    if (!this.cgiEnricher || typeof this.cgiEnricher.fetchMany !== 'function') {
      return;
    }

    if (typeof this.cgiEnricher.isEnabled === 'function' && !this.cgiEnricher.isEnabled()) {
      return;
    }

    const pending = new Map();

    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        continue;
      }

      const normalizedCgi = normalizeCgiKey(row?.cgi ?? row?.CGI);
      if (!normalizedCgi) {
        continue;
      }

      const needsLongitude = !this.#hasCoordinateValue(row.longitude ?? row.LONGITUDE);
      const needsLatitude = !this.#hasCoordinateValue(row.latitude ?? row.LATITUDE);
      const needsAzimut = !this.#hasCoordinateValue(row.azimut ?? row.AZIMUT);
      const needsName = !this.#hasCoordinateValue(row.nom_bts ?? row.NOM_BTS);

      if (!needsLongitude && !needsLatitude && !needsAzimut && !needsName) {
        continue;
      }

      if (!pending.has(normalizedCgi)) {
        pending.set(normalizedCgi, []);
      }

      pending.get(normalizedCgi).push({
        row,
        needsLongitude,
        needsLatitude,
        needsAzimut,
        needsName
      });
    }

    if (pending.size === 0) {
      return;
    }

    let lookup;
    try {
      lookup = await this.cgiEnricher.fetchMany(Array.from(pending.keys()));
    } catch (error) {
      console.warn(
        '⚠️ Enrichissement CGI/BTS indisponible, coordonnées brutes retournées:',
        error?.message || error
      );
      return;
    }

    if (!(lookup instanceof Map)) {
      return;
    }

    for (const [normalizedCgi, entries] of pending.entries()) {
      const enrichment = lookup.get(normalizedCgi);
      if (!enrichment) {
        continue;
      }

      const longitudeValue = this.#hasCoordinateValue(enrichment.longitude)
        ? enrichment.longitude
        : null;
      const latitudeValue = this.#hasCoordinateValue(enrichment.latitude)
        ? enrichment.latitude
        : null;
      const azimutValue = this.#hasCoordinateValue(enrichment.azimut)
        ? enrichment.azimut
        : null;
      const nameValue = normalizeString(enrichment.nom_bts);

      for (const entry of entries) {
        const target = entry.row;

        if (entry.needsLongitude && longitudeValue !== null) {
          target.longitude = longitudeValue;
          if (Object.prototype.hasOwnProperty.call(target, 'LONGITUDE')) {
            target.LONGITUDE = longitudeValue;
          }
        }

        if (entry.needsLatitude && latitudeValue !== null) {
          target.latitude = latitudeValue;
          if (Object.prototype.hasOwnProperty.call(target, 'LATITUDE')) {
            target.LATITUDE = latitudeValue;
          }
        }

        if (entry.needsAzimut && azimutValue !== null) {
          target.azimut = azimutValue;
          if (Object.prototype.hasOwnProperty.call(target, 'AZIMUT')) {
            target.AZIMUT = azimutValue;
          }
        }

        if (entry.needsName && nameValue) {
          target.nom_bts = nameValue;
          if (Object.prototype.hasOwnProperty.call(target, 'NOM_BTS')) {
            target.NOM_BTS = nameValue;
          }
        }
      }
    }
  }

  async #searchElasticsearch(variantList, filters, searchType = 'phone') {
    if (!Array.isArray(variantList) || variantList.length === 0) {
      return [];
    }

    if (!(await this.#ensureElasticsearchIndex())) {
      return null;
    }

    const filterClauses = [
      searchType === 'imei'
        ? { terms: { imei_appelant: variantList } }
        : { terms: { identifiers: variantList } }
    ];

    if (filters.startDate) {
      filterClauses.push({ range: { date_debut_appel: { gte: filters.startDate } } });
    }
    if (filters.endDate) {
      filterClauses.push({ range: { date_debut_appel: { lte: filters.endDate } } });
    }

    if (filters.startTimeBound) {
      const seconds = timeToSeconds(filters.startTimeBound);
      if (seconds !== null) {
        filterClauses.push({ range: { start_time_seconds: { gte: seconds } } });
      }
    }
    if (filters.endTimeBound) {
      const seconds = timeToSeconds(filters.endTimeBound);
      if (seconds !== null) {
        filterClauses.push({ range: { start_time_seconds: { lte: seconds } } });
      }
    }

    try {
      const response = await client.search({
        index: this.indexName,
        size: filters.limit,
        query: { bool: { filter: filterClauses } },
        sort: [
          { call_timestamp: { order: 'asc', unmapped_type: 'date' } },
          { record_id: { order: 'asc' } }
        ],
        track_total_hits: false
      });

      const hits = response?.hits?.hits || [];
      if (!hits.length) {
        return [];
      }

      return hits.map((hit) => {
        const source = hit._source || {};
        return {
          id: source.record_id ?? hit._id,
          seq_number: source.seq_number ?? null,
          type_appel: source.type_appel ?? null,
          statut_appel: source.statut_appel ?? null,
          cause_liberation: source.cause_liberation ?? null,
          facturation: source.facturation ?? null,
          date_debut_appel: source.date_debut_appel ?? null,
          date_fin_appel: source.date_fin_appel ?? null,
          heure_debut_appel: source.heure_debut_appel ?? null,
          heure_fin_appel: source.heure_fin_appel ?? null,
          duree_appel: source.duree_appel ?? null,
          numero_appelant:
            source.numero_appelant ?? source.numero_appelant_normalized ?? null,
          imei_appelant: source.imei_appelant ?? null,
          numero_appele: source.numero_appele ?? source.numero_appele_normalized ?? null,
          imsi_appelant: source.imsi_appelant ?? null,
          cgi: source.cgi ?? null,
          route_reseau: source.route_reseau ?? null,
          device_id: source.device_id ?? null,
          longitude: source.longitude ?? null,
          latitude: source.latitude ?? null,
          azimut: source.azimut ?? null,
          nom_bts: source.nom_bts ?? null,
          source_file: source.source_file ?? null,
          inserted_at: source.inserted_at ?? null
        };
      });
    } catch (error) {
      if (isConnectionError(error)) {
        console.error('Erreur de recherche Elasticsearch CDR temps réel:', error.message);
        this.#handleConnectionLoss('recherche', error);
        return null;
      }
      throw error;
    }
  }

  async #ensureElasticsearchIndex() {
    if (!this.elasticEnabled) {
      return false;
    }
    if (this.indexEnsured) {
      return true;
    }

    try {
      const exists = await client.indices.exists({ index: this.indexName });
      if (!exists) {
        await client.indices.create({
          index: this.indexName,
          mappings: {
            properties: {
              record_id: { type: 'long' },
              seq_number: { type: 'long' },
              type_appel: { type: 'keyword' },
              event_type: { type: 'keyword' },
              statut_appel: { type: 'keyword' },
              cause_liberation: { type: 'keyword' },
              facturation: { type: 'keyword' },
              date_debut_appel: { type: 'date' },
              date_fin_appel: { type: 'date' },
              heure_debut_appel: { type: 'keyword' },
              heure_fin_appel: { type: 'keyword' },
              duree_appel: { type: 'keyword' },
              duration_seconds: { type: 'integer' },
              numero_appelant: { type: 'keyword' },
              numero_appelant_sanitized: { type: 'keyword' },
              numero_appelant_normalized: { type: 'keyword' },
              numero_appele: { type: 'keyword' },
              numero_appele_sanitized: { type: 'keyword' },
              numero_appele_normalized: { type: 'keyword' },
              caller_variants: { type: 'keyword' },
              callee_variants: { type: 'keyword' },
              identifiers: { type: 'keyword' },
              imei_appelant: { type: 'keyword' },
              imsi_appelant: { type: 'keyword' },
              cgi: { type: 'keyword' },
              route_reseau: { type: 'keyword' },
              device_id: { type: 'keyword' },
              longitude: { type: 'double' },
              latitude: { type: 'double' },
              azimut: { type: 'keyword' },
              nom_bts: { type: 'keyword' },
              source_file: { type: 'keyword' },
              inserted_at: { type: 'date' },
              call_timestamp: { type: 'date' },
              start_time_seconds: { type: 'integer' },
              end_time_seconds: { type: 'integer' }
            }
          }
        });
      }
      this.indexEnsured = true;
      return true;
    } catch (error) {
      if (isConnectionError(error)) {
        console.error(
          "Erreur connexion Elasticsearch lors de la préparation de l'index CDR temps réel:",
          error.message
        );
        this.#handleConnectionLoss('préparation index', error);
        return false;
      }
      console.error('Erreur préparation index Elasticsearch CDR temps réel:', error);
      throw error;
    }
  }

  async #loadLastIndexedId() {
    if (!this.elasticEnabled) {
      this.lastIndexedId = 0;
      return;
    }

    const response = await client.search({
      index: this.indexName,
      size: 1,
      sort: [{ record_id: { order: 'desc' } }],
      _source: ['record_id']
    });

    const hits = response?.hits?.hits || [];
    if (hits.length > 0) {
      const value = hits[0]?._source?.record_id;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        this.lastIndexedId = parsed;
      }
    }
  }

  #resolveBatchSize(limit) {
    const parsed = Number(limit);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.floor(parsed), MAX_BATCH_SIZE);
    }

    const base = Number(this.batchSize);
    if (Number.isFinite(base) && base > 0) {
      return Math.min(Math.floor(base), MAX_BATCH_SIZE);
    }

    return Math.min(Math.max(1, INDEX_BATCH_SIZE), MAX_BATCH_SIZE);
  }

  async #fetchRows(afterId, limit) {
    const coordinateSelect = await this.#getCoordinateSelectClause();
    const numericAfterId = Number(afterId);
    const startId = Number.isFinite(numericAfterId)
      ? Math.max(0, Math.floor(numericAfterId))
      : 0;

    const effectiveLimit = this.#resolveBatchSize(limit);

    const rows = await this.database.query(
      `
        SELECT
          c.id,
          c.seq_number,
          c.type_appel,
          c.statut_appel,
          c.cause_liberation,
          c.facturation,
          c.date_debut AS date_debut_appel,
          c.date_fin AS date_fin_appel,
          c.heure_debut AS heure_debut_appel,
          c.heure_fin AS heure_fin_appel,
          c.duree_sec AS duree_appel,
          c.numero_appelant,
          c.imei_appelant,
          c.numero_appele,
          c.imsi_appelant,
          c.cgi,
          c.route_reseau,
          c.device_id,
          ${coordinateSelect},
          c.fichier_source AS source_file,
          c.inserted_at
        FROM ${REALTIME_CDR_TABLE_SQL} AS c
        WHERE c.id > ?
        ORDER BY c.id ASC
        LIMIT ?
      `,
      [startId, effectiveLimit]
    );

    await this.#applyCgiEnrichment(rows);
    return rows;
  }

  async #resetElasticsearchIndex() {
    if (!this.elasticEnabled) {
      return false;
    }

    try {
      const exists = await client.indices.exists({ index: this.indexName });
      if (exists) {
        await client.indices.delete({ index: this.indexName });
      }
      this.indexEnsured = false;
      this.lastIndexedId = 0;
      return true;
    } catch (error) {
      const statusCode = error?.meta?.statusCode;
      if (statusCode === 404) {
        this.indexEnsured = false;
        this.lastIndexedId = 0;
        return true;
      }

      if (isConnectionError(error)) {
        console.error(
          'Erreur suppression index Elasticsearch CDR temps réel:',
          error.message
        );
        this.#handleConnectionLoss('suppression index', error);
        return false;
      }

      throw error;
    }
  }

  #clearIndexTimer() {
    if (this.indexTimer) {
      clearTimeout(this.indexTimer);
      this.indexTimer = null;
    }
  }

  #handleConnectionLoss(context = 'operation', error = null) {
    const forced = isElasticsearchForced();

    if (forced) {
      console.warn(
        `⚠️ USE_ELASTICSEARCH=force actif : maintien de l\'indexation malgré l'échec (${context}).`
      );
      this.elasticEnabled = true;
    } else {
      this.elasticEnabled = false;
    }
    this.indexEnsured = false;
    this.indexReady = false;
    this.initializationPromise = null;
    this.#clearIndexTimer();

    if (!forced) {
      if (this.initialElasticEnabled) {
        console.warn(
          `⚠️ Elasticsearch temps réel désactivé après échec (${context}). Redémarrage requis pour réactiver cette fonctionnalité.`
        );
      }
      return;
    }

    if (!this.initialElasticEnabled) {
      return;
    }

    this.#scheduleReconnect(context, error);
  }

  #scheduleReconnect(context = 'reconnexion automatique', error = null) {
    if (this.reconnectTimer) {
      return;
    }

    if (process.env.USE_ELASTICSEARCH === 'false') {
      return;
    }

    const effectiveDelay = parseNonNegativeInteger(
      this.reconnectDelayMs,
      DEFAULT_RECONNECT_DELAY_MS
    );

    if (effectiveDelay === Infinity) {
      return;
    }

    const delaySeconds = Math.max(0, Math.round(effectiveDelay / 1000));
    const messageSuffix = delaySeconds
      ? ` dans ${delaySeconds} seconde${delaySeconds > 1 ? 's' : ''}`
      : ' immédiatement';

    console.warn(
      `⚠️ Elasticsearch temps réel indisponible (${context}). Nouvelle tentative${messageSuffix}.`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      if (!this.initialElasticEnabled || process.env.USE_ELASTICSEARCH === 'false') {
        return;
      }

      this.elasticEnabled = true;
      this.indexEnsured = false;

      try {
        this.initializationPromise = this.#initializeElasticsearch();
        const initialized = await this.initializationPromise;

        if (!initialized) {
          this.initializationPromise = null;
          this.#handleConnectionLoss('reconnexion automatique', error);
          return;
        }

        console.info('✅ Reconnexion Elasticsearch temps réel effectuée.');
      } catch (reconnectError) {
        this.initializationPromise = null;
        if (isConnectionError(reconnectError)) {
          this.#handleConnectionLoss('reconnexion automatique', reconnectError);
          return;
        }

        console.error(
          'Erreur lors de la tentative de reconnexion Elasticsearch temps réel:',
          reconnectError
        );
        this.#scheduleReconnect('reconnexion automatique (erreur inattendue)', reconnectError);
      }
    }, effectiveDelay);

    if (typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref();
    }
  }

  #scheduleIndexing(delay = this.pollInterval) {
    if (!this.elasticEnabled) {
      return;
    }
    if (this.indexTimer) {
      return;
    }
    const effectiveDelay = Math.max(0, Number.isFinite(delay) ? delay : this.pollInterval);

    this.indexTimer = setTimeout(() => {
      this.indexTimer = null;
      this.#indexNewRows();
    }, effectiveDelay);

    if (typeof this.indexTimer.unref === 'function') {
      this.indexTimer.unref();
    }
  }

  async bootstrapIndex(options = {}) {
    if (!this.elasticEnabled) {
      console.warn(
        "⚠️ Indexation CDR temps réel ignorée : Elasticsearch est désactivé."
      );
      return {
        indexed: 0,
        batches: 0,
        lastId: this.lastIndexedId || 0,
        skipped: true
      };
    }

    if (this.indexing) {
      console.warn(
        '⚠️ Impossible de lancer la réindexation CDR temps réel : une indexation est déjà en cours.'
      );
      return {
        indexed: 0,
        batches: 0,
        lastId: this.lastIndexedId || 0,
        skipped: true
      };
    }

    if (this.indexTimer) {
      clearTimeout(this.indexTimer);
      this.indexTimer = null;
    }

    const { reset = false, batchSize = null, onBatchComplete = null } = options;

    const originalBatchSize = this.batchSize;
    const previousIndexReady = this.indexReady;
    const overrideBatchSize = this.#resolveBatchSize(
      batchSize === null ? this.batchSize : batchSize
    );
    this.batchSize = overrideBatchSize;

    let totalIndexed = 0;
    let batchCount = 0;
    let lastId = this.lastIndexedId || 0;

    this.indexing = true;
    this.indexReady = false;

    try {
      if (reset) {
        const resetOk = await this.#resetElasticsearchIndex();
        if (!resetOk) {
          return {
            indexed: 0,
            batches: 0,
            lastId: this.lastIndexedId || 0,
            skipped: true
          };
        }
      }

      const ensured = await this.#ensureElasticsearchIndex();
      if (!ensured) {
        return {
          indexed: 0,
          batches: 0,
          lastId: this.lastIndexedId || 0,
          skipped: true
        };
      }

      if (!reset) {
        await this.#loadLastIndexedId();
      } else {
        this.lastIndexedId = 0;
      }

      lastId = this.lastIndexedId || 0;

      let hasMore = true;
      while (hasMore && this.elasticEnabled) {
        const rows = await this.#fetchRows(lastId, this.batchSize);
        if (!rows.length) {
          hasMore = false;
          break;
        }

        const indexedCount = await this.#indexBatch(rows);
        totalIndexed += indexedCount;
        batchCount += 1;
        lastId = rows[rows.length - 1].id;
        this.lastIndexedId = lastId;

        if (typeof onBatchComplete === 'function') {
          try {
            await onBatchComplete({
              batch: batchCount,
              indexed: indexedCount,
              lastId
            });
          } catch (callbackError) {
            console.error(
              'Erreur lors de la notification de progression CDR temps réel:',
              callbackError
            );
          }
        }

        hasMore = rows.length === this.batchSize;
      }

      this.indexReady = true;

      return {
        indexed: totalIndexed,
        batches: batchCount,
        lastId,
        skipped: false
      };
    } catch (error) {
      if (isConnectionError(error)) {
        return {
          indexed: totalIndexed,
          batches: batchCount,
          lastId: this.lastIndexedId || lastId || 0,
          error,
          skipped: false
        };
      }

      throw error;
    } finally {
      this.batchSize = originalBatchSize;
      this.indexing = false;

      if (!this.indexReady && previousIndexReady) {
        this.indexReady = previousIndexReady;
      }

      if (this.autoStart && this.elasticEnabled) {
        this.#scheduleIndexing(this.pollInterval);
      }
    }
  }

  async #indexNewRows() {
    if (!this.elasticEnabled || this.indexing) {
      if (this.elasticEnabled) {
        this.#scheduleIndexing(this.pollInterval);
      }
      return;
    }

    if (!(await this.#ensureElasticsearchIndex())) {
      console.warn(
        '⚠️ Indexation temps réel des CDR désactivée (Elasticsearch indisponible).'
      );
      this.#handleConnectionLoss('indexation');
      return;
    }

    this.indexing = true;

    try {
      let hasMore = true;
      while (hasMore && this.elasticEnabled) {
        const batchLimit = this.#resolveBatchSize(this.batchSize);
        const rows = await this.#fetchRows(this.lastIndexedId, batchLimit);

        if (!rows.length) {
          hasMore = false;
          break;
        }

        await this.#indexBatch(rows);
        this.lastIndexedId = rows[rows.length - 1].id;
        hasMore = rows.length === batchLimit;
      }
    } catch (error) {
      if (isConnectionError(error)) {
        console.warn(
          '⚠️ Indexation Elasticsearch désactivée pour les CDR temps réel (connexion perdue).'
        );
        this.#handleConnectionLoss('indexation', error);
      } else {
        console.error("Erreur lors de l'indexation des CDR temps réel:", error);
      }
    } finally {
      this.indexReady = true;
      this.indexing = false;
      if (this.elasticEnabled) {
        this.#scheduleIndexing(this.pollInterval);
      }
    }
  }

  async #indexBatch(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return 0;
    }

    const operations = [];
    let documentsToIndex = 0;

    for (const row of rows) {
      const document = this.#transformRow(row);
      if (!document) {
        continue;
      }
      operations.push({ index: { _index: this.indexName, _id: String(row.id) } });
      operations.push(document);
      documentsToIndex += 1;
    }

    if (operations.length === 0) {
      return 0;
    }

    try {
      const response = await client.bulk({ operations, refresh: false });
      let successCount = documentsToIndex;
      if (response.errors && Array.isArray(response.items)) {
        successCount = 0;
        for (const item of response.items) {
          const action = item.index || item.create || item.update;
          if (action?.error) {
            console.error(
              `Erreur indexation CDR temps réel #${action._id || 'inconnu'} :`,
              action.error
            );
          } else {
            successCount += 1;
          }
        }
      } else if (Array.isArray(response.items)) {
        successCount = 0;
        for (const item of response.items) {
          const action = item.index || item.create || item.update;
          if (!action?.error) {
            successCount += 1;
          }
        }
      }
      return successCount;
    } catch (error) {
      if (isConnectionError(error)) {
        console.error('Erreur indexation Elasticsearch CDR temps réel:', error.message);
        this.#handleConnectionLoss('indexation bulk', error);
        throw error;
      }
      throw error;
    }
  }

  #transformRow(row) {
    if (!row || typeof row !== 'object') {
      return null;
    }

    const rawCaller = normalizeString(row.numero_appelant);
    const rawCallee = normalizeString(row.numero_appele);
    const callerVariants = buildIdentifierVariants(rawCaller);
    const calleeVariants = buildIdentifierVariants(rawCallee);
    const identifiers = new Set([...callerVariants, ...calleeVariants]);
    const imeiValue = sanitizeImei(row.imei_appelant);

    const dateStart = normalizeDateInput(row.date_debut_appel);
    const dateEnd = normalizeDateInput(row.date_fin_appel);
    const startTime = normalizeTimeBound(row.heure_debut_appel);
    const endTime = normalizeTimeBound(row.heure_fin_appel);

    return {
      record_id: row.id,
      seq_number: normalizeString(row.seq_number),
      type_appel: normalizeString(row.type_appel),
      event_type: resolveEventType(row.type_appel),
      statut_appel: normalizeString(row.statut_appel),
      cause_liberation: normalizeString(row.cause_liberation),
      facturation: normalizeString(row.facturation),
      date_debut_appel: dateStart,
      date_fin_appel: dateEnd,
      heure_debut_appel: startTime,
      heure_fin_appel: endTime,
      duree_appel: normalizeString(row.duree_appel),
      duration_seconds: parseDurationSeconds(row.duree_appel),
      numero_appelant: rawCaller,
      numero_appelant_sanitized: sanitizeNumber(rawCaller) || null,
      numero_appelant_normalized: normalizePhoneNumber(rawCaller) || null,
      numero_appele: rawCallee,
      numero_appele_sanitized: sanitizeNumber(rawCallee) || null,
      numero_appele_normalized: normalizePhoneNumber(rawCallee) || null,
      caller_variants: Array.from(callerVariants),
      callee_variants: Array.from(calleeVariants),
      identifiers: Array.from(identifiers),
      imei_appelant: imeiValue || normalizeString(row.imei_appelant),
      imsi_appelant: normalizeString(row.imsi_appelant),
      cgi: normalizeString(row.cgi),
      route_reseau: normalizeString(row.route_reseau),
      device_id: normalizeString(row.device_id),
      longitude: toNullableNumber(row.longitude),
      latitude: toNullableNumber(row.latitude),
      azimut: normalizeString(row.azimut),
      nom_bts: normalizeString(row.nom_bts),
      source_file: normalizeString(row.source_file),
      inserted_at: normalizeDateTimeInput(row.inserted_at),
      call_timestamp: buildCallTimestampValue(dateStart, startTime),
      start_time_seconds: timeToSeconds(startTime),
      end_time_seconds: timeToSeconds(endTime)
    };
  }

  async #buildResult(rows, identifierSet, searchType = 'phone') {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ...EMPTY_RESULT };
    }

    await this.#applyCgiEnrichment(rows);

    const contactsMap = new Map();
    const locationsMap = new Map();
    const path = [];
    const normalizedType = searchType === 'imei' ? 'imei' : 'phone';

    for (const row of rows) {
      const caller = row.numero_appelant ? normalizeForOutput(row.numero_appelant) : '';
      const callee = row.numero_appele ? normalizeForOutput(row.numero_appele) : '';

      const eventType = resolveEventType(row.type_appel);

      const matchesCaller =
        normalizedType === 'imei'
          ? matchesIdentifier(identifierSet, row.imei_appelant, 'imei')
          : matchesIdentifier(identifierSet, row.numero_appelant, 'phone');
      let matchesCallee =
        normalizedType === 'imei'
          ? false
          : matchesIdentifier(identifierSet, row.numero_appele, 'phone');

      if (eventType === 'position') {
        matchesCallee = false;
      }

      if (!matchesCaller && !matchesCallee) {
        continue;
      }

      let direction = 'incoming';
      let otherNumber = '';

      if (matchesCaller && !matchesCallee) {
        direction = 'outgoing';
        otherNumber = callee;
      } else if (!matchesCaller && matchesCallee) {
        direction = 'incoming';
        otherNumber = caller;
      } else if (matchesCaller && matchesCallee) {
        direction = 'outgoing';
        otherNumber = callee || caller;
      }

      const normalizedOtherNumber = otherNumber ? normalizeForOutput(otherNumber) : '';
      if (normalizedOtherNumber && (eventType === 'call' || eventType === 'sms')) {
        const entry = contactsMap.get(normalizedOtherNumber) || { callCount: 0, smsCount: 0 };
        if (eventType === 'sms') {
          entry.smsCount += 1;
        } else {
          entry.callCount += 1;
        }
        contactsMap.set(normalizedOtherNumber, entry);
      }

      const latitude = toTrimmedString(getFirstDefinedValue(row, LATITUDE_FIELD_CANDIDATES));
      const longitude = toTrimmedString(getFirstDefinedValue(row, LONGITUDE_FIELD_CANDIDATES));

      if (latitude && longitude) {
        const locationName = toTrimmedString(getFirstDefinedValue(row, NOM_FIELD_CANDIDATES));
        const key = `${latitude},${longitude},${locationName}`;
        const locationEntry = locationsMap.get(key) || {
          latitude,
          longitude,
          nom: locationName,
          count: 0
        };
        locationEntry.count += 1;
        locationsMap.set(key, locationEntry);

        const azimut = toTrimmedString(getFirstDefinedValue(row, AZIMUT_FIELD_CANDIDATES));

        path.push({
          latitude,
          longitude,
          nom: locationName,
          type: eventType,
          direction,
          number: normalizedOtherNumber || undefined,
          caller: caller || undefined,
          callee: callee || undefined,
          callDate: formatDateValue(row.date_debut_appel),
          endDate: formatDateValue(row.date_fin_appel),
          startTime: formatTimeValue(row.heure_debut_appel),
          endTime: formatTimeValue(row.heure_fin_appel),
          duration: formatDuration(row.duree_appel),
          imsiCaller: row.imsi_appelant ? String(row.imsi_appelant).trim() : undefined,
          imeiCaller: row.imei_appelant ? String(row.imei_appelant).trim() : undefined,
          imeiCalled: undefined,
          cgi: row.cgi ? String(row.cgi).trim() : undefined,
          azimut: azimut || undefined,
          seqNumber: row.seq_number ? String(row.seq_number).trim() : undefined,
          callStatus: row.statut_appel ? String(row.statut_appel).trim() : undefined,
          releaseCause: row.cause_liberation ? String(row.cause_liberation).trim() : undefined,
          billing: row.facturation ? String(row.facturation).trim() : undefined,
          networkRoute: row.route_reseau ? String(row.route_reseau).trim() : undefined,
          deviceId: row.device_id ? String(row.device_id).trim() : undefined,
          sourceFile: row.source_file ? String(row.source_file).trim() : undefined,
          insertedAt: normalizeDateTimeInput(row.inserted_at) || undefined
        });
      }
    }

    const contacts = Array.from(contactsMap.entries())
      .map(([number, stats]) => ({
        number,
        callCount: stats.callCount,
        smsCount: stats.smsCount,
        total: stats.callCount + stats.smsCount
      }))
      .sort((a, b) => b.total - a.total);

    const locations = Array.from(locationsMap.values()).sort((a, b) => b.count - a.count);

    return {
      total: rows.length,
      contacts,
      topContacts: contacts.slice(0, 10),
      locations,
      topLocations: locations.slice(0, 10),
      path
    };
  }
}

const realtimeCdrService = new RealtimeCdrService();

export { RealtimeCdrService };
export default realtimeCdrService;
