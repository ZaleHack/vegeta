import express from 'express';
import { authenticate } from '../middleware/auth.js';
import database from '../config/database.js';

const router = express.Router();

// Statistiques générales
router.get('/overview', authenticate, async (req, res) => {
  try {
    // Statistiques générales
    const totalSearches = await database.queryOne(
      'SELECT COUNT(*) as count FROM autres.search_logs'
    );
    
    const avgExecutionTime = await database.queryOne(
      'SELECT AVG(execution_time_ms) as avg_time FROM autres.search_logs WHERE execution_time_ms > 0'
    );
    
    // Recherches aujourd'hui
    const todaySearches = await database.queryOne(`
      SELECT COUNT(*) as count FROM autres.search_logs 
      WHERE DATE(search_date) = CURDATE()
    `);

    // Utilisateurs actifs
    const activeUsers = await database.queryOne(
      'SELECT COUNT(*) as count FROM autres.users'
    );
    
    const stats = {
      total_searches: totalSearches?.count || 0,
      avg_execution_time: Math.round(avgExecutionTime?.avg_time || 0),
      today_searches: todaySearches?.count || 0,
      active_users: activeUsers?.count || 0
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Erreur statistiques overview:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

// Distribution des données par table
router.get('/data-distribution', authenticate, async (req, res) => {
  try {
    const distribution = [];
    
    // Liste des tables à analyser
    const tables = [
      { name: 'esolde.mytable', display: 'esolde - mytable' },
      { name: 'rhpolice.personne_concours', display: 'rhpolice - personne_concours' },
      { name: 'renseignement.agentfinance', display: 'renseignement - agentfinance' },
      { name: 'rhgendarmerie.personne', display: 'rhgendarmerie - personne' },
      { name: 'permis.tables', display: 'permis - tables' },
      { name: 'expresso.expresso', display: 'expresso - expresso' },
      { name: 'elections.dakar', display: 'elections - dakar' },
      { name: 'autres.Vehicules', display: 'autres - Vehicules' },
      { name: 'autres.entreprises', display: 'autres - entreprises' }
    ];

    for (const table of tables) {
      try {
        const result = await database.queryOne(`SELECT COUNT(*) as count FROM ${table.name}`);
        distribution.push({
          table: table.display,
          count: result?.count || 0
        });
      } catch (error) {
        console.warn(`Table ${table.name} non accessible:`, error.message);
        distribution.push({
          table: table.display,
          count: 0,
          error: error.message
        });
      }
    }

    res.json({ distribution });
  } catch (error) {
    console.error('Erreur distribution données:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la distribution' });
  }
});

// Série temporelle des recherches
router.get('/time-series', authenticate, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
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
    
    const timeSeries = rows.map(row => ({
      date: row.date,
      searches: row.searches,
      unique_users: row.unique_users,
      avg_time: Math.round(row.avg_time || 0)
    }));

    res.json({ time_series: timeSeries });
  } catch (error) {
    console.error('Erreur série temporelle:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données temporelles' });
  }
});

// Activité des utilisateurs
router.get('/user-activity', authenticate, async (req, res) => {
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
    
    res.json({ user_activity: userActivity || [] });
  } catch (error) {
    console.error('Erreur statistiques utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'activité utilisateur' });
  }
});

export default router;