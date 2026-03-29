import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeCdrService } from '../server/services/RealtimeCdrService.js';
import client from '../server/config/elasticsearch.js';

test('Realtime CDR Elasticsearch search supports legacy indexed field names', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalExists = client.indices.exists;
  const originalCreate = client.indices.create;
  const originalSearch = client.search;

  process.env.USE_ELASTICSEARCH = 'true';

  const capturedQueries = [];
  client.indices.exists = async () => true;
  client.indices.create = async () => ({ acknowledged: true });
  client.search = async (params) => {
    capturedQueries.push(params?.query || null);
    return {
      hits: {
        hits: [
          {
            _id: 'legacy-1',
            _source: {
              id: 'legacy-1',
              type_appel: 'VOIX',
              date_debut: '2025-01-10',
              date_fin: '2025-01-10',
              heure_debut: '08:10:00',
              heure_fin: '08:11:00',
              duree_sec: 60,
              numero_appelant: '770000000',
              numero_appele: '771111111',
              imei_appelant: '358240051111110',
              longitude: 17.45,
              latitude: -14.67,
              nom_bts: 'Alpha BTS'
            }
          }
        ]
      }
    };
  };

  const databaseStub = {
    async query() {
      return [];
    }
  };

  try {
    const service = new RealtimeCdrService({
      autoStart: false,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    const result = await service.search('770000000', { startDate: '2025-01-01', endDate: '2025-01-31' });
    assert.equal(result.total, 1);
    assert.equal(result.path.length, 1);
    assert.ok(result.path[0]?.number, 'path entry should expose one identifier');
    assert.equal(result.locations.length, 1);
    assert.equal(result.locations[0]?.nom, 'Alpha BTS');

    const query = capturedQueries[0];
    assert.ok(query?.bool?.filter?.length > 0, 'Elasticsearch bool.filter should be built');
    const phoneFilter = query?.bool?.filter?.find((item) => item?.bool?.minimum_should_match === 1);
    assert.ok(phoneFilter, 'phone lookup should use should clauses for compatibility');
  } finally {
    client.indices.exists = originalExists;
    client.indices.create = originalCreate;
    client.search = originalSearch;

    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }
  }
});

test('Realtime CDR link diagram Elasticsearch query supports normalized and legacy phone variants', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalExists = client.indices.exists;
  const originalCreate = client.indices.create;
  const originalSearch = client.search;

  process.env.USE_ELASTICSEARCH = 'true';

  const capturedQueries = [];
  client.indices.exists = async () => true;
  client.indices.create = async () => ({ acknowledged: true });
  client.search = async (params) => {
    capturedQueries.push(params?.query || null);
    return {
      hits: {
        hits: [
          {
            _id: 'legacy-link-1',
            _source: {
              numero_appelant: '770000000',
              numero_appele: '771111111',
              type_appel: 'VOIX'
            }
          }
        ]
      }
    };
  };

  const databaseStub = {
    async query() {
      return [];
    }
  };

  try {
    const service = new RealtimeCdrService({
      autoStart: false,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    const result = await service.buildLinkDiagram(['+221770000000']);
    assert.ok(Array.isArray(result.nodes), 'buildLinkDiagram should return nodes');
    assert.equal(result.nodes.some((node) => node.id === '221771111111'), true);
    assert.equal(result.links.length, 1);

    const query = capturedQueries[0];
    const phoneFilter = query?.bool?.filter?.find((item) => item?.bool?.minimum_should_match === 1);
    assert.ok(phoneFilter, 'phone filter should use compatibility should clauses');

    const shouldClauses = phoneFilter?.bool?.should || [];
    const rawCallerTerms = shouldClauses.find((item) => item?.terms?.numero_appelant)?.terms?.numero_appelant || [];
    assert.equal(rawCallerTerms.includes('770000000'), true);
    assert.equal(rawCallerTerms.includes('221770000000'), true);
  } finally {
    client.indices.exists = originalExists;
    client.indices.create = originalCreate;
    client.search = originalSearch;

    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }
  }
});

