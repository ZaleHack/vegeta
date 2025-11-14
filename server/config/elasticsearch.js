import { Client } from '@elastic/elasticsearch';

const parseNonNegativeInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const requestTimeout = parseNonNegativeInteger(
  process.env.ELASTICSEARCH_REQUEST_TIMEOUT_MS,
  2000
);

const maxRetries = parseNonNegativeInteger(process.env.ELASTICSEARCH_MAX_RETRIES, 0);

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  maxRetries,
  requestTimeout,
  sniffOnStart: false,
  sniffInterval: false
});

export default client;
