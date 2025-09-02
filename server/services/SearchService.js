import database from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import baseCatalog from '../config/tables-catalog.js';
import InMemoryCache from '../utils/cache.js';

class SearchService {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.catalogPath = path.join(__dirname, '../config/tables-catalog.json');
    this.cache = new InMemoryCache();
    this.catalog = this.loadCatalog();
    this.primaryKeyCache = new Map();
    if (fs.existsSync(this.catalogPath)) {
      fs.watch(this.catalogPath, () => this.refreshCatalog());
    }
  }

  extractLinkedIdentifiers(results) {
    const identifiers = new Set();
    for (const result of results) {
      const fields = result.linkedFields || [];
      for (const field of fields) {
        const value = result.preview?.[field];
        if (value) {
          identifiers.add(value);
        }
      }
    }
    return Array.from(identifiers);
  }

  loadCatalog() {
    let catalog = { ...baseCatalog };
    try {
      if (fs.existsSync(this.catalogPath)) {
        const raw = fs.readFileSync(this.catalogPath, 'utf-8');
        const json = JSON.parse(raw);
        for (const [key, value] of Object.entries(json)) {
          const [db, ...tableParts] = key.split('_');
          const tableName = `${db}.${tableParts.join('_')}`;
          catalog[tableName] = value;
        }
      }
    } catch (error) {
      console.error('❌ Erreur chargement catalogue:', error);
    }
    return catalog;
  }

  refreshCatalog() {
    this.catalog = this.loadCatalog();
  }

  async getPrimaryKey(tableName, config = {}) {
    if (config.primaryKey) {
      return config.primaryKey;
    }

    if (this.primaryKeyCache.has(tableName)) {
      return this.primaryKeyCache.get(tableName);
    }
    try {
      const rows = await database.query(
        `SHOW KEYS FROM ${tableName} WHERE Key_name = 'PRIMARY'`
      );
      if (rows.length > 0 && rows[0].Column_name) {
        const pk = rows[0].Column_name;
        this.primaryKeyCache.set(tableName, pk);
        return pk;
      }
    } catch (error) {
      console.warn(
        `⚠️ Impossible de déterminer la clé primaire pour ${tableName}:`,
        error.message
      );
    }

    try {
      const columns = await database.query(
        `SHOW COLUMNS FROM ${tableName}`
      );
      const hasId = columns.some((col) => col.Field === 'id');
      const fallback =
        hasId
          ? 'id'
          : config.searchable?.[0] ||
            config.preview?.[0] ||
            (columns[0] ? columns[0].Field : 'id');
      this.primaryKeyCache.set(tableName, fallback);
      return fallback;
    } catch (error) {
      console.warn(
        `⚠️ Impossible de récupérer les colonnes pour ${tableName}:`,
        error.message
      );
      const fallback = config.searchable?.[0] || config.preview?.[0] || 'id';
      this.primaryKeyCache.set(tableName, fallback);
      return fallback;
    }
  }

  async search(
    query,
    filters = {},
    page = 1,
    limit = 20,
    user = null,
    searchType = 'global',
    options = {}
  ) {
    const {
      followLinks = false,
      maxDepth = 1,
      depth = 0,
      seen = new Set()
    } = options;

    let cacheKey;
    if (depth === 0) {
      cacheKey = JSON.stringify({ query, filters, page, limit, searchType });
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const startTime = Date.now();
    const results = [];
    const tablesSearched = [];
    const catalog = this.catalog;

    if (!query || query.trim().length === 0) {
      throw new Error('Le terme de recherche ne peut pas être vide');
    }

    const offset = (page - 1) * limit;
    const searchTerms = this.parseSearchQuery(query);

    console.log('🔍 Recherche:', { query, searchTerms, filters });

    // Lancer les recherches en parallèle sur toutes les tables du catalogue
    const searchPromises = Object.entries(catalog).map(
      ([tableName, config]) =>
        this.searchInTable(tableName, config, searchTerms, filters)
          .then((tableResults) => ({ tableName, tableResults }))
          .catch((error) => {
            console.error(`❌ Erreur recherche table ${tableName}:`, error.message);
            return { tableName, tableResults: [] };
          }),
    );

    const tableSearches = await Promise.all(searchPromises);
    for (const { tableName, tableResults } of tableSearches) {
      if (tableResults.length > 0) {
        console.log(`✅ ${tableResults.length} résultats trouvés dans ${tableName}`);
        results.push(...tableResults);
        tablesSearched.push(tableName);
      }
    }

    let extraSearches = 0;
    const identifiersFollowed = [];

    if (followLinks && depth < maxDepth) {
      const linkedIds = this.extractLinkedIdentifiers(results);
      for (const id of linkedIds) {
        if (!seen.has(id)) {
          seen.add(id);
          extraSearches++;
          identifiersFollowed.push(id);
          const sub = await this.search(id, {}, 1, 50, null, 'linked', {
            followLinks,
            maxDepth,
            depth: depth + 1,
            seen
          });
          results.push(...sub.hits);
          tablesSearched.push(...sub.tables_searched);
        }
      }
    }

    // Recherche supplémentaire pour les valeurs CNI, TET ou téléphone trouvées
    if (depth === 0) {
      const extraValues = new Set();
      const phoneRegex = /^tel(ephone)?\d*$/i;
      for (const res of results) {
        const preview = res.preview || {};
        for (const [key, value] of Object.entries(preview)) {
          const keyLower = key.toLowerCase();
          if (
            (keyLower === 'cni' ||
              keyLower === 'tet' ||
              phoneRegex.test(keyLower)) &&
            value
          ) {
            extraValues.add(value);
          }
        }
      }

      for (const val of extraValues) {
        extraSearches++;
        const sub = await this.search(val, {}, 1, 50, null, 'linked', {
          depth: depth + 1
        });
        results.push(...sub.hits);
        tablesSearched.push(...sub.tables_searched);
      }
    }

    // Déduplication des résultats combinés
    const uniqueMap = new Map();
    for (const r of results) {
      const key = `${r.database}:${r.table}:${Object.values(r.primary_keys || {}).join(':')}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      }
    }
    const uniqueResults = Array.from(uniqueMap.values());

    // Tri, fusion et pagination des résultats
    const sortedResults = this.sortResults(uniqueResults);
    const totalResults = sortedResults.length;
    const paginatedResults = sortedResults.slice(offset, offset + limit);

    const executionTime = Date.now() - startTime;

    console.log(
      `🎯 Recherche terminée: ${totalResults} résultats en ${executionTime}ms`
    );

    // Journalisation
    if (user && depth === 0) {
      await this.logSearch({
        user_id: user.id,
        username: user.login,
        search_term: query,
        search_type: searchType,
        filters: JSON.stringify(filters),
        tables_searched: JSON.stringify([...new Set(tablesSearched)]),
        results_count: totalResults,
        execution_time_ms: executionTime,
        ip_address: user.ip_address || '',
        user_agent: user.user_agent || '',
        extra_searches: extraSearches,
        linked_identifiers: identifiersFollowed
      });
    }

    const response = {
      total: totalResults,
      page: page,
      limit: limit,
      pages: Math.ceil(totalResults / limit),
      elapsed_ms: executionTime,
      hits: paginatedResults,
      tables_searched: [...new Set(tablesSearched)]
    };

    if (depth === 0) {
      this.cache.set(cacheKey, response);
    }

    return response;
  }

  parseSearchQuery(query) {
    const terms = [];
    
    // Gestion des guillemets pour les phrases exactes
    const quotedPhrases = [];
    let cleanQuery = query;
    
    // Extraire les phrases entre guillemets
    const quoteMatches = query.match(/"[^"]+"/g);
    if (quoteMatches) {
      quoteMatches.forEach((match, index) => {
        const placeholder = `__QUOTED_${index}__`;
        quotedPhrases.push(match.slice(1, -1)); // Enlever les guillemets
        cleanQuery = cleanQuery.replace(match, placeholder);
      });
    }
    
    // Diviser par espaces en préservant les opérateurs
    const words = cleanQuery.split(/\s+/);

    for (let word of words) {
      word = word.trim();
      if (word.length === 0) continue;

      // Restaurer les phrases quotées
      if (word.startsWith('__QUOTED_')) {
        const index = parseInt(word.match(/\d+/)[0]);
        terms.push({ type: 'exact', value: quotedPhrases[index] });
      } else if (word.startsWith('-')) {
        // Exclusion
        const excludeValue = word.slice(1);
        if (excludeValue.startsWith('__QUOTED_')) {
          const index = parseInt(excludeValue.match(/\d+/)[0]);
          terms.push({ type: 'exclude', value: quotedPhrases[index] });
        } else {
          terms.push({ type: 'exclude', value: excludeValue });
        }
      } else if (word.startsWith('+')) {
        // Terme obligatoire
        terms.push({ type: 'required', value: word.slice(1) });
      } else if (word.includes(':')) {
        // Recherche par champ
        const [field, ...valueParts] = word.split(':');
        const value = valueParts.join(':'); // Au cas où il y aurait plusieurs ':'
        terms.push({ type: 'field', field: field.toLowerCase(), value: value });
      } else if (word.toUpperCase() === 'AND' || word.toUpperCase() === 'ET') {
        terms.push({ type: 'operator', value: 'AND' });
      } else if (word.toUpperCase() === 'OR' || word.toUpperCase() === 'OU') {
        terms.push({ type: 'operator', value: 'OR' });
      } else {
        // Terme normal
        terms.push({ type: 'normal', value: word });
      }
    }

    return terms;
  }

  async searchInTable(tableName, config, searchTerms, filters) {
    const results = [];
    const primaryKey = await this.getPrimaryKey(tableName, config);
    
    // Vérifier si la table existe
    try {
      await database.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
    } catch (error) {
      console.warn(`⚠️ Table ${tableName} non accessible:`, error.message);
      return results;
    }

    const fields = new Set([
      ...(config.preview || []),
      ...(config.linkedFields || []),
      ...(config.searchable || []),
      primaryKey,
    ]);
    const selectFields = Array.from(fields).join(', ');
    let sql = `SELECT ${selectFields} FROM ${tableName} WHERE `;
    const params = [];
    let conditions = [];
    let currentGroup = [];
    let operator = 'AND'; // Opérateur par défaut

    for (const term of searchTerms) {
      if (term.type === 'exclude') continue; // Traité séparément
      if (term.type === 'operator') {
        // Changer l'opérateur pour les prochains termes
        if (currentGroup.length > 0) {
          conditions.push(`(${currentGroup.join(' OR ')})`);
          currentGroup = [];
        }
        operator = term.value;
        continue;
      }

      const termConditions = [];

      if (term.type === 'exact') {
        // Recherche exacte
        for (const field of config.searchable) {
          termConditions.push(`${field} = ?`);
          params.push(term.value);
        }
      } else if (term.type === 'required') {
        // Terme obligatoire (doit être présent)
        for (const field of config.searchable) {
          termConditions.push(`${field} LIKE ?`);
          params.push(`${term.value}%`);
        }
      } else if (term.type === 'field') {
        // Recherche par champ spécifique
        const matchingFields = config.searchable.filter(field => 
          field.toLowerCase().includes(term.field) || 
          term.field.includes(field.toLowerCase())
        );
        
        if (matchingFields.length > 0) {
          for (const field of matchingFields) {
            termConditions.push(`${field} LIKE ?`);
            params.push(`${term.value}%`);
          }
        } else if (config.searchable.includes(term.field)) {
          termConditions.push(`${term.field} LIKE ?`);
          params.push(`${term.value}%`);
        }
      } else if (term.type === 'normal') {
        // Recherche normale dans tous les champs
        for (const field of config.searchable) {
          termConditions.push(`${field} LIKE ?`);
          params.push(`${term.value}%`);
        }
      }

      if (termConditions.length > 0) {
        if (term.type === 'required') {
          // Les termes obligatoires sont ajoutés directement
          conditions.push(`(${termConditions.join(' OR ')})`);
        } else {
          // Les autres termes sont groupés selon l'opérateur
          currentGroup.push(`(${termConditions.join(' OR ')})`);
        }
      }
    }
    
    // Ajouter le dernier groupe
    if (currentGroup.length > 0) {
      if (operator === 'OR') {
        conditions.push(`(${currentGroup.join(' OR ')})`);
      } else {
        conditions.push(...currentGroup);
      }
    }

    if (conditions.length === 0) {
      return results;
    }

    // Joindre les conditions avec AND par défaut
    sql += conditions.join(' AND ');

    // Gestion des exclusions
    const excludeTerms = searchTerms.filter(t => t.type === 'exclude');
    for (const term of excludeTerms) {
      const excludeConditions = [];
      for (const field of config.searchable) {
        excludeConditions.push(`${field} NOT LIKE ?`);
        params.push(`${term.value}%`);
      }
      if (excludeConditions.length > 0) {
        sql += ` AND (${excludeConditions.join(' AND ')})`;
      }
    }

    sql += ' LIMIT 50'; // Limite par table

    try {
      const rows = await database.query(sql, params);

      for (const row of rows) {
        const preview = this.buildPreview(row, config);
        results.push({
          table: config.display,
          database: config.database,
          preview: preview,
          primary_keys: { [primaryKey]: row[primaryKey] },
          score: this.calculateRelevanceScore(row, searchTerms, config),
          linkedFields: config.linkedFields || []
        });
      }
    } catch (error) {
      console.error(`❌ Erreur SQL table ${tableName}:`, error.message);
    }

    return results;
  }

  buildPreview(record, config) {
    const fields = new Set([...(config.preview || []), ...(config.linkedFields || [])]);
    const preview = {};

    fields.forEach(field => {
      const value = record[field];
      if (value !== null && value !== undefined && value !== '') {
        preview[field] = value;
      }
    });

    return preview;
  }

  calculateRelevanceScore(record, searchTerms, config) {
    let score = 0;
    let requiredTermsFound = 0;
    let requiredTermsTotal = 0;
    
    for (const term of searchTerms) {
      if (term.type === 'exclude' || term.type === 'operator') continue;
      
      if (term.type === 'required') {
        requiredTermsTotal++;
      }
      
      const searchValue = term.value.toLowerCase();
      let termFound = false;
      
      for (const field of config.searchable) {
        const value = record[field];
        if (!value) continue;
        
        const fieldValue = value.toString().toLowerCase();
        
        if (term.type === 'exact' && fieldValue === searchValue) {
          score += 15; // Score plus élevé pour les correspondances exactes
          termFound = true;
        } else if (fieldValue.includes(searchValue)) {
          const position = fieldValue.indexOf(searchValue);
          const lengthRatio = searchValue.length / fieldValue.length;
          let termScore = (10 - position * 0.1) * lengthRatio;
          
          // Bonus pour les correspondances au début du champ
          if (position === 0) {
            termScore *= 1.5;
          }
          
          // Bonus pour les termes obligatoires
          if (term.type === 'required') {
            termScore *= 2;
            termFound = true;
          }
          
          // Bonus pour les recherches par champ spécifique
          if (term.type === 'field') {
            termScore *= 1.3;
          }
          
          score += termScore;
        }
      }
      
      if (term.type === 'required' && termFound) {
        requiredTermsFound++;
      }
    }
    
    // Pénalité si tous les termes obligatoires ne sont pas trouvés
    if (requiredTermsTotal > 0) {
      const requiredRatio = requiredTermsFound / requiredTermsTotal;
      score *= requiredRatio;
    }
    
    return Math.round(score * 100) / 100;
  }

  sortResults(results) {
    const unique = new Map();
    for (const r of results) {
      const pk = r.primary_keys ? Object.values(r.primary_keys).join(':') : '';
      const key = `${r.database}.${r.table}:${pk}`;
      if (!unique.has(key)) {
        unique.set(key, r);
      }
    }
    return Array.from(unique.values()).sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.table.localeCompare(b.table);
    });
  }

  async logSearch(logData) {
    try {
      await database.query(
        `
        INSERT INTO autres.search_logs (
          user_id, username, search_term, search_type, tables_searched,
          results_count, execution_time_ms, ip_address, user_agent,
          extra_searches, linked_identifiers
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          logData.user_id,
          logData.username,
          logData.search_term,
          logData.search_type,
          logData.tables_searched,
          logData.results_count,
          logData.execution_time_ms,
          logData.ip_address,
          logData.user_agent,
          logData.extra_searches || 0,
          JSON.stringify(logData.linked_identifiers || [])
        ]
      );
    } catch (error) {
      console.error('❌ Erreur log recherche:', error);
    }
  }

  async getRecordDetails(tableName, id) {
    const catalog = this.catalog;
    if (!catalog[tableName]) {
      throw new Error('Table non autorisée');
    }

    const primaryKey = await this.getPrimaryKey(tableName, catalog[tableName]);
    const sql = `SELECT * FROM ${tableName} WHERE ${primaryKey} = ?`;
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
      table: catalog[tableName].display,
      database: catalog[tableName].database,
      details: details
    };
  }
}

export default SearchService;