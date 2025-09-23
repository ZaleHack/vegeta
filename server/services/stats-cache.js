import InMemoryCache from '../utils/cache.js';

const cache = new InMemoryCache();

export const getStatsCache = () => cache;

export default {
  get: (key) => cache.get(key),
  set: (key, value) => cache.set(key, value),
  clear: (prefix) => cache.clear(prefix)
};
