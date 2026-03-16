import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import DatabaseIndexingService from '../server/services/DatabaseIndexingService.js';

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

describe('DatabaseIndexingService', () => {
  it('includes every realtime CDR table in indexing bootstrap candidates', async () => {
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

    assert.equal(mockDb.inspectedTables.includes('autres.cdr_temps_reel'), true);
    assert.equal(mockDb.inspectedTables.includes('autres.cdr_temps_reel_live'), true);
  });
});
