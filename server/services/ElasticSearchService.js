import client from '../config/elasticsearch.js';

class ElasticSearchService {
  async indexProfile(profile) {
    if (!profile?.id) return;
    await client.index({
      index: 'profiles',
      id: profile.id,
      document: profile
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
          fields: ['name', 'email', 'company', 'skills']
        }
      }
    });

    const total = typeof hits.total === 'number' ? hits.total : hits.total?.value ?? 0;
    return {
      total,
      hits: hits.hits.map(h => h._source),
      elapsed_ms: took
    };
  }
}

export default ElasticSearchService;
