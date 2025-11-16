import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { isElasticsearchEnabled, isElasticsearchForced } from '../server/config/environment.js';

const resetEnvValue = (key, value) => {
  if (typeof value === 'undefined') {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

describe('Elasticsearch environment helpers', () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalUrl = process.env.ELASTICSEARCH_URL;

  beforeEach(() => {
    resetEnvValue('USE_ELASTICSEARCH', originalUseElastic);
    resetEnvValue('ELASTICSEARCH_URL', originalUrl);
  });

  afterEach(() => {
    resetEnvValue('USE_ELASTICSEARCH', originalUseElastic);
    resetEnvValue('ELASTICSEARCH_URL', originalUrl);
  });

  it('treats TRUE as enabled and normalizes the value', () => {
    process.env.USE_ELASTICSEARCH = 'TRUE';
    delete process.env.ELASTICSEARCH_URL;

    assert.equal(isElasticsearchEnabled(), true);
    assert.equal(process.env.USE_ELASTICSEARCH, 'true');
    assert.equal(process.env.ELASTICSEARCH_URL, 'http://localhost:9200');
  });

  it('treats FORCE (any casing) as forced mode', () => {
    process.env.USE_ELASTICSEARCH = 'FORCE';
    delete process.env.ELASTICSEARCH_URL;

    assert.equal(isElasticsearchEnabled(), true);
    assert.equal(isElasticsearchForced(), true);
    assert.equal(process.env.USE_ELASTICSEARCH, 'force');
  });

  it('treats numeric truthy values as enabled', () => {
    process.env.USE_ELASTICSEARCH = '1';
    delete process.env.ELASTICSEARCH_URL;

    assert.equal(isElasticsearchEnabled(), true);
    assert.equal(process.env.USE_ELASTICSEARCH, 'true');
  });
});
