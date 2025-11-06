import database from '../config/database.js';
import client from '../config/elasticsearch.js';
import { isElasticsearchEnabled } from '../config/environment.js';
import {
  sanitizeNumber,
  normalizePhoneNumber,
  buildIdentifierVariants,
  matchesIdentifier,
  normalizeForOutput
} from './phoneUtils.js';

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

const BTS_LOCATION_TABLES = ['2g', '3g', '4g', '5g'];

const BTS_COLUMN_ALIASES = {
  cgi: [
    'cgi',
    'cgi_appelant',
    'cell_global_identity',
    'cell_global_id',
    'cellid',
    'cell_id',
    'lac_ci',
    'eci',
    'ecgi',
    'e_cgi',
    'enodebcellid',
    'cgi_id',
    'c_g_i'
  ],
  longitude: [
    'longitude',
    'longitude_decimal',
    'longitude_dec',
    'longitude_deg',
    'longitude_degre',
    'long_dec',
    'long_deg',
    'long_degre',
    'long_dd',
    'lon',
    'lng',
    'coordx',
    'coord_x',
    'x_coord',
    'xcoord',
    'x_wgs84',
    'x_wgs_84'
  ],
  latitude: [
    'latitude',
    'latitude_decimal',
    'latitude_dec',
    'latitude_deg',
    'latitude_degre',
    'lat_dec',
    'lat_deg',
    'lat_degre',
    'lat_dd',
    'lat',
    'coordy',
    'coord_y',
    'y_coord',
    'ycoord',
    'y_wgs84',
    'y_wgs_84'
  ],
  azimut: [
    'azimut',
    'azimuth',
    'azimut_deg',
    'azimuth_deg',
    'azim',
    'azi',
    'orientation',
    'bearing',
    'direction'
  ],
  nom_bts: [
    'nom_bts',
    'nom bts',
    'nombts',
    'nom_site',
    'nom site',
    'nom',
    'site',
    'site_name',
    'site name',
    'designation',
    'label',
    'station',
    'station_name',
    'station name',
    'cell_name',
    'cellname',
    'bts_name'
  ]
};

const BTS_COLUMN_FALLBACK_PATTERNS = {
  cgi: ['cgi', 'ecgi', 'eci', 'cell_global', 'cellid'],
  longitude: ['longitude', 'coordx', 'x_coord', 'x_wgs'],
  latitude: ['latitude', 'coordy', 'y_coord', 'y_wgs'],
  azimut: ['azimut', 'azimuth', 'orientation', 'bearing'],
  nom_bts: ['nom_bts', 'nom_site', 'site', 'station', 'cell_name']
};

