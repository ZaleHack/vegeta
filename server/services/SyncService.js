import database from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import baseCatalog from '../config/tables-catalog.js';
import ElasticSearchService from './ElasticSearchService.js';
import { isElasticsearchEnabled } from '../config/environment.js';

const DEFAULT_BATCH_SIZE = 500;

/**
 * Service utilitaire pour synchroniser les tables configurées.
 * TODO: implémenter la logique de synchronisation spécifique aux besoins.
 */
class SyncService {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.catalogPath = path.join(__dirname, '../config/tables-catalog.json');
    this.elasticService = new ElasticSearchService();
    this.useElastic = isElasticsearchEnabled();
    this.defaultIndex = process.env.ELASTICSEARCH_DEFAULT_INDEX || 'global_search';
    this.resetIndices = new Set();
    this.catalog = this.loadCatalog();
    this.primaryKeyCache = new Map();
    this.tableColumnsCache = new Map();
    this.qualifiedTableNameCache = new Map();
  }

  formatTableName(tableName) {
    if (this.qualifiedTableNameCache.has(tableName)) {
      return this.qualifiedTableNameCache.get(tableName);
    }

    const parts = tableName.split('.').map((part) => `\`${part}\``);
    const qualifiedName = parts.join('.');
    this.qualifiedTableNameCache.set(tableName, qualifiedName);
    return qualifiedName;
  }

  async getTableColumns(tableName) {
    if (this.tableColumnsCache.has(tableName)) {
      return this.tableColumnsCache.get(tableName);
    }

    const columns = await database.query(`SHOW COLUMNS FROM ${this.formatTableName(tableName)}`);
    this.tableColumnsCache.set(tableName, columns);
    return columns;
  }

  async resolvePrimaryKey(tableName, tableConfig = {}) {
    if (this.primaryKeyCache.has(tableName)) {
      return this.primaryKeyCache.get(tableName);
    }

    const configuredPrimaryKey = tableConfig?.primaryKey;

    if (configuredPrimaryKey) {
      const columns = await this.getTableColumns(tableName);
      const hasConfiguredKey = columns.some((column) => column.field === configuredPrimaryKey);

      if (hasConfiguredKey) {
        this.primaryKeyCache.set(tableName, configuredPrimaryKey);
        return configuredPrimaryKey;
      }

      console.warn(
        `⚠️ Clé primaire "${configuredPrimaryKey}" introuvable pour ${tableName}, tentative de détection automatique.`
      );
    }

    const keys = await database.query(
      `SHOW KEYS FROM ${this.formatTableName(tableName)} WHERE Key_name = 'PRIMARY'`
    );

    if (keys.length > 0) {
      const primaryKeyColumn =
        keys.find((key) => key.seq_in_index === 1)?.column_name || keys[0].column_name;
      this.primaryKeyCache.set(tableName, primaryKeyColumn);
      return primaryKeyColumn;
    }

    const columns = await this.getTableColumns(tableName);

    if (!columns.length) {
      throw new Error(`Impossible de déterminer les colonnes pour ${tableName}`);
    }

    const fallbackColumn = columns[0]?.field;

    if (!fallbackColumn) {
      throw new Error(`Impossible de déterminer une colonne de repli pour ${tableName}`);
    }

    console.warn(
      `⚠️ Table ${tableName} sans clé primaire explicite, utilisation de la colonne "${fallbackColumn}" comme clé d'ordonnancement.`
    );

    this.primaryKeyCache.set(tableName, fallbackColumn);
    return fallbackColumn;
  }

  loadCatalog() {
    let catalog = { ...baseCatalog };
    try {
      if (fs.existsSync(this.catalogPath)) {
        const raw = fs.readFileSync(this.catalogPath, 'utf-8');
        const json = JSON.parse(raw);
        for (const [key, value] of Object.entries(json)) {
          const [db, ...tableParts] = key.split('_');
          const tableName = `${db}.${tableParts.join('_')}`;
          catalog[tableName] = value;
        }
      }
    } catch (error) {
      console.error('❌ Erreur chargement catalogue:', error);
    }
    return catalog;
  }

  resolveBatchSize(syncConfig = {}) {
    const envBatch = Number(process.env.SYNC_BATCH_SIZE);
    if (Number.isFinite(envBatch) && envBatch > 0) {
      return envBatch;
    }

    const configBatch = Number(syncConfig.batchSize);
    if (Number.isFinite(configBatch) && configBatch > 0) {
      return configBatch;
    }

    return DEFAULT_BATCH_SIZE;
  }

  async syncTable(tableName, config = null) {
    const catalog = config ? null : this.catalog || this.loadCatalog();
    const tableConfig = config || catalog?.[tableName];
    if (!tableConfig) {
      console.warn(`⚠️ Table ${tableName} absente du catalogue, synchronisation ignorée.`);
      return;
    }

    const baseSyncConfig = tableConfig.sync || {};

    if (baseSyncConfig.disabled || baseSyncConfig.enabled === false) {
      console.log(`ℹ️ Table ${tableName} : synchronisation Elasticsearch désactivée.`);
      return;
    }

    const syncConfig = {
      ...baseSyncConfig,
      type:
        baseSyncConfig.type ||
        (tableName === 'autres.profiles' ? 'profile' : 'generic'),
      elasticsearchIndex: baseSyncConfig.elasticsearchIndex || this.defaultIndex
    };

    const primaryKey = await this.resolvePrimaryKey(tableName, tableConfig);
    const qualifiedTableName = this.formatTableName(tableName);

    if (!this.useElastic) {
      console.warn(
        `⚠️ Synchronisation Elasticsearch désactivée (USE_ELASTICSEARCH!=true). Table ${tableName} ignorée.`
      );
      return;
    }
    const batchSize = this.resolveBatchSize(syncConfig);

    try {
      let lastPrimaryKey = null;
      let totalIndexed = 0;
      let totalFetched = 0;
      let hasMore = true;

      const shouldSyncToElastic = this.useElastic && syncConfig.elasticsearchIndex;

      if (shouldSyncToElastic && !this.resetIndices.has(syncConfig.elasticsearchIndex)) {
        if (syncConfig.purgeBeforeIndex !== false) {
          try {
            await this.elasticService.resetIndex({
              recreate: true,
              index: syncConfig.elasticsearchIndex
            });
            console.log(`🧹 Index ${syncConfig.elasticsearchIndex} réinitialisé`);
          } catch (error) {
            console.error(
              `❌ Échec de la réinitialisation de l'index ${syncConfig.elasticsearchIndex}:`,
              error.message
            );
          }
        }
        this.resetIndices.add(syncConfig.elasticsearchIndex);
      }

      while (hasMore) {
        const whereClause =
          lastPrimaryKey === null ? '' : `WHERE \`${primaryKey}\` > ?`;
        const rows = await database.query(
          `SELECT * FROM ${qualifiedTableName} ${whereClause} ORDER BY \`${primaryKey}\` ASC LIMIT ?`,
          lastPrimaryKey === null ? [batchSize] : [lastPrimaryKey, batchSize]
        );

        if (!rows.length) {
          hasMore = false;
          break;
        }

        totalFetched += rows.length;

        if (shouldSyncToElastic) {
          try {
            const { indexed, errors } = await this.elasticService.indexRecordsBulk(rows, {
              refresh: false,
              index: syncConfig.elasticsearchIndex,
              type: syncConfig.type || 'generic',
              tableName,
              config: tableConfig,
              primaryKey
            });
            totalIndexed += indexed;
            if (errors.length > 0) {
              for (const { id, error } of errors) {
                console.error(
                  `❌ Erreur indexation ${tableName}#${id} dans ${syncConfig.elasticsearchIndex}:`,
                  error
                );
              }
            }
          } catch (error) {
            console.error(`❌ Échec indexation Elasticsearch pour ${tableName}:`, error.message);
          }
        }

        lastPrimaryKey = rows[rows.length - 1]?.[primaryKey] ?? lastPrimaryKey;
        hasMore = rows.length === batchSize;
      }

      const syncSummary = [`${totalFetched} lignes lues`];
      if (shouldSyncToElastic) {
        syncSummary.push(`${totalIndexed} documents indexés`);
      }

      console.log(`✅ Table ${tableName} synchronisée (${syncSummary.join(', ')})`);
    } catch (error) {
      console.error(`❌ Synchronisation échouée pour ${tableName}:`, error.message);
    }
  }

  async syncAllTables() {
    this.catalog = this.loadCatalog();
    for (const [tableName, config] of Object.entries(this.catalog)) {
      await this.syncTable(tableName, config);
    }
  }
}

export default SyncService;
