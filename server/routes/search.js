import express from 'express';
import rateLimit from 'express-rate-limit';
import SearchService from '../services/SearchService.js';
import ElasticSearchService from '../services/ElasticSearchService.js';
import { authenticate } from '../middleware/auth.js';
import { validateSearch } from '../middleware/validators.js';
import logger from '../utils/logger.js';

const router = express.Router();
const searchService = new SearchService();
const useElastic = process.env.USE_ELASTICSEARCH === 'true';
const elasticService = useElastic ? new ElasticSearchService() : null;

// Rate limiting pour les recherches
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 recherches par IP
  message: { error: 'Limite de recherches atteinte. Veuillez patienter.' }
});

// Route de recherche principale
router.post('/', authenticate, searchLimiter, validateSearch, async (req, res) => {
  try {
    const {
      query,
      filters = {},
      page = 1,
      limit = 20,
      search_type = 'global',
      followLinks = false,
      depth = 1
    } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Le terme de recherche ne peut pas être vide'
      });
    }

    if (page < 1) {
      return res.status(400).json({ error: 'La page doit être >= 1' });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({ error: 'La limite doit être entre 1 et 100' });
    }

    if (typeof followLinks !== 'boolean') {
      return res.status(400).json({ error: 'followLinks doit être un booléen' });
    }

    if (isNaN(parseInt(depth)) || parseInt(depth) < 1) {
      return res.status(400).json({ error: 'depth doit être >= 1' });
    }

    // Ajouter les infos utilisateur pour les logs
    req.user.ip_address = req.ip;
    req.user.user_agent = req.headers['user-agent'];

    let results;
    if (useElastic) {
      const es = await elasticService.search(
        query.trim(),
        parseInt(page),
        parseInt(limit)
      );
      results = {
        total: es.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(es.total / parseInt(limit)),
        elapsed_ms: es.elapsed_ms,
        hits: es.hits,
        tables_searched: ['profiles']
      };
    } else {
      results = await searchService.search(
        query.trim(),
        filters,
        parseInt(page),
        parseInt(limit),
        req.user,
        search_type,
        { followLinks, maxDepth: parseInt(depth) }
      );
    }

    res.json(results);
  } catch (error) {
    logger.error('Erreur recherche', error);
    res.status(500).json({
      error: 'Erreur lors de la recherche. Veuillez réessayer.'
    });
  }
});

// Route pour obtenir les détails d'un enregistrement
router.get('/details/:table/:id', authenticate, async (req, res) => {
  try {
    const { table, id } = req.params;

    const details = await searchService.getRecordDetails(table, id);
    res.json(details);
  } catch (error) {
    logger.error('Erreur détails', error);

    if (error.message.includes('non trouvé')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Erreur lors de la récupération des détails' });
  }
});

export default router;

