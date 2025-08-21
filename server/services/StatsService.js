import database from '../config/database.js';

class StatsService {
  async getOverviewStats() {
    try {
      // Statistiques des utilisateurs
      const userStats = database.queryOne('SELECT COUNT(*) as total FROM users') || { total: 0 };
      
      // Statistiques des recherches
      const searchStats = database.queryOne('SELECT COUNT(*) as total FROM search_logs') || { total: 0 };
      
      // Statistiques des données
      const esoldeStats = database.queryOne('SELECT COUNT(*) as total FROM esolde_mytable') || { total: 0 };
      const rhpoliceStats = database.queryOne('SELECT COUNT(*) as total FROM rhpolice_personne_concours') || { total: 0 };
      
      // Recherches récentes
      const recentSearches = database.query(`
        SELECT search_term, results_count, execution_time_ms, search_date 
        FROM search_logs 
        ORDER BY search_date DESC 
        LIMIT 10
      `) || [];

      return {
        users: {
          total: userStats.total,
          active: userStats.total // Simplification pour la démo
        },
        searches: {
          total: searchStats.total,
          today: 0 // À implémenter si nécessaire
        },
        data: {
          esolde: esoldeStats.total,
          rhpolice: rhpoliceStats.total,
          total: esoldeStats.total + rhpoliceStats.total
        },
        recentSearches
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  async getTablesDistribution() {
    try {
      const tables = [
        { name: 'Esolde - Personnel', table: 'esolde_mytable' },
        { name: 'RH Police - Concours', table: 'rhpolice_personne_concours' }
      ];

      const distribution = [];
      
      for (const tableInfo of tables) {
        const count = database.queryOne(`SELECT COUNT(*) as total FROM ${tableInfo.table}`) || { total: 0 };
        distribution.push({
          name: tableInfo.name,
          count: count.total
        });
      }

      return distribution;
    } catch (error) {
      console.error('Erreur lors de la récupération de la distribution:', error);
      throw error;
    }
  }

  async getTimeSeriesData(period = '7d') {
    try {
      // Simplification pour la démo - retourner des données statiques
      const data = [];
      const now = new Date();
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        
        data.push({
          date: date.toISOString().split('T')[0],
          searches: Math.floor(Math.random() * 50) + 10,
          results: Math.floor(Math.random() * 500) + 100
        });
      }

      return data;
    } catch (error) {
      console.error('Erreur lors de la récupération des séries temporelles:', error);
      throw error;
    }
  }
}

export default new StatsService();