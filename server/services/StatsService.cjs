const database = require('../config/database.cjs');
const tablesCatalog = require('../config/tables-catalog.json');

class StatsService {
  async getOverviewStats() {
    try {
      const [
        totalSearches,
        avgExecutionTime,
        todaySearches,
        activeUsers,
        topSearchTerms
      ] = await Promise.all([
        database.queryOne('SELECT COUNT(*) as count FROM search_logs'),
        database.queryOne(
          'SELECT AVG(execution_time_ms) as avg_time FROM search_logs WHERE execution_time_ms > 0'
        ),
        database.queryOne(`
        SELECT COUNT(*) as count FROM search_logs
        WHERE DATE(search_date) = DATE('now')
      `),
        database.queryOne('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'),
        database.query(`
        SELECT search_term, COUNT(*) as search_count
        FROM search_logs
        WHERE search_term IS NOT NULL
          AND search_term != ''
          AND search_date >= DATE('now', '-30 day')
        GROUP BY search_term
        ORDER BY search_count DESC
        LIMIT 10
      `)
      ]);

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
    const tables = [
      'esolde_mytable',
      'rhpolice_personne_concours',
      'renseignement_agentfinance',
      'rhgendarmerie_personne',
      'permis_tables',
      'expresso_expresso',
      'elections_dakar',
      'autres_vehicules',
      'autres_entreprises',
      'autres_annuaire_gendarmerie',
      'autres_uvs',
      'autres_collections'
    ];

    const results = await Promise.all(
      tables.map(async (table) => {
        try {
          const result = await database.queryOne(`SELECT COUNT(*) as count FROM ${table}`);
          return [table, {
            total_records: result?.count || 0,
            table_name: table
          }];
        } catch (error) {
          return [table, {
            total_records: 0,
            error: error.message,
            table_name: table
          }];
        }
      })
    );

    return Object.fromEntries(results);
  }

  async getTableDistribution() {
    try {
      const entries = Object.entries(tablesCatalog);
      const distribution = await Promise.all(
        entries.map(async ([tableName, config]) => {
          try {
            const result = await database.queryOne(`SELECT COUNT(*) as count FROM ${tableName}`);
            return { table: config.display, count: result?.count || 0 };
          } catch (error) {
            console.warn(`Table ${tableName} non accessible:`, error.message);
            return { table: config.display, count: 0 };
          }
        })
      );

      return distribution.sort((a, b) => b.count - a.count);
    } catch (error) {
      console.error('Erreur distribution tables:', error);
      throw error;
    }
  }

  async getRegionDistribution() {
    const regions = [];

    try {
      const enterpriseRegions = await database.query(`
        SELECT region, COUNT(*) as count
        FROM autres_entreprises
        WHERE region IS NOT NULL AND region != ''
        GROUP BY region
        ORDER BY count DESC
        LIMIT 10
      `);

      regions.push(...enterpriseRegions);
    } catch (error) {
      console.warn('Erreur stats régions:', error);
    }

    return regions;
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
        WHERE search_date >= DATE('now', '-' || ? || ' days')
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
          u.username,
          u.role,
          COUNT(sl.id) as total_searches,
          AVG(sl.results_count) as avg_results,
          MAX(sl.search_date) as last_search
        FROM users u
        LEFT JOIN search_logs sl ON u.id = sl.user_id
        WHERE u.is_active = TRUE
        GROUP BY u.id, u.username, u.role
        ORDER BY total_searches DESC
      `);

      return userActivity || [];
    } catch (error) {
      console.error('Erreur statistiques utilisateurs:', error);
      throw error;
    }
  }

  async getSearchLogs(limit = null, username = '') {
    try {
      let sql = `
        SELECT
          sl.*, u.username
        FROM search_logs sl
        LEFT JOIN users u ON sl.user_id = u.id`;
      const params = [];

      if (username) {
        sql += ' WHERE u.username LIKE ?';
        params.push(`%${username}%`);
      }

      sql += ' ORDER BY sl.search_date DESC';

      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const logs = await database.query(sql, params);

      return logs || [];
    } catch (error) {
      console.error('Erreur logs de recherche:', error);
      return [];
    }
  }

  async exportStats(format = 'csv') {
    const stats = await this.getOverviewStats();

    if (format === 'csv') {
      return this.generateCSVExport(stats);
    } else if (format === 'json') {
      return JSON.stringify(stats, null, 2);
    }

    throw new Error('Format d\'export non supporté');
  }

  generateCSVExport(stats) {
    let csv = 'Statistiques VEGETA\n\n';

    csv += 'Recherches totales,' + stats.total_searches + '\n';
    csv += '\nTop termes\n';
    csv += 'Terme,Recherches\n';

    for (const term of stats.top_search_terms) {
      csv += `${term.search_term},${term.search_count}\n`;
    }

    return csv;
  }
}

module.exports = StatsService;