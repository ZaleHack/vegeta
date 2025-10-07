import crypto from 'crypto';

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173'];

let cachedSecret;
let cachedPayloadEncryptionKey;

const sanitizeList = (value = '') =>
  value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const truthyValues = new Set(['true', '1', 'yes', 'on']);
const falsyValues = new Set(['false', '0', 'no', 'off']);

const normalizeBooleanEnv = (value, defaultValue = true) => {
  if (typeof value === 'undefined' || value === null) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (truthyValues.has(normalized)) {
    return true;
  }

  if (falsyValues.has(normalized)) {
    return false;
  }

  return defaultValue;
};

const ensureSearchConfiguration = () => {
  const rawValue = process.env.USE_ELASTICSEARCH;
  const useElastic = normalizeBooleanEnv(rawValue, true);

  if (typeof rawValue === 'undefined') {
    console.warn(
      '⚠️ USE_ELASTICSEARCH non défini. Activation par défaut d\'Elasticsearch pour accélérer les recherches.'
    );
  } else if (
    rawValue &&
    !truthyValues.has(rawValue.trim().toLowerCase()) &&
    !falsyValues.has(rawValue.trim().toLowerCase())
  ) {
    console.warn(
      `⚠️ Valeur USE_ELASTICSEARCH inconnue ("${rawValue}"). Utilisation de ${
        useElastic ? 'true' : 'false'
      } après normalisation.`
    );
  }

  process.env.USE_ELASTICSEARCH = useElastic ? 'true' : 'false';

  if (useElastic && !process.env.ELASTICSEARCH_URL) {
    process.env.ELASTICSEARCH_URL = 'http://localhost:9200';
    console.warn(
      '⚠️ ELASTICSEARCH_URL non défini. Utilisation de http://localhost:9200 comme valeur par défaut.'
    );
  }
};

export const isElasticsearchEnabled = () => {
  ensureSearchConfiguration();
  return process.env.USE_ELASTICSEARCH === 'true';
};

export const getJwtSecret = () => {
  if (cachedSecret) {
    return cachedSecret;
  }

  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    cachedSecret = secret;
    return cachedSecret;
  }

  if (process.env.NODE_ENV !== 'production') {
    cachedSecret = crypto.randomBytes(48).toString('hex');
    process.env.JWT_SECRET = cachedSecret;
    console.warn(
      '⚠️ JWT_SECRET n\'est pas défini. Génération d\'un secret temporaire pour l\'environnement de développement.'
    );
    return cachedSecret;
  }

  throw new Error(
    'JWT secret is not configured. Set a strong JWT_SECRET environment variable before starting the server.'
  );
};

export const getPayloadEncryptionKey = () => {
  if (cachedPayloadEncryptionKey) {
    return cachedPayloadEncryptionKey;
  }

  const base64Key = process.env.PAYLOAD_ENCRYPTION_KEY?.trim();
  if (!base64Key) {
    if (process.env.NODE_ENV !== 'production') {
      cachedPayloadEncryptionKey = crypto.randomBytes(32);
      process.env.PAYLOAD_ENCRYPTION_KEY = cachedPayloadEncryptionKey.toString('base64');
      console.warn(
        '⚠️ PAYLOAD_ENCRYPTION_KEY n\'est pas défini. Génération d\'une clé AES-256 temporaire pour l\'environnement de développement.'
      );
      return cachedPayloadEncryptionKey;
    }

    throw new Error(
      'PAYLOAD_ENCRYPTION_KEY must be configured with the base64-encoded AES-256 key used to decrypt client payloads.'
    );
  }

  let decoded;
  try {
    decoded = Buffer.from(base64Key, 'base64');
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      cachedPayloadEncryptionKey = crypto.randomBytes(32);
      process.env.PAYLOAD_ENCRYPTION_KEY = cachedPayloadEncryptionKey.toString('base64');
      console.warn(
        '⚠️ PAYLOAD_ENCRYPTION_KEY est invalide. Génération d\'une clé AES-256 temporaire pour l\'environnement de développement.'
      );
      return cachedPayloadEncryptionKey;
    }

    throw new Error('PAYLOAD_ENCRYPTION_KEY must be a valid base64 encoded string.');
  }

  if (decoded.length !== 32) {
    if (process.env.NODE_ENV !== 'production') {
      cachedPayloadEncryptionKey = crypto.randomBytes(32);
      process.env.PAYLOAD_ENCRYPTION_KEY = cachedPayloadEncryptionKey.toString('base64');
      console.warn(
        '⚠️ PAYLOAD_ENCRYPTION_KEY doit décoder en 32 octets. Génération d\'une clé AES-256 temporaire pour l\'environnement de développement.'
      );
      return cachedPayloadEncryptionKey;
    }

    throw new Error('PAYLOAD_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256 key).');
  }

  cachedPayloadEncryptionKey = decoded;
  return cachedPayloadEncryptionKey;
};

export const resolveAllowedOrigins = () => {
  const configuredOrigins = sanitizeList(process.env.CORS_ALLOWED_ORIGINS);
  if (configuredOrigins.length > 0) {
    return [...new Set(configuredOrigins)];
  }

  if (process.env.NODE_ENV !== 'production') {
    return [...new Set(DEFAULT_DEV_ORIGINS)];
  }

  return [];
};

export const ensureEnvironment = () => {
  getJwtSecret();
  getPayloadEncryptionKey();
  ensureSearchConfiguration();

  if (process.env.NODE_ENV === 'production' && resolveAllowedOrigins().length === 0) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must be configured with at least one origin in production environments.'
    );
  }
};

