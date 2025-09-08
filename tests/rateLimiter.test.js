import { createRateLimiter } from '../server/middleware/rateLimiter.js';

describe('rateLimiter', () => {
  it('should skip for admin users', () => {
    const limiter = createRateLimiter(1000, 1);
    const req = { user: { role: 'ADMIN' } };
    expect(limiter.options.skip(req)).toBe(true);
  });

  it('should not skip for normal users', () => {
    const limiter = createRateLimiter(1000, 1);
    const req = { user: { role: 'USER' } };
    expect(limiter.options.skip(req)).toBe(false);
  });
});

