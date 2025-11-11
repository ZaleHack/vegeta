import test from 'node:test';
import assert from 'node:assert/strict';
import { CgiBtsEnrichmentService } from '../server/services/CgiBtsEnrichmentService.js';
import { normalizeCgi } from '../server/utils/cgi.js';

test('cgi enricher caches lookup results', async () => {
  let lookupCalls = 0;
  const enricher = new CgiBtsEnrichmentService({
    enabled: true,
    cacheSize: 16,
    ttlMs: 60_000,
    lookupExecutor: async (keys) => {
      lookupCalls += 1;
      const map = new Map();
      for (const key of keys) {
        map.set(key, {
          nom_bts: `SITE-${key}`,
          longitude: 17.45,
          latitude: -14.67,
          azimut: 120
        });
      }
      return map;
    }
  });

  const first = await enricher.fetchOne('sen-001');
  assert.ok(first);
  assert.equal(first?.nom_bts, 'SITE-SEN-001');

  const second = await enricher.fetchOne('sen-001');
  assert.ok(second);
  assert.equal(second?.nom_bts, 'SITE-SEN-001');
  assert.equal(lookupCalls, 1, 'Lookup should be called once thanks to cache.');

  const metrics = enricher.getMetrics();
  assert.equal(metrics.cacheMisses, 1);
  assert.equal(metrics.cacheHits, 1);
});

test('cgi enricher returns null when CGI is unknown', async () => {
  const enricher = new CgiBtsEnrichmentService({
    enabled: true,
    lookupExecutor: async () => new Map()
  });

  const result = await enricher.fetchOne('missing-cgi');
  assert.equal(result, null);
});

test('cgi enricher builds UNION ALL SQL when using database', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const stubDatabase = {
    async query(sql, params) {
      capturedSql = sql;
      capturedParams = params;
      return [
        {
          CGI: 'CELL-1',
          NOM_BTS: 'Alpha',
          LONGITUDE: 16.5,
          LATITUDE: -23.4,
          AZIMUT: 45
        }
      ];
    }
  };

  const enricher = new CgiBtsEnrichmentService({
    enabled: true,
    databaseClient: stubDatabase,
    staticTables: [
      { tableSql: '`radio5g`', priority: 1 },
      { tableSql: '`radio4g`', priority: 2 }
    ]
  });

  const results = await enricher.fetchMany(['cell-1']);
  assert.ok(results.get('CELL-1'));
  assert.match(capturedSql, /UNION ALL/);
  assert.ok(/WITH\s+unioned/i.test(capturedSql));
  assert.match(capturedSql, /UPPER\(TRIM\(CGI\)\)\s+IN\s*\(/i);
  assert.equal(
    capturedParams.length,
    2,
    'Parameters should repeat once per configured table.'
  );
  assert.deepEqual(capturedParams, ['CELL-1', 'CELL-1']);
});

test('normalizeCgi removes leading zero before LAC', () => {
  const normalized = normalizeCgi('608-01-09025-61051');
  assert.equal(normalized, '608-01-9025-61051');
});

test('cgi enricher normalizes realtime CGI keys before querying database', async () => {
  let capturedParams = [];
  const stubDatabase = {
    async query(sql, params) {
      capturedParams = params.slice();
      return [];
    }
  };

  const enricher = new CgiBtsEnrichmentService({
    enabled: true,
    databaseClient: stubDatabase,
    staticTables: [{ tableSql: '`radio4g`' }]
  });

  await enricher.fetchMany(['608-01-09025-61051']);
  assert.deepEqual(capturedParams, ['608-01-9025-61051']);
});
