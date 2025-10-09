import database from '../config/database.js';
import { loadCatalog, resolveTableComponents } from '../utils/catalog.js';
import SyncService from '../services/SyncService.js';

const catalog = loadCatalog();
const syncService = new SyncService();

const sanitizeIdentifier = (value) =>
  value
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

async function setupTriggers() {
  for (const [tableKey, config] of Object.entries(catalog)) {
    const syncConfig = config?.sync || {};
    if (syncConfig.disabled || syncConfig.enabled === false) {
      continue;
    }

    const { schema, table } = resolveTableComponents(tableKey);
    if (!schema || !table) {
      continue;
    }

    const primaryKey = await syncService.resolvePrimaryKey(tableKey, config);
    const qualifiedTable = syncService.formatTableName(tableKey);
    const triggerBase = sanitizeIdentifier(`${schema}_${table}_search_sync`);

    const triggers = [
      {
        name: `${triggerBase}_ai`,
        timing: 'AFTER',
        event: 'INSERT',
        valueReference: `NEW.\`${primaryKey}\``,
        operation: 'insert'
      },
      {
        name: `${triggerBase}_au`,
        timing: 'AFTER',
        event: 'UPDATE',
        valueReference: `NEW.\`${primaryKey}\``,
        operation: 'update'
      },
      {
        name: `${triggerBase}_ad`,
        timing: 'AFTER',
        event: 'DELETE',
        valueReference: `OLD.\`${primaryKey}\``,
        operation: 'delete'
      }
    ];

    for (const trigger of triggers) {
      const dropSql = `DROP TRIGGER IF EXISTS \`${schema}\`.\`${trigger.name}\``;
      try {
        await database.query(dropSql);
      } catch (error) {
        console.error(`⚠️ Impossible de supprimer le trigger ${trigger.name}:`, error.message);
      }

      const createSql = `
        CREATE TRIGGER \`${schema}\`.\`${trigger.name}\`
        ${trigger.timing} ${trigger.event} ON ${qualifiedTable}
        FOR EACH ROW
        INSERT INTO autres.search_sync_events (schema_name, table_name, primary_key, primary_value, operation)
        VALUES ('${schema}', '${table}', '${primaryKey}', ${trigger.valueReference}, '${trigger.operation}');
      `;

      try {
        await database.query(createSql);
        console.log(`✅ Trigger ${trigger.name} configuré pour ${tableKey}`);
      } catch (error) {
        console.error(`❌ Échec création trigger ${trigger.name}:`, error.message);
      }
    }
  }
}

setupTriggers()
  .then(async () => {
    await database.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Erreur configuration triggers:', error);
    try {
      await database.close();
    } catch (_) {}
    process.exit(1);
  });
