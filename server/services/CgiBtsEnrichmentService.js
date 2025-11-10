import { performance } from 'node:perf_hooks';
import database from '../config/database.js';
import {
  getCdrBtsCacheConfiguration,
  isCdrBtsDebugEnabled,
  isCdrBtsEnrichmentEnabled
} from '../config/cdr-enrichment.js';

class TimedLruCache {
  constructor(options = {}) {
    const { maxSize = 5000, ttlMs = 20 * 60 * 1000 } = options;
    this.maxSize = Math.max(1, Number.isFinite(maxSize) ? Math.floor(maxSize) : 5000);
    this.ttlMs = Math.max(1000, Number.isFinite(ttlMs) ? Math.floor(ttlMs) : 20 * 60 * 1000);
    this.store = new Map();
  }

  #isExpired(entry) {
    if (!entry) {
      return true;
    }
    if (!Number.isFinite(entry.expiresAt)) {
      return false;
    }
    return entry.expiresAt <= Date.now();
  }

  has(key) {
    if (!this.store.has(key)) {
      return false;
    }
    const entry = this.store.get(key);
    if (this.#isExpired(entry)) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  get(key) {
    if (!this.has(key)) {
      return undefined;
    }
    const entry = this.store.get(key);
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    const expiresAt = this.ttlMs > 0 ? Date.now() + this.ttlMs : Number.POSITIVE_INFINITY;
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { value, expiresAt });
    if (this.store.size > this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
  }

  clear() {
    this.store.clear();
  }
}

const RADIO_TABLE_CANDIDATES = [
  {
    priority: 1,
    candidates: [
      'bts-orange.`2g`',
      'bts_orange.`2g`',
      'bts-orange.`2G`',
      'bts_orange.`2G`',
      'bts-orange.radio_2g',
      'bts_orange.radio_2g',
      'bts-orange.radio2g',
      'bts_orange.radio2g',
      'bts-orange.RADIO_2G',
      'bts_orange.RADIO_2G',
      'bts-orange.RADIO2G',
      'bts_orange.RADIO2G',
      'radio_2g',
      'RADIO_2G',
      'radio2g',
      'RADIO2G'
    ]
  },
  {
    priority: 2,
    candidates: [
      'bts-orange.`3g`',
      'bts_orange.`3g`',
      'bts-orange.`3G`',
      'bts_orange.`3G`',
      'bts-orange.radio_3g',
      'bts_orange.radio_3g',
      'bts-orange.radio3g',
      'bts_orange.radio3g',
      'bts-orange.RADIO_3G',
      'bts_orange.RADIO_3G',
      'bts-orange.RADIO3G',
      'bts_orange.RADIO3G',
      'radio_3g',
      'RADIO_3G',
      'radio3g',
      'RADIO3G'
    ]
  },
  {
    priority: 3,
    candidates: [
      'bts-orange.`4g`',
      'bts_orange.`4g`',
      'bts-orange.`4G`',
      'bts_orange.`4G`',
      'bts-orange.radio_4g',
      'bts_orange.radio_4g',
      'bts-orange.radio4g',
      'bts_orange.radio4g',
      'bts-orange.RADIO_4G',
      'bts_orange.RADIO_4G',
      'bts-orange.RADIO4G',
      'bts_orange.RADIO4G',
      'radio_4g',
      'RADIO_4G',
      'radio4g',
      'RADIO4G'
    ]
  },
  {
    priority: 4,
    candidates: [
      'bts-orange.`5g`',
      'bts_orange.`5g`',
      'bts-orange.`5G`',
      'bts_orange.`5G`',
      'bts-orange.radio_5g',
      'bts_orange.radio_5g',
      'bts-orange.radio5g',
      'bts_orange.radio5g',
      'bts-orange.RADIO_5G',
      'bts_orange.RADIO_5G',
      'bts-orange.RADIO5G',
      'bts_orange.RADIO5G',
      'radio_5g',
      'RADIO_5G',
      'radio5g',
      'RADIO5G'
    ]
  }
];

