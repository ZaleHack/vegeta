const express = require('express');
const SearchService = require('../services/SearchService.cjs');
const { authenticate, attachUserInfo } = require('../middleware/auth.cjs');
const { searchRateLimit } = require('../middleware/rateLimiter.cjs');

const router = express.Router();
const searchService = new SearchService();

// Route de recherche principale
router.post('/', authenticate, attachUserInfo, searchRateLimit, async (req, res) => {
  try {
    const { query, filters = {}, page = 1, limit = 20 } = req.body;

    // Validation des paramètres
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Le terme de recherche ne peut pas être vide',
        code: 'EMPTY_QUERY'
      });
    }

    if (page < 1) {
      return res.status(400).json({ error: 'La page doit être >= 1' });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({ error: 'La limite doit être entre 1 et 100' });
    }

    // Effectuer la recherche
    const results = await searchService.search(
      query.trim(),
      filters,
      parseInt(page),
      parseInt(limit),
      req.user
    );

    // Ajouter les filtres disponibles basés sur les résultats
    if (results.hits.length > 0) {
      const tablesHit = [...new Set(results.hits.map(hit => `${hit.database}_${hit.table}`))];
      results.available_filters = searchService.getAvailableFilters(tablesHit);
    }

    res.json(results);
  } catch (error) {
    console.error('Erreur recherche:', error);
    
    if (error.message.includes('vide')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: 'Erreur lors de la recherche. Veuillez réessayer.',
      code: 'SEARCH_ERROR'
    });
  }
});

// Route pour obtenir les détails d'un enregistrement
router.get('/details/:table/:id', authenticate, async (req, res) => {
  try {
    const { table, id } = req.params;
    
    // Validation sécurisée du nom de table
    const allowedTables = [
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

    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: 'Table non autorisée' });
    }

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const details = await searchService.getRecordDetails(table, parseInt(id));
    res.json(details);
  } catch (error) {
    console.error('Erreur détails:', error);
    
    if (error.message.includes('non trouvé')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Erreur lors de la récupération des détails' });
  }
});

// Route pour obtenir des suggestions de recherche
router.get('/suggestions', authenticate, (req, res) => {
  try {
    const suggestions = [
      { label: 'Recherche par CNI', example: 'CNI: 123456789', icon: 'id-card' },
      { label: 'Recherche par nom complet', example: 'Jean Dupont', icon: 'user' },
      { label: 'Recherche par téléphone', example: '77 123 45 67', icon: 'phone' },
      { label: 'Recherche par immatriculation', example: 'DK 1234 AB', icon: 'car' },
      { label: 'Recherche par NINEA', example: 'NINEA: 123456', icon: 'building' },
      { label: 'Recherche exacte', example: '"Jean Pierre Dupont"', icon: 'search' },
      { label: 'Exclusion de terme', example: 'Dupont -Marie', icon: 'minus-circle' }
    ];

    res.json({ suggestions });
  } catch (error) {
    console.error('Erreur suggestions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des suggestions' });
  }
});

module.exports = router;