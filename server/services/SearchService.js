import database from '../config/database.js';
import tablesCatalog from '../config/tables-catalog.js';

class SearchService {
  constructor() {
    this.mockData = this.generateMockData();
  }

  generateMockData() {
    return [
      {
        id: 1,
        table: 'esolde.mytable',
        data: {
          matricule: 'MAT001',
          nomprenom: 'DIALLO Amadou',
          cni: '1234567890123',
          telephone: '77 123 45 67'
        },
        score: 100
      },
      {
        id: 2,
        table: 'rhpolice.personne_concours',
        data: {
          prenom: 'Fatou',
          nom: 'SALL',
          date_naiss: '1985-03-15',
          lieu_naiss: 'Dakar',
          sexe: 'F',
          adresse: 'Parcelles Assainies',
          email: 'fatou.sall@email.com',
          telephone: '76 987 65 43',
          cni: '9876543210987'
        },
        score: 95
      },
      {
        id: 3,
        table: 'autres.Vehicules',
        data: {
          Numero_Immatriculation: 'DK 1234 AB',
          Marque: 'Toyota',
          Appelation_Com: 'Corolla',
          Prenoms: 'Moussa',
          Nom: 'NDIAYE',
          Date_Naissance: '1980-07-22',
          Tel_Portable: '77 555 44 33'
        },
        score: 90
      }
    ];
  }
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
    const searchTerms = this.parseSearchQuery(query);

    console.log('🔍 Recherche:', { query, searchTerms, filters });

    // Recherche dans toutes les tables configurées
    for (const [tableName, config] of Object.entries(this.catalog)) {
      try {
        console.log(`🔍 Recherche dans ${tableName}...`);
        const tableResults = await this.searchInTable(tableName, config, searchTerms, filters);
        if (tableResults.length > 0) {
          results.push(...tableResults);
          tablesSearched.push(tableName);
          console.log(`✅ ${tableResults.length} résultats trouvés dans ${tableName}`);
        }
      } catch (error) {
        console.error(`❌ Erreur recherche table ${tableName}:`, error.message);
        // Continue avec les autres tables même si une échoue
      }
    }

    // Tri et pagination des résultats
    const sortedResults = this.sortResults(results, searchTerms);
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
        filters: JSON.stringify(filters),
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

