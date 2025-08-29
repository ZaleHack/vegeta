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

  async search(query, limit = 20) {
    const { hits } = await client.search({
      index: 'profiles',
      size: limit,
      query: {
        multi_match: {
          query,
          fields: ['name', 'email', 'company', 'skills']
        }
      }
    });
    return hits.hits.map(h => h._source);
  }
}

export default ElasticSearchService;