test('Realtime CDR link diagram falls back to SQL when Elasticsearch has no links', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalExists = client.indices.exists;
  const originalCreate = client.indices.create;
  const originalSearch = client.search;

  process.env.USE_ELASTICSEARCH = 'true';

  client.indices.exists = async () => true;
  client.indices.create = async () => ({ acknowledged: true });
  client.search = async () => ({ hits: { hits: [] } });

  const databaseStub = {
    async query() {
      return [
        {
          caller: '770000000',
          callee: '771111111',
          call_type: 'VOIX',
          date_debut: '2025-01-10',
          heure_debut: '09:00:00'
        }
      ];
    },
    async queryOne() {
      return null;
    }
  };

  try {
    const service = new RealtimeCdrService({
      autoStart: false,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    const result = await service.buildLinkDiagram(['+221770000000']);
    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].source, '221770000000');
    assert.equal(result.links[0].target, '221771111111');
  } finally {
    client.indices.exists = originalExists;
    client.indices.create = originalCreate;
    client.search = originalSearch;

    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }
  }
});

test('Realtime CDR link diagram indexedOnly interroge Elasticsearch même si USE_ELASTICSEARCH=false', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalSearch = client.search;

  process.env.USE_ELASTICSEARCH = 'false';

  const capturedQueries = [];
  client.search = async (params) => {
    capturedQueries.push(params?.query || null);
    return {
      hits: {
        hits: [
          {
            _id: 'indexed-only-1',
            _source: {
              numero_appelant: '221770000000',
              numero_appele: '221771111111',
              type_appel: 'SMS'
            }
          }
        ]
      }
    };
  };

  const databaseStub = {
    async query() {
      return [];
    }
  };

  try {
    const service = new RealtimeCdrService({
      autoStart: false,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    const result = await service.buildLinkDiagram(['+221770000000'], { indexedOnly: true });
    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].source, '221770000000');
    assert.equal(result.links[0].target, '221771111111');
    assert.equal(capturedQueries.length, 1);
  } finally {
    client.search = originalSearch;

    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }
  }
});

test('Realtime CDR fraud detection query matches phone identifier on both caller and callee fields', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalExists = client.indices.exists;
  const originalCreate = client.indices.create;
  const originalSearch = client.search;

  process.env.USE_ELASTICSEARCH = 'true';

  const capturedQueries = [];
  client.indices.exists = async () => true;
  client.indices.create = async () => ({ acknowledged: true });
  client.search = async (params) => {
    capturedQueries.push(params?.query || null);
    return {
      hits: {
        hits: [
          {
            _id: 'fraud-es-1',
            _source: {
              numero_appelant: '221771111111',
              numero_appele: '221770000000',
              imei_appelant: '358240051111110',
              imei_appele: '352099001234560',
              date_debut: '2025-01-10',
              heure_debut: '08:10:00'
            }
          }
        ]
      }
    };
  };

  const databaseStub = {
    async query() {
      return [];
    }
  };

  try {
    const service = new RealtimeCdrService({
      autoStart: false,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    const result = await service.findAssociations('221770000000');
    assert.equal(result.numbers.length, 1);
    assert.equal(result.numbers[0].imeis.length, 1);
    assert.equal(result.numbers[0].imeis[0].imei, '352099001234560');

    const query = capturedQueries[0];
    const phoneFilter = query?.bool?.filter?.find((item) => item?.bool?.minimum_should_match === 1);
    const shouldClauses = phoneFilter?.bool?.should || [];
    assert.equal(shouldClauses.some((item) => item?.terms?.numero_appelant), true);
    assert.equal(shouldClauses.some((item) => item?.terms?.numero_appele), true);
  } finally {
    client.indices.exists = originalExists;
    client.indices.create = originalCreate;
    client.search = originalSearch;

    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }
  }
});

