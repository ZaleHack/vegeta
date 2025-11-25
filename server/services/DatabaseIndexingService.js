import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import database from '../config/database.js';
import baseCatalog from '../config/tables-catalog.js';
import {
  getRealtimeCdrTableIdentifiers,
  REALTIME_CDR_TABLE_METADATA
} from '../config/realtime-table.js';

const DEFAULT_EXCLUSIONS = [
  'blacklist',
  'divisions',
  'profiles',
  'profile_attachments',
  'profile_shares',
  'structuresanctions',
  'search_sync_events',
  'upload_history',
  'users',
  'users_log',
  'user_sessions',
  'search_logs'
];

const TEXT_TYPES = new Set(['text', 'mediumtext', 'longtext', 'tinytext']);
const BLOB_TYPES = new Set(['blob', 'mediumblob', 'longblob', 'tinyblob']);
const UNSUPPORTED_TYPES = new Set(['json']);

const ADDITIONAL_INDEXING_TABLES = ['autres.data_orange'];

const sanitizeIdentifier = (name) => name.replace(/[^a-zA-Z0-9_]/g, '_');

class DatabaseIndexingService {
  constructor({ db = database, logger = console } = {}) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    this.database = db;
    this.logger = logger;
    this.catalogPath = path.join(__dirname, '../config/tables-catalog.json');
    this.tableExclusions = this.#buildTableExclusions();
  }

  #buildTableExclusions() {
    const exclusions = new Set();

    DEFAULT_EXCLUSIONS.forEach((entry) => {
      const normalized = entry.toLowerCase();
      exclusions.add(normalized);
      exclusions.add(`autres.${normalized}`);
    });

    const shouldExcludeRealtime =
      process.env.EXCLUDE_REALTIME_CDR_FROM_INDEXING === 'true';

    if (shouldExcludeRealtime) {
      const realtimeIdentifiers = getRealtimeCdrTableIdentifiers();
      const realtimeSchema = REALTIME_CDR_TABLE_METADATA.schema;
      const realtimeTable = REALTIME_CDR_TABLE_METADATA.table;

      if (realtimeSchema && realtimeTable) {
        realtimeIdentifiers.add(
          `${realtimeSchema}.${realtimeTable}`.toLowerCase()
        );
      }

      for (const identifier of realtimeIdentifiers) {
        const normalized = identifier.toLowerCase();
        exclusions.add(normalized);
        const [, withoutSchema = normalized] = normalized.split('.');
        if (withoutSchema) {
          exclusions.add(withoutSchema);
          exclusions.add(`autres.${withoutSchema}`);
        }
      }
    }

    return exclusions;
  }

  loadCatalog() {
    let catalog = { ...baseCatalog };

    try {
      if (fs.existsSync(this.catalogPath)) {
        const raw = fs.readFileSync(this.catalogPath, 'utf-8');
        const json = JSON.parse(raw);

        for (const [key, value] of Object.entries(json)) {
          let dbName;
          let tableKey;

          if (key.includes('.')) {
            const [schema, ...tableParts] = key.split('.');
            if (!schema || tableParts.length === 0) {
              this.logger.warn(`⚠️ Entrée de catalogue invalide ignorée: ${key}`);
              continue;
            }
            dbName = schema;
            tableKey = tableParts.join('.');
          } else {
            const [schema, ...tableParts] = key.split('_');
            if (!schema || tableParts.length === 0) {
              this.logger.warn(`⚠️ Entrée de catalogue invalide ignorée: ${key}`);
              continue;
            }
            dbName = schema;
            tableKey = tableParts.join('_');
          }

          const tableName = `${dbName}.${tableKey}`;
          const existing = catalog[tableName] || {};
          const merged = { ...existing, ...value };

          if (!merged.database) {
            merged.database = dbName;
          }

          catalog[tableName] = merged;
        }
      }
    } catch (error) {
      this.logger.error('❌ Erreur chargement catalogue:', error);
    }

    return catalog;
  }

  #isTableExcluded(schema, table) {
    const normalizedSchema = (schema || '').toLowerCase();
    const normalizedTable = (table || '').toLowerCase();
    const fullName = `${normalizedSchema}.${normalizedTable}`;

    return (
      this.tableExclusions.has(normalizedTable) ||
      this.tableExclusions.has(fullName)
    );
  }

  async #indexExists(schema, table, indexName) {
    const existingIndex = await this.database.queryOne(
      `
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?
        LIMIT 1
      `,
      [schema, table, indexName]
    );

    return Boolean(existingIndex);
  }

  async #columnExists(schema, table, columnName) {
    const existingColumn = await this.database.queryOne(
      `
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [schema, table, columnName]
    );

    return Boolean(existingColumn);
  }

  async #getTableColumns(schema, table) {
    const columns = await this.database.query(
      `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `,
      [schema, table]
    );

    return columns.map((column) => ({
      name: column.column_name,
      dataType: column.data_type,
      maxLength: column.character_maximum_length
    }));
  }

  async #isColumnIndexed(schema, table, columnName) {
    const existing = await this.database.queryOne(
      `
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [schema, table, columnName]
    );

    return Boolean(existing);
  }

  #getColumnIndexExpression(column) {
    const type = column.dataType?.toLowerCase();

    if (UNSUPPORTED_TYPES.has(type)) {
      return null;
    }

    if (TEXT_TYPES.has(type) || BLOB_TYPES.has(type)) {
      const length = column.maxLength && Number.isFinite(Number(column.maxLength))
        ? Math.min(Number(column.maxLength), 255)
        : 255;
      return `\`${column.name}\`(${length})`;
    }

    return `\`${column.name}\``;
  }

  #resolveTable(tableKey, config) {
    const [defaultSchema, defaultTable] = tableKey.split('.');
    const schema = config.database || defaultSchema || 'autres';
    const table = defaultTable || tableKey;
    return { schema, table };
  }

  buildIndexName(schema, table, column) {
    return `idx_${sanitizeIdentifier(schema)}_${sanitizeIdentifier(table)}_${sanitizeIdentifier(column)}`.slice(0, 63);
  }

  async ensureIndexes({ dryRun = false } = {}) {
    const catalog = this.loadCatalog();

    for (const table of ADDITIONAL_INDEXING_TABLES) {
      if (!catalog[table]) {
        const [schema = 'autres', tableName = ''] = table.split('.');
        const resolvedTable = tableName || schema;
        catalog[table] = { database: schema, display: resolvedTable };
      }
    }
    const summary = {
      tablesProcessed: 0,
      columnsEvaluated: 0,
      indexesCreated: 0,
      indexesSkipped: 0,
      errors: []
    };

    for (const [tableKey, config] of Object.entries(catalog)) {
      const { schema, table } = this.#resolveTable(tableKey, config);

      if (this.#isTableExcluded(schema, table)) {
        this.logger.log(`ℹ️ Table ${schema}.${table} ignorée (liste d'exclusion)`);
        continue;
      }

      let columns = [];

      try {
        columns = await this.#getTableColumns(schema, table);
      } catch (error) {
        const message = `❌ Impossible de récupérer les colonnes pour ${schema}.${table}: ${error.message}`;
        this.logger.log(message);
        summary.errors.push({ table: `${schema}.${table}`, error });
        continue;
      }

      if (!columns.length) {
        this.logger.log(`ℹ️ Aucune colonne détectée pour ${schema}.${table}, aucun index créé`);
        continue;
      }

      summary.tablesProcessed += 1;

      for (const column of columns) {
        summary.columnsEvaluated += 1;
        const indexExpression = this.#getColumnIndexExpression(column);

        if (!indexExpression) {
          this.logger.log(
            `⚠️ Colonne ${column.name} (${column.dataType}) ignorée pour ${schema}.${table} (type non pris en charge)`
          );
          summary.indexesSkipped += 1;
          continue;
        }

        const indexName = this.buildIndexName(schema, table, column.name);

        try {
          const hasColumn = await this.#columnExists(schema, table, column.name);
          if (!hasColumn) {
            this.logger.log(
              `⚠️ Colonne ${column.name} introuvable dans ${schema}.${table}, index ${indexName} ignoré`
            );
            summary.indexesSkipped += 1;
            continue;
          }

          const alreadyIndexed = await this.#isColumnIndexed(schema, table, column.name);
          if (alreadyIndexed) {
            this.logger.log(`ℹ️ Colonne ${column.name} déjà indexée dans ${schema}.${table}`);
            summary.indexesSkipped += 1;
            continue;
          }

          const exists = await this.#indexExists(schema, table, indexName);
          if (exists) {
            this.logger.log(`ℹ️ Index ${indexName} déjà présent`);
            summary.indexesSkipped += 1;
            continue;
          }

          if (dryRun) {
            this.logger.log(`🔍 [DRY-RUN] Index ${indexName} serait créé sur ${schema}.${table}`);
            summary.indexesCreated += 1;
            continue;
          }

          await this.database.query(
            `CREATE INDEX \`${indexName}\` ON \`${schema}\`.\`${table}\` (${indexExpression})`
          );
          this.logger.log(`✅ Index ${indexName} créé`);
          summary.indexesCreated += 1;
        } catch (error) {
          const message = `❌ Échec création index ${indexName}: ${error.message}`;
          this.logger.log(message);
          summary.errors.push({
            table: `${schema}.${table}`,
            column: column.name,
            index: indexName,
            error
          });
        }
      }
    }

    return summary;
  }
}

export default DatabaseIndexingService;
