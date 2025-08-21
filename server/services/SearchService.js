import database from '../config/database.js';
import tablesCatalog from '../config/tables-catalog.js';

class SearchService {
  constructor() {
    this.catalog = tablesCatalog;
  }

  async search(query, filters = {}, page = 1, limit = 20, user = null) {
    const startTime = Date.now();
    const results = [];
    const tablesSearched = [];

    if (!query || query.trim().length === 0) {
      throw new Error('Le terme de recherche ne peut pas être vide');
    }

    const offset = (page - 1) * limit;
    const searchCriteria = this.parseAdvancedQuery(query);

    console.log('🔍 Recherche avancée:', { query, searchCriteria });

    // Recherche dans toutes les tables configurées
    for (const [tableName, config] of Object.entries(this.catalog)) {
      try {
        console.log(`🔍 Recherche dans ${tableName}...`);
        const tableResults = await this.searchInTable(tableName, config, searchCriteria);
        if (tableResults.length > 0) {
          results.push(...tableResults);
          tablesSearched.push(tableName);
          console.log(`✅ ${tableResults.length} résultats trouvés dans ${tableName}`);
        }
      } catch (error) {
        console.error(`❌ Erreur recherche table ${tableName}:`, error.message);
      }
    }

    // Tri et pagination des résultats
    const sortedResults = this.sortResults(results, searchCriteria);
    const totalResults = sortedResults.length;
    const paginatedResults = sortedResults.slice(offset, offset + limit);

    const executionTime = Date.now() - startTime;

    console.log(`🎯 Recherche terminée: ${totalResults} résultats en ${executionTime}ms`);

    // Journalisation
    if (user) {
      await this.logSearch({
        user_id: user.id,
        username: user.login,
        search_term: query,
        tables_searched: JSON.stringify(tablesSearched),
        results_count: totalResults,
        execution_time_ms: executionTime,
        ip_address: user.ip_address || '',
        user_agent: user.user_agent || ''
      });
    }

    return {
      total: totalResults,
      page: page,
      limit: limit,
      pages: Math.ceil(totalResults / limit),
      elapsed_ms: executionTime,
      hits: paginatedResults,
      tables_searched: tablesSearched
    };
  }

