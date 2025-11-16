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

const normalizeBooleanPreference = (value, defaultValue = true) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return defaultValue;
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
    preferElastic = true,
    diagnostic = false
  }) {
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    const pageNumber = Number.isFinite(Number(page)) ? parseInt(page, 10) : 1;
    const limitNumber = Number.isFinite(Number(limit)) ? parseInt(limit, 10) : 20;
    const depthNumber = Number.isFinite(Number(depth)) ? parseInt(depth, 10) : 1;

    const requiresSqlOnly = followLinks === true || hasActiveFilters(filters);
    const preferElasticSearch = normalizeBooleanPreference(preferElastic);
    const includeDiagnostics = normalizeBooleanPreference(diagnostic, false);

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

    const searchStartedAt = Date.now();

    const finalizeDiagnostics = (resolvedEngine) => {
      if (!includeDiagnostics || !diagnostics) {
        return;
      }
      diagnostics.resolved_by = resolvedEngine;
      diagnostics.total_elapsed_ms = Date.now() - searchStartedAt;
    };

    const finalizeResults = (result, fallbackEngine) => {
      if (!result) {
        const defaultResponse = buildDefaultResponse(pageNumber, limitNumber);
        if (includeDiagnostics && diagnostics) {
          finalizeDiagnostics(defaultResponse.engine);
          defaultResponse.diagnostics = diagnostics;
        }
        return defaultResponse;
      }

      const normalized = {
        ...result,
        engine: result.engine || fallbackEngine
      };

      if (includeDiagnostics && diagnostics) {
        finalizeDiagnostics(normalized.engine);
        normalized.diagnostics = diagnostics;
      }

      if (!Array.isArray(normalized.hits)) {
        normalized.hits = [];
      }

      if (!Array.isArray(normalized.tables_searched)) {
        normalized.tables_searched = [];
      }

      return normalized;
    };

    const primaryEngine = preferElasticSearch ? 'elasticsearch' : 'sql';
    const secondaryEngine = preferElasticSearch ? 'sql' : 'elasticsearch';

    const diagnostics = includeDiagnostics
      ? {
          started_at: new Date(searchStartedAt).toISOString(),
          preferElastic: preferElasticSearch,
          requiresSqlOnly,
          primary_engine: primaryEngine,
          secondary_engine: primaryEngine === secondaryEngine ? null : secondaryEngine,
          attempts: [],
          fallback:
            primaryEngine === secondaryEngine
              ? null
              : {
                  delay_ms: SECONDARY_TRIGGER_DELAY_MS,
                  started_at_ms: null,
                  reason: null
                },
          resolved_by: null,
          total_elapsed_ms: null
        }
      : null;

    const trackAttempt = (engine, role) => {
      if (!includeDiagnostics || !diagnostics) {
        return null;
      }
      const startedAt = Date.now();
      const attempt = {
        engine,
        role,
        started_at: new Date(startedAt).toISOString(),
        start_offset_ms: startedAt - searchStartedAt,
        status: 'pending'
      };
      diagnostics.attempts.push(attempt);
      return {
        attempt,
        startedAt
      };
    };

    const finalizeAttempt = (tracker, result, error) => {
      if (!tracker?.attempt) {
        return;
      }
      const { attempt, startedAt } = tracker;
      attempt.duration_ms = Date.now() - startedAt;
      if (error) {
        attempt.status = 'error';
        attempt.error = error.message || String(error);
        attempt.hits = 0;
        attempt.total = null;
        attempt.has_hits = false;
        return;
      }

      attempt.status = 'success';
      attempt.total = typeof result?.total === 'number' ? result.total : null;
      attempt.hits = Array.isArray(result?.hits) ? result.hits.length : 0;
      attempt.has_hits = hasHits(result);
      attempt.engine_elapsed_ms =
        typeof result?.elapsed_ms === 'number' ? result.elapsed_ms : null;
    };

    const runEngineAttempt = (engine, role, runner) => {
      if (!includeDiagnostics) {
        return runner();
      }
      const tracker = trackAttempt(engine, role);
      return runner()
        .then((result) => {
          finalizeAttempt(tracker, result, null);
          return result;
        })
        .catch((error) => {
          finalizeAttempt(tracker, null, error);
          throw error;
        });
    };

    const markFallbackStart = (reason) => {
      if (!diagnostics?.fallback) {
        return;
      }
      if (typeof diagnostics.fallback.started_at_ms === 'number') {
        return;
      }
      diagnostics.fallback.started_at_ms = Date.now() - searchStartedAt;
      diagnostics.fallback.reason = reason;
    };

    if (requiresSqlOnly) {
      const sqlResults = await runEngineAttempt('sql', 'solo', runSqlSearch);
      return finalizeResults(sqlResults, 'sql');
    }

    const runPrimary = () =>
      runEngineAttempt(primaryEngine, 'primary', () =>
        primaryEngine === 'elasticsearch' ? runElasticSearch() : runSqlSearch()
      );
    const runSecondary = () =>
      runEngineAttempt(secondaryEngine, 'secondary', () =>
        secondaryEngine === 'elasticsearch' ? runElasticSearch() : runSqlSearch()
      );

    let secondaryPromise = null;
    const startSecondaryExecution = (reason) => {
      if (!secondaryPromise) {
        markFallbackStart(reason);
        secondaryPromise = runSecondary().catch(() => null);
      }
      return secondaryPromise;
    };

    let fallbackTimer = null;
    if (primaryEngine !== secondaryEngine) {
      fallbackTimer = setTimeout(() => {
        startSecondaryExecution('timer');
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

    const secondaryResults = await startSecondaryExecution(
      primaryResults && !hasHits(primaryResults) ? 'primary_empty' : 'primary_failed'
    );

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
