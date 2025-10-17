import database from '../config/database.js';
import { ensureUserExists, handleMissingUserForeignKey } from '../utils/foreign-key-helpers.js';
import statsCache from '../services/stats-cache.js';
import { sanitizeNonNegative } from '../utils/number-utils.js';

const serialize = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
};

class SearchLog {
  static async create({
    user_id,
    username,
    search_term,
    search_type = 'global',
    tables_searched = [],
    results_count = 0,
    execution_time_ms = 0,
    extra_searches = 0,
    ip_address = null,
    user_agent = null
  }) {
    const safeUserId = await ensureUserExists(user_id);
    const payload = [
      safeUserId,
      username || null,
      search_term || null,
      search_type || null,
      serialize(tables_searched),
      Number.isFinite(results_count) ? Math.max(0, Number(results_count)) : 0,
      Number.isFinite(execution_time_ms) ? Math.max(0, Math.round(Number(execution_time_ms))) : 0,
      sanitizeNonNegative(extra_searches),
      ip_address || null,
      user_agent || null
    ];

    const insert = async (userIdValue) => {
      await database.query(
        `INSERT INTO autres.search_logs (
          user_id,
          username,
          search_term,
          search_type,
          tables_searched,
          results_count,
          execution_time_ms,
          extra_searches,
          ip_address,
          user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userIdValue, ...payload.slice(1)]
      );
    };

    try {
      await insert(safeUserId);
    } catch (error) {
      const handled = await handleMissingUserForeignKey(error, async () => {
        await insert(null);
      });
      if (!handled) {
        throw error;
      }
    }

    statsCache.clear('overview:');
    statsCache.clear('timeSeries:');
    statsCache.clear('userActivity');
    statsCache.clear('searchLogs:');
  }
}

export default SearchLog;
