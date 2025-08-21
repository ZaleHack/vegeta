import express from 'express';
import StatsService from '../services/StatsService.js';
import { authenticate } from '../middleware/auth.js';
import database from '../config/database.js';

const router = express.Router();
const statsService = new StatsService();

// Statistiques générales
router.get('/overview', async (req, res) => {
  try {
    if (!database.isConnected()) {
      return res.status(503).json({ 
        error: 'Service temporairement indisponible - Base de données non connectée',
        code: 'DATABASE_UNAVAILABLE'
      });
    }
    
    const stats = await statsService.getOverviewStats();
    res.json(stats);
  } catch (error) {
    console.error('Erreur stats overview:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

// Distribution des données par table
router.get('/data-distribution', async (req, res) => {
  try {
    if (!database.isConnected()) {
      return res.status(503).json({ 
        error: 'Service temporairement indisponible - Base de données non connectée',
        code: 'DATABASE_UNAVAILABLE'
      });
    }
    
    const distribution = await statsService.getDataStatistics();
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
    const timeSeries = await statsService.getTimeSeriesData(days);
    res.json({ time_series: timeSeries });
  } catch (error) {
    console.error('Erreur série temporelle:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données temporelles' });
  }
});

// Activité des utilisateurs
router.get('/user-activity', authenticate, async (req, res) => {
  try {
    const userActivity = await statsService.getUserActivity();
    res.json({ user_activity: userActivity });
  } catch (error) {
    console.error('Erreur activité utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'activité' });
  }
});

// Distribution géographique
router.get('/regions', authenticate, async (req, res) => {
  try {
    const regions = await statsService.getRegionDistribution();
    res.json({ regions });
  } catch (error) {
    console.error('Erreur distribution régions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données régionales' });
  }
});

export default router;