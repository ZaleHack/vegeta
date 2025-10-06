import client from '../config/elasticsearch.js';
import { normalizeProfileRecord } from '../utils/profile-normalizer.js';
import InMemoryCache from '../utils/cache.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCatalog, catalogOverridesPath } from '../utils/catalog-loader.js';
import { isElasticsearchEnabled } from '../config/environment.js';

class ElasticSearchService {
  constructor() {
    const ttlEnv = process.env.ELASTICSEARCH_CACHE_TTL_MS;
    const parsedTtl = Number(ttlEnv);
    const ttl = Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 60000;
    this.cache = new InMemoryCache(ttl);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.catalogPath = catalogOverridesPath || path.join(__dirname, '../config/tables-catalog.json');
    this.defaultIndex = process.env.ELASTICSEARCH_DEFAULT_INDEX || 'global_search';
    this.enabled = isElasticsearchEnabled();
    this.initiallyEnabled = this.enabled;
    this.catalog = {};
    this.catalogPromise = null;
    this.indexes = this.enabled ? [this.defaultIndex] : [];
    this.loadCatalog();
    const timeoutEnv = Number(process.env.ELASTICSEARCH_HEALTHCHECK_TIMEOUT_MS);
    this.connectionTimeout = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : 5000;
    this.connectionChecked = false;
    this.connectionCheckPromise = null;
    const retryEnv = Number(process.env.ELASTICSEARCH_RETRY_DELAY_MS);
    this.retryDelayMs = Number.isFinite(retryEnv) && retryEnv >= 0 ? retryEnv : 15000;
    this.reconnectTimer = null;

    if (this.enabled) {
      this.scheduleConnectionVerification('initialisation');
    }
  }

  isOperational() {
    return this.enabled === true && this.connectionChecked === true;
  }

  isConnectionError(error) {
    if (!error) {
      return false;
    }
    if (error.name === 'ConnectionError') {
      return true;
    }
    return error?.meta?.statusCode === 0;
  }

  disableForSession(context, error) {
    if (!this.enabled) {
      return;
    }
    const reason = error?.message || error?.name || 'Erreur inconnue';
    console.warn(
      `⚠️ Elasticsearch désactivé pour la session actuelle (${context}): ${reason}`
    );
    this.enabled = false;
    this.indexes = [];
    this.cache.clear();
    this.connectionChecked = false;
    this.scheduleReconnect();
  }

  scheduleReconnect(delay = this.retryDelayMs) {
    if (!this.initiallyEnabled) {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    const effectiveDelay = Number.isFinite(delay) && delay >= 0 ? delay : this.retryDelayMs;

    if (effectiveDelay === Infinity) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (!this.initiallyEnabled || process.env.USE_ELASTICSEARCH === 'false') {
        return;
      }

      this.enabled = true;
      this.indexes = this.resolveIndexesFromCatalog(this.catalog);
      this.scheduleConnectionVerification('reconnexion automatique');
    }, effectiveDelay);

