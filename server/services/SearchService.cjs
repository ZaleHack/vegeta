const database = require('../config/database.cjs');
const tablesCatalog = require('../config/tables-catalog.json');
const SearchLog = require('../models/SearchLog.cjs');

class SearchService {
  constructor() {
    this.catalog = tablesCatalog;
  }

  async search(query, filters = {}, page = 1, limit = 20, user = null) {
    const startTime = Date.now();
    const results = [];
    const tablesSearched = [];

    // Validation des paramètres
    if (!query || query.trim().length === 0) {
      throw new Error('Le terme de recherche ne peut pas être vide');
    }

    const offset = (page - 1) * limit;
    const searchTerms = this.parseSearchQuery(query);

    // Recherche en parallèle dans toutes les tables configurées
    const searchPromises = Object.entries(this.catalog).map(([tableName, config]) =>
      this.searchInTable(tableName, config, searchTerms, filters)
        .then(tableResults => ({ tableName, tableResults }))
        .catch(error => {
          console.error(`Erreur recherche table ${tableName}:`, error);
          return { tableName, tableResults: [] };
        })
    );

    const tableSearches = await Promise.all(searchPromises);
    tableSearches.forEach(({ tableName, tableResults }) => {
      if (tableResults.length > 0) {
        results.push(...tableResults);
        tablesSearched.push(tableName);
      }
    });

    // Tri et pagination des résultats
    const sortedResults = this.sortResults(results, searchTerms);
    const totalResults = sortedResults.length;
    const paginatedResults = sortedResults.slice(offset, offset + limit);

    const executionTime = Date.now() - startTime;

    // Journalisation
    if (user) {
      try {
        await SearchLog.create({
          user_id: user.id,
          username: user.username,
          search_term: query,
          filters: filters,
          tables_searched: tablesSearched,
          results_count: totalResults,
          execution_time_ms: executionTime,
          ip_address: user.ip_address,
          user_agent: user.user_agent
        });
      } catch (err) {
        console.error('Erreur journalisation recherche:', err);
      }
    }

    return {
      total: totalResults,
      page: page,
      limit: limit,
      pages: Math.ceil(totalResults / limit),
      elapsed_ms: executionTime,
      hits: paginatedResults
    };
  }

  parseSearchQuery(query) {
    // Support des opérateurs basiques
    const terms = [];
    const words = query.split(/\s+/);

    for (let word of words) {
      word = word.trim();
      if (word.length === 0) continue;

      if (word.startsWith('"') && word.endsWith('"')) {
        // Recherche exacte
        terms.push({ type: 'exact', value: word.slice(1, -1) });
      } else if (word.startsWith('-')) {
        // Exclusion
        terms.push({ type: 'exclude', value: word.slice(1) });
      } else if (word.includes(':')) {
        // Recherche par champ
        const [field, value] = word.split(':', 2);
        terms.push({ type: 'field', field: field, value: value });
      } else {
        // Recherche normale
        terms.push({ type: 'normal', value: word });
      }
    }

    return terms;
  }

