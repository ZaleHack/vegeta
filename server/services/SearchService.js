import database from '../config/database.js';

class SearchService {
  constructor() {
    // Configuration des tables disponibles pour la recherche
    this.searchableTables = {
      'esolde_mytable': {
        name: 'Esolde - Personnel',
        columns: ['matricule', 'nomprenom', 'cni', 'telephone'],
        searchColumns: ['matricule', 'nomprenom', 'cni', 'telephone']
      },
      'rhpolice_personne_concours': {
        name: 'RH Police - Concours',
        columns: ['prenom', 'nom', 'date_naiss', 'lieu_naiss', 'sexe', 'adresse', 'email', 'telephone', 'cni'],
        searchColumns: ['prenom', 'nom', 'cni', 'telephone', 'email']
      }
    };
  }

  async search(searchTerm, filters = {}, userId = null) {
    const startTime = Date.now();
    const results = {};
    let totalResults = 0;

    try {
      console.log('🔍 Recherche:', { searchTerm, filters });

      // Rechercher dans chaque table
      for (const [tableName, tableConfig] of Object.entries(this.searchableTables)) {
        try {
          const tableResults = await this.searchInTable(tableName, tableConfig, searchTerm, filters);
          if (tableResults.length > 0) {
            results[tableName] = {
              name: tableConfig.name,
              data: tableResults,
              count: tableResults.length
            };
            totalResults += tableResults.length;
          }
        } catch (error) {
          console.error(`Erreur recherche dans ${tableName}:`, error);
        }
      }

      const executionTime = Date.now() - startTime;

      // Enregistrer le log de recherche
      if (userId) {
        this.logSearch(userId, searchTerm, filters, Object.keys(results), totalResults, executionTime);
      }

      console.log(`✅ Recherche terminée: ${totalResults} résultats en ${executionTime}ms`);

      return {
        results,
        totalResults,
        executionTime,
        searchTerm
      };

    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      throw error;
    }
  }

  async searchInTable(tableName, tableConfig, searchTerm, filters) {
    try {
      let query = `SELECT * FROM ${tableName}`;
      let params = [];
      let conditions = [];

      // Construire les conditions de recherche
      if (searchTerm && searchTerm.trim()) {
        const searchConditions = tableConfig.searchColumns.map(column => 
          `${column} LIKE ?`
        ).join(' OR ');
        
        conditions.push(`(${searchConditions})`);
        
        // Ajouter le terme de recherche pour chaque colonne
        tableConfig.searchColumns.forEach(() => {
          params.push(`%${searchTerm.trim()}%`);
        });
      }

      // Ajouter les filtres
      if (filters && Object.keys(filters).length > 0) {
        for (const [key, value] of Object.entries(filters)) {
          if (value && tableConfig.columns.includes(key)) {
            conditions.push(`${key} LIKE ?`);
            params.push(`%${value}%`);
          }
        }
      }

      // Assembler la requête
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` LIMIT 100`; // Limiter les résultats

      console.log(`🔍 Requête ${tableName}:`, query);
      console.log(`📊 Paramètres:`, params);

      const results = database.query(query, params);
      console.log(`✅ ${tableName}: ${results.length} résultats`);

      return results;

    } catch (error) {
      console.error(`Erreur recherche dans ${tableName}:`, error);
      return [];
    }
  }

  logSearch(userId, searchTerm, filters, tablesSearched, resultsCount, executionTime) {
    try {
      database.query(`
        INSERT INTO search_logs (
          user_id, search_term, filters, tables_searched, 
          results_count, execution_time_ms, search_date
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        userId,
        searchTerm,
        JSON.stringify(filters),
        JSON.stringify(tablesSearched),
        resultsCount,
        executionTime
      ]);
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du log:', error);
    }
  }

  getSearchableTables() {
    return this.searchableTables;
  }
}

export default SearchService;