import database from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import baseCatalog from '../config/tables-catalog.js';

/**
 * Service de génération de statistiques basées sur les journaux de recherche
 * et les différentes tables configurées dans la plateforme.
 */
class StatsService {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.catalogPath = path.join(__dirname, '../config/tables-catalog.json');
  }

  loadCatalog() {
    let catalog = { ...baseCatalog };
    try {
      if (fs.existsSync(this.catalogPath)) {
        const raw = fs.readFileSync(this.catalogPath, 'utf-8');
        const json = JSON.parse(raw);
        for (const [key, value] of Object.entries(json)) {
          const [db, ...tableParts] = key.split('_');
          const tableName = `${db}.${tableParts.join('_')}`;
          catalog[tableName] = value;
        }
      }
    } catch (error) {
      console.error('❌ Erreur chargement catalogue:', error);
    }
    return catalog;
  }

  /**
   * Récupère les statistiques globales d'utilisation de la plateforme.
   */
  async getOverviewStats() {
    try {
      const [
        totalSearches,
        avgExecutionTime,
        todaySearches,
        activeUsers,
        topSearchTerms,
        searchesByType
      ] = await Promise.all([
        database.queryOne('SELECT COUNT(*) as count FROM autres.search_logs'),
        database.queryOne(
          'SELECT AVG(execution_time_ms) as avg_time FROM autres.search_logs WHERE execution_time_ms > 0'
        ),
        database.queryOne(`
        SELECT COUNT(*) as count FROM autres.search_logs
        WHERE DATE(search_date) = CURDATE()
      `),
        database.queryOne('SELECT COUNT(*) as count FROM autres.users'),
        database.query(`
        SELECT search_term, COUNT(*) as search_count
        FROM autres.search_logs
        WHERE search_term IS NOT NULL
          AND search_term != ''
          AND search_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY search_term
        ORDER BY search_count DESC
        LIMIT 10
      `),
        database.query(`
        SELECT COALESCE(search_type, 'unknown') as search_type, COUNT(*) as search_count
        FROM autres.search_logs
        GROUP BY search_type
        ORDER BY search_count DESC
      `)
      ]);

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
    const catalog = this.loadCatalog();
    const entries = Object.entries(catalog);
    const results = await Promise.all(
      entries.map(async ([tableName, config]) => {
        try {
          const result = await database.queryOne(`SELECT COUNT(*) as count FROM ${tableName}`);
          return [tableName, {
            total_records: result?.count || 0,
            table_name: config.display,
            database: config.database
          }];
        } catch (error) {
          console.warn(`Table ${tableName} non accessible:`, error.message);
          return [tableName, {
            total_records: 0,
            table_name: config.display,
            database: config.database,
            error: error.message
          }];
        }
      })
    );

    return Object.fromEntries(results);
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

