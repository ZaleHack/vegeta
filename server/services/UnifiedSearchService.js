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

    const sqlPromise = this.#runSqlSearch(
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

    const shouldQueryElastic = !requiresSqlOnly && preferElasticSearch;
    const elasticPromise = shouldQueryElastic
      ? this.#runElasticSearch(trimmedQuery, pageNumber, limitNumber)
      : Promise.resolve(null);

    const [sqlResults, esResults] = await Promise.all([sqlPromise, elasticPromise]);

    let results = sqlResults;

    if (esResults && Array.isArray(esResults.hits) && esResults.hits.length > 0) {
      const combined = new Map();
      const addHits = (hits = []) => {
        for (const hit of hits) {
          if (!hit) {
            continue;
          }

          const tableIdentifier =
            hit.table_name ||
            (hit.database && hit.table ? `${hit.database}.${hit.table}` : hit.table || '');
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

      if (Array.isArray(sqlResults?.hits)) {
        addHits(sqlResults.hits);
      }

      addHits(esResults.hits);

      const combinedHits = Array.from(combined.values());
      const sortedCombinedHits =
        typeof this.searchService.sortResults === 'function'
          ? this.searchService.sortResults(combinedHits)
          : combinedHits;
      const offset = (pageNumber - 1) * limitNumber;
      const paginatedCombinedHits = sortedCombinedHits.slice(offset, offset + limitNumber);
      const totalCombined = sortedCombinedHits.length;

      const tablesSearched = new Set([
        ...(Array.isArray(sqlResults?.tables_searched) ? sqlResults.tables_searched : []),
        ...(Array.isArray(esResults.tables_searched) ? esResults.tables_searched : [])
      ]);

      results = {
        total: totalCombined,
        page: pageNumber,
        limit: limitNumber,
        pages: limitNumber > 0 ? Math.ceil(totalCombined / limitNumber) : 0,
        elapsed_ms: Math.max(sqlResults?.elapsed_ms ?? 0, esResults.elapsed_ms ?? 0),
        hits: paginatedCombinedHits,
        tables_searched: Array.from(tablesSearched),
        engine: sqlResults && esResults ? 'mixed' : esResults.engine || 'elasticsearch'
      };
    }

    if (!results && esResults) {
      results = {
        ...esResults,
        engine: esResults.engine || 'elasticsearch'
      };
    }

    if (!results) {
      results = buildDefaultResponse(pageNumber, limitNumber);
    }

    if (!Array.isArray(results.hits)) {
      results.hits = [];
    }

    if (!Array.isArray(results.tables_searched)) {
      results.tables_searched = [];
    }

    return results;
  }
}

export default UnifiedSearchService;