  parseAdvancedQuery(query) {
    const criteria = {
      terms: [],
      operators: [],
      logic: 'AND' // Logique par défaut
    };

    // Nettoyer et normaliser la requête
    let cleanQuery = query.trim();
    
    // Gérer les expressions entre guillemets
    const quotedExpressions = [];
    cleanQuery = cleanQuery.replace(/"([^"]+)"/g, (match, content) => {
      quotedExpressions.push({ type: 'exact', value: content.trim() });
      return `__QUOTED_${quotedExpressions.length - 1}__`;
    });

    // Séparer par les opérateurs logiques
    const tokens = cleanQuery.split(/\s+(AND|OR|NOT)\s+/i);
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim();
      
      if (!token) continue;
      
      // Si c'est un opérateur logique
      if (['AND', 'OR', 'NOT'].includes(token.toUpperCase())) {
        criteria.operators.push(token.toUpperCase());
        continue;
      }
      
      // Traiter chaque terme
      const words = token.split(/\s+/);
      const termGroup = [];
      
      for (let word of words) {
        word = word.trim();
        if (!word) continue;
        
        // Restaurer les expressions quotées
        if (word.includes('__QUOTED_')) {
          const index = parseInt(word.match(/__QUOTED_(\d+)__/)[1]);
          termGroup.push(quotedExpressions[index]);
        }
        // Exclusion avec -
        else if (word.startsWith('-')) {
          termGroup.push({ type: 'exclude', value: word.slice(1) });
        }
        // Recherche par champ avec :
        else if (word.includes(':')) {
          const [field, value] = word.split(':', 2);
          termGroup.push({ type: 'field', field: field.trim(), value: value.trim() });
        }
        // Comparaisons
        else if (word.includes('>=')) {
          const [field, value] = word.split('>=', 2);
          termGroup.push({ type: 'comparison', field: field.trim(), operator: '>=', value: value.trim() });
        }
        else if (word.includes('<=')) {
          const [field, value] = word.split('<=', 2);
          termGroup.push({ type: 'comparison', field: field.trim(), operator: '<=', value: value.trim() });
        }
        else if (word.includes('>')) {
          const [field, value] = word.split('>', 2);
          termGroup.push({ type: 'comparison', field: field.trim(), operator: '>', value: value.trim() });
        }
        else if (word.includes('<')) {
          const [field, value] = word.split('<', 2);
          termGroup.push({ type: 'comparison', field: field.trim(), operator: '<', value: value.trim() });
        }
        // Terme normal
        else {
          termGroup.push({ type: 'normal', value: word });
        }
      }
      
      if (termGroup.length > 0) {
        criteria.terms.push(termGroup);
      }
    }

    return criteria;
  }

  async searchInTable(tableName, config, searchCriteria) {
    const results = [];
    
    // Vérifier si la table existe
    try {
      await database.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
    } catch (error) {
      console.warn(`⚠️ Table ${tableName} non accessible:`, error.message);
      return results;
    }

    // Construire la requête SQL
    const { sql, params } = this.buildSQLQuery(tableName, config, searchCriteria);
    
    if (!sql) {
      return results;
    }

    try {
      console.log(`🔍 SQL pour ${tableName}:`, sql);
      console.log(`📋 Paramètres:`, params);
      
      const rows = await database.query(sql, params);

      for (const row of rows) {
        results.push({
          table: config.display,
          database: config.database,
          data: row,
          primary_keys: { id: row.id },
          score: this.calculateRelevanceScore(row, searchCriteria, config)
        });
      }
    } catch (error) {
      console.error(`❌ Erreur SQL table ${tableName}:`, error.message);
    }

    return results;
  }

  buildSQLQuery(tableName, config, searchCriteria) {
    let sql = `SELECT * FROM ${tableName} WHERE `;
    const params = [];
    const conditions = [];

    // Traiter chaque groupe de termes
    for (let i = 0; i < searchCriteria.terms.length; i++) {
      const termGroup = searchCriteria.terms[i];
      const groupConditions = [];

      // Traiter chaque terme dans le groupe
      for (const term of termGroup) {
        const termConditions = this.buildTermConditions(term, config, params);
        if (termConditions.length > 0) {
          groupConditions.push(`(${termConditions.join(' OR ')})`);
        }
      }

      if (groupConditions.length > 0) {
        const groupCondition = groupConditions.join(' AND ');
        
        // Appliquer l'opérateur logique
        if (i === 0) {
          conditions.push(`(${groupCondition})`);
        } else {
          const operator = searchCriteria.operators[i - 1] || 'AND';
          if (operator === 'NOT') {
            conditions.push(`AND NOT (${groupCondition})`);
          } else {
            conditions.push(`${operator} (${groupCondition})`);
          }
        }
      }
    }

    if (conditions.length === 0) {
      return { sql: null, params: [] };
    }

    sql += conditions.join(' ');
    sql += ' LIMIT 50'; // Limite par table

    return { sql, params };
  }

  buildTermConditions(term, config, params) {
    const conditions = [];

    switch (term.type) {
      case 'exact':
        for (const field of config.searchable) {
          conditions.push(`${field} = ?`);
          params.push(term.value);
        }
        break;

      case 'field':
        if (config.searchable.includes(term.field)) {
          conditions.push(`${term.field} LIKE ?`);
          params.push(`%${term.value}%`);
        }
        break;

      case 'comparison':
        if (config.searchable.includes(term.field)) {
          conditions.push(`${term.field} ${term.operator} ?`);
          params.push(term.value);
        }
        break;

      case 'exclude':
        for (const field of config.searchable) {
          conditions.push(`${field} NOT LIKE ?`);
          params.push(`%${term.value}%`);
        }
        break;

      case 'normal':
      default:
        for (const field of config.searchable) {
          conditions.push(`${field} LIKE ?`);
          params.push(`%${term.value}%`);
        }
        break;
    }

    return conditions;
  }

  calculateRelevanceScore(record, searchCriteria, config) {
    let score = 0;
    
    for (const termGroup of searchCriteria.terms) {
      for (const term of termGroup) {
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
            const lengthRatio = searchValue.length / fieldValue.length;
            score += (10 - position * 0.1) * lengthRatio;
          }
        }
      }
    }
    
    return Math.round(score * 100) / 100;
  }

  sortResults(results, searchCriteria) {
    return results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.table.localeCompare(b.table);
    });
  }

  async logSearch(logData) {
    try {
      await database.query(`
        INSERT INTO autres.search_logs (
          user_id, username, search_term, tables_searched, 
          results_count, execution_time_ms, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        logData.user_id,
        logData.username,
        logData.search_term,
        logData.tables_searched,
        logData.results_count,
        logData.execution_time_ms,
        logData.ip_address,
        logData.user_agent
      ]);
    } catch (error) {
      console.error('❌ Erreur log recherche:', error);
    }
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
}

export default SearchService;