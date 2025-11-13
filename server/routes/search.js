import express from 'express';
import SearchService from '../services/SearchService.js';
import ElasticSearchService from '../services/ElasticSearchService.js';
import { isElasticsearchEnabled } from '../config/environment.js';
import { authenticate } from '../middleware/auth.js';
import Blacklist from '../models/Blacklist.js';
import UserLog from '../models/UserLog.js';
import SearchLog from '../models/SearchLog.js';
import searchAccessManager from '../utils/search-access-manager.js';
import { hasActiveFilters } from '../utils/filter-utils.js';

const router = express.Router();
const searchService = new SearchService();
let elasticService = null;

const ELASTICSEARCH_TIMEOUT_SYMBOL = Symbol('ELASTICSEARCH_TIMEOUT');
const DEFAULT_ELASTIC_TIMEOUT_MS = 2000;
const MIN_ELASTIC_TIMEOUT_MS = 250;
const MAX_ELASTIC_TIMEOUT_MS = 10000;

const getElasticTimeoutMs = () => {
  const raw = Number(process.env.ELASTICSEARCH_SEARCH_TIMEOUT_MS);
  if (Number.isFinite(raw)) {
    if (raw <= 0) {
      return 0;
    }
    return Math.min(Math.max(raw, MIN_ELASTIC_TIMEOUT_MS), MAX_ELASTIC_TIMEOUT_MS);
  }
  return DEFAULT_ELASTIC_TIMEOUT_MS;
};

const withTimeout = (promise, timeoutMs) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(ELASTICSEARCH_TIMEOUT_SYMBOL), timeoutMs);
    })
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
};

const getElasticService = () => {
  if (!isElasticsearchEnabled()) {
    elasticService = null;
    return null;
  }

  if (!elasticService) {
    elasticService = new ElasticSearchService();
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

    const activeFilters = hasActiveFilters(filters);
    const requiresSqlOnly = followLinks === true || activeFilters;
    const preferElasticSearch =
      typeof preferElastic === 'boolean'
        ? preferElastic
        : typeof preferElastic === 'string'
        ? preferElastic !== 'false'
        : true;

    let results = null;
    let fallbackReason = null;

    if (!requiresSqlOnly && preferElasticSearch) {
      const elastic = getElasticService();
      if (elastic) {
        let canUseElastic = true;

        if (typeof elastic.ensureOperational === 'function') {
          try {
            canUseElastic = await elastic.ensureOperational('search-route');
          } catch (error) {
            console.error('Erreur vérification Elasticsearch:', error);
            canUseElastic = false;
            fallbackReason = 'unavailable';
          }
        } else if (typeof elastic.isOperational === 'function') {
          canUseElastic = elastic.isOperational();
          if (!canUseElastic) {
            fallbackReason = 'unavailable';
          }
        }

        if (canUseElastic) {
          let esResults = null;
          try {
            const timeoutMs = getElasticTimeoutMs();
            const result = await withTimeout(
              elastic.search(trimmed, pageNumber, limitNumber),
              timeoutMs
            );

            if (result === ELASTICSEARCH_TIMEOUT_SYMBOL) {
              fallbackReason = 'timeout';
              console.warn(
                `⏱️ Recherche Elasticsearch > ${timeoutMs}ms. Bascule sur le moteur SQL.`
              );
            } else {
              esResults = result;
            }
          } catch (error) {
            console.error('Erreur recherche Elasticsearch:', error);
            fallbackReason = 'error';
          }

          if (esResults && Array.isArray(esResults.hits)) {
            const totalEs = esResults.total ?? 0;
            results = {
              total: totalEs,
              page: pageNumber,
              limit: limitNumber,
              pages: limitNumber > 0 ? Math.ceil(totalEs / limitNumber) : 0,
              elapsed_ms: esResults.elapsed_ms ?? 0,
              hits: esResults.hits || [],
              tables_searched: esResults.tables_searched || [],
              engine: 'elasticsearch'
            };
            fallbackReason = null;
          } else if (!fallbackReason) {
            fallbackReason = 'invalid_response';
          }
        }
      } else {
        fallbackReason = 'disabled';
      }
    }

    if (!results) {
      const sqlResults = await searchService
        .search(trimmed, filters, pageNumber, limitNumber, req.user, search_type, {
          followLinks,
          maxDepth: depthNumber
        })
        .catch((error) => {
          console.error('Erreur recherche SQL:', error);
          return null;
        });

      if (sqlResults) {
        results = { ...sqlResults, engine: 'sql' };
      }
    }

    if (!results) {
      results = {
        total: 0,
        page: pageNumber,
        limit: limitNumber,
        pages: 0,
        elapsed_ms: 0,
        hits: [],
        tables_searched: [],
        engine: 'sql'
      };
    }

    if (fallbackReason && results.engine === 'sql') {
      results.fallback_reason = fallbackReason;
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
