import { getBtsPool } from '../config/btsDatabase.js';

export const normalizeCgi = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
};

class BtsLookupService {
  constructor() {
    this.cache = new Map();
    this.tables = ['5g', '4g', '3g', '2g'];
    this.chunkSize = 500;
  }

  #normalizeRow(row) {
    const normalized = {};
    for (const [key, value] of Object.entries(row || {})) {
      if (typeof key === 'string') {
        normalized[key.toUpperCase()] = value;
      } else {
        normalized[key] = value;
      }
    }

    return {
      LONGITUDE: normalized.LONGITUDE ?? null,
      LATITUDE: normalized.LATITUDE ?? null,
      AZIMUT: normalized.AZIMUT ?? null,
      NOM_BTS: normalized.NOM_BTS ?? null
    };
  }

  async #queryTable(pool, table, cgiValues) {
    if (!Array.isArray(cgiValues) || cgiValues.length === 0) {
      return new Map();
    }

    const placeholders = cgiValues.map(() => '?').join(',');
    const sql = `SELECT CGI, NOM_BTS, LONGITUDE, LATITUDE, AZIMUT FROM \`${table}\` WHERE CGI IN (${placeholders})`;

    const [rows] = await pool.query(sql, cgiValues);
    const matches = new Map();

    for (const row of rows) {
      const key = normalizeCgi(row.CGI ?? row.cgi);
      if (!key || matches.has(key)) {
        continue;
      }
      matches.set(key, this.#normalizeRow(row));
    }

    return matches;
  }

  async lookup(cgi) {
    const normalized = normalizeCgi(cgi);
    if (!normalized) {
      return null;
    }

    if (this.cache.has(normalized)) {
      return this.cache.get(normalized);
    }

    const pool = getBtsPool();
    const pending = new Set([normalized]);
    const results = await this.#lookupPending(pool, pending);

    if (results.has(normalized)) {
      const value = results.get(normalized);
      this.cache.set(normalized, value);
      return value;
    }

    this.cache.set(normalized, null);
    return null;
  }

  async lookupMultiple(cgiList) {
    const results = new Map();
    const pending = new Set();

    for (const value of cgiList || []) {
      const normalized = normalizeCgi(value);
      if (!normalized) {
        continue;
      }

      if (this.cache.has(normalized)) {
        results.set(normalized, this.cache.get(normalized));
      } else if (!pending.has(normalized)) {
        pending.add(normalized);
      }
    }

    if (pending.size === 0) {
      return results;
    }

    const pool = getBtsPool();
    const fetched = await this.#lookupPending(pool, pending);

    for (const [key, value] of fetched.entries()) {
      this.cache.set(key, value);
      results.set(key, value);
      pending.delete(key);
    }

    for (const remaining of pending) {
      this.cache.set(remaining, null);
      results.set(remaining, null);
    }

    return results;
  }

  async #lookupPending(pool, pendingSet) {
    const resolved = new Map();
    const pending = new Set(pendingSet);

    for (const table of this.tables) {
      if (pending.size === 0) {
        break;
      }

      const values = Array.from(pending);
      for (let i = 0; i < values.length; i += this.chunkSize) {
        const chunk = values.slice(i, i + this.chunkSize).filter((value) => pending.has(value));
        if (chunk.length === 0) {
          continue;
        }

        const matches = await this.#queryTable(pool, table, chunk);
        for (const [cgi, info] of matches.entries()) {
          if (!pending.has(cgi)) {
            continue;
          }
          resolved.set(cgi, info);
          pending.delete(cgi);
        }
      }
    }

    return resolved;
  }
}

export default BtsLookupService;