const sanitizeTableIdentifier = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/`/g, '').trim();
};

const parseTableIdentifier = (value) => {
  const sanitized = sanitizeTableIdentifier(value);
  if (!sanitized) {
    return null;
  }
  const parts = sanitized
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return { schema: null, table: parts[0] };
  }
  return { schema: parts[0], table: parts.slice(1).join('.') };
};

const quoteIdentifier = (value) => `\`${value.replace(/`/g, '``')}\``;

const formatTableReference = ({ schema, table }) => {
  if (!table) {
    return null;
  }
  if (schema) {
    return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  }
  return quoteIdentifier(table);
};

const normalizeString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
};

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

class CgiBtsEnrichmentService {
  constructor(options = {}) {
    const cacheConfig = getCdrBtsCacheConfiguration();
    const {
      enabled = isCdrBtsEnrichmentEnabled(),
      cacheSize = cacheConfig.maxSize,
      ttlMs = cacheConfig.ttlMs,
      debug = isCdrBtsDebugEnabled(),
      databaseClient = database,
      staticTables = null,
      lookupExecutor = null
    } = options;

    this.enabled = Boolean(enabled);
    this.debug = Boolean(debug);
    this.cache = new TimedLruCache({ maxSize: cacheSize, ttlMs });
    this.database = databaseClient;
    this.staticTables = Array.isArray(staticTables) ? staticTables : null;
    this.lookupExecutor = typeof lookupExecutor === 'function' ? lookupExecutor : null;

    this.lookupSourcesPromise = null;
    this.pendingLookups = new Map();
    this.reportedMissingIndexes = new Set();

    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      lookupRequests: 0,
      lookupErrors: 0,
      totalLookupMs: 0,
      maxLookupMs: 0
    };
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
  }

  setLookupExecutor(executor) {
    this.lookupExecutor = typeof executor === 'function' ? executor : null;
  }

  clearCache() {
    this.cache.clear();
  }

  getMetrics() {
    const { cacheHits, cacheMisses, lookupRequests, lookupErrors, totalLookupMs, maxLookupMs } = this.metrics;
    const averageLookupMs = lookupRequests > 0 ? totalLookupMs / lookupRequests : 0;
    const failureRate = lookupRequests > 0 ? lookupErrors / lookupRequests : 0;
    return {
      cacheHits,
      cacheMisses,
      lookupRequests,
      lookupErrors,
      averageLookupMs,
      maxLookupMs,
      failureRate
    };
  }

  async listLookupSources() {
    const sources = await this.#getLookupSources();
    if (!Array.isArray(sources)) {
      return [];
    }

    return sources.map((source) => ({
      tableSql: source.tableSql,
      priority: source.priority,
      schema: source.schema ?? null,
      table: source.table ?? null
    }));
  }

  async fetchOne(cgi) {
    const map = await this.fetchMany([cgi]);
    const normalized = this.#normalizeCgi(cgi);
    return map.get(normalized) ?? null;
  }

  async fetchMany(cgiList) {
    if (!this.enabled) {
      return new Map();
    }

    const normalizedKeys = [];
    for (const value of cgiList || []) {
      const key = this.#normalizeCgi(value);
      if (key) {
        normalizedKeys.push(key);
      }
    }

    if (normalizedKeys.length === 0) {
      return new Map();
    }

    const uniqueKeys = Array.from(new Set(normalizedKeys));
    const results = new Map();
    const missing = [];

    for (const key of uniqueKeys) {
      if (this.cache.has(key)) {
        const cached = this.cache.get(key);
        results.set(key, cached);
        this.metrics.cacheHits += 1;
      } else {
        missing.push(key);
        this.metrics.cacheMisses += 1;
      }
    }

    if (missing.length === 0) {
      return results;
    }

    const batchKey = missing.slice().sort().join('||');
    let lookupPromise = this.pendingLookups.get(batchKey);
    if (!lookupPromise) {
      lookupPromise = this.#performLookup(missing);
      this.pendingLookups.set(batchKey, lookupPromise);
    }

    let lookupResults = new Map();
    try {
      lookupResults = await lookupPromise;
    } finally {
      this.pendingLookups.delete(batchKey);
    }

    for (const key of missing) {
      const value = lookupResults.get(key) ?? null;
      this.cache.set(key, value);
      results.set(key, value);
    }

    return results;
  }

  async #performLookup(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
      return new Map();
    }

    this.#debug('Début recherche des coordonnées BTS pour CGI.', { keys });
    const start = performance.now();
    this.metrics.lookupRequests += 1;

    try {
      let lookupMap;
      if (this.lookupExecutor) {
        this.#debug('Utilisation du moteur de recherche BTS personnalisé.', { keys });
        const value = await this.lookupExecutor(keys.slice());
        lookupMap = value instanceof Map ? value : this.#normalizeLookupResult(value, keys);
      } else {
        lookupMap = await this.#lookupFromDatabase(keys);
      }

      const elapsed = performance.now() - start;
      this.metrics.totalLookupMs += elapsed;
      if (elapsed > this.metrics.maxLookupMs) {
        this.metrics.maxLookupMs = elapsed;
      }

      if (lookupMap instanceof Map) {
        const entries = Array.from(lookupMap.entries()).map(([key, value]) => ({
          cgi: key,
          longitude: value?.longitude ?? null,
          latitude: value?.latitude ?? null,
          azimut: value?.azimut ?? null,
          nom_bts: value?.nom_bts ?? null
        }));
        this.#debug('Résultats de la recherche des coordonnées BTS.', {
          keys,
          resultCount: lookupMap.size,
          entries
        });
      }

      return lookupMap;
    } catch (error) {
      this.metrics.lookupErrors += 1;
      this.#debug('Erreur lors du chargement des coordonnées BTS pour CGI:', error);
      return new Map();
    }
  }

  #normalizeLookupResult(value, keys) {
    const normalized = new Map();
    if (value && typeof value === 'object') {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          normalized.set(key, value[key]);
        }
      }
    }
    return normalized;
  }

  async #lookupFromDatabase(keys) {
    const sources = await this.#getLookupSources();
    if (!Array.isArray(sources) || sources.length === 0) {
      this.#debug('Aucune source de données BTS disponible pour la recherche.', { keys });
      return new Map();
    }

    const normalizedKeys = keys
      .map((key) => this.#normalizeCgi(key))
      .filter((key) => typeof key === 'string' && key.length > 0);
    if (normalizedKeys.length === 0) {
      return new Map();
    }

    const placeholders = normalizedKeys.map(() => '?').join(', ');
    const normalizedExpression = 'UPPER(TRIM(CGI))';
    const unionSegments = sources
      .map(
        (source, index) =>
          `SELECT CGI, NOM_BTS, LONGITUDE, LATITUDE, AZIMUT, ${
            source.priority ?? index + 1
          } AS priority FROM ${source.tableSql} WHERE ${normalizedExpression} IN (${placeholders})`
      )
      .join('\n    UNION ALL\n');

    const sql = `
      WITH unioned AS (
        ${unionSegments}
      )
      SELECT u.CGI, u.NOM_BTS, u.LONGITUDE, u.LATITUDE, u.AZIMUT
      FROM unioned u
      INNER JOIN (
        SELECT CGI, MIN(priority) AS min_priority
        FROM unioned
        GROUP BY CGI
      ) best ON u.CGI = best.CGI AND u.priority = best.min_priority
    `;

    const params = [];
    for (let i = 0; i < sources.length; i += 1) {
      params.push(...normalizedKeys);
    }

    const debugSql = sql.replace(/\s+/g, ' ').trim();
    this.#debug('Exécution de la requête SQL pour les coordonnées BTS.', {
      keys,
      tables: sources.map((source) => ({
        tableSql: source.tableSql,
        priority: source.priority ?? null
      })),
      sql: debugSql,
      params
    });

    const rows = await this.database.query(sql, params, {
      suppressErrorCodes: ['ER_NO_SUCH_TABLE', '42S02'],
      suppressErrorLog: true
    });

    this.#debug('Résultats bruts retournés par la base BTS.', {
      rowCount: Array.isArray(rows) ? rows.length : 0,
      rows
    });

    const result = new Map();
    for (const row of rows || []) {
      const key = this.#normalizeCgi(row?.CGI ?? row?.cgi);
      if (!key || result.has(key)) {
        continue;
      }

      result.set(key, {
        nom_bts: normalizeString(row?.NOM_BTS ?? row?.nom_bts),
        longitude: toNullableNumber(row?.LONGITUDE ?? row?.longitude),
        latitude: toNullableNumber(row?.LATITUDE ?? row?.latitude),
        azimut: toNullableNumber(row?.AZIMUT ?? row?.azimut)
      });
    }

    this.#debug('Carte des coordonnées BTS normalisées prête.', {
      keys,
      resultCount: result.size
    });

    return result;
  }

  async #getLookupSources() {
    if (this.staticTables) {
      return this.staticTables.map((entry, index) => ({
        tableSql: entry.tableSql,
        priority: entry.priority ?? index + 1,
        schema: entry.schema ?? null,
        table: entry.table ?? null
      }));
    }

    if (!this.lookupSourcesPromise) {
      this.lookupSourcesPromise = this.#detectLookupSources().catch((error) => {
        this.#debug('Impossible de détecter les tables BTS pour enrichissement CGI:', error);
        return [];
      });
    }

    return this.lookupSourcesPromise;
  }

  async #detectLookupSources() {
    const detected = [];

    for (const definition of RADIO_TABLE_CANDIDATES) {
      for (const candidate of definition.candidates) {
        const parsed = parseTableIdentifier(candidate);
        if (!parsed || !parsed.table) {
          continue;
        }

        const exists = await this.#tableExists(parsed);
        if (!exists) {
          continue;
        }

        const tableSql = formatTableReference(parsed);
        if (!tableSql) {
          continue;
        }

        await this.#checkCgiIndex(parsed);

        detected.push({
          tableSql,
          priority: definition.priority,
          schema: parsed.schema,
          table: parsed.table
        });
        break;
      }
    }

    detected.sort((a, b) => a.priority - b.priority);
    return detected;
  }

  async #tableExists(reference) {
    const { schema, table } = reference;
    const sql = schema
      ? 'SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1'
      : 'SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1';
    const params = schema ? [schema, table] : [table];
    try {
      const rows = await this.database.query(sql, params, {
        suppressErrorCodes: ['ER_NO_SUCH_TABLE', '42S02'],
        suppressErrorLog: true
      });
      return Array.isArray(rows) && rows.length > 0;
    } catch (error) {
      this.#debug('Vérification de table BTS impossible:', error);
      return false;
    }
  }

  async #checkCgiIndex(reference) {
    const cacheKey = `${reference.schema || 'default'}.${reference.table}`;
    if (this.reportedMissingIndexes.has(cacheKey)) {
      return;
    }

    const sql = reference.schema
      ? `
        SELECT 1
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'CGI'
        LIMIT 1
      `
      : `
        SELECT 1
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'CGI'
        LIMIT 1
      `;

    const params = reference.schema ? [reference.schema, reference.table] : [reference.table];
    try {
      const rows = await this.database.query(sql, params, {
        suppressErrorCodes: ['ER_NO_SUCH_TABLE', '42S02'],
        suppressErrorLog: true
      });
      const hasIndex = Array.isArray(rows) && rows.length > 0;
      if (!hasIndex) {
        this.reportedMissingIndexes.add(cacheKey);
        const tableId = reference.schema ? `${reference.schema}.${reference.table}` : reference.table;
        console.warn(
          `⚠️ Index manquant sur la colonne CGI pour ${tableId}. ` +
            `Créer un index avec: CREATE INDEX idx_${reference.table}_cgi ON ${tableId}(CGI);`
        );
      }
    } catch (error) {
      this.#debug('Impossible de vérifier les index CGI pour une table BTS:', error);
    }
  }

  #normalizeCgi(value) {
    if (value === null || value === undefined) {
      return '';
    }
    const text = String(value).trim();
    return text ? text.toUpperCase() : '';
  }

  #debug(message, ...details) {
    if (!this.debug) {
      return;
    }
    if (details.length > 0) {
      console.debug(`[CDR-BTS] ${message}`, ...details);
    } else {
      console.debug(`[CDR-BTS] ${message}`);
    }
  }
}

const cgiBtsEnricher = new CgiBtsEnrichmentService();

export { CgiBtsEnrichmentService };
export default cgiBtsEnricher;
