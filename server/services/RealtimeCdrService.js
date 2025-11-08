import database from '../config/database.js';
import client from '../config/elasticsearch.js';
import { isElasticsearchEnabled } from '../config/environment.js';

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

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const sanitizeColumnForSelection = (column) => `
  CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN TRIM(CAST(${column} AS CHAR)) = '' THEN NULL
    WHEN LOWER(TRIM(CAST(${column} AS CHAR))) = 'null' THEN NULL
    ELSE TRIM(CAST(${column} AS CHAR))
  END
`;

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

const buildNormalizedCgiSql = (column) =>
  `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${column}), '-', ''), ':', ''), ' ', ''), '.', ''), ';', ''))`;

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
    const { autoStart = true } = options;

    this.autoStart = autoStart !== false;
    this.indexName = REALTIME_INDEX;
    this.elasticEnabled = isElasticsearchEnabled();
    this.batchSize = INDEX_BATCH_SIZE;
    this.pollInterval = INDEX_POLL_INTERVAL;
    this.indexEnsured = false;
    this.indexReady = false;
    this.lastIndexedId = 0;
    this.indexing = false;
    this.indexTimer = null;

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
    const {
      batchSize = null,
      limit = null,
      dryRun = false,
      onBatchComplete = null
    } = options;

    const effectiveBatchSize = this.#resolveBatchSize(
      batchSize === null || batchSize === undefined ? this.batchSize : batchSize
    );
    const totalLimit = parsePositiveInteger(limit, null);

    const normalizedCgiSql = buildNormalizedCgiSql('c.cgi');
    const join2gCondition = `${buildNormalizedCgiSql('r2.CGI')} = ${normalizedCgiSql}`;
    const join3gCondition = `${buildNormalizedCgiSql('r3.CGI')} = ${normalizedCgiSql}`;
    const join4gCondition = `${buildNormalizedCgiSql('r4.CGI')} = ${normalizedCgiSql}`;
    const join5gCondition = `${buildNormalizedCgiSql('r5.CGI')} = ${normalizedCgiSql}`;

    let totalUpdated = 0;
    let totalScanned = 0;
    let batchCount = 0;
    let lastId = 0;
    let hasMore = true;

    while (hasMore) {
      if (totalLimit !== null && totalUpdated >= totalLimit) {
        break;
      }

      const remainingLimit =
        totalLimit !== null ? Math.max(totalLimit - totalUpdated, 0) : Number.POSITIVE_INFINITY;
      const fetchLimit = Math.min(effectiveBatchSize, Math.max(remainingLimit || effectiveBatchSize, 1));

      const rows = await database.query(
        `
          SELECT
            c.id,
            COALESCE(
              ${sanitizeColumnForSelection('r2.LONGITUDE')},
              ${sanitizeColumnForSelection('r3.LONGITUDE')},
              ${sanitizeColumnForSelection('r4.LONGITUDE')},
              ${sanitizeColumnForSelection('r5.LONGITUDE')}
            ) AS resolved_longitude,
            COALESCE(
              ${sanitizeColumnForSelection('r2.LATITUDE')},
              ${sanitizeColumnForSelection('r3.LATITUDE')},
              ${sanitizeColumnForSelection('r4.LATITUDE')},
              ${sanitizeColumnForSelection('r5.LATITUDE')}
            ) AS resolved_latitude,
            COALESCE(
              ${sanitizeColumnForSelection('r2.AZIMUT')},
              ${sanitizeColumnForSelection('r3.AZIMUT')},
              ${sanitizeColumnForSelection('r4.AZIMUT')},
              ${sanitizeColumnForSelection('r5.AZIMUT')}
            ) AS resolved_azimut
          FROM autres.cdr_temps_reel AS c
          LEFT JOIN bts_orange.\`2g\` AS r2 ON ${join2gCondition}
          LEFT JOIN bts_orange.\`3g\` AS r3 ON ${join3gCondition} AND r2.CGI IS NULL
          LEFT JOIN bts_orange.\`4g\` AS r4 ON ${join4gCondition} AND r2.CGI IS NULL AND r3.CGI IS NULL
          LEFT JOIN bts_orange.\`5g\` AS r5
            ON ${join5gCondition} AND r2.CGI IS NULL AND r3.CGI IS NULL AND r4.CGI IS NULL
          WHERE c.id > ?
            AND (
              c.longitude IS NULL
              OR c.latitude IS NULL
              OR c.azimut IS NULL
            )
            AND (
              r2.CGI IS NOT NULL
              OR r3.CGI IS NOT NULL
              OR r4.CGI IS NOT NULL
              OR r5.CGI IS NOT NULL
            )
          ORDER BY c.id ASC
          LIMIT ?
        `,
        [lastId, fetchLimit]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        break;
      }

      batchCount += 1;
      totalScanned += rows.length;
      lastId = rows[rows.length - 1].id || lastId;

      const candidates = rows
        .map((row) => ({
          id: row.id,
          longitude: toNullableNumber(row.resolved_longitude),
          latitude: toNullableNumber(row.resolved_latitude),
          azimut: normalizeString(row.resolved_azimut)
        }))
        .filter((row) => row.longitude !== null || row.latitude !== null || row.azimut !== null);

      let updatedInBatch = 0;

      if (!dryRun && candidates.length > 0) {
        for (const candidate of candidates) {
          const result = await database.query(
            `
              UPDATE autres.cdr_temps_reel
              SET
                longitude = IFNULL(longitude, ?),
                latitude  = IFNULL(latitude, ?),
                azimut    = IFNULL(azimut, ?)
              WHERE id = ?
            `,
            [candidate.longitude, candidate.latitude, candidate.azimut, candidate.id]
          );

          const affected = Number(result?.affectedRows ?? 0);
          updatedInBatch += Number.isFinite(affected) ? affected : 0;

          if (totalLimit !== null && totalUpdated + updatedInBatch >= totalLimit) {
            break;
          }
        }
      } else if (dryRun) {
        updatedInBatch = candidates.length;
      }

      totalUpdated += updatedInBatch;

      if (typeof onBatchComplete === 'function') {
        try {
          await onBatchComplete({
            batch: batchCount,
            fetched: rows.length,
            candidates: candidates.length,
            updated: updatedInBatch,
            lastId
          });
        } catch (callbackError) {
          console.error('Erreur notification enrichissement CDR temps réel:', callbackError);
        }
      }

      if (rows.length < fetchLimit || (totalLimit !== null && totalUpdated >= totalLimit)) {
        hasMore = false;
      }
    }

    return {
      dryRun: Boolean(dryRun),
      scanned: totalScanned,
      updated: totalUpdated,
      batches: batchCount,
      lastId
    };
  }

  async #searchDatabase(identifierVariants, filters) {
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

    const normalizedCgiSql = buildNormalizedCgiSql('c.cgi');
    const join2gCondition = `${buildNormalizedCgiSql('r2.CGI')} = ${normalizedCgiSql}`;
    const join3gCondition = `${buildNormalizedCgiSql('r3.CGI')} = ${normalizedCgiSql}`;
    const join4gCondition = `${buildNormalizedCgiSql('r4.CGI')} = ${normalizedCgiSql}`;
    const join5gCondition = `${buildNormalizedCgiSql('r5.CGI')} = ${normalizedCgiSql}`;

    const sql = `
      SELECT
        c.id,
        c.type_appel,
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
        COALESCE(
          ${sanitizeColumnForSelection('r2.LONGITUDE')},
          ${sanitizeColumnForSelection('r3.LONGITUDE')},
          ${sanitizeColumnForSelection('r4.LONGITUDE')},
          ${sanitizeColumnForSelection('r5.LONGITUDE')}
        ) AS longitude,
        COALESCE(
          ${sanitizeColumnForSelection('r2.LATITUDE')},
          ${sanitizeColumnForSelection('r3.LATITUDE')},
          ${sanitizeColumnForSelection('r4.LATITUDE')},
          ${sanitizeColumnForSelection('r5.LATITUDE')}
        ) AS latitude,
        COALESCE(
          ${sanitizeColumnForSelection('r2.AZIMUT')},
          ${sanitizeColumnForSelection('r3.AZIMUT')},
          ${sanitizeColumnForSelection('r4.AZIMUT')},
          ${sanitizeColumnForSelection('r5.AZIMUT')}
        ) AS azimut,
        COALESCE(
          ${sanitizeColumnForSelection('r2.NOM_BTS')},
          ${sanitizeColumnForSelection('r3.NOM_BTS')},
          ${sanitizeColumnForSelection('r4.NOM_BTS')},
          ${sanitizeColumnForSelection('r5.NOM_BTS')}
        ) AS nom_bts,
        c.fichier_source AS source_file,
        c.inserted_at
      FROM autres.cdr_temps_reel AS c
      LEFT JOIN bts_orange.\`2g\` AS r2 ON ${join2gCondition}
      LEFT JOIN bts_orange.\`3g\` AS r3 ON ${join3gCondition} AND r2.CGI IS NULL
      LEFT JOIN bts_orange.\`4g\` AS r4 ON ${join4gCondition} AND r2.CGI IS NULL AND r3.CGI IS NULL
      LEFT JOIN bts_orange.\`5g\` AS r5
        ON ${join5gCondition} AND r2.CGI IS NULL AND r3.CGI IS NULL AND r4.CGI IS NULL
      ${whereClause}
      ORDER BY c.date_debut ASC, c.heure_debut ASC, c.id ASC
      LIMIT ?
    `;

    return database.query(sql, params);
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
          type_appel: source.type_appel ?? null,
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
              type_appel: { type: 'keyword' },
              event_type: { type: 'keyword' },
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
    const numericAfterId = Number(afterId);
    const startId = Number.isFinite(numericAfterId)
      ? Math.max(0, Math.floor(numericAfterId))
      : 0;

    const effectiveLimit = this.#resolveBatchSize(limit);

    const normalizedCgiSql = buildNormalizedCgiSql('c.cgi');
    const join2gCondition = `${buildNormalizedCgiSql('r2.CGI')} = ${normalizedCgiSql}`;
    const join3gCondition = `${buildNormalizedCgiSql('r3.CGI')} = ${normalizedCgiSql}`;
    const join4gCondition = `${buildNormalizedCgiSql('r4.CGI')} = ${normalizedCgiSql}`;
    const join5gCondition = `${buildNormalizedCgiSql('r5.CGI')} = ${normalizedCgiSql}`;

    return database.query(
      `
        SELECT
          c.id,
          c.type_appel,
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
          COALESCE(
            ${sanitizeColumnForSelection('r2.LONGITUDE')},
            ${sanitizeColumnForSelection('r3.LONGITUDE')},
            ${sanitizeColumnForSelection('r4.LONGITUDE')},
            ${sanitizeColumnForSelection('r5.LONGITUDE')}
          ) AS longitude,
          COALESCE(
            ${sanitizeColumnForSelection('r2.LATITUDE')},
            ${sanitizeColumnForSelection('r3.LATITUDE')},
            ${sanitizeColumnForSelection('r4.LATITUDE')},
            ${sanitizeColumnForSelection('r5.LATITUDE')}
          ) AS latitude,
          COALESCE(
            ${sanitizeColumnForSelection('r2.AZIMUT')},
            ${sanitizeColumnForSelection('r3.AZIMUT')},
            ${sanitizeColumnForSelection('r4.AZIMUT')},
            ${sanitizeColumnForSelection('r5.AZIMUT')}
          ) AS azimut,
          COALESCE(
            ${sanitizeColumnForSelection('r2.NOM_BTS')},
            ${sanitizeColumnForSelection('r3.NOM_BTS')},
            ${sanitizeColumnForSelection('r4.NOM_BTS')},
            ${sanitizeColumnForSelection('r5.NOM_BTS')}
          ) AS nom_bts,
          c.fichier_source AS source_file,
          c.inserted_at
        FROM autres.cdr_temps_reel AS c
        LEFT JOIN bts_orange.\`2g\` AS r2 ON ${join2gCondition}
        LEFT JOIN bts_orange.\`3g\` AS r3 ON ${join3gCondition} AND r2.CGI IS NULL
        LEFT JOIN bts_orange.\`4g\` AS r4 ON ${join4gCondition} AND r2.CGI IS NULL AND r3.CGI IS NULL
        LEFT JOIN bts_orange.\`5g\` AS r5
          ON ${join5gCondition} AND r2.CGI IS NULL AND r3.CGI IS NULL AND r4.CGI IS NULL
        WHERE c.id > ?
        ORDER BY c.id ASC
        LIMIT ?
      `,
      [startId, effectiveLimit]
    );
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
      type_appel: normalizeString(row.type_appel),
      event_type: resolveEventType(row.type_appel),
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

  #buildResult(rows, identifierSet) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ...EMPTY_RESULT };
    }

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

      const latitude = row.latitude !== null && row.latitude !== undefined ? String(row.latitude) : '';
      const longitude = row.longitude !== null && row.longitude !== undefined ? String(row.longitude) : '';

      if (latitude && longitude) {
        const locationName = row.nom_bts ? String(row.nom_bts).trim() : '';
        const key = `${latitude},${longitude},${locationName}`;
        const locationEntry = locationsMap.get(key) || {
          latitude,
          longitude,
          nom: locationName,
          count: 0
        };
        locationEntry.count += 1;
        locationsMap.set(key, locationEntry);

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
          azimut: row.azimut ? String(row.azimut).trim() : undefined
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
