import crypto from 'crypto';

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173'];

let cachedSecret;
let cachedPayloadEncryptionKey;

const sanitizeList = (value = '') =>
  value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

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
    throw new Error(
      'PAYLOAD_ENCRYPTION_KEY must be configured with the base64-encoded AES-256 key used to decrypt client payloads.'
    );
  }

  let decoded;
  try {
    decoded = Buffer.from(base64Key, 'base64');
  } catch (error) {
    throw new Error('PAYLOAD_ENCRYPTION_KEY must be a valid base64 encoded string.');
  }

  if (decoded.length !== 32) {
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

  if (process.env.NODE_ENV === 'production' && resolveAllowedOrigins().length === 0) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must be configured with at least one origin in production environments.'
    );
  }
};

