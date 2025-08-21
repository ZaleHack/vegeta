import database from '../config/database.js';
import tablesCatalog from '../config/tables-catalog.js';

class SearchService {
  constructor() {
    this.catalog = tablesCatalog;
  }

  parseSearchQuery(query) {
    const terms = [];
    const regex = /(?:"([^"]+)"|(\w+):([^\s]+)|(\w+))/g;
    let match;

    while ((match = regex.exec(query)) !== null) {
      if (match[1]) {
        // Exact phrase in quotes
        terms.push({ type: 'exact', value: match[1] });
      } else if (match[2] && match[3]) {
        // Field:value
        terms.push({ type: 'field', field: match[2], value: match[3] });
      } else if (match[4]) {
        // Regular term
        const term = match[4];
        if (term.toUpperCase() === 'AND' || term.toUpperCase() === 'OR' || term.toUpperCase() === 'NOT') {
          terms.push({ type: 'operator', value: term.toUpperCase() });
        } else if (term.startsWith('-')) {
          terms.push({ type: 'exclude', value: term.substring(1) });
        } else {
          terms.push({ type: 'term', value: term });
        }
      }
    }

    return terms;
  }

  buildSearchConditions(terms, columns) {
    const conditions = [];
    let currentOperator = 'AND';

    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];

      if (term.type === 'operator') {
        currentOperator = term.value;
        continue;
      }

      let condition = '';

      switch (term.type) {
        case 'exact':
          const exactConditions = columns.map(col => `${col} LIKE ?`).join(' OR ');
          condition = `(${exactConditions})`;
          break;

        case 'field':
          const fieldCol = columns.find(col => 
            col.toLowerCase().includes(term.field.toLowerCase()) ||
            term.field.toLowerCase().includes(col.toLowerCase())
          );
          if (fieldCol) {
            condition = `${fieldCol} LIKE ?`;
          } else {
            // If field not found, search in all columns
            condition = columns.map(col => `${col} LIKE ?`).join(' OR ');
            condition = `(${condition})`;
          }
          break;

        case 'exclude':
        case 'term':
          const termConditions = columns.map(col => `${col} LIKE ?`).join(' OR ');
          condition = `(${termConditions})`;
          if (term.type === 'exclude') {
            condition = `NOT ${condition}`;
          }
          break;
      }

      if (condition) {
        if (conditions.length > 0) {
          conditions.push(`${currentOperator} ${condition}`);
        } else {
          conditions.push(condition);
        }
      }
    }

    return conditions.join(' ');
  }

  getSearchParams(terms) {
    const params = [];

    for (const term of terms) {
      if (term.type === 'operator') continue;

      const searchValue = `%${term.value}%`;

      switch (term.type) {
        case 'exact':
          // For exact search, add the parameter for each column
          for (let i = 0; i < 10; i++) { // Assuming max 10 columns per table
            params.push(searchValue);
          }
          break;

        case 'field':
          params.push(searchValue);
          break;

        case 'exclude':
        case 'term':
          // Add parameter for each column
          for (let i = 0; i < 10; i++) { // Assuming max 10 columns per table
            params.push(searchValue);
          }
          break;
      }
    }

    return params;
  }

  async search(query, options = {}) {
    const startTime = Date.now();
    const results = [];

    try {
      console.log('🔍 Recherche:', query);

      const terms = this.parseSearchQuery(query);
      console.log('📝 Termes analysés:', terms);

      // For demo purposes, return mock data since we don't have the actual databases
      const mockResults = [
        {
          table: 'mytable',
          database: 'esolde',
          data: {
            matricule: '12345',
            nomprenom: 'DIALLO Amadou',
            cni: '1234567890123',
            telephone: '77 123 45 67'
          },
          primary_keys: { id: 1 },
          score: 0.95
        },
        {
          table: 'personne_concours',
          database: 'rhpolice',
          data: {
            prenom: 'Marie',
            nom: 'DUPONT',
            date_naiss: '1985-03-15',
            lieu_naiss: 'Dakar',
            sexe: 'F',
            adresse: '123 Rue de la Paix',
            email: 'marie.dupont@email.com',
            telephone: '76 987 65 43',
            cni: '9876543210987'
          },
          primary_keys: { id: 2 },
          score: 0.87
        }
      ];

      const executionTime = Date.now() - startTime;

      return {
        hits: mockResults,
        total: mockResults.length,
        execution_time: executionTime,
        query: query
      };

    } catch (error) {
      console.error('❌ Erreur de recherche:', error);
      throw error;
    }
  }

  async logSearch(userId, username, searchTerm, tablesSearched, resultsCount, executionTime, ipAddress, userAgent) {
    try {
      await database.query(`
        INSERT INTO search_logs (
          user_id, username, search_term, tables_searched,
          results_count, execution_time_ms, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId, username, searchTerm, JSON.stringify(tablesSearched),
        resultsCount, executionTime, ipAddress, userAgent
      ]);
    } catch (error) {
      console.error('❌ Erreur log recherche:', error);
    }
  }
}

export default new SearchService();