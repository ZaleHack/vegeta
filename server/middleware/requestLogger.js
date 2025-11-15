import { isRequestLoggingEnabled } from '../config/logging.js';

const SENSITIVE_KEYS = new Set(['password', 'currentPassword', 'newPassword', 'token']);

const redactValue = (value) => {
  if (value === undefined || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (typeof value === 'object') {
    return redactObject(value);
  }
  if (typeof value === 'string') {
    return value.length > 0 ? '***redacted***' : value;
  }
  return '***redacted***';
};

const redactObject = (source) => {
  const clone = Array.isArray(source) ? [] : {};
  for (const [key, value] of Object.entries(source)) {
    if (SENSITIVE_KEYS.has(key)) {
      clone[key] = redactValue(value);
      continue;
    }

    if (value && typeof value === 'object') {
      clone[key] = redactObject(value);
    } else {
      clone[key] = value;
    }
  }
  return clone;
};

const hasBodyToLog = (req) => {
  if (!req.body) {
    return false;
  }
  if (typeof req.body !== 'object') {
    return false;
  }
  return Object.keys(req.body).length > 0;
};

const SKIPPED_PATHS = [/^\/api\/cdr\/realtime\/search/i];

const shouldSkipLogging = (url = '') => {
  const [pathname] = String(url).split('?');
  return SKIPPED_PATHS.some((pattern) => pattern.test(pathname));
};

export const requestLogger = (req, res, next) => {
  if (!isRequestLoggingEnabled()) {
    return next();
  }

  if (shouldSkipLogging(req.originalUrl)) {
    return next();
  }

  const start = process.hrtime.bigint();
  const { method, originalUrl } = req;
  const origin = req.headers.origin || 'n/a';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;
    const status = res.statusCode;

    const user = req.user ? `${req.user.id ?? 'unknown'}${req.user.email ? ` <${req.user.email}>` : ''}` : 'anonymous';

    const parts = [
      `[${new Date().toISOString()}]`,
      method,
      originalUrl,
      `status=${status}`,
      `duration=${durationMs.toFixed(1)}ms`,
      `origin=${origin}`,
      `ip=${ip}`,
      `user=${user}`
    ];

    console.log(parts.join(' '));

    if (Object.keys(req.query || {}).length > 0) {
      console.log('  query:', JSON.stringify(req.query));
    }

    if (hasBodyToLog(req)) {
      console.log('  body:', JSON.stringify(redactObject(req.body)));
    }
  });

  next();
};

export default requestLogger;
