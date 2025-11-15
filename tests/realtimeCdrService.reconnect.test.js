import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { RealtimeCdrService } from '../server/services/RealtimeCdrService.js';
import client from '../server/config/elasticsearch.js';

const createConnectionError = () => {
  const error = new Error('ECONNREFUSED');
  error.name = 'ConnectionError';
  error.meta = { statusCode: 0 };
  return error;
};

test('Realtime CDR service reconnects to Elasticsearch after connection loss', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalRetryDelay = process.env.ELASTICSEARCH_RETRY_DELAY_MS;
  const originalExists = client.indices.exists;
  const originalCreate = client.indices.create;
  const originalSearch = client.search;

  process.env.USE_ELASTICSEARCH = 'true';
  process.env.ELASTICSEARCH_RETRY_DELAY_MS = '10';

  const connectionError = createConnectionError();
  let shouldFail = true;
  let indexCreated = false;

  client.indices.exists = async () => {
    if (shouldFail) {
      throw connectionError;
    }
    return indexCreated;
  };

  client.indices.create = async () => {
    indexCreated = true;
    return { acknowledged: true };
  };

  client.search = async () => ({ hits: { hits: [] } });

  const databaseStub = {
    async query(sql) {
      if (typeof sql === 'string' && /INFORMATION_SCHEMA/i.test(sql)) {
        return [];
      }
      return [];
    }
  };

  let service;

  try {
    service = new RealtimeCdrService({
      autoStart: true,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    if (service.initializationPromise) {
      await service.initializationPromise;
    }

    assert.equal(service.elasticEnabled, false, 'Elasticsearch should be disabled after failure');

    shouldFail = false;

    for (let attempt = 0; attempt < 20 && !service.elasticEnabled; attempt += 1) {
      await delay(20);
    }

    assert.equal(service.elasticEnabled, true, 'Elasticsearch should be re-enabled after reconnect');
    assert.equal(service.indexEnsured, true, 'Realtime index should be marked as ensured after reconnect');
  } finally {
    if (service) {
      service.elasticEnabled = false;
      if (service.indexTimer) {
        clearTimeout(service.indexTimer);
        service.indexTimer = null;
      }
      if (service.reconnectTimer) {
        clearTimeout(service.reconnectTimer);
        service.reconnectTimer = null;
      }
    }

    client.indices.exists = originalExists;
    client.indices.create = originalCreate;
    client.search = originalSearch;

    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }

    if (typeof originalRetryDelay === 'undefined') {
      delete process.env.ELASTICSEARCH_RETRY_DELAY_MS;
    } else {
      process.env.ELASTICSEARCH_RETRY_DELAY_MS = originalRetryDelay;
    }
  }
});

test('Realtime CDR service keeps Elasticsearch enabled when forcing usage', async () => {
  const originalUseElastic = process.env.USE_ELASTICSEARCH;
  const originalRetryDelay = process.env.ELASTICSEARCH_RETRY_DELAY_MS;
  const originalExists = client.indices.exists;
  const originalCreate = client.indices.create;
  const originalSearch = client.search;

  process.env.USE_ELASTICSEARCH = 'force';
  process.env.ELASTICSEARCH_RETRY_DELAY_MS = '10';

  const connectionError = createConnectionError();
  let shouldFail = true;
  let indexCreated = false;

  client.indices.exists = async () => {
    if (shouldFail) {
      throw connectionError;
    }
    return indexCreated;
  };

  client.indices.create = async () => {
    indexCreated = true;
    return { acknowledged: true };
  };

  client.search = async () => ({ hits: { hits: [] } });

  const databaseStub = {
    async query(sql) {
      if (typeof sql === 'string' && /INFORMATION_SCHEMA/i.test(sql)) {
        return [];
      }
      return [];
    }
  };

  let service;

  try {
    service = new RealtimeCdrService({
      autoStart: true,
      databaseClient: databaseStub,
      cgiEnricher: null
    });

    if (service.initializationPromise) {
      await service.initializationPromise;
    }

    assert.equal(
      service.elasticEnabled,
      true,
      'Elasticsearch should stay enabled when forcing usage'
    );

    shouldFail = false;

    for (let attempt = 0; attempt < 40 && !service.indexEnsured; attempt += 1) {
      await delay(20);
    }

    assert.equal(service.elasticEnabled, true, 'Elasticsearch should remain enabled after reconnect');
    assert.equal(service.indexEnsured, true, 'Realtime index should be marked as ensured after forced reconnect');
  } finally {
    if (service) {
      service.elasticEnabled = false;
      if (service.indexTimer) {
        clearTimeout(service.indexTimer);
        service.indexTimer = null;
      }
      if (service.reconnectTimer) {
        clearTimeout(service.reconnectTimer);
        service.reconnectTimer = null;
      }
    }

    client.indices.exists = originalExists;
    client.indices.create = originalCreate;
    client.search = originalSearch;

    if (typeof originalUseElastic === 'undefined') {
      delete process.env.USE_ELASTICSEARCH;
    } else {
      process.env.USE_ELASTICSEARCH = originalUseElastic;
    }

    if (typeof originalRetryDelay === 'undefined') {
      delete process.env.ELASTICSEARCH_RETRY_DELAY_MS;
    } else {
      process.env.ELASTICSEARCH_RETRY_DELAY_MS = originalRetryDelay;
    }
  }
});
