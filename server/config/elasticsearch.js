import { Client } from '@elastic/elasticsearch';

const node = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

const maxRetriesEnv = Number(process.env.ELASTICSEARCH_MAX_RETRIES);
const requestTimeoutEnv = Number(process.env.ELASTICSEARCH_REQUEST_TIMEOUT_MS);

const maxRetries = Number.isFinite(maxRetriesEnv) && maxRetriesEnv >= 0 ? maxRetriesEnv : 1;
const requestTimeout =
  Number.isFinite(requestTimeoutEnv) && requestTimeoutEnv > 0 ? requestTimeoutEnv : 3000;

const client = new Client({
  node,
  maxRetries,
  requestTimeout,
  sniffOnStart: false,
  name: 'sora-search-platform'
});

export default client;