test('Realtime CDR fraud detection query matches IMEI identifier on both caller and callee fields', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalExists = client.indices.exists;
  const originalCreate = client.indices.create;
  const originalGetMapping = client.indices.getMapping;
  const originalPutMapping = client.indices.putMapping;
  const originalSearch = client.search;

  process.env.USE_ELASTICSEARCH = 'true';

  const capturedQueries = [];
  client.indices.exists = async () => true;
  client.indices.create = async () => ({ acknowledged: true });
  client.indices.getMapping = async () => ({});
  client.indices.putMapping = async () => ({ acknowledged: true });
  client.search = async (params) => {
    capturedQueries.push(params?.query || null);
    return {
      hits: {
        hits: [
          {
            _id: 'fraud-es-imei-1',
            _source: {
              numero_appelant: '221771111111',
              numero_appele: '221770000000',
              imei_appelant: '358240051111110',
              imei_appele: '352099001234560',
              date_debut: '2025-01-10',
              heure_debut: '08:10:00'
            }
          }
        ]
      }
    };
  };

  const databaseStub = {
    async query() {
      return [];
    }
  };

  try {
    const service = new RealtimeCdrService({
      autoStart: false,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    const result = await service.findAssociations('352099001234560');
    assert.equal(result.imeis.length, 1);
    assert.equal(result.imeis[0].numbers.length, 1);
    assert.equal(result.imeis[0].numbers[0].number, '221770000000');

    const query = capturedQueries[0];
    const imeiFilter = query?.bool?.filter?.find((item) => item?.bool?.minimum_should_match === 1);
    const shouldClauses = imeiFilter?.bool?.should || [];
    assert.equal(shouldClauses.some((item) => item?.terms?.imei_appelant), true);
    assert.equal(shouldClauses.some((item) => item?.terms?.imei_appele), true);
  } finally {
    client.indices.exists = originalExists;
    client.indices.create = originalCreate;
    client.indices.getMapping = originalGetMapping;
    client.indices.putMapping = originalPutMapping;
    client.search = originalSearch;

    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }
  }
});

test('Realtime CDR fraud detection SQL fallback checks caller and callee fields', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  process.env.USE_ELASTICSEARCH = 'false';

  const captured = { sql: '', params: [] };
  const databaseStub = {
    async query(sql, params) {
      captured.sql = sql;
      captured.params = params;
      return [];
    },
    async queryOne() {
      return null;
    }
  };

  try {
    const service = new RealtimeCdrService({
      autoStart: false,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    await service.findAssociations('221770000000');

    assert.match(captured.sql, /numero_appelant IN/i);
    assert.match(captured.sql, /numero_appele IN/i);
    assert.equal(captured.params.length >= 2, true);
  } finally {
    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }
  }
});

test('Realtime CDR fraud detection SQL fallback checks IMEI caller and callee fields', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  process.env.USE_ELASTICSEARCH = 'false';

  const captured = { sqls: [], paramsList: [] };
  const databaseStub = {
    async query(sql, params) {
      captured.sqls.push(sql);
      captured.paramsList.push(params);
      return [];
    },
    async queryOne() {
      return null;
    }
  };

  try {
    const service = new RealtimeCdrService({
      autoStart: false,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    await service.findAssociations('352099001234560');

    const fraudSql = captured.sqls.find((sql) => /FROM .*cdr_temps_reel|FROM .*REALTIME_CDR_UNIFIED_TABLE_SQL/i.test(sql))
      || captured.sqls.find((sql) => /imei_appelant IN/i.test(sql))
      || '';
    assert.match(fraudSql, /imei_appelant IN/i);
    assert.match(fraudSql, /imei_appele IN/i);
    const fraudParams = captured.paramsList.find((params) => Array.isArray(params) && params.length >= 4) || [];
    assert.equal(fraudParams.length >= 4, true);
  } finally {
    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }
  }
});
