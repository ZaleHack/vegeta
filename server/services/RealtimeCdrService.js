import database from '../config/database.js';
import client from '../config/elasticsearch.js';
import { isElasticsearchEnabled } from '../config/environment.js';
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

const buildIdentifierVariants = (value) => {
  const variants = new Set();
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

const matchesIdentifier = (identifierSet, value) => {
  if (!value) {
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
  if (text.includes('sms')) {
    return 'sms';
  }
  if (text.includes('data') || text.includes('gprs') || text.includes('web')) {
    return 'web';
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
    this.indexEnsured = false;
    this.indexReady = false;
    this.lastIndexedId = 0;
    this.indexing = false;
    this.indexTimer = null;
    this.coordinateSelectClausePromise = null;
    this.coordinateFallbackColumns = null;
    this.btsLookupSegmentsPromise = null;

    this.initializationPromise = this.elasticEnabled && this.autoStart
      ? this.#initializeElasticsearch().catch((error) => {
          console.error('Erreur initialisation Elasticsearch CDR temps réel:', error);
          this.elasticEnabled = false;
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
        return false;
      }
      throw error;
    }

    this.indexReady = false;
    this.#scheduleIndexing(0);
    return true;
  }

  async search(identifier, options = {}) {
    const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
    if (!trimmedIdentifier) {
      return { ...EMPTY_RESULT };
    }

    const identifierVariants = buildIdentifierVariants(trimmedIdentifier);
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

    if (this.elasticEnabled && this.indexReady) {
      const rowsFromElasticsearch = await this.#searchElasticsearch(
        Array.from(identifierVariants),
        {
          startDate,
          endDate,
          startTimeBound,
          endTimeBound,
          limit: limitValue
        }
      );

      if (Array.isArray(rowsFromElasticsearch)) {
        return this.#buildResult(rowsFromElasticsearch, identifierVariants);
      }
    }

    const rows = await this.#searchDatabase(identifierVariants, {
      startDate,
      endDate,
      startTimeBound,
      endTimeBound,
      limit: limitValue
    });
    return this.#buildResult(rows, identifierVariants);
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
      : 'SELECT NULL AS CGI, NULL AS NOM_BTS, NULL AS LONGITUDE, NULL AS LATITUDE, NULL AS AZIMUT, 1 AS priority FROM (SELECT 1) AS empty WHERE 1 = 0';
    const conditions = [];
    const params = [];

    const variantList = Array.from(identifierVariants);
    if (variantList.length > 0) {
      const numberConditions = variantList.map(
        () => '(c.numero_appelant = ? OR c.numero_appele = ?)'
      );
      conditions.push(`(${numberConditions.join(' OR ')})`);
      variantList.forEach((variant) => {
        params.push(variant, variant);
      });
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
          p.CGI AS cgi,
          p.NOM_BTS AS nom_bts,
          p.LONGITUDE AS longitude,
          p.LATITUDE AS latitude,
          p.AZIMUT AS azimut
        FROM prioritized_bts p
        INNER JOIN (
          SELECT CGI, MIN(priority) AS min_priority
          FROM prioritized_bts
          GROUP BY CGI
        ) ranked ON ranked.CGI = p.CGI AND ranked.min_priority = p.priority
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
      LEFT JOIN best_bts AS coords ON coords.cgi = c.cgi
      ${whereClause}
      ORDER BY c.date_debut ASC, c.heure_debut ASC, c.id ASC
      LIMIT ?
    `;

    return this.database.query(sql, params);
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
            `SELECT CGI, NOM_BTS, LONGITUDE, LATITUDE, AZIMUT, ${priority} AS priority FROM ${source.tableSql}`
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

  async #searchElasticsearch(variantList, filters) {
    if (!Array.isArray(variantList) || variantList.length === 0) {
      return [];
    }

    if (!(await this.#ensureElasticsearchIndex())) {
      return null;
    }

    const filterClauses = [{ terms: { identifiers: variantList } }];

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
        this.elasticEnabled = false;
        this.indexEnsured = false;
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
        this.elasticEnabled = false;
        return false;
      }

      throw error;
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
      this.elasticEnabled = false;
      console.warn(
        '⚠️ Indexation temps réel des CDR désactivée (Elasticsearch indisponible).'
      );
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
        this.elasticEnabled = false;
        this.indexEnsured = false;
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
        this.elasticEnabled = false;
        this.indexEnsured = false;
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
      imei_appelant: normalizeString(row.imei_appelant),
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

  async #buildResult(rows, identifierSet) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ...EMPTY_RESULT };
    }

    await this.#applyCgiEnrichment(rows);

    const contactsMap = new Map();
    const locationsMap = new Map();
    const path = [];

    for (const row of rows) {
      const caller = row.numero_appelant ? normalizeForOutput(row.numero_appelant) : '';
      const callee = row.numero_appele ? normalizeForOutput(row.numero_appele) : '';

      const matchesCaller = matchesIdentifier(identifierSet, row.numero_appelant);
      const matchesCallee = matchesIdentifier(identifierSet, row.numero_appele);

      if (!matchesCaller && !matchesCallee) {
        continue;
      }

      const eventType = resolveEventType(row.type_appel);

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
      if (normalizedOtherNumber && eventType !== 'web') {
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
