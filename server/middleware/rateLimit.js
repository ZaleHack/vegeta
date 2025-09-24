import LoginAttemptTracker from '../utils/login-attempt-tracker.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const ipTracker = new LoginAttemptTracker({
  windowMs: FIFTEEN_MINUTES,
  maxAttempts: 20,
  blockDurationMs: FIFTEEN_MINUTES
});

const accountTracker = new LoginAttemptTracker({
  windowMs: FIFTEEN_MINUTES,
  maxAttempts: 10,
  blockDurationMs: FIFTEEN_MINUTES
});

export const formatRetryAfter = (retryAfterMs = 0) => {
  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds < 60) {
    return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
};

export const loginRateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';

  const contexts = [
    { tracker: ipTracker, key: `ip:${ip}` }
  ];

  if (login) {
    contexts.push({ tracker: accountTracker, key: `login:${login}` });
  }

  for (const { tracker, key } of contexts) {
    const status = tracker.isBlocked(key);
    if (status.blocked) {
      if (status.retryAfterMs) {
        res.setHeader('Retry-After', Math.ceil(status.retryAfterMs / 1000));
      }
      return res.status(429).json({
        error: `Trop de tentatives de connexion. Veuillez réessayer dans ${formatRetryAfter(status.retryAfterMs)}.`
      });
    }
  }

  req.loginRateLimit = {
    recordSuccess: () => {
      contexts.forEach(({ tracker, key }) => tracker.recordSuccess(key));
    },
    recordFailure: () => {
      let blockedContext = null;
      let remainingAttempts = Infinity;

      contexts.forEach(({ tracker, key }) => {
        const result = tracker.recordFailure(key);
        if (result.blocked && !blockedContext) {
          blockedContext = result;
        }
        if (typeof result.remaining === 'number' && result.remaining < remainingAttempts) {
          remainingAttempts = result.remaining;
        }
      });

      return {
        blocked: Boolean(blockedContext),
        retryAfterMs: blockedContext?.retryAfterMs || null,
        remaining: Number.isFinite(remainingAttempts) ? Math.max(remainingAttempts, 0) : null
      };
    }
  };

  next();
};

export default loginRateLimiter;
