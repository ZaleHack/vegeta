import SearchService from './SearchService.js';
import ElasticSearchService from './ElasticSearchService.js';
import { isElasticsearchEnabled } from '../config/environment.js';
import { hasActiveFilters } from '../utils/filter-utils.js';

const buildDefaultResponse = (page, limit) => ({
  total: 0,
  page,
  limit,
  pages: 0,
  elapsed_ms: 0,
  hits: [],
  tables_searched: [],
  engine: 'sql'
});

const normalizeBooleanPreference = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value !== 'false';
  }
  return true;
};

// Laisser le moteur principal démarrer avant d'amorcer la requête de secours
// afin de ne pas solliciter inutilement les deux moteurs à chaque recherche.
const SECONDARY_TRIGGER_DELAY_MS = 75;

class UnifiedSearchService {
  constructor({ searchService = new SearchService(), elasticFactory = null } = {}) {
    this.searchService = searchService;
    this.elasticFactory =
      typeof elasticFactory === 'function' ? elasticFactory : () => new ElasticSearchService();
    this.elasticService = null;
  }

  #getElasticService() {
    if (!isElasticsearchEnabled()) {
      this.elasticService = null;
      return null;
    }

    if (!this.elasticService) {
      this.elasticService = this.elasticFactory();
    }

    return this.elasticService;
  }

  async #runElasticSearch(query, page, limit) {
    const elastic = this.#getElasticService();
    if (!elastic) {
      return null;
    }

    let canUseElastic = true;

    if (typeof elastic.ensureOperational === 'function') {
      try {
        canUseElastic = await elastic.ensureOperational('unified-search');
      } catch (error) {
        console.error('Erreur vérification Elasticsearch:', error);
        canUseElastic = false;
      }
    } else if (typeof elastic.isOperational === 'function') {
      canUseElastic = elastic.isOperational();
    }

    if (!canUseElastic) {
      return null;
    }

    try {
      const esResults = await elastic.search(query, page, limit);
      if (!esResults || !Array.isArray(esResults.hits)) {
        return null;
      }

      const totalEs = esResults.total ?? 0;
      return {
        total: totalEs,
        page,
        limit,
        pages: limit > 0 ? Math.ceil(totalEs / limit) : 0,
        elapsed_ms: esResults.elapsed_ms ?? 0,
        hits: esResults.hits || [],
        tables_searched: esResults.tables_searched || [],
        engine: 'elasticsearch'
      };
    } catch (error) {
      console.error('Erreur recherche Elasticsearch:', error);
      return null;
    }
  }

  async #runSqlSearch(query, filters, page, limit, user, searchType, options) {
    try {
      const sqlResults = await this.searchService.search(
        query,
        filters,
        page,
        limit,
        user,
        searchType,
        options
      );

      if (!sqlResults) {
        return null;
      }

      return { ...sqlResults, engine: 'sql' };
    } catch (error) {
      console.error('Erreur recherche SQL:', error);
      return null;
    }
  }

  async search({
    query,
    filters = {},
    page = 1,
    limit = 20,
    user,
    searchType = 'global',
    followLinks = false,
    depth = 1,
    preferElastic = true
  }) {
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    const pageNumber = Number.isFinite(Number(page)) ? parseInt(page, 10) : 1;
    const limitNumber = Number.isFinite(Number(limit)) ? parseInt(limit, 10) : 20;
    const depthNumber = Number.isFinite(Number(depth)) ? parseInt(depth, 10) : 1;

    const requiresSqlOnly = followLinks === true || hasActiveFilters(filters);
    const preferElasticSearch = normalizeBooleanPreference(preferElastic);

    const runSqlSearch = () =>
      this.#runSqlSearch(
        trimmedQuery,
        filters,
        pageNumber,
        limitNumber,
        user,
        searchType,
        {
          followLinks,
          maxDepth: depthNumber
        }
      );

    const runElasticSearch = () => this.#runElasticSearch(trimmedQuery, pageNumber, limitNumber);

    const hasHits = (result) => Array.isArray(result?.hits) && result.hits.length > 0;

    const finalizeResults = (result, fallbackEngine) => {
      if (!result) {
        return buildDefaultResponse(pageNumber, limitNumber);
      }

      const normalized = {
        ...result,
        engine: result.engine || fallbackEngine
      };

      if (!Array.isArray(normalized.hits)) {
        normalized.hits = [];
      }

      if (!Array.isArray(normalized.tables_searched)) {
        normalized.tables_searched = [];
      }

      return normalized;
    };

    if (requiresSqlOnly) {
      const sqlResults = await runSqlSearch();
      return finalizeResults(sqlResults, 'sql');
    }

    const primaryEngine = preferElasticSearch ? 'elasticsearch' : 'sql';
    const secondaryEngine = preferElasticSearch ? 'sql' : 'elasticsearch';

    const runPrimary = primaryEngine === 'elasticsearch' ? runElasticSearch : runSqlSearch;
    const runSecondary = secondaryEngine === 'elasticsearch' ? runElasticSearch : runSqlSearch;

    let secondaryPromise = null;
    const startSecondaryExecution = () => {
      if (!secondaryPromise) {
        secondaryPromise = runSecondary().catch(() => null);
      }
      return secondaryPromise;
    };

    let fallbackTimer = null;
    if (primaryEngine !== secondaryEngine) {
      fallbackTimer = setTimeout(() => {
        startSecondaryExecution();
      }, SECONDARY_TRIGGER_DELAY_MS);
      if (typeof fallbackTimer.unref === 'function') {
        fallbackTimer.unref();
      }
    }

    let primaryResults;
    try {
      primaryResults = await runPrimary();
    } finally {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
    }

    if (hasHits(primaryResults)) {
      return finalizeResults(primaryResults, primaryEngine);
    }

    const secondaryResults = await startSecondaryExecution();

    if (hasHits(secondaryResults)) {
      const tables = new Set([
        ...(Array.isArray(primaryResults?.tables_searched) ? primaryResults.tables_searched : []),
        ...(Array.isArray(secondaryResults.tables_searched) ? secondaryResults.tables_searched : [])
      ]);

      return finalizeResults(
        {
          ...secondaryResults,
          tables_searched: Array.from(tables)
        },
        secondaryEngine
      );
    }

    if (primaryResults && secondaryResults) {
      const tables = new Set([
        ...(Array.isArray(primaryResults.tables_searched) ? primaryResults.tables_searched : []),
        ...(Array.isArray(secondaryResults.tables_searched) ? secondaryResults.tables_searched : [])
      ]);

      return finalizeResults(
        {
          ...primaryResults,
          tables_searched: Array.from(tables)
        },
        primaryEngine
      );
    }

    return finalizeResults(primaryResults ?? secondaryResults, primaryEngine);
  }
}

export default UnifiedSearchService;
