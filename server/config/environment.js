import crypto from 'crypto';

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173'];

let cachedSecret;

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

  if (process.env.NODE_ENV === 'production' && resolveAllowedOrigins().length === 0) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must be configured with at least one origin in production environments.'
    );
  }
};

