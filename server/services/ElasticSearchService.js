import client from '../config/elasticsearch.js';
import database from '../config/database.js';
import { normalizeProfileRecord } from '../utils/profile-normalizer.js';
import InMemoryCache from '../utils/cache.js';
import { loadCatalog, watchCatalog, resolveTableComponents } from '../utils/catalog.js';
import {
  computeFieldWeight,
  buildSuggestionsFromValues,
  isIdentifierField
} from '../utils/search-helpers.js';
import { isElasticsearchEnabled } from '../config/environment.js';

class ElasticSearchService {
  constructor() {
    const ttlEnv = process.env.ELASTICSEARCH_CACHE_TTL_MS;
    const parsedTtl = Number(ttlEnv);
    const ttl = Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 60000;
    this.cache = new InMemoryCache(ttl);
    this.defaultIndex = process.env.ELASTICSEARCH_DEFAULT_INDEX || 'global_search';
    this.enabled = isElasticsearchEnabled();
    this.initiallyEnabled = this.enabled;
    this.catalog = loadCatalog();
    this.indexes = this.enabled ? this.resolveIndexesFromCatalog(this.catalog) : [];
    const timeoutEnv = Number(process.env.ELASTICSEARCH_HEALTHCHECK_TIMEOUT_MS);
    this.connectionTimeout = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : 5000;
    this.connectionChecked = false;
    this.connectionCheckPromise = null;
    const retryEnv = Number(process.env.ELASTICSEARCH_RETRY_DELAY_MS);
    this.retryDelayMs = Number.isFinite(retryEnv) && retryEnv >= 0 ? retryEnv : 15000;
    this.reconnectTimer = null;

    this.stopWatchingCatalog = watchCatalog(() => {
      this.catalog = loadCatalog();
      this.indexes = this.resolveIndexesFromCatalog(this.catalog);
      this.indexDefinitionCache = new Map();
      this.tableColumnCache = new Map();
      this.tableSearchSchemaCache = new Map();
    });

    this.indexDefinitionCache = new Map();
    this.tableColumnCache = new Map();
    this.tableSearchSchemaCache = new Map();

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

  async getTableColumns(tableName) {
    if (this.tableColumnCache.has(tableName)) {
      return this.tableColumnCache.get(tableName);
    }

    try {
      const columns = await database.query(`SHOW COLUMNS FROM ${tableName}`);
      this.tableColumnCache.set(tableName, columns);
      return columns;
    } catch (error) {
      console.warn(`⚠️ Impossible de récupérer les colonnes pour ${tableName}:`, error.message);
      this.tableColumnCache.set(tableName, []);
      return [];
    }
  }

  async getTableSearchSchema(tableName, config = {}) {
    if (this.tableSearchSchemaCache.has(tableName)) {
      return this.tableSearchSchemaCache.get(tableName);
    }

    const columns = await this.getTableColumns(tableName);
    const descriptors = columns.map((column) => ({
      name: column.Field,
      type: column.Type,
      weight: computeFieldWeight(column.Field, config),
      isIdentifier: isIdentifierField(column.Field)
    }));

    const schema = {
      table: tableName,
      columns: descriptors,
      filters: config.filters || {}
    };

    this.tableSearchSchemaCache.set(tableName, schema);
    return schema;
  }

  async buildIndexDefinition(indexName) {
    if (this.indexDefinitionCache.has(indexName)) {
      return this.indexDefinitionCache.get(indexName);
    }

    const columnProperties = {};
    const filterTypes = {};
    const fieldWeights = {};

    const associatedTables = Object.entries(this.catalog).filter(([tableName, config]) => {
      const syncConfig = config?.sync || {};
      const targetIndex = syncConfig.elasticsearchIndex || this.defaultIndex;
      return targetIndex === indexName;
    });

    for (const [tableName, config] of associatedTables) {
      const schema = await this.getTableSearchSchema(tableName, config);
      const tableFieldWeights = {};

      schema.columns.forEach((column) => {
        if (!columnProperties[column.name]) {
          columnProperties[column.name] = {
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword', ignore_above: 256 }
            }
          };
        }
        tableFieldWeights[column.name] = column.weight;
      });

      Object.entries(schema.filters || {}).forEach(([filterField, filterType]) => {
        filterTypes[filterField] = filterType || 'keyword';
      });

      fieldWeights[tableName] = tableFieldWeights;
    }

    const settings = {
      analysis: {
        filter: {
          autocomplete_filter: {
            type: 'edge_ngram',
            min_gram: 2,
            max_gram: 20
          }
        },
        analyzer: {
          autocomplete: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'asciifolding', 'autocomplete_filter']
          },
          autocomplete_search: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'asciifolding']
          }
        }
      }
    };

    const mappings = {
      dynamic_templates: [
        {
          columns_template: {
            path_match: 'columns.*',
            mapping: {
              type: 'text',
              analyzer: 'standard',
              fields: {
                keyword: {
                  type: 'keyword',
                  ignore_above: 256
                }
              }
            }
          }
        },
        {
          filter_template: {
            path_match: 'filter_values.*',
            mapping: {
              type: 'keyword'
            }
          }
        },
        {
          suggestions_template: {
            path_match: 'suggestions',
            mapping: {
              type: 'completion',
              analyzer: 'autocomplete',
              search_analyzer: 'autocomplete_search'
            }
          }
        }
      ],
      properties: {
        table: { type: 'keyword' },
        table_name: { type: 'keyword' },
        database_name: { type: 'keyword' },
        preview: { type: 'object', enabled: true },
        search_tokens: {
          type: 'text',
          analyzer: 'autocomplete',
          search_analyzer: 'autocomplete_search',
          fields: {
            keyword: { type: 'keyword', ignore_above: 256 }
          }
        },
        primary_key: { type: 'keyword' },
        primary_value: { type: 'keyword' },
        primary_keys: { type: 'object', enabled: true },
        raw_values: {
          type: 'text',
          analyzer: 'standard',
          search_analyzer: 'standard'
        },
        full_text: {
          type: 'text',
          analyzer: 'standard',
          search_analyzer: 'standard'
        },
        filter_values: { type: 'object', enabled: true },
        columns: { type: 'object', enabled: true, properties: {} },
        column_weights: { type: 'object', enabled: true },
        suggestions: {
          type: 'completion',
          analyzer: 'autocomplete',
          search_analyzer: 'autocomplete_search'
        }
      }
    };

    Object.assign(mappings.properties.columns.properties || (mappings.properties.columns.properties = {}), columnProperties);

    const definition = { settings, mappings, fieldWeights, filterTypes };
    this.indexDefinitionCache.set(indexName, definition);
    return definition;
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
    const profileConfig = this.catalog?.['autres.profiles'] || {};
    const filterValues = {};

    if (normalized.division_id !== null && normalized.division_id !== undefined) {
      filterValues.division_id = normalized.division_id;
    }

    const columnValues = {
      first_name: normalized.first_name || null,
      last_name: normalized.last_name || null,
      full_name: fullName || null,
      phone: normalized.phone || null,
      email: normalized.email || null,
      comment: commentPreview
    };

    const columnWeights = {};

    Object.keys(columnValues).forEach((key) => {
      if (columnValues[key] === null || columnValues[key] === undefined || columnValues[key] === '') {
        delete columnValues[key];
        return;
      }
      columnWeights[key] = computeFieldWeight(key, profileConfig);
    });

    const suggestions = buildSuggestionsFromValues([
      ...rawValues,
      normalized.id,
      normalized.phone,
      normalized.email,
      fullName
    ]);

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
      full_text: this.buildFullTextFromValues(rawValues),
      filter_values: filterValues,
      column_weights: columnWeights,
      columns: columnValues,
      suggestions
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

    if (record && typeof record === 'object') {
      Object.keys(record).forEach((field) => fields.add(field));
    }

    const filterFields = Object.keys(config.filters || {});
    filterFields.forEach((field) => fields.add(field));

    const columnValues = {};
    const filterValues = {};
    const columnWeights = {};
    const values = [];

    fields.forEach((field) => {
      if (!field || !record) {
        return;
      }
      const value = record[field];
      if (value === null || value === undefined || value === '') {
        return;
      }
      columnValues[field] = value;
      columnWeights[field] = computeFieldWeight(field, config);
      if (filterFields.includes(field)) {
        filterValues[field] = value;
      }
      values.push(value);
    });

    return {
      normalizedValues: this.normalizeValues(values),
      columnValues,
      filterValues,
      columnWeights
    };
  }

  buildGenericDocument(record, { tableName, config = {}, primaryKey }) {
    const key = primaryKey && record ? record[primaryKey] : null;
    if (key === null || key === undefined) {
      return null;
    }

    const preview = this.buildPreview(record, config);
    const {
      normalizedValues,
      columnValues,
      filterValues,
      columnWeights
    } = this.collectSearchValues(
      record,
      config,
      primaryKey
    );
    const searchTokens = this.buildTokensFromValues(normalizedValues);
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
      raw_values: normalizedValues,
      full_text: this.buildFullTextFromValues(normalizedValues),
      columns: columnValues,
      column_weights: columnWeights,
      filter_values: filterValues,
      suggestions: buildSuggestionsFromValues([
        ...normalizedValues,
        key,
        record?.[config.primaryKey || 'id']
      ])
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

  async deleteGenericDocument({ index = this.defaultIndex, tableName, primaryValue }) {
    if (!this.enabled) {
      return;
    }

    if (!(await this.ensureOperational('deleteGenericDocument'))) {
      return;
    }

    if (!tableName || primaryValue === undefined || primaryValue === null) {
      return;
    }

    const documentId = `${tableName}::${primaryValue}`;
    try {
      await client.delete({
        index,
        id: String(documentId)
      });
    } catch (error) {
      const status = error?.meta?.statusCode;
      if (status !== 404) {
        if (this.isConnectionError(error)) {
          console.error('❌ Échec suppression document Elasticsearch:', error.message);
          this.disableForSession('deleteGenericDocument', error);
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
        const definition = await this.buildIndexDefinition(index);
        await client.indices.create({
          index,
          settings: definition.settings,
          mappings: definition.mappings
        });
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
    const {
      indexes = this.indexes,
      filters = {},
      facets = [],
      autocomplete = false
    } = options;

    const cacheKey = JSON.stringify({ query, page, limit, indexes, filters, facets, autocomplete });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (!this.enabled) {
      return {
        total: 0,
        hits: [],
        elapsed_ms: 0,
        tables_searched: [],
        facets: {},
        suggestions: []
      };
    }

    if (!(await this.ensureOperational('search'))) {
      return {
        total: 0,
        hits: [],
        elapsed_ms: 0,
        tables_searched: [],
        facets: {},
        suggestions: []
      };
    }

    const definitions = await Promise.all(indexes.map((index) => this.buildIndexDefinition(index)));
    const weightedFields = new Map();
    const aggregatedFilterTypes = {};

    definitions.forEach((definition) => {
      Object.assign(aggregatedFilterTypes, definition.filterTypes || {});
      const tableWeights = definition.fieldWeights || {};
      Object.values(tableWeights).forEach((weights = {}) => {
        Object.entries(weights).forEach(([field, weight]) => {
          const path = `columns.${field}`;
          const existing = weightedFields.get(path) || 1;
          weightedFields.set(path, Math.max(existing, weight || 1));
        });
      });
    });

    const multiMatchFields = Array.from(weightedFields.entries()).map(([field, weight]) =>
      weight && weight > 0 ? `${field}^${Math.max(1, Math.round(weight * 100) / 100)}` : field
    );

    if (multiMatchFields.length === 0) {
      multiMatchFields.push('columns.*^1.2');
    }

    multiMatchFields.push('full_text^2', 'raw_values', 'search_tokens^1.5');

    const filterClauses = [];
    Object.entries(filters || {}).forEach(([field, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }

      const filterType = aggregatedFilterTypes[field] || 'keyword';
      const path = `filter_values.${field}`;

      if (Array.isArray(value)) {
        filterClauses.push({ terms: { [path]: value } });
        return;
      }

      if (typeof value === 'object' && value !== null) {
        const range = {};
        if (value.from !== undefined) {
          range.gte = value.from;
        }
        if (value.to !== undefined) {
          range.lte = value.to;
        }
        if (Object.keys(range).length > 0) {
          filterClauses.push({ range: { [path]: range } });
        }
        return;
      }

      if (filterType === 'number' || filterType === 'numeric') {
        const numericValue = Number(value);
        if (!Number.isNaN(numericValue)) {
          filterClauses.push({ term: { [path]: numericValue } });
        }
        return;
      }

      filterClauses.push({ term: { [path]: value } });
    });

    const shouldQueries = [
      {
        multi_match: {
          query,
          type: 'best_fields',
          fields: multiMatchFields,
          fuzziness: 'AUTO'
        }
      },
      {
        multi_match: {
          query,
          type: 'phrase_prefix',
          fields: ['columns.*^1.5', 'full_text', 'search_tokens']
        }
      },
      {
        term: {
          primary_value: {
            value: query,
            boost: 5
          }
        }
      },
      {
        term: {
          'search_tokens.keyword': {
            value: query.toLowerCase(),
            boost: 3
          }
        }
      }
    ];

    const boolQuery = {
      bool: {
        should: shouldQueries,
        minimum_should_match: 1,
        filter: filterClauses
      }
    };

    const aggs = {};
    (Array.isArray(facets) ? facets : []).forEach((facet) => {
      if (!facet || typeof facet !== 'string') {
        return;
      }
      const fieldPath = `filter_values.${facet}`;
      aggs[`facet_${facet}`] = {
        terms: {
          field: fieldPath,
          size: 20
        }
      };
    });

    const suggest = autocomplete
      ? {
          global_suggest: {
            prefix: query,
            completion: {
              field: 'suggestions',
              size: 10,
              skip_duplicates: true
            }
          }
        }
      : undefined;

    let hits;
    let took;
    let aggregations;
    let suggestions = [];
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
          'raw_values',
          'filter_values',
          'columns'
        ],
        query: boolQuery,
        aggs: Object.keys(aggs).length ? aggs : undefined,
        suggest
      });
      hits = response.hits;
      took = response.took;
      aggregations = response.aggregations;
      if (autocomplete && response.suggest?.global_suggest?.length) {
        suggestions = response.suggest.global_suggest[0].options
          .map((option) => option.text)
          .filter(Boolean);
      }
    } catch (error) {
      if (this.isConnectionError(error)) {
        console.error('❌ Recherche Elasticsearch indisponible:', error.message);
        this.disableForSession('search', error);
        return {
          total: 0,
          hits: [],
          elapsed_ms: 0,
          tables_searched: [],
          facets: {},
          suggestions: []
        };
      }
      throw error;
    }

    const total = typeof hits.total === 'number' ? hits.total : hits.total?.value ?? 0;
    const normalizedHits = hits.hits.map((hit) => this.normalizeHit(hit));
    const facetResults = {};

    if (aggregations) {
      Object.entries(aggregations).forEach(([key, bucket]) => {
        if (!key.startsWith('facet_') || !bucket?.buckets) {
          return;
        }
        const facetName = key.replace(/^facet_/, '');
        facetResults[facetName] = bucket.buckets.map((entry) => ({
          key: entry.key,
          count: entry.doc_count
        }));
      });
    }

    const response = {
      total,
      hits: normalizedHits,
      elapsed_ms: took,
      tables_searched: Array.from(new Set(normalizedHits.map((hit) => hit.table_name).filter(Boolean))),
      facets: facetResults,
      suggestions
    };

    this.cache.set(cacheKey, response);
    return response;
  }
}

export default ElasticSearchService;