  async searchInTable(tableName, config, searchTerms, filters) {
    const results = [];
    const primaryKey = config.primaryKey || 'id';
    const fields = new Set([
      primaryKey,
      ...(config.preview || []),
      ...(config.searchable || []),
    ]);
    const selectFields = Array.from(fields).join(', ');
    let sql = `SELECT ${selectFields} FROM ${tableName} WHERE `;
    const params = [];
    const conditions = [];

    for (const term of searchTerms) {
      if (term.type === 'exclude') continue; // Traité séparément

      const termConditions = [];

      if (term.type === 'exact') {
        for (const field of config.searchable) {
          termConditions.push(`${field} = ?`);
          params.push(term.value);
        }
      } else if (term.type === 'field') {
        if (config.searchable.includes(term.field)) {
          termConditions.push(`${term.field} LIKE ?`);
          params.push(`%${term.value}%`);
        }
      } else if (term.type === 'normal') {
        for (const field of config.searchable) {
          termConditions.push(`${field} LIKE ?`);
          params.push(`%${term.value}%`);
        }
      }

      if (termConditions.length > 0) {
        conditions.push(`(${termConditions.join(' OR ')})`);
      }
    }

    // Ajout des filtres
    const filterConditions = this.buildFilterConditions(filters, config, params);
    conditions.push(...filterConditions);

    if (conditions.length === 0) {
      return results; // Aucune condition de recherche valide
    }

    sql += conditions.join(' AND ');

    // Gestion des exclusions
    const excludeTerms = searchTerms.filter(t => t.type === 'exclude');
    for (const term of excludeTerms) {
      const excludeConditions = [];
      for (const field of config.searchable) {
        excludeConditions.push(`${field} NOT LIKE ?`);
        params.push(`%${term.value}%`);
      }
      if (excludeConditions.length > 0) {
        sql += ` AND (${excludeConditions.join(' AND ')})`;
      }
    }

    sql += ' LIMIT 100'; // Limite par table pour éviter les timeouts

    try {
      const rows = await database.query(sql, params);

      for (const row of rows) {
        const preview = this.buildPreview(row, config);
        results.push({
          table: config.display,
          database: config.database,
          preview: preview,
          primary_keys: { [primaryKey]: row[primaryKey] },
          score: this.calculateRelevanceScore(row, searchTerms, config)
        });
      }
    } catch (error) {
      console.error(`Erreur SQL table ${tableName}:`, error);
    }

    return results;
  }

  buildFilterConditions(filters, config, params) {
    const conditions = [];
    
    if (!filters || !config.filters) {
      return conditions;
    }

    Object.entries(filters).forEach(([field, value]) => {
      if (value && config.filters[field]) {
        conditions.push(`${field} LIKE ?`);
        params.push(`%${value}%`);
      }
    });

    return conditions;
  }

  buildPreview(record, config) {
    const preview = {};
    
    config.preview.forEach(field => {
      if (record[field] !== null && record[field] !== undefined && record[field] !== '') {
        preview[field] = record[field];
      }
    });

    return preview;
  }

  calculateRelevanceScore(record, searchTerms, config) {
    let score = 0;
    
    for (const term of searchTerms) {
      if (term.type === 'exclude') continue;
      
      const searchValue = term.value.toLowerCase();
      
      for (const field of config.searchable) {
        const value = record[field];
        if (!value) continue;
        
        const fieldValue = value.toString().toLowerCase();
        
        if (term.type === 'exact' && fieldValue === searchValue) {
          score += 10;
        } else if (fieldValue.includes(searchValue)) {
          const position = fieldValue.indexOf(searchValue);
          const lengthRatio = searchValue.length / value.length;
          score += (10 - position * 0.1) * lengthRatio;
        }
      }
    }
    
    return Math.round(score * 100) / 100;
  }

  sortResults(results, searchTerms) {
    return results.sort((a, b) => {
      // Tri par score de pertinence décroissant
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // En cas d'égalité, tri alphabétique par table
      return a.table.localeCompare(b.table);
    });
  }

  async getRecordDetails(tableName, id) {
    if (!this.catalog[tableName]) {
      throw new Error('Table non autorisée');
    }

    const sql = `SELECT * FROM ${tableName} WHERE id = ?`;
    const record = await database.queryOne(sql, [id]);
    
    if (!record) {
      throw new Error('Enregistrement non trouvé');
    }

    // Nettoyer les valeurs nulles pour l'affichage
    const details = {};
    Object.entries(record).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        details[key] = value;
      }
    });

    return {
      table: this.catalog[tableName].display,
      database: this.catalog[tableName].database,
      details: details
    };
  }

  getAvailableFilters(tablesHit) {
    const filters = {
      identite: new Set(),
      contact: new Set(),
      pro: new Set(),
      transport: new Set(),
      entreprise: new Set(),
      civique: new Set(),
      telecom: new Set()
    };

    for (const tableName of tablesHit) {
      const config = this.catalog[tableName];
      if (!config || !config.filters) continue;

      const theme = config.theme || 'identite';
      if (filters[theme]) {
        Object.keys(config.filters).forEach(field => {
          filters[theme].add(field);
        });
      }
    }

    // Convertir les Sets en Arrays
    Object.keys(filters).forEach(theme => {
      filters[theme] = Array.from(filters[theme]);
    });

    return filters;
  }
}

module.exports = SearchService;