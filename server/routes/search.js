import express from 'express';
import UnifiedSearchService from '../services/UnifiedSearchService.js';
import SearchService from '../services/SearchService.js';
import { authenticate } from '../middleware/auth.js';
import Blacklist from '../models/Blacklist.js';
import UserLog from '../models/UserLog.js';
import SearchLog from '../models/SearchLog.js';
import searchAccessManager from '../utils/search-access-manager.js';

const router = express.Router();
const unifiedSearchService = new UnifiedSearchService();
const searchService = new SearchService();

// Route de recherche principale
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      query,
      filters = {},
      page = 1,
      limit = 20,
      search_type = 'global',
      followLinks = false,
      depth = 1,
      preferElastic = true
    } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Le terme de recherche ne peut pas être vide'
      });
    }

    const trimmed = query.trim();
    if (await Blacklist.exists(trimmed)) {
      try {
        await UserLog.create({
          user_id: req.user.id,
          action: 'blacklist_search_attempt',
          details: JSON.stringify({
            alert: true,
            number: trimmed,
            page: 'search',
            message: 'Tentative de recherche sur un numéro blacklisté'
          })
        });
      } catch (logError) {
        console.error('Erreur log blacklist:', logError);
      }
      return res.status(403).json({ error: 'Aucun résultat trouvé' });
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

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const depthNumber = parseInt(depth);
    const searchTypeValue =
      typeof search_type === 'string' && search_type ? search_type : 'global';

    const results = await unifiedSearchService.search({
      query: trimmed,
      filters,
      page: pageNumber,
      limit: limitNumber,
      user: req.user,
      searchType: searchTypeValue,
      followLinks,
      depth: depthNumber,
      preferElastic
    });

    searchAccessManager.remember(req.user.id, results.hits || []);

    const userAgent = req.get('user-agent') || null;
    const ipAddress = req.ip || null;
    SearchLog.create({
      user_id: req.user.id,
      username: req.user.login,
      search_term: trimmed,
      search_type: searchTypeValue,
      tables_searched: results.tables_searched,
      results_count: results.total,
      execution_time_ms: results.elapsed_ms,
      ip_address: ipAddress,
      user_agent: userAgent
    }).catch((err) => {
      console.error('Erreur journalisation recherche:', err);
    });

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

    if (!id) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const isAdmin = req.user?.admin === 1 || req.user?.admin === '1';
    if (!isAdmin) {
      const authorized = searchAccessManager.isAllowed(req.user.id, table, id);
      if (!authorized) {
        return res.status(403).json({ error: 'Accès aux détails non autorisé ou expiré. Relancez la recherche.' });
      }
    }

    const details = await searchService.getRecordDetails(table, id);
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
