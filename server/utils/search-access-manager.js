const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES_PER_TABLE = 500;

class SearchAccessManager {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    this.store = new Map(); // userId -> Map<tableName, Map<recordId, expiresAt>>
  }

  _now() {
    return Date.now();
  }

  _cleanup(userId, now = this._now()) {
    const tables = this.store.get(userId);
    if (!tables) {
      return;
    }

    for (const [tableName, records] of tables) {
      for (const [recordId, expiresAt] of records) {
        if (!expiresAt || expiresAt <= now) {
          records.delete(recordId);
        }
      }
      if (records.size === 0) {
        tables.delete(tableName);
      }
    }

    if (tables.size === 0) {
      this.store.delete(userId);
    }
  }

  remember(userId, hits = []) {
    if (!userId || !Array.isArray(hits) || hits.length === 0) {
      return;
    }

    const now = this._now();
    let tables = this.store.get(userId);
    if (!tables) {
      tables = new Map();
      this.store.set(userId, tables);
    }

    this._cleanup(userId, now);

    for (const hit of hits) {
      const tableName = hit.table_name || (hit.database && hit.table ? `${hit.database}.${hit.table}` : null);
      if (!tableName) {
        continue;
      }

      const primaryKeys = hit.primary_keys && typeof hit.primary_keys === 'object'
        ? Object.values(hit.primary_keys)
        : [];

      if (!primaryKeys.length) {
        continue;
      }

      let records = tables.get(tableName);
      if (!records) {
        records = new Map();
        tables.set(tableName, records);
      }

      const expiresAt = now + this.ttlMs;
      for (const value of primaryKeys) {
        if (value === null || value === undefined) {
          continue;
        }
        const recordId = String(value);
        records.set(recordId, expiresAt);
      }

      if (records.size > MAX_ENTRIES_PER_TABLE) {
        const sorted = Array.from(records.entries()).sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
        while (records.size > MAX_ENTRIES_PER_TABLE) {
          const [recordId] = sorted.shift();
          records.delete(recordId);
        }
      }
    }
  }

  isAllowed(userId, tableName, recordId) {
    if (!userId || !tableName || recordId === undefined || recordId === null) {
      return false;
    }

    const now = this._now();
    this._cleanup(userId, now);

    const tables = this.store.get(userId);
    if (!tables) {
      return false;
    }

    const records = tables.get(tableName);
    if (!records) {
      return false;
    }

    const stored = records.get(String(recordId));
    if (!stored) {
      return false;
    }

    if (stored <= now) {
      records.delete(String(recordId));
      return false;
    }

    return true;
  }

  revokeUser(userId) {
    if (!userId) {
      return;
    }
    this.store.delete(userId);
  }
}

const searchAccessManager = new SearchAccessManager();

export default searchAccessManager;