  parseSearchQuery(query) {
    const terms = [];
    
    // Gérer les guillemets pour les expressions exactes
    const quotedExpressions = [];
    let cleanQuery = query.replace(/"([^"]+)"/g, (match, content) => {
      quotedExpressions.push(content);
      return `__QUOTED_${quotedExpressions.length - 1}__`;
    });
    
    // Séparer par espaces mais garder les opérateurs logiques
    const words = cleanQuery.split(/\s+/);

    for (let word of words) {
      word = word.trim();
      if (word.length === 0) continue;

      // Restaurer les expressions quotées
      if (word.includes('__QUOTED_')) {
        const index = parseInt(word.match(/__QUOTED_(\d+)__/)[1]);
        terms.push({ type: 'exact', value: quotedExpressions[index] });
      } else if (word.toUpperCase() === 'AND') {
        terms.push({ type: 'operator', value: 'AND' });
      } else if (word.toUpperCase() === 'OR') {
        terms.push({ type: 'operator', value: 'OR' });
      } else if (word.toUpperCase() === 'NOT') {
        terms.push({ type: 'operator', value: 'NOT' });
      } else if (word.startsWith('-')) {
        terms.push({ type: 'exclude', value: word.slice(1) });
      } else if (word.includes(':')) {
        const [field, value] = word.split(':', 2);
        terms.push({ type: 'field', field: field, value: value });
      } else if (word.includes('>=')) {
        const [field, value] = word.split('>=', 2);
        terms.push({ type: 'comparison', field: field, operator: '>=', value: value });
      } else if (word.includes('<=')) {
        const [field, value] = word.split('<=', 2);
        terms.push({ type: 'comparison', field: field, operator: '<=', value: value });
      } else if (word.includes('>')) {
        const [field, value] = word.split('>', 2);
        terms.push({ type: 'comparison', field: field, operator: '>', value: value });
      } else if (word.includes('<')) {
        const [field, value] = word.split('<', 2);
        terms.push({ type: 'comparison', field: field, operator: '<', value: value });
      } else {
        terms.push({ type: 'normal', value: word });
      }
    }

    return terms;
  }

  async searchInTable(tableName, config, searchTerms, filters) {
    const results = [];
    
    // Vérifier si la table existe
    try {
      await database.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
    } catch (error) {
      console.warn(`⚠️ Table ${tableName} non accessible:`, error.message);
      return results;
    }

    let sql = `SELECT * FROM ${tableName} WHERE `;
    const params = [];
    
    // Construire les conditions avec support des opérateurs logiques
    const conditions = this.buildAdvancedConditions(searchTerms, config, params);

    if (!conditions || conditions.length === 0) {
      return results;
    }

    sql += conditions;

    sql += ' LIMIT 50'; // Limite par table

    try {
      const rows = await database.query(sql, params);

      // Si en mode mock, retourner les données de démonstration
      if (db.mockMode) {
        console.log('🎭 Utilisation des données de démonstration');
        const mockResults = this.mockData.filter(item => 
          JSON.stringify(item.data).toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        const executionTime = Date.now() - startTime;
        console.log(`✅ Recherche mock terminée en ${executionTime}ms, ${mockResults.length} résultats`);
        
        return {
          results: mockResults,
          totalResults: mockResults.length,
          executionTime,
          searchTerm
        };
      }
      for (const row of rows) {
        results.push({
          table: config.display,
          database: config.database,
          data: row,
          primary_keys: { id: row.id },
          score: this.calculateRelevanceScore(row, searchTerms, config)
        });
      }
    } catch (error) {
      console.error(`❌ Erreur SQL table ${tableName}:`, error.message);
    }

    return results;
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
          const lengthRatio = searchValue.length / fieldValue.length;
          score += (10 - position * 0.1) * lengthRatio;
        }
      }
    }
    
    return Math.round(score * 100) / 100;
  }

  buildAdvancedConditions(searchTerms, config, params) {
    if (searchTerms.length === 0) return '';
    
    const conditions = [];
    let currentOperator = 'AND'; // Opérateur par défaut
    
    for (let i = 0; i < searchTerms.length; i++) {
      const term = searchTerms[i];
      
      if (term.type === 'operator') {
        currentOperator = term.value;
        continue;
      }
      
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
      } else if (term.type === 'comparison') {
        if (config.searchable.includes(term.field)) {
          termConditions.push(`${term.field} ${term.operator} ?`);
          params.push(term.value);
        }
      } else if (term.type === 'exclude') {
        const excludeConditions = [];
        for (const field of config.searchable) {
          excludeConditions.push(`${field} NOT LIKE ?`);
          params.push(`%${term.value}%`);
        }
        if (excludeConditions.length > 0) {
          termConditions.push(`(${excludeConditions.join(' AND ')})`);
        }
      } else if (term.type === 'normal') {
        for (const field of config.searchable) {
          termConditions.push(`${field} LIKE ?`);
          params.push(`%${term.value}%`);
        }
      }
      
      if (termConditions.length > 0) {
        const condition = `(${termConditions.join(' OR ')})`;
        
        if (conditions.length === 0) {
          conditions.push(condition);
        } else {
          if (currentOperator === 'NOT') {
            conditions.push(`AND NOT ${condition}`);
          } else {
            conditions.push(`${currentOperator} ${condition}`);
          }
        }
        
        // Reset à AND par défaut après chaque terme
        currentOperator = 'AND';
      }
    }
    
    return conditions.join(' ');
  }

  sortResults(results, searchTerms) {
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