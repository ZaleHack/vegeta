const express = require('express');
const StatsService = require('../services/StatsService.cjs');
const { authenticate, authorize } = require('../middleware/auth.cjs');

const router = express.Router();
const statsService = new StatsService();

// Statistiques générales (accessible aux analystes et admins)
router.get('/overview', authenticate, authorize(['ADMIN', 'ANALYSTE']), async (req, res) => {
  try {
    const dateRange = parseInt(req.query.days) || 30;
    const stats = await statsService.getOverviewStats(dateRange);
    res.json(stats);
  } catch (error) {
    console.error('Erreur stats overview:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

// Distribution des données par table
router.get('/tables-distribution', authenticate, authorize(['ADMIN', 'ANALYSTE']), async (req, res) => {
  try {
    const distribution = await statsService.getTableDistribution();
    res.json({ distribution });
  } catch (error) {
    console.error('Erreur distribution tables:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la distribution' });
  }
});

// Distribution géographique
router.get('/regions-distribution', authenticate, authorize(['ADMIN', 'ANALYSTE']), async (req, res) => {
  try {
    const regions = await statsService.getRegionDistribution();
    res.json({ regions });
  } catch (error) {
    console.error('Erreur distribution régions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données régionales' });
  }
});

// Série temporelle des recherches
router.get('/time-series', authenticate, authorize(['ADMIN', 'ANALYSTE']), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const timeSeries = await statsService.getTimeSeriesStats(days);
    res.json({ time_series: timeSeries });
  } catch (error) {
    console.error('Erreur série temporelle:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données temporelles' });
  }
});

// Termes de recherche populaires
router.get('/popular-terms', authenticate, authorize(['ADMIN', 'ANALYSTE']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const popularTerms = await statsService.getPopularSearchTerms(limit);
    res.json({ popular_terms: popularTerms });
  } catch (error) {
    console.error('Erreur termes populaires:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des termes populaires' });
  }
});

// Activité des utilisateurs
router.get('/user-activity', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const userActivity = await statsService.getUserActivity(limit);
    res.json({ user_activity: userActivity });
  } catch (error) {
    console.error('Erreur activité utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'activité' });
  }
});

// Export des statistiques
router.get('/export', authenticate, authorize(['ADMIN', 'ANALYSTE']), async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const exportData = await statsService.exportStats(format);
    
    const filename = `vegeta-stats-${new Date().toISOString().split('T')[0]}.${format}`;
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(JSON.parse(exportData));
    }
  } catch (error) {
    console.error('Erreur export stats:', error);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
});

module.exports = router;