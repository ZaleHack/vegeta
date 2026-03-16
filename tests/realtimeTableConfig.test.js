import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const loadRealtimeTableConfig = async (envOverrides) => {
  const keys = ['REALTIME_CDR_TABLES', 'REALTIME_CDR_TABLE'];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(envOverrides)) {
    if (typeof value === 'undefined' || value === null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  try {
    const moduleUrl = new URL(`../server/config/realtime-table.js?test=${Date.now()}-${Math.random()}`, import.meta.url);
    return await import(moduleUrl.href);
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe('realtime table configuration', () => {
  it('defaults to the legacy realtime table when no env vars are set', async () => {
    const config = await loadRealtimeTableConfig({});

    assert.equal(config.REALTIME_CDR_TABLE_SQL, '`autres`.`cdr_temps_reel`');
    assert.equal(config.REALTIME_CDR_TABLES_METADATA.length, 1);
    assert.equal(config.REALTIME_CDR_TABLES_METADATA[0].raw, 'autres.cdr_temps_reel');
  });

  it('uses legacy REALTIME_CDR_TABLE when REALTIME_CDR_TABLES is not provided', async () => {
    const config = await loadRealtimeTableConfig({
      REALTIME_CDR_TABLE: 'legacy.custom_table'
    });

    assert.equal(config.REALTIME_CDR_TABLE_SQL, '`legacy`.`custom_table`');
    assert.deepEqual(config.REALTIME_CDR_TABLES_METADATA.map((table) => table.raw), ['legacy.custom_table']);
  });

  it('builds a UNION ALL source when REALTIME_CDR_TABLES includes multiple values', async () => {
    const config = await loadRealtimeTableConfig({
      REALTIME_CDR_TABLES: 'autres.cdr_temps_reel,autres.cdr_temps_reel_live'
    });

    assert.match(config.REALTIME_CDR_TABLE_SQL, /SELECT \* FROM `autres`\.`cdr_temps_reel`/);
    assert.match(config.REALTIME_CDR_TABLE_SQL, /UNION ALL/);
    assert.match(config.REALTIME_CDR_TABLE_SQL, /SELECT \* FROM `autres`\.`cdr_temps_reel_live`/);
    assert.deepEqual(config.REALTIME_CDR_TABLES_METADATA.map((table) => table.raw), [
      'autres.cdr_temps_reel',
      'autres.cdr_temps_reel_live'
    ]);
  });
});
