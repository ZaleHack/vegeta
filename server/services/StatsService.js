import database from '../config/database.js';
import tablesCatalog from '../config/tables-catalog.js';

class StatsService {
  async getOverviewStats() {
    try {
      // Statistiques générales
      const totalSearches = await database.queryOne(
        'SELECT COUNT(*) as count FROM search_logs'
      );
      
      const avgExecutionTime = await database.queryOne(
        'SELECT AVG(execution_time_ms) as avg_time FROM search_logs WHERE execution_time_ms > 0'
      );
      
      // Recherches aujourd'hui
      const todaySearches = await database.queryOne(`
        SELECT COUNT(*) as count FROM search_logs 
        WHERE DATE(search_date) = CURDATE()
      `);

      // Utilisateurs actifs
      const activeUsers = await database.queryOne(
        'SELECT COUNT(*) as count FROM autres.users'
      );
      
      // Top 10 des termes de recherche
      const topSearchTerms = await database.query(`
        SELECT search_term, COUNT(*) as search_count
        FROM search_logs 
        WHERE search_term IS NOT NULL 
          AND search_term != ''
          AND search_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY search_term
        ORDER BY search_count DESC 
        LIMIT 10
      `);
      
      return {
        total_searches: totalSearches?.count || 0,
        avg_execution_time: Math.round(avgExecutionTime?.avg_time || 0),
        today_searches: todaySearches?.count || 0,
        active_users: activeUsers?.count || 0,
        top_search_terms: topSearchTerms || []
      };
      
    } catch (error) {
      console.error('Erreur statistiques overview:', error);
      throw error;
    }
  }

  async getDataStatistics() {
    const stats = {};

    for (const [tableName, config] of Object.entries(tablesCatalog)) {
      try {
        const result = await database.queryOne(`SELECT COUNT(*) as count FROM ${tableName}`);
        stats[tableName] = {
          total_records: result?.count || 0,
          table_name: config.display,
          database: config.database
        };
      } catch (error) {
        console.warn(`Table ${tableName} non accessible:`, error.message);
        stats[tableName] = {
          total_records: 0,
          table_name: config.display,
          database: config.database,
          error: error.message
        };
      }
    }

    return stats;
  }

  async getTimeSeriesData(days = 30) {
    try {
      const rows = await database.query(`
        SELECT 
          DATE(search_date) as date,
          COUNT(*) as searches,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(execution_time_ms) as avg_time
        FROM search_logs 
        WHERE search_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY DATE(search_date)
        ORDER BY date ASC
      `, [days]);
      
      return rows.map(row => ({
        date: row.date,
        searches: row.searches,
        unique_users: row.unique_users,
        avg_time: Math.round(row.avg_time || 0)
      }));
      
    } catch (error) {
      console.error('Erreur données temporelles:', error);
      throw error;
    }
  }

  async getUserActivity() {
    try {
      const userActivity = await database.query(`
        SELECT 
          u.login,
          u.admin,
          COUNT(sl.id) as total_searches,
          AVG(sl.results_count) as avg_results,
          MAX(sl.search_date) as last_search
        FROM autres.users u
        LEFT JOIN search_logs sl ON u.id = sl.user_id
        GROUP BY u.id, u.login, u.admin
        ORDER BY total_searches DESC
      `);
      
      return userActivity || [];
      
    } catch (error) {
      console.error('Erreur statistiques utilisateurs:', error);
      throw error;
    }
  }

  async getRegionDistribution() {
    try {
      // Distribution par région depuis les entreprises
      const regions = await database.query(`
        SELECT region, COUNT(*) as count 
        FROM autres.entreprises 
        WHERE region IS NOT NULL AND region != ''
        GROUP BY region 
        ORDER BY count DESC
        LIMIT 10
      `);

      return regions || [];
    } catch (error) {
      console.warn('Erreur stats régions:', error);
      return [];
    }
  }
}

export default StatsService;