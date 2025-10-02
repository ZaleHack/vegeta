import client from '../config/elasticsearch.js';
import { normalizeProfileRecord } from '../utils/profile-normalizer.js';
import InMemoryCache from '../utils/cache.js';

class ElasticSearchService {
  constructor() {
    const ttlEnv = process.env.ELASTICSEARCH_CACHE_TTL_MS;
    const parsedTtl = Number(ttlEnv);
    const ttl = Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 60000;
    this.cache = new InMemoryCache(ttl);
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
      search_tokens: this.buildSearchTokens(normalized)
    };
  }

  buildSearchTokens(profile) {
    const rawValues = [
      profile.first_name,
      profile.last_name,
      profile.phone,
      profile.email,
      ...(Array.isArray(profile.extra_fields) ? profile.extra_fields : [])
    ];
    const tokens = new Set();
    for (const value of rawValues) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        const nested = Object.values(value).map((v) => (v === null || v === undefined ? '' : String(v)));
        nested.forEach((entry) => {
          const normalized = entry.trim();
          if (!normalized) return;
          tokens.add(normalized.toLowerCase());
          tokens.add(normalized.replace(/\s+/g, '').toLowerCase());
        });
        continue;
      }
      const text = String(value).trim();
      if (!text) continue;
      tokens.add(text.toLowerCase());
      tokens.add(text.replace(/\s+/g, '').toLowerCase());
    }
    return Array.from(tokens);
  }

  async indexProfile(profile) {
    if (!profile?.id) return;
    const document = this.buildProfileDocument(profile);
    if (!document) return;
    await client.index({
      index: 'profiles',
      id: profile.id,
      document
    });
    this.cache.clear();
  }

  async indexProfilesBulk(profiles, options = {}) {
    const { refresh = false, index = 'profiles' } = options;
    if (!Array.isArray(profiles) || profiles.length === 0) {
      return { indexed: 0, errors: [] };
    }

    const operations = [];
    for (const profile of profiles) {
      if (!profile?.id) continue;
      const document = this.buildProfileDocument(profile);
      if (!document) continue;
      operations.push({ index: { _index: index, _id: profile.id } });
      operations.push(document);
    }

    if (operations.length === 0) {
      return { indexed: 0, errors: [] };
    }

    const response = await client.bulk({
      operations,
      refresh: refresh ? 'wait_for' : false
    });

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

    this.cache.clear();
    return { indexed: indexedCount, errors };
  }

  async resetProfilesIndex({ recreate = true, index = 'profiles' } = {}) {
    try {
      await client.indices.delete({ index });
    } catch (error) {
      const status = error?.meta?.statusCode;
      if (status !== 404) {
        throw error;
      }
    }

    if (recreate) {
      await client.indices.create({ index });
    }

    this.cache.clear();
  }

  buildPreviewFromSource(source) {
    if (!source || typeof source !== 'object') {
      return {};
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
    const tableName = hit?._index || 'profiles';
    const primaryKey = source.id ?? hit?._id;

    return {
      table: tableName,
      table_name: tableName,
      database: 'Elasticsearch',
      preview,
      primary_keys: primaryKey ? { id: primaryKey } : {},
      score: typeof hit?._score === 'number' ? hit._score : undefined
    };
  }

  async search(query, page = 1, limit = 20) {
    const from = (page - 1) * limit;
    const cacheKey = JSON.stringify({ query, page, limit });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { hits, took } = await client.search({
      index: 'profiles',
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
        'extra_fields'
      ],
      query: {
        multi_match: {
          query,
          fields: ['full_name^2', 'first_name', 'last_name', 'phone', 'email', 'search_tokens']
        }
      }
    });

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
