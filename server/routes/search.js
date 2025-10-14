import express from 'express';
import SearchService from '../services/SearchService.js';
import ElasticSearchService from '../services/ElasticSearchService.js';
import { isElasticsearchEnabled } from '../config/environment.js';
import { authenticate } from '../middleware/auth.js';
import Blacklist from '../models/Blacklist.js';
import UserLog from '../models/UserLog.js';
import SearchLog from '../models/SearchLog.js';
import searchAccessManager from '../utils/search-access-manager.js';

const router = express.Router();
const searchService = new SearchService();
let elasticService = null;

const getElasticService = () => {
  if (!isElasticsearchEnabled()) {
    elasticService = null;
    return null;
  }

  if (!elasticService) {
    elasticService = new ElasticSearchService();
  }

  if (typeof elasticService.isOperational === 'function' && !elasticService.isOperational()) {
    return null;
  }

  return elasticService;
};

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
      depth = 1
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

    const sqlPromise = searchService
      .search(trimmed, filters, pageNumber, limitNumber, req.user, search_type, {
        followLinks,
        maxDepth: depthNumber
      })
      .catch((error) => {
        console.error('Erreur recherche SQL:', error);
        return null;
      });

    const elastic = getElasticService();
    const canUseElastic = elastic?.isOperational?.() === true;

    const elasticPromise = canUseElastic
      ? elastic
          .search(trimmed, pageNumber, limitNumber)
          .catch((error) => {
            console.error('Erreur recherche Elasticsearch:', error);
            return null;
          })
      : Promise.resolve(null);

    const [sqlResults, esResults] = await Promise.all([sqlPromise, elasticPromise]);

    let results = sqlResults;

    if (esResults && Array.isArray(esResults.hits)) {
      const combined = new Map();
      const addHits = (hits = []) => {
        for (const hit of hits) {
          if (!hit) continue;
          const tableIdentifier = hit.table_name || `${hit.database}:${hit.table}`;
          const primaryValues =
            hit.primary_keys && typeof hit.primary_keys === 'object'
              ? Object.values(hit.primary_keys).join(':')
              : '';
          const key = `${tableIdentifier}:${primaryValues}`;
          if (!combined.has(key)) {
            combined.set(key, hit);
          }
        }
      };

      if (sqlResults?.hits) {
        addHits(sqlResults.hits);
      }
      addHits(esResults.hits);

      const combinedHits = Array.from(combined.values());
      const sortedCombinedHits = searchService.sortResults(combinedHits);
      const offset = (pageNumber - 1) * limitNumber;
      const paginatedCombinedHits = sortedCombinedHits.slice(offset, offset + limitNumber);
      const totalCombined = sortedCombinedHits.length;
      const tablesSearched = new Set([
        ...(sqlResults?.tables_searched || []),
        ...(esResults.tables_searched || [])
      ]);

      results = {
        total: totalCombined,
        page: pageNumber,
        limit: limitNumber,
        pages: limitNumber > 0 ? Math.ceil(totalCombined / limitNumber) : 0,
        elapsed_ms: Math.max(sqlResults?.elapsed_ms ?? 0, esResults.elapsed_ms ?? 0),
        hits: paginatedCombinedHits,
        tables_searched: Array.from(tablesSearched)
      };
    }

    if (!results && esResults) {
      const totalEs = esResults.total ?? 0;
      results = {
        total: totalEs,
        page: pageNumber,
        limit: limitNumber,
        pages: limitNumber > 0 ? Math.ceil(totalEs / limitNumber) : 0,
        elapsed_ms: esResults.elapsed_ms ?? 0,
        hits: esResults.hits || [],
        tables_searched: esResults.tables_searched || []
      };
    }

    if (!results) {
      results = {
        total: 0,
        page: pageNumber,
        limit: limitNumber,
        pages: 0,
        elapsed_ms: 0,
        hits: [],
        tables_searched: []
      };
    }

    searchAccessManager.remember(req.user.id, results.hits || []);

    const searchTypeValue = typeof search_type === 'string' && search_type ? search_type : 'global';
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
    })
      .then(() => {
        searchService.clearRecentSearchCache(req.user.id);
      })
      .catch((err) => {
        console.error('Erreur journalisation recherche:', err);
        searchService.clearRecentSearchCache(req.user.id);
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

router.get('/recent', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const requestedScope = typeof req.query.scope === 'string' ? req.query.scope.toLowerCase() : 'user';
    const isAdmin = req.user?.admin === 1 || req.user?.admin === '1';
    const scope = requestedScope === 'global' && isAdmin ? 'global' : 'user';

    const searches = await searchService.getRecentSearches({
      userId: scope === 'user' ? req.user.id : null,
      username: req.user?.login || '',
      limit,
      scope
    });

    res.json({ searches });
  } catch (error) {
    console.error('Erreur recherches récentes:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des recherches récentes' });
  }
});

export default router;
