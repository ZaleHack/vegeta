const database = require('../config/database.cjs');
const tablesCatalog = require('../config/tables-catalog.json');

class StatsService {
  async getOverviewStats() {
    try {
      // Statistiques générales
      const totalSearches = database.queryOne(
        'SELECT COUNT(*) as count FROM search_logs'
      );
      
      const totalUsers = database.queryOne(
        'SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'
      );
      
      const avgExecutionTime = database.queryOne(
        'SELECT AVG(execution_time_ms) as avg_time FROM search_logs WHERE execution_time_ms > 0'
      );
      
      // Recherches aujourd'hui
      const todaySearches = database.queryOne(`
        SELECT COUNT(*) as count FROM search_logs 
        WHERE DATE(search_date) = DATE('now')
      `);
      
      // Top 10 des tables les plus consultées (approximation avec SQLite)
      const topTables = database.query(`
        SELECT 
          SUBSTR(tables_searched, 3, LENGTH(tables_searched) - 4) as table_name,
          COUNT(*) as search_count
        FROM search_logs 
        WHERE tables_searched IS NOT NULL 
          AND tables_searched != '[]'
        GROUP BY table_name
        ORDER BY search_count DESC 
        LIMIT 10
      `);
      
      return {
        total_searches: totalSearches.count,
        total_users: totalUsers.count,
        avg_execution_time: Math.round(avgExecutionTime.avg_time || 0),
        today_searches: todaySearches.count,
        top_tables: topTables
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
      'autres_entreprises'
    ];

    const stats = {};

    for (const table of tables) {
      try {
        const result = await database.queryOne(`SELECT COUNT(*) as count FROM ${table}`);
        stats[table] = {
          total_records: result.count,
          table_name: table
        };
      } catch (error) {
        stats[table] = {
          total_records: 0,
          error: error.message
        };
      }
    }

    return stats;
  }

  async getTablesDistribution() {
    try {
      // Compter les enregistrements par table
      const distribution = [];
      
      for (const [tableName, config] of Object.entries(tablesCatalog)) {
        try {
          const result = database.queryOne(`SELECT COUNT(*) as count FROM ${tableName}`);
          distribution.push({
            table: config.display,
            count: result.count
          });
        } catch (error) {
          console.warn(`Table ${tableName} non accessible:`, error.message);
          distribution.push({
            table: config.display,
            count: 0
          });
        }
      }
      
      return distribution.sort((a, b) => b.count - a.count);
      
    } catch (error) {
      console.error('Erreur distribution tables:', error);
      throw error;
    }
  }

  async getRegionDistribution() {
    // Distribution géographique (exemple avec entreprises et véhicules)
    const regions = [];

    try {
      // Entreprises par région
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
      const rows = database.query(`
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

  async getPopularSearchTerms(limit = 20) {
    // Termes de recherche les plus populaires
    const popularTerms = await database.query(`
      SELECT 
        search_term,
        COUNT(*) as frequency,
        AVG(results_count) as avg_results
      FROM search_logs
      WHERE search_term IS NOT NULL 
        AND search_term != ''
        AND search_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY search_term
      ORDER BY frequency DESC
      LIMIT ${limit}
    `);

    return popularTerms;
  }

  async getUserActivityStats() {
    try {
      // Activité par utilisateur
      const userActivity = database.query(`
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
      
      // Répartition par rôle
      const roleDistribution = database.query(`
        SELECT 
          role,
          COUNT(*) as count
        FROM users 
        WHERE is_active = TRUE
        GROUP BY role
      `);
      
      return {
        user_activity: userActivity,
        role_distribution: roleDistribution
      };
      
    } catch (error) {
      console.error('Erreur statistiques utilisateurs:', error);
      throw error;
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
    
    // Stats générales
    csv += 'Recherches totales,' + stats.search_stats.total_searches + '\n';
    csv += '\nTop Tables\n';
    csv += 'Table,Recherches\n';
    
    for (const table of stats.search_stats.top_tables) {
      csv += `${table.table_name},${table.search_count}\n`;
    }
    
    csv += '\nUtilisateurs actifs\n';
    csv += 'Utilisateur,Recherches\n';
    
    for (const user of stats.search_stats.top_users) {
      csv += `${user.username},${user.search_count}\n`;
    }
    
    return csv;
  }
}

module.exports = StatsService;