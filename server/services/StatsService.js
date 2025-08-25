import database from '../config/database.js';
import tablesCatalog from '../config/tables-catalog.js';

/**
 * Service de génération de statistiques basées sur les journaux de recherche
 * et les différentes tables configurées dans la plateforme.
 */
class StatsService {
  /**
   * Récupère les statistiques globales d'utilisation de la plateforme.
   */
  async getOverviewStats() {
    try {
      const totalSearches = await database.queryOne(
        'SELECT COUNT(*) as count FROM autres.search_logs'
      );

      const avgExecutionTime = await database.queryOne(
        'SELECT AVG(execution_time_ms) as avg_time FROM autres.search_logs WHERE execution_time_ms > 0'
      );

      const todaySearches = await database.queryOne(`
        SELECT COUNT(*) as count FROM autres.search_logs
        WHERE DATE(search_date) = CURDATE()
      `);

      const activeUsers = await database.queryOne(
        'SELECT COUNT(*) as count FROM autres.users'
      );

      const topSearchTerms = await database.query(`
        SELECT search_term, COUNT(*) as search_count
        FROM autres.search_logs
        WHERE search_term IS NOT NULL
          AND search_term != ''
          AND search_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY search_term
        ORDER BY search_count DESC
        LIMIT 10
      `);

      const searchesByType = await database.query(`
        SELECT COALESCE(search_type, 'unknown') as search_type, COUNT(*) as search_count
        FROM autres.search_logs
        GROUP BY search_type
        ORDER BY search_count DESC
      `);

      return {
        total_searches: totalSearches?.count || 0,
        avg_execution_time: Math.round(avgExecutionTime?.avg_time || 0),
        today_searches: todaySearches?.count || 0,
        active_users: activeUsers?.count || 0,
        top_search_terms: topSearchTerms || [],
        searches_by_type: searchesByType || []
      };
    } catch (error) {
      console.error('Erreur statistiques overview:', error);
      throw error;
    }
  }

  /**
   * Compte le nombre d'enregistrements pour chaque table de données.
   */
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

  /**
   * Retourne l'évolution des recherches sur une période donnée.
   */
  async getTimeSeriesData(days = 30) {
    try {
      const rows = await database.query(`
        SELECT
          DATE(search_date) as date,
          COUNT(*) as searches,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(execution_time_ms) as avg_time
        FROM autres.search_logs
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

  /**
   * Statistiques d'activité par utilisateur.
   */
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
        LEFT JOIN autres.search_logs sl ON u.id = sl.user_id
        GROUP BY u.id, u.login, u.admin
        ORDER BY total_searches DESC
      `);

      return userActivity || [];
    } catch (error) {
      console.error('Erreur statistiques utilisateurs:', error);
      throw error;
    }
  }

  /**
   * Répartition géographique basée sur les entreprises.
   */
  async getRegionDistribution() {
    try {
      const regions = await database.query(`
        SELECT region, COUNT(*) as count
        FROM autres_entreprises
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

  /**
   * Récupère les logs de recherche récents avec l'utilisateur associé.
   * Permet de filtrer par nom d'utilisateur.
   */
  async getSearchLogs(limit = 20, username = '') {
    try {
      let sql = `
        SELECT
          sl.*, u.login as username
        FROM autres.search_logs sl
        LEFT JOIN autres.users u ON sl.user_id = u.id
      `;

      const params = [];

      if (username) {
        sql += ' WHERE u.login LIKE ?';
        params.push(`%${username}%`);
      }

      sql += ' ORDER BY sl.search_date DESC LIMIT ?';
      params.push(limit);

      const logs = await database.query(sql, params);
      return logs || [];
    } catch (error) {
      console.error('Erreur logs de recherche:', error);
      return [];
    }
  }
}

export default StatsService;

