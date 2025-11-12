import database from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import baseCatalog from '../config/tables-catalog.js';
import InMemoryCache from '../utils/cache.js';
import {
  getRealtimeCdrTableIdentifiers,
  REALTIME_CDR_TABLE_METADATA
} from '../config/realtime-table.js';

const MISSING_TABLE_ERROR_CODES = ['ER_NO_SUCH_TABLE', 'ER_BAD_TABLE_ERROR'];

const EXCLUDED_SEARCH_TABLES = new Set(
  [
    'autres.blacklist',
    'autres.divisions',
    'autres.profiles',
    'autres.profile_attachments',
    'autres.profile_shares',
    'autres.structuresanctions',
    'autres.structuresanction',
    'autres.search_logs',
    'autres.search_sync_events',
    'autres.upload_history',
    'autres.users',
    'autres.users_log',
    'autres.user_logs',
    'autres.user_sessions',
    'blacklist',
    'divisions',
    'profiles',
    'profile_attachments',
    'profile_shares',
    'structuresanctions',
    'structuresanction',
    'search_logs',
    'search_sync_events',
    'upload_history',
    'users',
    'users_log',
    'user_logs',
    'user_sessions'
  ].map((name) => name.toLowerCase())
);

const shouldExcludeRealtimeCdr =
  process.env.EXCLUDE_REALTIME_CDR_FROM_SEARCH === 'true';

if (shouldExcludeRealtimeCdr) {
  const realtimeExclusions = getRealtimeCdrTableIdentifiers();
  const realtimeSchema = REALTIME_CDR_TABLE_METADATA.schema;
  const realtimeTable = REALTIME_CDR_TABLE_METADATA.table;

  if (realtimeSchema && realtimeTable) {
    realtimeExclusions.add(`${realtimeSchema}.${realtimeTable}`.toLowerCase());
  }

  for (const entry of realtimeExclusions) {
    EXCLUDED_SEARCH_TABLES.add(entry);
    const [, withoutSchema = entry] = entry.split('.');
    if (withoutSchema) {
      EXCLUDED_SEARCH_TABLES.add(withoutSchema);
    }
  }
}

const UNIQUE_SEARCH_FIELDS = new Set(
  [
    'CNI',
    'cni',
    'NIN',
    'nin',
    'Phone',
    'PHONE',
    'TELEPHONE',
    'Telephone',
    'Numero',
    'NUMERO',
    'Telephone1',
    'Telephone2',
    'TELEPHONE1',
    'TELEPHONE2',
    'PassePort',
    'PASSEPORT',
    'Passeport',
    'Email',
    'EMAIL',
    'mail',
    'Mail',
    'MAIL'
  ].map((field) => field.toLowerCase())
);

const resolveMaxExtraSearches = () => {
  const rawValue = process.env.SEARCH_MAX_EXTRA_SEARCHES ?? process.env.SEARCH_MAX_EXTRA_QUERIES;
  if (rawValue === undefined) {
    return 5;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 5;
  }

  return Math.floor(parsed);
};

const MAX_EXTRA_SEARCHES = resolveMaxExtraSearches();

