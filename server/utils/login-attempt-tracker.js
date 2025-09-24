class LoginAttemptTracker {
  constructor({ windowMs = 15 * 60 * 1000, maxAttempts = 10, blockDurationMs = 15 * 60 * 1000 } = {}) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
    this.blockDurationMs = blockDurationMs;
    this.store = new Map();
  }

  _cleanup(key, now) {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.blockedUntil && entry.blockedUntil <= now) {
      this.store.delete(key);
      return null;
    }

    if (!entry.blockedUntil && entry.expiresAt && entry.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }

    return entry;
  }

  _getOrCreate(key, now) {
    const existing = this._cleanup(key, now);
    if (existing) {
      return existing;
    }

    const fresh = {
      attempts: 0,
      expiresAt: 0,
      blockedUntil: null
    };
    this.store.set(key, fresh);
    return fresh;
  }

  isBlocked(key, now = Date.now()) {
    const entry = this._cleanup(key, now);
    if (!entry) {
      return { blocked: false };
    }

    if (entry.blockedUntil && entry.blockedUntil > now) {
      return {
        blocked: true,
        retryAfterMs: entry.blockedUntil - now
      };
    }

    return { blocked: false };
  }

  recordFailure(key, now = Date.now()) {
    if (!key) {
      return { blocked: false };
    }

    const entry = this._getOrCreate(key, now);
    entry.attempts += 1;
    entry.expiresAt = now + this.windowMs;

    if (entry.attempts >= this.maxAttempts) {
      entry.blockedUntil = now + this.blockDurationMs;
      return {
        blocked: true,
        retryAfterMs: this.blockDurationMs,
        attempts: entry.attempts,
        remaining: 0
      };
    }

    const remaining = Math.max(this.maxAttempts - entry.attempts, 0);
    return {
      blocked: false,
      attempts: entry.attempts,
      remaining
    };
  }

  recordSuccess(key) {
    if (!key) {
      return;
    }

    if (this.store.has(key)) {
      this.store.delete(key);
    }
  }
}

export default LoginAttemptTracker;
