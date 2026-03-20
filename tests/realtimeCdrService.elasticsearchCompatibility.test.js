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
