import express from 'express';
import rateLimit from 'express-rate-limit';
import SearchService from '../services/SearchService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const searchService = new SearchService();

// Rate limiting pour les recherches
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 recherches par IP
  message: { error: 'Limite de recherches atteinte. Veuillez patienter.' }
});

// Route de recherche principale
router.post('/', authenticate, searchLimiter, async (req, res) => {
  try {
    const { query, filters = {}, page = 1, limit = 20 } = req.body;

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

    // Ajouter les infos utilisateur pour les logs
    req.user.ip_address = req.ip;
    req.user.user_agent = req.headers['user-agent'];

    const results = await searchService.search(
      query.trim(),
      filters,
      parseInt(page),
      parseInt(limit),
      req.user
    );

    res.json(results);
  } catch (error) {
    console.error('Erreur recherche:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la recherche. Veuillez réessayer.'
    });
  }
});

// Route pour obtenir les détails d'un enregistrement
router.get('/details/:table/:id', authenticate, async (req, res) => {
  try {
    const { table, id } = req.params;
    
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

export default router;