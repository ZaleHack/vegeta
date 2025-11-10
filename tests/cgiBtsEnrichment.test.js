import test from 'node:test';
import assert from 'node:assert/strict';
import { CgiBtsEnrichmentService } from '../server/services/CgiBtsEnrichmentService.js';

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
  assert.match(capturedSql, /CGI\s+IN\s*\(/i);
  assert.match(capturedSql, /UPPER\(CGI\)\s+AS\s+normalized_cgi/i);
  assert.match(capturedSql, /GROUP BY\s+normalized_cgi/i);
  assert.match(capturedSql, /ON\s+u\.normalized_cgi\s*=\s*best\.normalized_cgi/i);
  assert.equal(
    capturedParams.length,
    2,
    'Parameters should repeat once per configured table.'
  );
  assert.deepEqual(capturedParams, ['CELL-1', 'CELL-1']);
});

test('cgi enricher falls back to normalized lookup when direct match missing', async () => {
  const capturedSql = [];
  const capturedParams = [];
  const stubDatabase = {
    async query(sql, params) {
      capturedSql.push(sql);
      capturedParams.push(params);
      if (capturedSql.length === 1) {
        return [];
      }
      return [
        {
          CGI: 'Cell-1',
          NOM_BTS: 'Fallback Alpha',
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

  const results = await enricher.fetchMany(['Cell-1']);
  assert.ok(results.get('CELL-1'));
  assert.equal(capturedSql.length, 2, 'Fallback query should run after primary miss.');
  assert.match(capturedSql[0], /CGI\s+IN\s*\(/i);
  assert.match(capturedSql[0], /UPPER\(CGI\)\s+AS\s+normalized_cgi/i);
  assert.match(capturedSql[1], /LOWER\(CGI\)\s+IN\s*\(/i);
  assert.match(capturedSql[1], /LOWER\(CGI\)\s+AS\s+normalized_cgi/i);
  assert.deepEqual(capturedParams[0], ['CELL-1', 'CELL-1']);
  assert.deepEqual(capturedParams[1], ['cell-1', 'cell-1']);
});