class SearchService {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.catalogPath = path.join(__dirname, '../config/tables-catalog.json');
    this.cache = new InMemoryCache();
    this.catalog = this.loadCatalog();
    this.primaryKeyCache = new Map();
    this.columnCache = new Map();
    if (fs.existsSync(this.catalogPath)) {
      fs.watch(this.catalogPath, () => this.refreshCatalog());
    }
  }

  formatTableName(tableName) {
    if (typeof tableName !== 'string' || tableName.trim() === '') {
      return tableName;
    }

    return tableName
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .map((segment) => `\`${segment.replace(/`/g, '``')}\``)
      .join('.');
  }

  isTableExcluded(tableName) {
    if (!tableName) {
      return false;
    }

    const normalized = String(tableName).toLowerCase();
    if (EXCLUDED_SEARCH_TABLES.has(normalized)) {
      return true;
    }

    const [, withoutSchema = normalized] = normalized.split('.');
    return EXCLUDED_SEARCH_TABLES.has(withoutSchema);
  }

  normalizeFieldName(field) {
    if (typeof field !== 'string') {
      return field;
    }
    return field.toLowerCase();
  }

  normalizeIdentifierForMatching(name) {
    if (typeof name !== 'string') {
      return '';
    }
    return name.replace(/[\s_-]/g, '').toLowerCase();
  }

  quoteIdentifier(name) {
    if (typeof name !== 'string') {
      return name;
    }
    return `\`${name.replace(/`/g, '``')}\``;
  }

  buildSelectClause(column, alias) {
    const quotedColumn = this.quoteIdentifier(column);
    if (!alias || alias === column) {
      return quotedColumn;
    }
    return `${quotedColumn} AS ${this.quoteIdentifier(alias)}`;
  }

  getFieldValue(record, field) {
    if (!record || field === undefined || field === null) {
      return undefined;
    }

    if (typeof field === 'string') {
      const normalized = this.normalizeFieldName(field);
      if (normalized && Object.prototype.hasOwnProperty.call(record, normalized)) {
        return record[normalized];
      }
      if (Object.prototype.hasOwnProperty.call(record, field)) {
        return record[field];
      }
    }

    return record[field];
  }

  getColumnNameFromRow(row) {
    if (!row || typeof row !== 'object') {
      return null;
    }

    return (
      row.column_name ||
      row.column ||
      row.field ||
      row.Field ||
      row.COLUMN_NAME ||
      row.COLUMN ||
      row.name ||
      null
    );
  }

  getNormalizedColumnName(row) {
    const name = this.getColumnNameFromRow(row);
    if (typeof name === 'string') {
      return name.toLowerCase();
    }
    return null;
  }

  async getTableColumns(tableName) {
    if (this.columnCache.has(tableName)) {
      return this.columnCache.get(tableName);
    }

    try {
      const formattedTable = this.formatTableName(tableName);
      const rows = await database.query(
        `SHOW COLUMNS FROM ${formattedTable}`,
        [],
        {
          suppressErrorCodes: MISSING_TABLE_ERROR_CODES,
          suppressErrorLog: true,
        }
      );
      const columns = rows
        .map((row) => this.getColumnNameFromRow(row))
        .filter((name) => typeof name === 'string');

      const lookup = new Map();
      for (const column of columns) {
        lookup.set(column, column);
        lookup.set(column.toLowerCase(), column);
        lookup.set(this.normalizeIdentifierForMatching(column), column);
      }

      const info = { columns, lookup };
      this.columnCache.set(tableName, info);
      return info;
    } catch (error) {
      console.warn(
        `⚠️ Impossible de récupérer les colonnes pour ${tableName}:`,
        error.message
      );
      this.columnCache.set(tableName, null);
      return null;
    }
  }

  resolveColumnFromInfo(field, columnInfo) {
    if (!field) {
      return null;
    }

    if (!columnInfo) {
      return field;
    }

    const { lookup, columns } = columnInfo;
    if (lookup.has(field)) {
      return lookup.get(field);
    }

    const lower = field.toLowerCase();
    if (lookup.has(lower)) {
      return lookup.get(lower);
    }

    const normalized = this.normalizeIdentifierForMatching(field);
    if (lookup.has(normalized)) {
      return lookup.get(normalized);
    }

    for (const column of columns) {
      const normalizedColumn = this.normalizeIdentifierForMatching(column);
      if (normalizedColumn === normalized) {
        return column;
      }
    }

    for (const column of columns) {
      const normalizedColumn = this.normalizeIdentifierForMatching(column);
      if (
        normalizedColumn.includes(normalized) ||
        normalized.includes(normalizedColumn)
      ) {
        return column;
      }
    }

    return null;
  }

  mapFields(fieldList, columnInfo) {
    const mapped = [];
    const seenAliases = new Set();

    for (const field of fieldList) {
      if (!field || seenAliases.has(field)) {
        continue;
      }

      const column = this.resolveColumnFromInfo(field, columnInfo);
      if (!column) {
        continue;
      }

      mapped.push({ column, alias: field });
      seenAliases.add(field);
    }

    return mapped;
  }

  fieldsMatch(termField, candidate) {
    if (!termField || !candidate) {
      return false;
    }

    const termLower = termField.toLowerCase();
    const candidateLower = candidate.toLowerCase();

    if (termLower === candidateLower) {
      return true;
    }

    if (
      candidateLower.includes(termLower) ||
      termLower.includes(candidateLower)
    ) {
      return true;
    }

    const normalizedTerm = this.normalizeIdentifierForMatching(termField);
    const normalizedCandidate = this.normalizeIdentifierForMatching(candidate);

    if (normalizedTerm === normalizedCandidate) {
      return true;
    }

    return (
      normalizedCandidate.includes(normalizedTerm) ||
      normalizedTerm.includes(normalizedCandidate)
    );
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
      this.primaryKeyCache.set(tableName, config.primaryKey);
      return config.primaryKey;
    }

    if (this.primaryKeyCache.has(tableName)) {
      return this.primaryKeyCache.get(tableName);
    }
    try {
      const formattedTable = this.formatTableName(tableName);
      const rows = await database.query(
        `SHOW KEYS FROM ${formattedTable} WHERE Key_name = 'PRIMARY'`,
        [],
        {
          suppressErrorCodes: MISSING_TABLE_ERROR_CODES,
          suppressErrorLog: true,
        }
      );
      if (rows.length > 0) {
        const primaryRow = rows.find((row) => this.getColumnNameFromRow(row));
        const pk = this.getColumnNameFromRow(primaryRow || rows[0]);
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
      const formattedTable = this.formatTableName(tableName);
      const columns = await database.query(
        `SHOW COLUMNS FROM ${formattedTable}`,
        [],
        {
          suppressErrorCodes: MISSING_TABLE_ERROR_CODES,
          suppressErrorLog: true,
        }
      );
      const columnDetails = columns
        .map((col) => ({
          original: this.getColumnNameFromRow(col),
          normalized: this.getNormalizedColumnName(col)
        }))
        .filter((col) => col.original);
      const idColumn = columnDetails.find((col) => col.normalized === 'id');
      const fallback =
        idColumn?.original ||
        config.searchable?.[0] ||
        config.preview?.[0] ||
        columnDetails[0]?.original ||
        'id';
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
    const searchableCatalogEntries = Object.entries(catalog).filter(
      ([tableName]) => !this.isTableExcluded(tableName)
    );

    if (!query || query.trim().length === 0) {
      throw new Error('Le terme de recherche ne peut pas être vide');
    }

    const offset = (page - 1) * limit;
    const searchTerms = this.parseSearchQuery(query);

    // Lancer les recherches en parallèle sur toutes les tables du catalogue
    const searchPromises = searchableCatalogEntries.map(
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
        const enrichedResults = tableResults.map(result => ({
          ...result,
          table_name: tableName
        }));
        results.push(...enrichedResults);
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

    // Recherche supplémentaire pour les champs uniques trouvés dans les résultats
    if (depth === 0 && MAX_EXTRA_SEARCHES !== 0) {
      const extraValueCandidates = [];
      const seenExtraValues = new Set();
      const queryNormalized = String(query).trim().toLowerCase();

      for (const res of results) {
        const preview = res.preview || {};
        for (const [key, value] of Object.entries(preview)) {
          const normalizedKey = this.normalizeFieldName(key);
          if (!UNIQUE_SEARCH_FIELDS.has(normalizedKey)) {
            continue;
          }

          const valueStr = String(value).trim();
          if (!valueStr) {
            continue;
          }

          const normalizedValue = valueStr.toLowerCase();
          if (normalizedValue === queryNormalized) {
            continue;
          }

          if (!seenExtraValues.has(normalizedValue)) {
            seenExtraValues.add(normalizedValue);
            extraValueCandidates.push(valueStr);
          }
        }
      }

      const limitedExtraValues =
        MAX_EXTRA_SEARCHES > 0
          ? extraValueCandidates.slice(0, MAX_EXTRA_SEARCHES)
          : extraValueCandidates;

      let extraValueSearches = 0;

      for (const val of limitedExtraValues) {
        const normalizedValue = val.toLowerCase();
        if (normalizedValue === queryNormalized) {
          continue;
        }

        if (MAX_EXTRA_SEARCHES > 0 && extraValueSearches >= MAX_EXTRA_SEARCHES) {
          break;
        }

        extraSearches++;
        extraValueSearches++;
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
      const tableIdentifier = r.table_name || `${r.database}:${r.table}`;
      const key = `${tableIdentifier}:${Object.values(r.primary_keys || {}).join(':')}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      }
    }
    const uniqueResults = Array.from(uniqueMap.values());

    // Tri, fusion et pagination des résultats
    const sortedResults = this.sortResults(uniqueResults);
    const totalResults = sortedResults.length;
    const paginatedResults = sortedResults.slice(offset, offset + limit);
    const sanitizedHits = paginatedResults.map(({ linkedFields, ...rest }) => rest);

    const executionTime = Date.now() - startTime;

    const response = {
      total: totalResults,
      page: page,
      limit: limit,
      pages: Math.ceil(totalResults / limit),
      elapsed_ms: executionTime,
      hits: sanitizedHits,
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
      const formattedTable = this.formatTableName(tableName);
      await database.query(
        `SELECT 1 FROM ${formattedTable} LIMIT 1`,
        [],
        {
          suppressErrorCodes: MISSING_TABLE_ERROR_CODES,
          suppressErrorLog: true,
        }
      );
    } catch (error) {
      console.warn(`⚠️ Table ${tableName} non accessible:`, error.message);
      return results;
    }

    const columnInfo = await this.getTableColumns(tableName);
    const tableColumns = Array.isArray(columnInfo?.columns)
      ? columnInfo.columns.filter(Boolean)
      : [];

    const resolvedPrimaryColumn =
      this.resolveColumnFromInfo(primaryKey, columnInfo) ||
      tableColumns[0] ||
      primaryKey;

    const fields = new Set([
      ...tableColumns,
      ...(config.preview || []),
      ...(config.linkedFields || []),
      ...(config.searchable || []),
      primaryKey,
    ].filter(Boolean));

    const mappedSelectFields = this.mapFields(Array.from(fields), columnInfo);

    if (
      !mappedSelectFields.some((field) => field.alias === primaryKey) &&
      resolvedPrimaryColumn
    ) {
      mappedSelectFields.push({ column: resolvedPrimaryColumn, alias: primaryKey });
    }

    if (mappedSelectFields.length === 0) {
      return results;
    }

    const selectFields = mappedSelectFields
      .map(({ column, alias }) => this.buildSelectClause(column, alias))
      .join(', ');

    const combinedSearchFields = [
      ...(Array.isArray(tableColumns) ? tableColumns : []),
      ...(config.searchable || []),
      ...(config.preview || []),
      ...(config.linkedFields || []),
    ].filter((field) => typeof field === 'string' && field.toLowerCase() !== 'id');

    let searchableMappings = this.mapFields(combinedSearchFields, columnInfo);

    if (searchableMappings.length === 0) {
      const fallbackColumns = Array.from(fields).filter(
        (field) => typeof field === 'string' && field.toLowerCase() !== 'id'
      );

      searchableMappings = fallbackColumns.map((column) => ({
        column,
        alias: column,
      }));
    }

    if (searchableMappings.length === 0) {
      return results;
    }

    const searchableColumns = searchableMappings.map(({ column }) => column);
    const searchableAliases = searchableMappings.map(({ alias }) => alias);

    const formattedTable = this.formatTableName(tableName);
    let sql = `SELECT ${selectFields} FROM ${formattedTable} WHERE `;
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
        for (const field of searchableColumns) {
          termConditions.push(`${this.quoteIdentifier(field)} = ?`);
          params.push(term.value);
        }
      } else if (term.type === 'required') {
        // Terme obligatoire (doit être présent)
        for (const field of searchableColumns) {
          termConditions.push(`${this.quoteIdentifier(field)} LIKE ?`);
          params.push(`${term.value}%`);
        }
      } else if (term.type === 'field') {
        // Recherche par champ spécifique
        const matchingFields = searchableMappings.filter(({ alias, column }) =>
          this.fieldsMatch(term.field, alias) ||
          this.fieldsMatch(term.field, column)
        );

        if (matchingFields.length > 0) {
          for (const { column } of matchingFields) {
            termConditions.push(`${this.quoteIdentifier(column)} LIKE ?`);
            params.push(`${term.value}%`);
          }
        } else {
          const resolvedColumn = this.resolveColumnFromInfo(
            term.field,
            columnInfo
          );
          if (resolvedColumn) {
            termConditions.push(
              `${this.quoteIdentifier(resolvedColumn)} LIKE ?`
            );
            params.push(`${term.value}%`);
          }
        }
      } else if (term.type === 'normal') {
        // Recherche normale dans tous les champs
        for (const field of searchableColumns) {
          termConditions.push(`${this.quoteIdentifier(field)} LIKE ?`);
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
      for (const field of searchableColumns) {
        excludeConditions.push(`${this.quoteIdentifier(field)} NOT LIKE ?`);
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
        const primaryValue = this.getFieldValue(row, primaryKey);
        results.push({
          table: config.display,
          database: config.database,
          preview: preview,
          primary_keys: { [primaryKey]: primaryValue },
          score: this.calculateRelevanceScore(row, searchTerms, searchableAliases),
          linkedFields: config.linkedFields || []
        });
      }
    } catch (error) {
      console.error(`❌ Erreur SQL table ${tableName}:`, error.message);
    }

    return results;
  }

  buildPreview(record, config) {
    if (!record || typeof record !== 'object') {
      return {};
    }

    const preview = {};

    const setValue = (field, value) => {
      if (!field) {
        return;
      }

      const normalizedField = typeof field === 'string' ? field.toLowerCase() : String(field);
      if (normalizedField === 'id') {
        return;
      }

      if (value === null || value === undefined || value === '') {
        return;
      }

      if (Buffer.isBuffer(value)) {
        preview[field] = value.toString('utf8');
        return;
      }

      if (value instanceof Date) {
        preview[field] = value.toISOString();
        return;
      }

      preview[field] = value;
    };

    Object.entries(record).forEach(([field, value]) => {
      setValue(field, value);
    });

    if (Object.keys(preview).length === 0 && config) {
      const fields = new Set([...(config.preview || []), ...(config.linkedFields || [])]);
      fields.forEach((field) => {
        const value = this.getFieldValue(record, field);
        setValue(field, value);
      });
    }

    return preview;
  }

  calculateRelevanceScore(record, searchTerms, searchableFields) {
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
      
      for (const field of searchableFields) {
        const value = this.getFieldValue(record, field);
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

  async getRecordDetails(tableName, id) {
    const catalog = this.catalog;
    if (!catalog[tableName]) {
      throw new Error('Table non autorisée');
    }

    const primaryKey = await this.getPrimaryKey(tableName, catalog[tableName]);
    const formattedTable = this.formatTableName(tableName);
    const quotedPrimaryKey = this.quoteIdentifier(primaryKey);
    const sql = `SELECT * FROM ${formattedTable} WHERE ${quotedPrimaryKey} = ?`;
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