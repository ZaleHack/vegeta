import database from '../config/database.js';
import SyncService from './SyncService.js';
import { loadCatalog } from '../utils/catalog.js';

const DEFAULT_INCREMENTAL_BATCH = Number(process.env.SYNC_INCREMENTAL_BATCH_SIZE) || 200;
const DEFAULT_POLL_INTERVAL = Number(process.env.SYNC_INCREMENTAL_POLL_MS) || 15000;

class IncrementalSyncService extends SyncService {
  constructor(options = {}) {
    super();
    this.catalog = loadCatalog();
    this.batchSize = Number(options.batchSize) || DEFAULT_INCREMENTAL_BATCH;
    this.pollInterval = Number(options.pollInterval) || DEFAULT_POLL_INTERVAL;
    this.running = false;
    this.timer = null;
  }

  async fetchPendingEvents(limit = this.batchSize) {
    return database.query(
      `
        SELECT id, schema_name, table_name, primary_key, primary_value, operation, attempts
        FROM autres.search_sync_events
        WHERE processed_at IS NULL
        ORDER BY id ASC
        LIMIT ?
      `,
      [limit]
    );
  }

  async markEventProcessed(eventId) {
    await database.query(
      `
        UPDATE autres.search_sync_events
        SET processed_at = NOW(), last_error = NULL
        WHERE id = ?
      `,
      [eventId]
    );
  }

  async recordEventError(eventId, error) {
    const message = error?.message || String(error);
    await database.query(
      `
        UPDATE autres.search_sync_events
        SET attempts = attempts + 1, last_error = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [message.slice(0, 2000), eventId]
    );
  }

  resolveTableConfig(event) {
    const tableName = `${event.schema_name}.${event.table_name}`;
    return {
      tableName,
      config: this.catalog[tableName] || null
    };
  }

  async processEvent(event) {
    const { tableName, config } = this.resolveTableConfig(event);

    if (!config) {
      await this.markEventProcessed(event.id);
      return;
    }

    const syncConfig = config.sync || {};
    const indexName = syncConfig.elasticsearchIndex || this.defaultIndex;

    if (!this.useElastic || !indexName) {
      await this.markEventProcessed(event.id);
      return;
    }

    const primaryKey = await this.resolvePrimaryKey(tableName, config);
    const qualifiedTable = this.formatTableName(tableName);

    if (event.operation === 'delete') {
      await this.elasticService.deleteGenericDocument({
        index: indexName,
        tableName,
        primaryValue: event.primary_value
      });
      await this.markEventProcessed(event.id);
      return;
    }

    const row = await database.queryOne(
      `SELECT * FROM ${qualifiedTable} WHERE \`${primaryKey}\` = ? LIMIT 1`,
      [event.primary_value]
    );

    if (!row) {
      await this.elasticService.deleteGenericDocument({
        index: indexName,
        tableName,
        primaryValue: event.primary_value
      });
      await this.markEventProcessed(event.id);
      return;
    }

    await this.elasticService.indexRecordsBulk([row], {
      refresh: false,
      index: indexName,
      type: 'generic',
      tableName,
      config,
      primaryKey
    });

    await this.markEventProcessed(event.id);
  }

  async processBatch(limit = this.batchSize) {
    const events = await this.fetchPendingEvents(limit);
    if (!events.length) {
      return 0;
    }

    let processed = 0;
    for (const event of events) {
      try {
        await this.processEvent(event);
        processed += 1;
      } catch (error) {
        console.error('❌ Erreur traitement événement incrémental:', error);
        await this.recordEventError(event.id, error);
      }
    }

    return processed;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.timer = setInterval(() => {
      this.processBatch().catch((error) => {
        console.error('❌ Erreur lors du traitement incrémental:', error);
      });
    }, this.pollInterval);

    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export default IncrementalSyncService;
