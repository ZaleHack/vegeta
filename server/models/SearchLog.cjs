const database = require('../config/database.cjs');

class SearchLog {
  static async create(logData) {
    const result = database.run(`
      INSERT INTO search_logs (
        user_id, username, search_term, filters, tables_searched, 
        results_count, execution_time_ms, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      logData.user_id,
      logData.username,
      logData.search_term,
      JSON.stringify(logData.filters || {}),
      JSON.stringify(logData.tables_searched || []),
      logData.results_count,
      logData.execution_time_ms,
      logData.ip_address,
      logData.user_agent
    ]);
    
    return { id: result.lastInsertRowid, ...logData };
  }

  static async getRecent(limit = 100) {
    const rows = database.query(`
      SELECT * FROM search_logs 
      ORDER BY search_date DESC 
      LIMIT ?
    `, [limit]);
    
    return rows.map(row => ({
      ...row,
      filters: JSON.parse(row.filters || '{}'),
      tables_searched: JSON.parse(row.tables_searched || '[]')
    }));
  }

  static async getStats(dateRange = 30) {
    // Statistiques générales
    const totalSearches = database.queryOne(
      'SELECT COUNT(*) as count FROM search_logs'
    );
    
    const avgResults = database.queryOne(
      'SELECT AVG(results_count) as avg_results FROM search_logs WHERE results_count > 0'
    );
    
    const avgTime = database.queryOne(
      'SELECT AVG(execution_time_ms) as avg_time FROM search_logs'
    );
    
    // Top utilisateurs
    const topUsers = database.query(`
      SELECT username, COUNT(*) as search_count 
      FROM search_logs 
      WHERE username IS NOT NULL 
      GROUP BY username 
      ORDER BY search_count DESC 
      LIMIT 10
    `);
    
    // Recherches par jour (7 derniers jours)
    const dailySearches = database.query(`
      SELECT 
        DATE(search_date) as date,
        COUNT(*) as count
      FROM search_logs 
      WHERE search_date >= DATE('now', '-7 days')
      GROUP BY DATE(search_date)
      ORDER BY date DESC
    `);
    
    return {
      total_searches: totalSearches.count,
      avg_results: Math.round(avgResults.avg_results || 0),
      avg_execution_time: Math.round(avgTime.avg_time || 0),
      top_users: topUsers,
      daily_searches: dailySearches
    };
  }
}

module.exports = SearchLog;