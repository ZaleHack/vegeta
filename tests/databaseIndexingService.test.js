import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const createMockDatabase = () => {
  const inspectedTables = [];

  return {
    inspectedTables,
    async query(sql, params = []) {
      if (sql.includes('FROM information_schema.COLUMNS')) {
        const [schema, table] = params;
        inspectedTables.push(`${schema}.${table}`);
        return [];
      }

      return [];
    },
    async queryOne() {
      return null;
    }
  };
};

const loadDatabaseIndexingService = async () => {
  const module = await import(`../server/services/DatabaseIndexingService.js?cacheBust=${Date.now()}_${Math.random()}`);
  return module.default;
};

describe('DatabaseIndexingService', () => {
  it('includes every realtime CDR table in indexing bootstrap candidates', async () => {
    delete process.env.REALTIME_CDR_TABLES;
    delete process.env.REALTIME_CDR_TABLE;

    const DatabaseIndexingService = await loadDatabaseIndexingService();
    const mockDb = createMockDatabase();
    const logger = { log: () => {}, warn: () => {}, error: () => {} };
    const service = new DatabaseIndexingService({ db: mockDb, logger });

    service.loadCatalog = () => ({
      'autres.placeholder': {
        display: 'placeholder',
        database: 'autres'
      }
    });

    await service.ensureIndexes({ dryRun: true });

    assert.equal(mockDb.inspectedTables.includes('autres.cdr_temps_reel_live'), true);
    assert.equal(mockDb.inspectedTables.includes('autres.cdr_temps_reel'), false);
  });

  it('does not inspect cdr_temps_reel by default', async () => {
    delete process.env.REALTIME_CDR_TABLES;
    delete process.env.REALTIME_CDR_TABLE;

    const DatabaseIndexingService = await loadDatabaseIndexingService();
    const mockDb = createMockDatabase();
    const logger = { log: () => {}, warn: () => {}, error: () => {} };
    const service = new DatabaseIndexingService({ db: mockDb, logger });

    service.loadCatalog = () => ({
      'autres.placeholder': {
        display: 'placeholder',
        database: 'autres'
      }
    });

    await service.ensureIndexes({ dryRun: true });

    assert.equal(mockDb.inspectedTables.includes('autres.cdr_temps_reel'), false);
  });
});
