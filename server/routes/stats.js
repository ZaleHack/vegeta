import express from 'express';
import StatsService from '../services/StatsService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const statsService = new StatsService();

// Statistiques générales
router.get('/overview', authenticate, async (req, res) => {
  try {
    const stats = await statsService.getOverviewStats();
    res.json(stats);
  } catch (error) {
    console.error('Erreur stats overview:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

// Distribution des données par table
router.get('/data-distribution', authenticate, async (req, res) => {
  try {
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

// Logs de recherche récents
router.get('/search-logs', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const logs = await statsService.getSearchLogs(limit);
    res.json({ logs });
  } catch (error) {
    console.error('Erreur logs de recherche:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des logs' });
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