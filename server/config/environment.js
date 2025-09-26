const DEFAULT_DEV_ORIGINS = ['http://localhost:5173'];

const sanitizeList = (value = '') =>
  value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'JWT secret is not configured. Set a strong JWT_SECRET environment variable before starting the server.'
    );
  }
  return secret;
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

