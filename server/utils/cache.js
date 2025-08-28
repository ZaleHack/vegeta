export default class InMemoryCache {
  constructor(ttl = 300000) {
    this.ttl = ttl;
    this.store = new Map();
  }

  _now() {
    return Date.now();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    const { value, expiry } = entry;
    if (expiry < this._now()) {
      this.store.delete(key);
      return null;
    }
    return value;
  }

  set(key, value) {
    const expiry = this._now() + this.ttl;
    this.store.set(key, { value, expiry });
  }
}
