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

class EmptyElasticService {
  async ensureOperational() {
    return true;
  }

  async search() {
    return {
      total: 0,
      hits: [],
      elapsed_ms: 4,
      tables_searched: ['autres.profiles']
    };
  }
}

describe('UnifiedSearchService Elasticsearch fallback', () => {
  let previousUseElastic;
  let previousUrl;
  let previousAutoReconnect;

  beforeEach(() => {
    previousUseElastic = process.env.USE_ELASTICSEARCH;
    previousUrl = process.env.ELASTICSEARCH_URL;
    previousAutoReconnect = process.env.ELASTICSEARCH_AUTO_RECONNECT;
    process.env.USE_ELASTICSEARCH = 'false';
    delete process.env.ELASTICSEARCH_URL;
    delete process.env.ELASTICSEARCH_AUTO_RECONNECT;
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

    if (typeof previousAutoReconnect === 'undefined') {
      delete process.env.ELASTICSEARCH_AUTO_RECONNECT;
    } else {
      process.env.ELASTICSEARCH_AUTO_RECONNECT = previousAutoReconnect;
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

  it('does not schedule reconnect attempts when auto reconnect is disabled', () => {
    const service = new ElasticSearchService();
    service.enabled = true;
    service.initiallyEnabled = true;
    service.retryDelayMs = 1;

    service.disableForSession('test', new Error('ECONNREFUSED'));

    assert.equal(service.reconnectTimer, null, 'No reconnect timer should be scheduled');
  });

  it('forces USE_ELASTICSEARCH=false when disabling without auto reconnect', () => {
    const service = new ElasticSearchService();
    process.env.USE_ELASTICSEARCH = 'true';
    service.enabled = true;
    service.initiallyEnabled = true;

    service.disableForSession('test', new Error('ECONNREFUSED'));

    assert.equal(
      process.env.USE_ELASTICSEARCH,
      'false',
      'Environment flag should be turned off to avoid repeated failures'
    );
  });

  it('allows opting-in to reconnect attempts via ELASTICSEARCH_AUTO_RECONNECT', () => {
    process.env.ELASTICSEARCH_AUTO_RECONNECT = 'true';
    const service = new ElasticSearchService();
    service.enabled = true;
    service.initiallyEnabled = true;
    service.retryDelayMs = 1;

    try {
      service.disableForSession('test', new Error('ECONNREFUSED'));

      assert.ok(service.reconnectTimer, 'Reconnect timer should be scheduled when opt-in is enabled');
    } finally {
      if (service.reconnectTimer) {
        clearTimeout(service.reconnectTimer);
        service.reconnectTimer = null;
      }
    }
  });

  it('exposes diagnostics metadata when requested', async () => {
    const unified = new UnifiedSearchService({
      searchService: new FakeSearchService(),
      elasticFactory: () => new EmptyElasticService()
    });

    const results = await unified.search({
      query: 'jean',
      page: 1,
      limit: 20,
      preferElastic: true,
      diagnostic: true
    });

    assert.equal(results.engine, 'sql');
    assert.ok(results.diagnostics, 'Diagnostics payload should be present');
    assert.equal(results.diagnostics.primary_engine, 'elasticsearch');
    assert.equal(results.diagnostics.secondary_engine, 'sql');
    assert.equal(results.diagnostics.resolved_by, 'sql');
    assert.ok(results.diagnostics.attempts.length >= 2);
    const sqlAttempt = results.diagnostics.attempts.find((attempt) => attempt.engine === 'sql');
    assert.ok(sqlAttempt, 'SQL attempt should be recorded');
    assert.equal(sqlAttempt.status, 'success');
    assert.equal(sqlAttempt.has_hits, true);
  });
});