const CDR_TABLE_CANDIDATES = [
  { schema: 'bts_orange', table: 'cdr_temps_reel' },
  { schema: 'autres', table: 'cdr_temps_reel' },
  { schema: null, table: 'cdr_temps_reel' },
  { schema: null, table: 'autres_cdr_temps_reel' }
];

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

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, '').replace(/,/g, '.');
  let num = Number(normalized);

  if (!Number.isFinite(num)) {
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    num = match ? Number(match[0]) : Number.NaN;
  }

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
    this.tableName = null;
    this.tableNamePromise = null;
    this.tableLookupLogged = false;
    this.tableSchema = null;
    this.btsJoinConfig = undefined;
    this.btsJoinPromise = null;
    this.btsJoinMissingLogged = false;
    this.btsTableColumnCache = new Map();
    this.btsColumnWarningLogged = new Set();

    this.initializationPromise = this.elasticEnabled && this.autoStart
      ? this.#initializeElasticsearch().catch((error) => {
          console.error('Erreur initialisation Elasticsearch CDR temps réel:', error);
          this.elasticEnabled = false;
          return false;
        })
      : null;
  }

  #sanitizeIdentifier(identifier) {
    if (typeof identifier !== 'string') {
      return '';
    }
    return identifier.replace(/[^A-Za-z0-9_\$]/g, '');
  }

  #quoteIdentifier(identifier) {
    if (!identifier) {
      return '';
    }
    return `\`${identifier.replace(/`/g, '``')}\``;
  }

  #normalizeCgiExpression(column) {
    if (typeof column !== 'string') {
      return 'NULL';
    }
    const expr = column.trim();
    if (!expr) {
      return 'NULL';
    }

    const replacements = [' ', '-', '_', '.', '/', ':', ';', ',', '#', '(', ')', '[', ']', '{', '}'];
    const sanitized = replacements.reduce((acc, char) => {
      const escaped = char.replace(/\\/g, '\\\\').replace(/'/g, "''");
      return `REPLACE(${acc}, '${escaped}', '')`;
    }, expr);

    return `LOWER(${sanitized})`;
  }

  #normalizeColumnKey(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const text = String(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return text;
  }

  #getBtsTableCacheKey(schema, table) {
    const schemaKey = schema ? this.#normalizeColumnKey(schema) : 'default';
    const tableKey = this.#normalizeColumnKey(table);
    return `${schemaKey || 'default'}:${tableKey}`;
  }

  #formatBtsTableLabel(schema, table) {
    const schemaLabel = schema ? String(schema).trim() : '';
    const tableLabel = String(table || '').trim();
    return schemaLabel ? `${schemaLabel}.${tableLabel}` : tableLabel;
  }

  #inferTechnologyFromTable(table) {
    const key = this.#normalizeColumnKey(table);
    if (!key) {
      return null;
    }

    if (key.includes('5g')) return '5G';
    if (key.includes('4g') || key.includes('lte')) return '4G';
    if (key.includes('3g') || key.includes('umts')) return '3G';
    if (key.includes('2g') || key.includes('gsm')) return '2G';

    return null;
  }

  #warnOnceForBtsTable(schema, table, message) {
    const key = `${this.#getBtsTableCacheKey(schema, table)}:${message}`;
    if (this.btsColumnWarningLogged.has(key)) {
      return;
    }
    this.btsColumnWarningLogged.add(key);
    console.warn(message);
  }

  async #resolveBtsTableColumns(schema, table) {
    const cacheKey = this.#getBtsTableCacheKey(schema, table);
    if (this.btsTableColumnCache.has(cacheKey)) {
      return this.btsTableColumnCache.get(cacheKey);
    }

    const sanitizedTable = this.#sanitizeIdentifier(table);
    if (!sanitizedTable) {
      this.btsTableColumnCache.set(cacheKey, null);
      return null;
    }

    const sanitizedSchema = schema ? this.#sanitizeIdentifier(schema) : null;
    const sql = sanitizedSchema
      ? `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE LOWER(TABLE_SCHEMA) = LOWER(?) AND LOWER(TABLE_NAME) = LOWER(?)`
      : `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`;
    const params = sanitizedSchema ? [sanitizedSchema, sanitizedTable] : [sanitizedTable];

    let rows;
    try {
      rows = await database.query(sql, params);
    } catch (error) {
      console.error('Erreur récupération colonnes BTS:', error);
      this.btsTableColumnCache.set(cacheKey, null);
      return null;
    }

    const columnNames = Array.isArray(rows)
      ? rows
          .map((row) => row.COLUMN_NAME || row.column_name || row.Column_name || null)
          .filter((name) => typeof name === 'string' && name.trim().length > 0)
          .map((name) => name.trim())
      : [];

    if (!columnNames.length) {
      this.btsTableColumnCache.set(cacheKey, null);
      return null;
    }

    const normalizedColumns = [];
    const seenOriginal = new Set();
    for (const name of columnNames) {
      if (seenOriginal.has(name)) {
        continue;
      }
      seenOriginal.add(name);
      normalizedColumns.push({ original: name, normalized: this.#normalizeColumnKey(name) });
    }

    const lookup = new Map();
    for (const { original, normalized } of normalizedColumns) {
      if (normalized && !lookup.has(normalized)) {
        lookup.set(normalized, original);
      }
    }

    const findColumn = (aliases = [], patterns = []) => {
      for (const alias of aliases) {
        const key = this.#normalizeColumnKey(alias);
        if (key && lookup.has(key)) {
          return lookup.get(key);
        }
      }

      for (const pattern of patterns) {
        const patternKey = this.#normalizeColumnKey(pattern);
        if (!patternKey) {
          continue;
        }
        const match = normalizedColumns.find((column) => column.normalized && column.normalized.includes(patternKey));
        if (match) {
          return match.original;
        }
      }

      return null;
    };

    const cgiColumn = findColumn(BTS_COLUMN_ALIASES.cgi, BTS_COLUMN_FALLBACK_PATTERNS.cgi);
    if (!cgiColumn) {
      this.#warnOnceForBtsTable(
        schema,
        table,
        `⚠️ Table ${this.#formatBtsTableLabel(schema, table)} ignorée : colonne CGI introuvable.`
      );
      this.btsTableColumnCache.set(cacheKey, null);
      return null;
    }

    const longitudeColumn = findColumn(
      BTS_COLUMN_ALIASES.longitude,
      BTS_COLUMN_FALLBACK_PATTERNS.longitude
    );
    const latitudeColumn = findColumn(
      BTS_COLUMN_ALIASES.latitude,
      BTS_COLUMN_FALLBACK_PATTERNS.latitude
    );
    const azimutColumn = findColumn(BTS_COLUMN_ALIASES.azimut, BTS_COLUMN_FALLBACK_PATTERNS.azimut);
    const nomBtsColumn = findColumn(BTS_COLUMN_ALIASES.nom_bts, BTS_COLUMN_FALLBACK_PATTERNS.nom_bts);

    if (!longitudeColumn || !latitudeColumn) {
      this.#warnOnceForBtsTable(
        schema,
        table,
        `⚠️ Table ${this.#formatBtsTableLabel(schema, table)} : colonnes longitude/latitude partiellement manquantes.`
      );
    }

    if (!azimutColumn) {
      this.#warnOnceForBtsTable(
        schema,
        table,
        `ℹ️ Table ${this.#formatBtsTableLabel(schema, table)} : colonne azimut introuvable.`
      );
    }

    if (!nomBtsColumn) {
      this.#warnOnceForBtsTable(
        schema,
        table,
        `ℹ️ Table ${this.#formatBtsTableLabel(schema, table)} : colonne nom de site introuvable.`
      );
    }

    const resolvedColumns = {
      cgi: cgiColumn,
      longitude: longitudeColumn,
      latitude: latitudeColumn,
      azimut: azimutColumn,
      nom_bts: nomBtsColumn
    };

    this.btsTableColumnCache.set(cacheKey, resolvedColumns);
    return resolvedColumns;
  }

  #formatTableReference(schema, table) {
    const sanitizedTable = this.#sanitizeIdentifier(table);
    if (!sanitizedTable) {
      throw new Error('Nom de table CDR temps réel invalide.');
    }
    const quotedTable = this.#quoteIdentifier(sanitizedTable);
    if (!schema) {
      return quotedTable;
    }
    const sanitizedSchema = this.#sanitizeIdentifier(schema);
    if (!sanitizedSchema) {
      return quotedTable;
    }
    return `${this.#quoteIdentifier(sanitizedSchema)}.${quotedTable}`;
  }

  async #checkTableExists(schema, table) {
    const sanitizedTable = this.#sanitizeIdentifier(table);
    if (!sanitizedTable) {
      return null;
    }

    const sanitizedSchema = schema ? this.#sanitizeIdentifier(schema) : null;
    const sql = sanitizedSchema
      ? `SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name FROM information_schema.TABLES WHERE LOWER(TABLE_SCHEMA) = LOWER(?) AND LOWER(TABLE_NAME) = LOWER(?) LIMIT 1`
      : `SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) LIMIT 1`;

    const params = sanitizedSchema
      ? [sanitizedSchema, sanitizedTable]
      : [sanitizedTable];

    try {
      const result = await database.queryOne(sql, params);
      const resolvedTable = this.#sanitizeIdentifier(result?.table_name);
      if (!resolvedTable) {
        return null;
      }
      const resolvedSchema = result?.table_schema
        ? this.#sanitizeIdentifier(result.table_schema)
        : sanitizedSchema;
      return {
        schema: resolvedSchema || null,
        table: resolvedTable
      };
    } catch (error) {
      console.error('Erreur lors de la vérification de la table CDR temps réel:', error);
      return null;
    }
  }

  async #resolveTableName() {
    if (this.tableName) {
      return this.tableName;
    }
    if (this.tableNamePromise) {
      return this.tableNamePromise;
    }

    this.tableNamePromise = (async () => {
      for (const candidate of CDR_TABLE_CANDIDATES) {
        const resolved = await this.#checkTableExists(candidate.schema, candidate.table);
        if (resolved) {
          const formatted = this.#formatTableReference(resolved.schema, resolved.table);
          this.tableSchema = resolved.schema || null;
          this.tableName = formatted;
          return formatted;
        }
      }

      if (!this.tableLookupLogged) {
        console.warn(
          "⚠️ Table CDR temps réel introuvable via les candidats configurés. Utilisation du nom par défaut 'cdr_temps_reel'."
        );
        this.tableLookupLogged = true;
      }

      const fallback = this.#formatTableReference(null, 'cdr_temps_reel');
      this.tableSchema = null;
      this.tableName = fallback;
      return fallback;
    })();

    return this.tableNamePromise;
  }

  async #findBtsLocationTables() {
    const schemaCandidates = [];
    if (this.tableSchema) {
      schemaCandidates.push(this.tableSchema);
    }
    schemaCandidates.push('bts_orange', 'autres', null);

    const uniqueSchemas = [];
    const seenSchemas = new Set();
    for (const schema of schemaCandidates) {
      const sanitizedSchema = schema ? this.#sanitizeIdentifier(schema) : null;
      const key = sanitizedSchema || 'default';
      if (seenSchemas.has(key)) {
        continue;
      }
      seenSchemas.add(key);
      uniqueSchemas.push(sanitizedSchema);
    }

    const tables = [];
    const seenTables = new Set();
    for (const schema of uniqueSchemas) {
      for (const tableName of BTS_LOCATION_TABLES) {
        const sanitizedTable = this.#sanitizeIdentifier(tableName);
        if (!sanitizedTable) {
          continue;
        }
        const resolved = await this.#checkTableExists(schema, sanitizedTable);
        if (resolved) {
          const resolvedSchema = resolved.schema ?? schema;
          const resolvedKey = `${resolvedSchema || 'default'}:${resolved.table}`;
          if (seenTables.has(resolvedKey)) {
            continue;
          }
          seenTables.add(resolvedKey);
          tables.push({ schema: resolvedSchema, table: resolved.table });
        }
      }
    }

    return tables;
  }

  async #resolveBtsJoinConfig() {
    await this.#resolveTableName();

    if (this.btsJoinConfig) {
      return this.btsJoinConfig;
    }

    if (this.btsJoinPromise) {
      return this.btsJoinPromise;
    }

    this.btsJoinPromise = (async () => {
      const defaultConfig = {
        joinClause: '',
        selectExpressions: {
          longitude: 'NULL',
          latitude: 'NULL',
          azimut: 'NULL',
          nom_bts: 'NULL',
          technology: 'NULL'
        }
      };

      try {
        const tables = await this.#findBtsLocationTables();
        if (!tables.length) {
          if (!this.btsJoinMissingLogged) {
            console.warn(
              '⚠️ Tables 2G/3G/4G/5G introuvables pour enrichir les CDR temps réel. Les champs de localisation resteront vides.'
            );
            this.btsJoinMissingLogged = true;
          }
          return defaultConfig;
        }

        const technologyPriority = ['5G', '4G', '3G', '2G'];
        const technologyDetails = new Map();

        for (const { schema, table } of tables) {
          const columns = await this.#resolveBtsTableColumns(schema, table);
          if (!columns) {
            continue;
          }

          const tableRef = this.#formatTableReference(schema, table);
          const technologyLabel = this.#inferTechnologyFromTable(table);
          if (!technologyLabel || !technologyPriority.includes(technologyLabel)) {
            continue;
          }

          if (technologyDetails.has(technologyLabel)) {
            continue;
          }

          const alias = `bts_${technologyLabel.toLowerCase()}`;
          const quotedCgi = `${alias}.${this.#quoteIdentifier(columns.cgi)}`;
          const normalizedBtsCgi = this.#normalizeCgiExpression(quotedCgi);
          const normalizedCdrCgi = this.#normalizeCgiExpression('cdr.cgi');

          const joinClause = `
      LEFT JOIN ${tableRef} AS ${alias} ON ${normalizedBtsCgi} = ${normalizedCdrCgi}
    `;

          const fieldExpr = (columnName) => {
            if (!columnName) {
              return 'NULL';
            }
            return `${alias}.${this.#quoteIdentifier(columnName)}`;
          };

          technologyDetails.set(technologyLabel, {
            joinClause,
            expressions: {
              longitude: fieldExpr(columns.longitude),
              latitude: fieldExpr(columns.latitude),
              azimut: fieldExpr(columns.azimut),
              nom_bts: fieldExpr(columns.nom_bts),
              cgi: quotedCgi
            }
          });
        }

        const joinClauses = [];
        const expressionsByTechnology = new Map();

        for (const technology of technologyPriority) {
          const details = technologyDetails.get(technology);
          if (!details) {
            continue;
          }
          joinClauses.push(details.joinClause);
          expressionsByTechnology.set(technology, details.expressions);
        }

        if (!joinClauses.length) {
          if (!this.btsJoinMissingLogged) {
            console.warn(
              '⚠️ Colonnes CGI/coordonnées introuvables dans les tables BTS. Les champs de localisation resteront vides.'
            );
            this.btsJoinMissingLogged = true;
          }
          return defaultConfig;
        }

        const buildCoalesceExpression = (field) => {
          const expressions = [];
          for (const technology of technologyPriority) {
            const techExpressions = expressionsByTechnology.get(technology);
            if (!techExpressions) {
              continue;
            }
            const expr = techExpressions[field];
            if (!expr || expr === 'NULL') {
              continue;
            }
            expressions.push(expr);
          }

          if (!expressions.length) {
            return 'NULL';
          }

          if (expressions.length === 1) {
            return expressions[0];
          }

          return `COALESCE(${expressions.join(', ')})`;
        };

        const technologyExpressions = [];
        for (const technology of technologyPriority) {
          const techExpressions = expressionsByTechnology.get(technology);
          if (!techExpressions || !techExpressions.cgi || techExpressions.cgi === 'NULL') {
            continue;
          }
          technologyExpressions.push(
            `CASE WHEN ${techExpressions.cgi} IS NOT NULL AND ${techExpressions.cgi} <> '' THEN '${technology}' END`
          );
        }

        const technologyExpression = technologyExpressions.length
          ? technologyExpressions.length === 1
            ? technologyExpressions[0]
            : `COALESCE(${technologyExpressions.join(', ')})`
          : 'NULL';

        return {
          joinClause: joinClauses.join('\n'),
          selectExpressions: {
            longitude: buildCoalesceExpression('longitude'),
            latitude: buildCoalesceExpression('latitude'),
            azimut: buildCoalesceExpression('azimut'),
            nom_bts: buildCoalesceExpression('nom_bts'),
            technology: technologyExpression
          }
        };
      } catch (error) {
        console.error('Erreur lors de la préparation des données de localisation BTS:', error);
        return defaultConfig;
      }
    })().then((config) => {
      this.btsJoinConfig = config;
      this.btsJoinPromise = null;
      return config;
    });

    return this.btsJoinPromise;
  }

  async enrichMissingCoordinates(options = {}) {
    const {
      batchSize: rawBatchSize = null,
      limit: rawLimit = null,
      dryRun = false,
      onBatchComplete = null
    } = options;

    const batchSize = parsePositiveInteger(rawBatchSize, 1000);
    const limit = rawLimit !== null && rawLimit !== undefined ? parsePositiveInteger(rawLimit, null) : null;

    const tableName = await this.#resolveTableName();
    const { joinClause, selectExpressions } = await this.#resolveBtsJoinConfig();

    if (!joinClause) {
      if (!this.btsJoinMissingLogged) {
        console.warn(
          '⚠️ Impossible d\'enrichir les CDR temps réel : aucune table radio 2G/3G/4G/5G trouvée.'
        );
        this.btsJoinMissingLogged = true;
      }
      return {
        updated: 0,
        scanned: 0,
        batches: 0,
        lastId: 0,
        dryRun: Boolean(dryRun)
      };
    }

    let lastId = 0;
    let scanned = 0;
    let updated = 0;
    let batches = 0;

    const buildCaseExpression = (rows, column) => {
      const parts = [];
      const params = [];
      const ids = [];

      for (const row of rows) {
        const value = row[column];
        if (value === null || value === undefined) {
          continue;
        }
        parts.push(' WHEN ? THEN ?');
        params.push(row.id, value);
        ids.push(row.id);
      }

      if (!parts.length) {
        return null;
      }

      return {
        column,
        expression: `CASE id${parts.join('')} ELSE ${column} END`,
        params,
        ids
      };
    };

    while (true) {
      const remaining = limit !== null ? limit - updated : null;
      if (remaining !== null && remaining <= 0) {
        break;
      }

      const currentBatchSize = remaining !== null ? Math.min(batchSize, remaining) : batchSize;
      if (!currentBatchSize || currentBatchSize <= 0) {
        break;
      }

      const rows = await database.query(
        `
          SELECT
            cdr.id AS id,
            ${selectExpressions.longitude} AS bts_longitude,
            ${selectExpressions.latitude} AS bts_latitude,
            ${selectExpressions.azimut} AS bts_azimut,
            ${selectExpressions.nom_bts} AS bts_nom_bts
          FROM ${tableName} AS cdr
          ${joinClause}
          WHERE cdr.id > ?
            AND (cdr.longitude IS NULL OR cdr.latitude IS NULL OR cdr.azimut IS NULL OR cdr.nom_bts IS NULL)
            AND (
              ${selectExpressions.longitude} IS NOT NULL
              OR ${selectExpressions.latitude} IS NOT NULL
              OR ${selectExpressions.azimut} IS NOT NULL
              OR ${selectExpressions.nom_bts} IS NOT NULL
            )
          ORDER BY cdr.id
          LIMIT ${currentBatchSize}
        `,
        [lastId]
      );

      if (!rows.length) {
        break;
      }

      batches += 1;
      scanned += rows.length;

      const updatableRows = rows
        .map((row) => ({
          id: Number(row.id),
          longitude: toNullableNumber(row.bts_longitude),
          latitude: toNullableNumber(row.bts_latitude),
          azimut: toNullableNumber(row.bts_azimut),
          nom_bts: normalizeString(row.bts_nom_bts)
        }))
        .filter(
          (row) =>
            Number.isFinite(row.id) &&
            (row.longitude !== null || row.latitude !== null || row.azimut !== null || row.nom_bts !== null)
        );

      const expressions = ['longitude', 'latitude', 'azimut', 'nom_bts']
        .map((column) => buildCaseExpression(updatableRows, column))
        .filter(Boolean);

      let batchUpdated = 0;
      if (expressions.length) {
        const ids = Array.from(
          new Set(
            expressions.flatMap((expr) => expr.ids.filter((id) => Number.isFinite(id)))
          )
        ).sort((a, b) => a - b);

        if (ids.length) {
          const updateSql = `
            UPDATE ${tableName}
            SET ${expressions.map((expr) => `${expr.column} = ${expr.expression}`).join(', ')}
            WHERE id IN (${ids.map(() => '?').join(', ')})
          `;
          const params = expressions.flatMap((expr) => expr.params).concat(ids);

          if (!dryRun) {
            await database.transaction(async ({ query }) => {
              await query(updateSql, params);
            });
          }

          batchUpdated = ids.length;
          updated += batchUpdated;
        }
      }

      const lastRow = rows[rows.length - 1];
      const resolvedLastId = Number(lastRow?.id);
      if (Number.isFinite(resolvedLastId) && resolvedLastId > lastId) {
        lastId = resolvedLastId;
      }

      if (typeof onBatchComplete === 'function') {
        try {
          await onBatchComplete({
            batch: batches,
            fetched: rows.length,
            candidates: updatableRows.length,
            updated: batchUpdated,
            lastId
          });
        } catch (callbackError) {
          console.error('Erreur callback enrichissement CDR temps réel:', callbackError);
        }
      }
    }

    return {
      updated,
      scanned,
      batches,
      lastId,
      dryRun: Boolean(dryRun)
    };
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

    let rowsFromElasticsearch = null;

    if (this.elasticEnabled && this.indexReady) {
      rowsFromElasticsearch = await this.#searchElasticsearch(
        Array.from(identifierVariants),
        {
          startDate,
          endDate,
          startTimeBound,
          endTimeBound,
          limit: limitValue
        }
      );

      if (Array.isArray(rowsFromElasticsearch) && rowsFromElasticsearch.length > 0) {
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

  async #searchDatabase(identifierVariants, filters) {
    const conditions = [];
    const params = [];

    const variantList = Array.from(identifierVariants);
    if (variantList.length > 0) {
      const numberConditions = variantList.map(
        () => '(cdr.numero_appelant = ? OR cdr.numero_appele = ?)'
      );
      conditions.push(`(${numberConditions.join(' OR ')})`);
      variantList.forEach((variant) => {
        params.push(variant, variant);
      });
    }

    if (filters.startDate) {
      conditions.push('cdr.date_debut >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push('cdr.date_debut <= ?');
      params.push(filters.endDate);
    }

    if (filters.startTimeBound) {
      conditions.push('cdr.heure_debut >= ?');
      params.push(filters.startTimeBound);
    }
    if (filters.endTimeBound) {
      conditions.push('cdr.heure_debut <= ?');
      params.push(filters.endTimeBound);
    }

    params.push(filters.limit);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const tableName = await this.#resolveTableName();
    const { joinClause, selectExpressions } = await this.#resolveBtsJoinConfig();

    const sql = `
      SELECT
        cdr.id,
        cdr.seq_number,
        cdr.type_appel,
        cdr.statut_appel,
        cdr.cause_liberation,
        cdr.facturation,
        cdr.date_debut AS date_debut_appel,
        cdr.date_fin AS date_fin_appel,
        cdr.heure_debut AS heure_debut_appel,
        cdr.heure_fin AS heure_fin_appel,
        cdr.duree_sec AS duree_appel,
        cdr.numero_appelant,
        cdr.imei_appelant,
        cdr.numero_appele,
        cdr.imsi_appelant,
        cdr.cgi,
        ${selectExpressions.longitude} AS longitude,
        ${selectExpressions.latitude} AS latitude,
        ${selectExpressions.azimut} AS azimut,
        ${selectExpressions.nom_bts} AS nom_bts,
        ${selectExpressions.technology} AS technology,
        cdr.route_reseau,
        cdr.device_id,
        cdr.fichier_source AS source_file,
        cdr.inserted_at
      FROM ${tableName} AS cdr
      ${joinClause}
      ${whereClause}
      ORDER BY cdr.date_debut ASC, cdr.heure_debut ASC, cdr.id ASC
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
          longitude: source.longitude ?? null,
          latitude: source.latitude ?? null,
          azimut: source.azimut ?? null,
          nom_bts: source.nom_bts ?? null,
          route_reseau: source.route_reseau ?? null,
          device_id: source.device_id ?? null,
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
              statut_appel: { type: 'keyword' },
              cause_liberation: { type: 'keyword' },
              facturation: { type: 'keyword' },
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
              route_reseau: { type: 'keyword' },
              device_id: { type: 'keyword' },
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

    const tableName = await this.#resolveTableName();

    const { joinClause, selectExpressions } = await this.#resolveBtsJoinConfig();

    return database.query(
      `
        SELECT
          cdr.id,
          cdr.seq_number,
          cdr.type_appel,
          cdr.statut_appel,
          cdr.cause_liberation,
          cdr.facturation,
          cdr.date_debut AS date_debut_appel,
          cdr.date_fin AS date_fin_appel,
          cdr.heure_debut AS heure_debut_appel,
          cdr.heure_fin AS heure_fin_appel,
          cdr.duree_sec AS duree_appel,
          cdr.numero_appelant,
          cdr.imei_appelant,
          cdr.numero_appele,
          cdr.imsi_appelant,
          cdr.cgi,
          ${selectExpressions.longitude} AS longitude,
          ${selectExpressions.latitude} AS latitude,
          ${selectExpressions.azimut} AS azimut,
          ${selectExpressions.nom_bts} AS nom_bts,
          cdr.route_reseau,
          cdr.device_id,
          cdr.fichier_source AS source_file,
          cdr.inserted_at
        FROM ${tableName} AS cdr
        ${joinClause}
        WHERE cdr.id > ?
        ORDER BY cdr.id ASC
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
      seq_number: toNullableNumber(row.seq_number),
      type_appel: normalizeString(row.type_appel),
      statut_appel: normalizeString(row.statut_appel),
      cause_liberation: normalizeString(row.cause_liberation),
      facturation: normalizeString(row.facturation),
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
      technology: normalizeString(row.technology),
      route_reseau: normalizeString(row.route_reseau),
      device_id: normalizeString(row.device_id),
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
      const technology = row.technology ? String(row.technology).trim() : '';

      if (latitude && longitude) {
        const locationName = row.nom_bts ? String(row.nom_bts).trim() : '';
        const key = `${latitude},${longitude},${locationName}`;
        const locationEntry = locationsMap.get(key) || {
          latitude,
          longitude,
          nom: locationName,
          count: 0,
          technology: technology || undefined
        };
        locationEntry.count += 1;
        if (technology && !locationEntry.technology) {
          locationEntry.technology = technology;
        }
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
          azimut: row.azimut ? String(row.azimut).trim() : undefined,
          technology: technology || undefined,
          seqNumber:
            row.seq_number !== null && row.seq_number !== undefined
              ? String(row.seq_number)
              : undefined,
          statutAppel: row.statut_appel ? String(row.statut_appel).trim() : undefined,
          causeLiberation: row.cause_liberation
            ? String(row.cause_liberation).trim()
            : undefined,
          facturation: row.facturation ? String(row.facturation).trim() : undefined,
          routeReseau: row.route_reseau ? String(row.route_reseau).trim() : undefined,
          deviceId: row.device_id ? String(row.device_id).trim() : undefined
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

export { RealtimeCdrService, buildIdentifierVariants };
export default realtimeCdrService;
