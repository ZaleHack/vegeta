import client from '../config/elasticsearch.js';
import { normalizeProfileRecord } from '../utils/profile-normalizer.js';

class ElasticSearchService {
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
  }

  async search(query, page = 1, limit = 20) {
    const from = (page - 1) * limit;
    const { hits, took } = await client.search({
      index: 'profiles',
      from,
      size: limit,
      query: {
        multi_match: {
          query,
          fields: ['full_name^2', 'first_name', 'last_name', 'phone', 'email', 'search_tokens']
        }
      }
    });

    const total = typeof hits.total === 'number' ? hits.total : hits.total?.value ?? 0;
    return {
      total,
      hits: hits.hits.map((h) => h._source),
      elapsed_ms: took
    };
  }
}

export default ElasticSearchService;