    if (typeof this.reconnectTimer.unref === 'function') {
      this.reconnectTimer.unref();
    }
  }

  scheduleConnectionVerification(context = 'healthcheck') {
    if (!this.enabled || this.connectionChecked || this.connectionCheckPromise) {
      return;
    }

    this.connectionCheckPromise = this.verifyConnection(context)
      .catch((error) => {
        if (!this.isConnectionError(error)) {
          console.error(
            '❌ Erreur inattendue lors de la vérification Elasticsearch:',
            error
          );
        }
        return false;
      })
      .finally(() => {
        this.connectionCheckPromise = null;
      });
  }

  async verifyConnection(context = 'healthcheck') {
    if (!this.enabled) {
      return false;
    }

    try {
      await client.ping({ requestTimeout: this.connectionTimeout });
      this.connectionChecked = true;
      return true;
    } catch (error) {
      if (this.isConnectionError(error)) {
        console.error('❌ Elasticsearch indisponible:', error.message);
        this.disableForSession(context, error);
        return false;
      }

      console.error('❌ Erreur lors de la vérification Elasticsearch:', error);
      throw error;
    }
  }

  async ensureOperational(context = 'operation') {
    if (!this.enabled) {
      return false;
    }

    if (this.connectionChecked) {
      return true;
    }

    if (!this.connectionCheckPromise) {
      this.scheduleConnectionVerification(context);
    }

    if (!this.connectionCheckPromise) {
      return this.enabled;
    }

    try {
      const result = await this.connectionCheckPromise;
      return result === true && this.enabled;
    } catch (error) {
      if (this.isConnectionError(error)) {
        return false;
      }
      throw error;
    }
  }

  loadCatalog() {
    if (this.catalogPromise) {
      return this.catalogPromise;
    }

    this.catalogPromise = buildCatalog()
      .then((catalog) => {
        this.catalog = catalog || {};
        if (this.enabled) {
          this.indexes = this.resolveIndexesFromCatalog(this.catalog);
        }
        return this.catalog;
      })
      .catch((error) => {
        console.error('❌ Erreur chargement catalogue Elasticsearch:', error);
        if (this.enabled && (!this.indexes || this.indexes.length === 0)) {
          this.indexes = [this.defaultIndex];
        }
        return this.catalog;
      })
      .finally(() => {
        this.catalogPromise = null;
      });

    return this.catalogPromise;
  }

  resolveIndexesFromCatalog(catalog = {}) {
    const indexes = new Set();
    Object.entries(catalog).forEach(([tableName, config]) => {
      const syncConfig = config?.sync || {};
      const indexName = syncConfig.elasticsearchIndex || this.defaultIndex;
      if (indexName) {
        indexes.add(indexName);
      }
      if (!syncConfig.elasticsearchIndex && tableName) {
        indexes.add(this.defaultIndex);
      }
    });
    if (indexes.size === 0) {
      indexes.add('profiles');
    }
    return Array.from(indexes);
  }

  normalizeValues(values = []) {
    const output = [];
    const visit = (value) => {
      if (value === null || value === undefined) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === 'object') {
        Object.values(value).forEach(visit);
        return;
      }
      const text = String(value).trim();
      if (text) {
        output.push(text);
      }
    };

    values.forEach(visit);
    return output;
  }

  buildTokensFromValues(values = []) {
    const normalized = this.normalizeValues(values);
    const tokens = new Set();
    normalized.forEach((text) => {
      const lowered = text.toLowerCase();
      tokens.add(lowered);
      tokens.add(lowered.replace(/\s+/g, ''));
    });
    return Array.from(tokens);
  }

  buildFullTextFromValues(values = []) {
    const normalized = this.normalizeValues(values);
    if (!normalized.length) {
      return null;
    }
    return normalized.join(' ');
  }

  buildProfileDocument(profile) {
    const normalized = normalizeProfileRecord(profile);
    if (!normalized) {
      return null;
    }

    const fullName = [normalized.first_name, normalized.last_name]
      .filter((part) => part && String(part).trim().length > 0)
      .join(' ')
      .trim();

    const comment = normalized.comment ? String(normalized.comment) : '';
    const commentPreview = comment ? comment.slice(0, 200) : null;

    const previewEntries = {};
    if (normalized.first_name) {
      previewEntries.first_name = normalized.first_name;
    }
    if (normalized.last_name) {
      previewEntries.last_name = normalized.last_name;
    }
    if (normalized.phone) {
      previewEntries.phone = normalized.phone;
    }
    if (normalized.email) {
      previewEntries.email = normalized.email;
    }
    if (commentPreview) {
      previewEntries.comment = commentPreview;
    }

    const rawValues = this.normalizeValues([
      fullName,
      normalized.first_name,
      normalized.last_name,
      normalized.phone,
      normalized.email,
      commentPreview,
      normalized.extra_fields
    ]);
    const searchTokens = this.buildTokensFromValues(rawValues);

    return {
      id: normalized.id,
      user_id: normalized.user_id ?? null,
      division_id: normalized.division_id ?? null,
      first_name: normalized.first_name || null,
      last_name: normalized.last_name || null,
      full_name: fullName || null,
      phone: normalized.phone || null,
      email: normalized.email || null,
      comment_preview: commentPreview,
      extra_fields: Array.isArray(normalized.extra_fields) ? normalized.extra_fields : [],
      table: 'profiles',
      table_name: 'autres.profiles',
      database_name: 'autres',
      preview: previewEntries,
      search_tokens: searchTokens,
      primary_key: 'id',
      primary_value: normalized.id,
      primary_keys: { id: normalized.id },
      raw_values: rawValues,
      full_text: this.buildFullTextFromValues(rawValues)
    };
  }

  buildPreview(record, config = {}) {
    const preview = {};
    const fields = new Set([...(config.preview || []), ...(config.linkedFields || [])]);

    fields.forEach((field) => {
      if (!field) return;
      const value = record[field];
      if (value !== null && value !== undefined && value !== '') {
        preview[field] = value;
      }
    });

    return preview;
  }

  collectSearchValues(record, config = {}, primaryKey) {
    const fields = new Set([
      ...(config.searchable || []),
      ...(config.preview || []),
      ...(config.linkedFields || [])
    ]);
    if (primaryKey) {
      fields.add(primaryKey);
    }

    const values = [];
    fields.forEach((field) => {
      if (!field) return;
      values.push(record[field]);
    });

    return this.normalizeValues(values);
  }

  buildGenericDocument(record, { tableName, config = {}, primaryKey }) {
    const key = primaryKey && record ? record[primaryKey] : null;
    if (key === null || key === undefined) {
      return null;
    }

    const preview = this.buildPreview(record, config);
    const rawValues = this.collectSearchValues(record, config, primaryKey);
    const searchTokens = this.buildTokensFromValues(rawValues);
    const databaseName = config.database || (tableName ? tableName.split('.')[0] : null);

    return {
      table: config.display || tableName,
      table_name: tableName,
      database_name: databaseName,
      preview,
      search_tokens: searchTokens,
      primary_key: primaryKey || 'id',
      primary_value: key,
      primary_keys: { [primaryKey || 'id']: key },
      raw_values: rawValues,
      full_text: this.buildFullTextFromValues(rawValues)
    };
  }

  async indexProfile(profile) {
    if (!profile?.id) return;
    if (!this.enabled) {
      return;
    }

    if (!(await this.ensureOperational('indexProfile'))) {
      return;
    }
    const document = this.buildProfileDocument(profile);
    if (!document) return;
    try {
      await client.index({
        index: 'profiles',
        id: String(profile.id),
        document
      });
      this.cache.clear();
    } catch (error) {
      if (this.isConnectionError(error)) {
        console.error('❌ Échec indexation profil Elasticsearch:', error.message);
        this.disableForSession('indexProfile', error);
        return;
      }
      throw error;
    }
  }

  async deleteProfile(profileId, options = {}) {
    const { index = 'profiles' } = options;
    if (!profileId) {
      return;
    }

    if (!this.enabled) {
      return;
    }

    if (!(await this.ensureOperational('deleteProfile'))) {
      return;
    }

    try {
      await client.delete({
        index,
        id: String(profileId)
      });
    } catch (error) {
      const status = error?.meta?.statusCode;
      if (status !== 404) {
        if (this.isConnectionError(error)) {
          console.error('❌ Échec suppression profil Elasticsearch:', error.message);
          this.disableForSession('deleteProfile', error);
          return;
        }
        throw error;
      }
    }

    this.cache.clear();
  }

  async indexProfilesBulk(profiles, options = {}) {
    return this.indexRecordsBulk(profiles, { ...options, type: 'profile' });
  }

  async indexRecordsBulk(records, options = {}) {
    const {
      refresh = false,
      index = this.defaultIndex,
      type = 'generic',
      tableName = null,
      config = {},
      primaryKey = 'id'
    } = options;

    if (!Array.isArray(records) || records.length === 0) {
      return { indexed: 0, errors: [] };
    }

    if (!this.enabled) {
      return { indexed: 0, errors: [] };
    }

    if (!(await this.ensureOperational('indexRecordsBulk'))) {
      return { indexed: 0, errors: [] };
    }

    const operations = [];

    for (const record of records) {
      let document = null;
      let id = null;

      if (type === 'profile') {
        document = this.buildProfileDocument(record);
        id = record?.id;
      } else {
        document = this.buildGenericDocument(record, { tableName, config, primaryKey });
        const primaryValue = document?.primary_value;
        id = primaryValue !== undefined && primaryValue !== null ? `${tableName || 'table'}::${primaryValue}` : null;
      }

      if (!document || id === null || id === undefined) {
        continue;
      }

      operations.push({ index: { _index: index, _id: String(id) } });
      operations.push(document);
    }

    if (operations.length === 0) {
      return { indexed: 0, errors: [] };
    }

    let response;
    try {
      response = await client.bulk({
        operations,
        refresh: refresh ? 'wait_for' : false
      });
    } catch (error) {
      if (this.isConnectionError(error)) {
        console.error('❌ Échec requête bulk Elasticsearch:', error.message);
        this.disableForSession('indexRecordsBulk', error);
        return {
          indexed: 0,
          errors: [{ id: null, error: error.message }]
        };
      }
      throw error;
    }

    const errors = [];
    if (response.errors && Array.isArray(response.items)) {
      for (const item of response.items) {
        const action = item.index || item.create || item.update;
        if (action?.error) {
          errors.push({ id: action._id, error: action.error });
        }
      }
    }

    const totalOperations = operations.length / 2;
    const failedCount = new Set(errors.map((entry) => entry.id)).size;
    const indexedCount = Math.max(0, totalOperations - failedCount);

    if (index && !this.indexes.includes(index)) {
      this.indexes = Array.from(new Set([...this.indexes, index]));
    }

    this.cache.clear();
    return { indexed: indexedCount, errors };
  }

  async resetIndex({ recreate = true, index = this.defaultIndex } = {}) {
    if (!this.enabled) {
      return;
    }

    if (!(await this.ensureOperational('resetIndex'))) {
      return;
    }

    try {
      await client.indices.delete({ index });
    } catch (error) {
      const status = error?.meta?.statusCode;
      if (status !== 404) {
        if (this.isConnectionError(error)) {
          console.error("❌ Impossible de supprimer l'index Elasticsearch:", error.message);
          this.disableForSession('resetIndex(delete)', error);
          return;
        }
        throw error;
      }
    }

    if (!this.enabled) {
      return;
    }

    if (recreate) {
      try {
        await client.indices.create({ index });
      } catch (error) {
        if (this.isConnectionError(error)) {
          console.error("❌ Impossible de créer l'index Elasticsearch:", error.message);
          this.disableForSession('resetIndex(create)', error);
          return;
        }
        throw error;
      }
    }

    if (index && !this.indexes.includes(index)) {
      this.indexes = Array.from(new Set([...this.indexes, index]));
    }

    this.cache.clear();
  }

  async resetProfilesIndex({ recreate = true, index = 'profiles' } = {}) {
    return this.resetIndex({ recreate, index });
  }

  buildPreviewFromSource(source) {
    if (!source || typeof source !== 'object') {
      return {};
    }

    if (source.preview && typeof source.preview === 'object') {
      return source.preview;
    }

    const entries = {};
    const fullName =
      source.full_name ||
      [source.first_name, source.last_name]
        .filter((part) => part && String(part).trim().length > 0)
        .join(' ')
        .trim() || null;

    if (fullName) {
      entries.full_name = fullName;
    }

    const fieldCandidates = {
      first_name: source.first_name,
      last_name: source.last_name,
      phone: source.phone,
      email: source.email,
      comment: source.comment_preview
    };

    for (const [key, value] of Object.entries(fieldCandidates)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        entries[key] = value;
      }
    }

    if (Array.isArray(source.extra_fields)) {
      source.extra_fields.forEach((field, index) => {
        if (!field) return;
        if (typeof field === 'object') {
          Object.entries(field).forEach(([key, value]) => {
            if (value === null || value === undefined) return;
            const normalizedKey = key || `extra_${index}`;
            if (entries[normalizedKey] === undefined) {
              entries[normalizedKey] = value;
            }
          });
        } else {
          const key = `extra_${index}`;
          if (entries[key] === undefined) {
            entries[key] = field;
          }
        }
      });
    }

    return entries;
  }

  normalizeHit(hit) {
    const source = hit?._source || {};
    const preview = this.buildPreviewFromSource(source);
    const tableName = source.table_name || 'autres.profiles';
    const tableDisplay = source.table || tableName;
    const primaryKeyName = source.primary_key || 'id';
    const primaryValue = source.primary_value ?? source.id ?? hit?._id;
    const primaryKeys =
      source.primary_keys && typeof source.primary_keys === 'object'
        ? source.primary_keys
        : { [primaryKeyName]: primaryValue };

    return {
      table: tableDisplay,
      table_name: tableName,
      database: source.database_name || 'Elasticsearch',
      preview,
      primary_keys: primaryKeys,
      score: typeof hit?._score === 'number' ? hit._score : undefined
    };
  }

  async search(query, page = 1, limit = 20, options = {}) {
    const from = (page - 1) * limit;
    const { indexes = this.indexes } = options;
    const cacheKey = JSON.stringify({ query, page, limit, indexes });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (!this.enabled) {
      return {
        total: 0,
        hits: [],
        elapsed_ms: 0,
        tables_searched: []
      };
    }

    if (!(await this.ensureOperational('search'))) {
      return {
        total: 0,
        hits: [],
        elapsed_ms: 0,
        tables_searched: []
      };
    }

    let hits;
    let took;
    try {
      const response = await client.search({
        index: indexes,
        ignore_unavailable: true,
        from,
        size: limit,
        _source: [
          'id',
          'user_id',
          'division_id',
          'first_name',
          'last_name',
          'full_name',
          'phone',
          'email',
          'comment_preview',
          'extra_fields',
          'table',
          'table_name',
          'database_name',
          'primary_key',
          'primary_value',
          'primary_keys',
          'preview',
          'search_tokens',
          'full_text',
          'raw_values'
        ],
        query: {
          bool: {
            should: [
              {
                multi_match: {
                  query,
                  fields: [
                    'full_name^2',
                    'first_name',
                    'last_name',
                    'phone',
                    'email',
                    'search_tokens',
                    'full_text',
                    'raw_values'
                  ],
                  fuzziness: 'AUTO'
                }
              },
              {
                term: {
                  'primary_value.keyword': {
                    value: query,
                    boost: 5
                  }
                }
              }
            ],
            minimum_should_match: 1
          }
        }
      });
      hits = response.hits;
      took = response.took;
    } catch (error) {
      if (this.isConnectionError(error)) {
        console.error('❌ Recherche Elasticsearch indisponible:', error.message);
        this.disableForSession('search', error);
        return {
          total: 0,
          hits: [],
          elapsed_ms: 0,
          tables_searched: []
        };
      }
      throw error;
    }

    const total = typeof hits.total === 'number' ? hits.total : hits.total?.value ?? 0;
    const normalizedHits = hits.hits.map((hit) => this.normalizeHit(hit));
    const response = {
      total,
      hits: normalizedHits,
      elapsed_ms: took,
      tables_searched: Array.from(new Set(normalizedHits.map((hit) => hit.table_name).filter(Boolean)))
    };

    this.cache.set(cacheKey, response);
    return response;
  }
}

export default ElasticSearchService;
