import database from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import baseCatalog from '../config/tables-catalog.js';
import statsCache from './stats-cache.js';

/**
 * Service de génération de statistiques basées sur les journaux de recherche
 * et les différentes tables configurées dans la plateforme.
 */
class StatsService {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.catalogPath = path.join(__dirname, '../config/tables-catalog.json');
    this.cache = statsCache;
  }

  formatTableName(tableName) {
    if (typeof tableName !== 'string' || tableName.trim() === '') {
      return tableName;
    }

    return tableName
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .map((segment) => `\`${segment.replace(/`/g, '``')}\``)
      .join('.');
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
  async getOverviewStats(userId = null) {
    const cacheKey = `overview:${userId || 'all'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [
        totalSearches,
        avgExecutionTime,
        todaySearches,
        activeUsers,
        topSearchTerms,
        searchesByType,
        profileStats,
        requestStats,
        operationStats,
        dataStats
      ] = await Promise.all([
        database.queryOne(
          `SELECT COUNT(*) as count FROM autres.search_logs${userId ? ' WHERE user_id = ?' : ''}`,
          userId ? [userId] : []
        ),
        database.queryOne(
          `SELECT AVG(execution_time_ms) as avg_time FROM autres.search_logs WHERE execution_time_ms > 0${userId ? ' AND user_id = ?' : ''}`,
          userId ? [userId] : []
        ),
        database.queryOne(
          `SELECT COUNT(*) as count FROM autres.search_logs WHERE search_date >= DATE(NOW())${userId ? ' AND user_id = ?' : ''}`,
          userId ? [userId] : []
        ),
        userId
          ? Promise.resolve({ count: 1 })
          : database.queryOne('SELECT COUNT(*) as count FROM autres.users'),
        database.query(
          `SELECT search_term, COUNT(*) as search_count FROM autres.search_logs WHERE search_term IS NOT NULL AND search_term != ''${userId ? ' AND user_id = ?' : ''} AND search_date >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY search_term ORDER BY search_count DESC LIMIT 10`,
          userId ? [userId] : []
        ),
        database.query(
          `SELECT COALESCE(search_type, 'unknown') as search_type, COUNT(*) as search_count FROM autres.search_logs${userId ? ' WHERE user_id = ?' : ''} GROUP BY search_type ORDER BY search_count DESC`,
          userId ? [userId] : []
        ),
        database.queryOne(
          `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today,
            SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS recent
          FROM autres.profiles${userId ? ' WHERE user_id = ?' : ''}`,
          userId ? [userId] : []
        ),
        database.queryOne(
          `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'identified' THEN 1 ELSE 0 END) AS identified,
            SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today,
            SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS recent
          FROM autres.identification_requests${userId ? ' WHERE user_id = ?' : ''}`,
          userId ? [userId] : []
        ),
        database.queryOne(
          userId
            ? `
              SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS recent
              FROM (
                SELECT c.id, c.created_at
                FROM autres.cdr_cases c
                WHERE c.user_id = ?
                UNION
                SELECT c.id, c.created_at
                FROM autres.cdr_cases c
                INNER JOIN autres.cdr_case_shares s ON s.case_id = c.id
                WHERE s.user_id = ?
              ) AS accessible_cases
            `
            : `
              SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS recent
              FROM autres.cdr_cases
            `,
          userId ? [userId, userId] : []
        ),
        this.getDataStatistics()
      ]);

      const totalRecords = Object.values(dataStats || {}).reduce(
        (sum, entry) => sum + Number(entry?.total_records ?? 0),
        0
      );
      const sourceCount = (() => {
        if (!dataStats) {
          return 0;
        }
        const databases = new Set(
          Object.values(dataStats)
            .map(entry => entry?.database)
            .filter(Boolean)
        );
        return databases.size;
      })();
      const tableCount = Object.keys(dataStats || {}).length;

      const stats = {
        total_searches: Number(totalSearches?.count ?? 0),
        avg_execution_time: Math.round(Number(avgExecutionTime?.avg_time ?? 0)),
        today_searches: Number(todaySearches?.count ?? 0),
        active_users: Number(activeUsers?.count ?? 0),
        top_search_terms: topSearchTerms || [],
        searches_by_type: searchesByType || [],
        profiles: {
          total: Number(profileStats?.total ?? 0),
          today: Number(profileStats?.today ?? 0),
          recent: Number(profileStats?.recent ?? 0)
        },
        requests: {
          total: Number(requestStats?.total ?? 0),
          pending: Number(requestStats?.pending ?? 0),
          identified: Number(requestStats?.identified ?? 0),
          today: Number(requestStats?.today ?? 0),
          recent: Number(requestStats?.recent ?? 0)
        },
        operations: {
          total: Number(operationStats?.total ?? 0),
          today: Number(operationStats?.today ?? 0),
          recent: Number(operationStats?.recent ?? 0)
        },
        data: {
          total_records: totalRecords,
          sources: sourceCount,
          tables: tableCount
        }
      };

      this.cache.set(cacheKey, stats);
      return stats;
    } catch (error) {
      console.error('Erreur statistiques overview:', error);
      throw error;
    }
  }

  /**
   * Compte le nombre d'enregistrements pour chaque table de données.
   */
  async getDataStatistics() {
    const cacheKey = 'dataStats';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const catalog = this.loadCatalog();
    const entries = Object.entries(catalog);
    const results = await Promise.all(
      entries.map(async ([tableName, config]) => {
        try {
          const formattedTable = this.formatTableName(tableName);
          const result = await database.queryOne(`SELECT COUNT(*) as count FROM ${formattedTable}`);
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

    const distribution = Object.fromEntries(results);
    this.cache.set(cacheKey, distribution);
    return distribution;
  }

  /**
   * Retourne l'évolution des recherches sur une période donnée.
   */
  async getTimeSeriesData(days = 30, userId = null) {
    const cacheKey = `timeSeries:${days}:${userId || 'all'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let sql = `
        SELECT
          DATE(search_date) as date,
          COUNT(*) as searches,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(execution_time_ms) as avg_time
        FROM autres.search_logs
        WHERE search_date >= DATE_SUB(NOW(), INTERVAL ? DAY)`;

      const params = [days];
      if (userId) {
        sql += ' AND user_id = ?';
        params.push(userId);
      }
      sql += ' GROUP BY DATE(search_date) ORDER BY date ASC';

      const rows = await database.query(sql, params);

      const data = rows.map(row => ({
        date: row.date,
        searches: row.searches,
        unique_users: row.unique_users,
        avg_time: Math.round(row.avg_time || 0)
      }));

      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Erreur données temporelles:', error);
      throw error;
    }
  }

  /**
   * Statistiques d'activité par utilisateur.
   */
  async getUserActivity() {
    const cacheKey = 'userActivity';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

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

      this.cache.set(cacheKey, userActivity || []);
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
    const cacheKey = 'regionDistribution';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const regions = await database.query(`
        SELECT region, COUNT(*) as count
        FROM autres.entreprises
        WHERE region IS NOT NULL AND region != ''
        GROUP BY region
        ORDER BY count DESC
        LIMIT 10
      `);

      this.cache.set(cacheKey, regions || []);
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
  async getSearchLogs(limit = 20, username = '', userId = null) {
    const cacheKey = `searchLogs:${limit}:${username}:${userId || 'all'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let sql = `
        SELECT
          sl.*, u.login as username
        FROM autres.search_logs sl
        LEFT JOIN autres.users u ON sl.user_id = u.id`;

      const params = [];
      const conditions = [];

      if (userId) {
        conditions.push('sl.user_id = ?');
        params.push(userId);
      } else if (username) {
        conditions.push('u.login LIKE ?');
        params.push(`%${username}%`);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY sl.search_date DESC LIMIT ?';
      params.push(limit);

      const logs = await database.query(sql, params);
      this.cache.set(cacheKey, logs || []);
      return logs || [];
    } catch (error) {
      console.error('Erreur logs de recherche:', error);
      return [];
    }
  }
}

export default StatsService;

