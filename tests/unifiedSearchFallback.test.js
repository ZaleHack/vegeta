import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import ElasticSearchService from '../server/services/ElasticSearchService.js';
import UnifiedSearchService from '../server/services/UnifiedSearchService.js';

class FakeSearchService {
  async search(query, filters, page, limit) {
    return {
      total: 1,
      page,
      limit,
      pages: 1,
      elapsed_ms: 5,
      hits: [
        {
          table: 'profiles',
          table_name: 'autres.profiles',
          database: 'autres',
          preview: { first_name: 'Jean', last_name: 'Dupont' },
          primary_keys: { id: 42 },
          score: 1
        }
      ],
      tables_searched: ['autres.profiles']
    };
  }
}

describe('UnifiedSearchService Elasticsearch fallback', () => {
  let previousUseElastic;
  let previousUrl;

  beforeEach(() => {
    previousUseElastic = process.env.USE_ELASTICSEARCH;
    previousUrl = process.env.ELASTICSEARCH_URL;
    process.env.USE_ELASTICSEARCH = 'false';
    delete process.env.ELASTICSEARCH_URL;
  });

  afterEach(() => {
    if (typeof previousUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = previousUseElastic;
    }

    if (typeof previousUrl === 'undefined') {
      delete process.env.ELASTICSEARCH_URL;
    } else {
      process.env.ELASTICSEARCH_URL = previousUrl;
    }
  });

  it('returns null when Elasticsearch is disabled', async () => {
    const service = new ElasticSearchService();
    const result = await service.search('test', 1, 20);
    assert.equal(result, null);
  });

  it('falls back to SQL results when Elasticsearch returns null', async () => {
    const unified = new UnifiedSearchService({
      searchService: new FakeSearchService(),
      elasticFactory: () => new ElasticSearchService()
    });

    const results = await unified.search({ query: 'jean', page: 1, limit: 20, preferElastic: true });

    assert.equal(results.engine, 'sql');
    assert.equal(results.total, 1);
    assert.deepEqual(results.tables_searched, ['autres.profiles']);
    assert.equal(results.hits.length, 1);
    assert.equal(results.hits[0].primary_keys.id, 42);
  });

  it('keeps Elasticsearch enabled when USE_ELASTICSEARCH is forced', async () => {
    process.env.USE_ELASTICSEARCH = 'force';
    const service = new ElasticSearchService();

    assert.equal(service.enabled, true, 'Elasticsearch should start enabled when forced');

    service.disableForSession('test', new Error('ECONNREFUSED'));

    assert.equal(service.enabled, true, 'Elasticsearch should remain enabled when forcing usage');
    assert.equal(service.connectionChecked, false);
  });
});
