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

const FOLLOWUP_FIELD_NAMES = [
  'cni',
  'nin',
  'telephone',
  'telephone1',
  'telephone2',
  'numero',
  'phone'
];

const FOLLOWUP_FIELDS = new Set(
  FOLLOWUP_FIELD_NAMES.flatMap((name) => [name, name.toUpperCase()]).map((name) => name.toLowerCase())
);

const MAX_FOLLOWUP_QUERIES = 5;
const MIN_FOLLOWUP_LENGTH = 3;

const normalizeFollowupValues = (value) => {
  const normalized = new Set();
  const visit = (candidate) => {
    if (candidate === null || candidate === undefined) {
      return;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }

    if (typeof candidate === 'object') {
      return;
    }

    const text = String(candidate).trim();
    if (text.length < MIN_FOLLOWUP_LENGTH) {
      return;
    }

    normalized.add(text);

    const digits = text.replace(/\D+/g, '');
    if (digits.length >= 6) {
      normalized.add(digits);
    }
  };

  visit(value);
  return Array.from(normalized);
};

const extractFollowupValuesFromHit = (hit) => {
  const values = new Set();
  const collect = (record) => {
    if (!record || typeof record !== 'object') {
      return;
    }

    Object.entries(record).forEach(([key, rawValue]) => {
      if (!key) {
        return;
      }

      if (!FOLLOWUP_FIELDS.has(key.toLowerCase())) {
        return;
      }

      normalizeFollowupValues(rawValue).forEach((normalized) => {
        values.add(normalized);
      });
    });
  };

  collect(hit?.record);
  collect(hit?.preview);

  return Array.from(values);
};

const buildHitIdentity = (hit) => {
  if (!hit) {
    return null;
  }

  const table = String(hit.table_name || hit.table || '').toLowerCase();
  const keys = hit.primary_keys && typeof hit.primary_keys === 'object' ? hit.primary_keys : null;

  if (keys) {
    const sorted = Object.entries(keys)
      .filter(([_, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');

    if (sorted) {
      return `${table}::${sorted}`;
    }
  }

  if (hit.primary_key && hit.primary_value !== undefined && hit.primary_value !== null) {
    return `${table}::${String(hit.primary_key).toLowerCase()}:${hit.primary_value}`;
  }

  if (hit.id !== undefined && hit.id !== null) {
    return `${table}::id:${hit.id}`;
  }

  return `${table}::${JSON.stringify(hit.preview || hit.record || {})}`;
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
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const depthValue = parseInt(depth, 10);
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

    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      return res.status(400).json({ error: 'La page doit être >= 1' });
    }

    if (!Number.isFinite(limitNumber) || limitNumber < 1 || limitNumber > 100) {
      return res.status(400).json({ error: 'La limite doit être entre 1 et 100' });
    }

    if (typeof followLinks !== 'boolean') {
      return res.status(400).json({ error: 'followLinks doit être un booléen' });
    }

    if (!Number.isFinite(depthValue) || depthValue < 1) {
      return res.status(400).json({ error: 'depth doit être >= 1' });
    }

    const elastic = getElasticService();
    const elasticOperational = elastic && elastic.isOperational?.() === true;
    let results;
    let hitsForAccess = [];

    if (elasticOperational) {
      const es = await elastic.search(trimmed, pageNumber, limitNumber);
      const tablesSearched = new Set(
        Array.isArray(es.tables_searched) && es.tables_searched.length > 0
          ? es.tables_searched
          : ['profiles']
      );

      results = {
        total: es.total,
        page: pageNumber,
        limit: limitNumber,
        pages: Math.ceil(es.total / limitNumber),
        elapsed_ms: es.elapsed_ms,
        hits: es.hits,
        tables_searched: Array.from(tablesSearched)
      };

      const originalHits = Array.isArray(results.hits) ? results.hits : [];
      const followupCandidates = new Set();

      const normalizedQueryValues = new Set(
        normalizeFollowupValues(trimmed).map((value) => value.toLowerCase())
      );

      originalHits.forEach((hit) => {
        extractFollowupValuesFromHit(hit).forEach((value) => {
          if (!value || value.length < MIN_FOLLOWUP_LENGTH) {
            return;
          }
          if (normalizedQueryValues.has(value.toLowerCase())) {
            return;
          }
          followupCandidates.add(value);
        });
      });

      const followupValues = Array.from(followupCandidates).slice(0, MAX_FOLLOWUP_QUERIES);
      const existingIdentities = new Set(
        originalHits.map((hit) => buildHitIdentity(hit)).filter(Boolean)
      );
      const relatedQueries = [];
      const relatedHitsForAccess = [];

      if (followupValues.length > 0) {
        const followupResults = await Promise.all(
          followupValues.map(async (value) => {
            try {
              const response = await elastic.search(value, 1, Math.max(limitNumber, 20));
              return { value, response };
            } catch (error) {
              console.error('Erreur recherche associée:', error.message || error);
              return { value, response: null };
            }
          })
        );

        followupResults.forEach(({ value, response }) => {
          if (!response || !Array.isArray(response.hits) || response.hits.length === 0) {
            return;
          }

          if (Array.isArray(response.tables_searched)) {
            response.tables_searched.forEach((table) => tablesSearched.add(table));
          }

          const filteredHits = response.hits.filter((hit) => {
            const identity = buildHitIdentity(hit);
            if (!identity) {
              return true;
            }
            if (existingIdentities.has(identity)) {
              return false;
            }
            existingIdentities.add(identity);
            return true;
          });

          if (filteredHits.length === 0) {
            return;
          }

          const annotatedHits = filteredHits.map((hit) => ({ ...hit, related_to: value }));
          relatedHitsForAccess.push(...annotatedHits);
          relatedQueries.push({ value, hits: annotatedHits });
        });
      }

      if (relatedQueries.length > 0) {
        results.related_queries = relatedQueries;
      }

      results.tables_searched = Array.from(tablesSearched);
      hitsForAccess = [...originalHits, ...relatedHitsForAccess];
    } else {
      results = await searchService.search(
        trimmed,
        filters,
        pageNumber,
        limitNumber,
        req.user,
        search_type,
        {
          followLinks,
          maxDepth: depthValue
        }
      );

      if (!results || typeof results !== 'object') {
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

      results.page = Number.isFinite(results.page) ? results.page : pageNumber;
      results.limit = Number.isFinite(results.limit) ? results.limit : limitNumber;
      results.pages = Number.isFinite(results.pages)
        ? results.pages
        : Math.ceil((results.total || 0) / (results.limit || limitNumber || 1));
      results.tables_searched = Array.isArray(results.tables_searched)
        ? results.tables_searched.filter(Boolean)
        : [];
      results.hits = Array.isArray(results.hits) ? results.hits : [];
      hitsForAccess = results.hits;
    }

    searchAccessManager.remember(req.user.id, hitsForAccess);

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
