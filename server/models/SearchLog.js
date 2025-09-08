import database from '../config/database.js';

class SearchLog {
  static async create(logData) {
    const result = await database.query(
      `INSERT INTO autres.search_logs (
        user_id, username, search_term, filters, tables_searched,
        results_count, execution_time_ms, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        logData.user_id,
        logData.username,
        logData.search_term,
        JSON.stringify(logData.filters || {}),
        JSON.stringify(logData.tables_searched || []),
        logData.results_count,
        logData.execution_time_ms,
        logData.ip_address,
        logData.user_agent
      ]
    );

    return { id: result.insertId, ...logData };
  }

  static async getRecent(limit = 100) {
    const rows = await database.query(
      `SELECT * FROM autres.search_logs ORDER BY search_date DESC LIMIT ?`,
      [limit]
    );

    return rows.map(row => ({
      ...row,
      filters: JSON.parse(row.filters || '{}'),
      tables_searched: JSON.parse(row.tables_searched || '[]')
    }));
  }

  static async getStats() {
    const totalSearches = await database.queryOne(
      'SELECT COUNT(*) as count FROM autres.search_logs'
    );

    const avgResults = await database.queryOne(
      'SELECT AVG(results_count) as avg_results FROM autres.search_logs WHERE results_count > 0'
    );

    const avgTime = await database.queryOne(
      'SELECT AVG(execution_time_ms) as avg_time FROM autres.search_logs'
    );

    const topUsers = await database.query(
      `SELECT username, COUNT(*) as search_count
       FROM autres.search_logs
       WHERE username IS NOT NULL
       GROUP BY username
       ORDER BY search_count DESC
       LIMIT 10`
    );

    const dailySearches = await database.query(
      `SELECT DATE(search_date) as date, COUNT(*) as count
       FROM autres.search_logs
       WHERE search_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(search_date)
       ORDER BY date DESC`
    );

    return {
      total_searches: totalSearches?.count || 0,
      avg_results: Math.round(avgResults?.avg_results || 0),
      avg_execution_time: Math.round(avgTime?.avg_time || 0),
      top_users: topUsers,
      daily_searches: dailySearches
    };
  }
}

export default SearchLog;

