import { quoteIdentifier } from './sql.js';

const sanitizeTableName = (tableName = '') => {
  if (!tableName) {
    return '';
  }

  return tableName
    .toString()
    .replace(/`/g, '')
    .trim();
};

const addVariant = (set, value) => {
  if (!value) {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  if (!set.has(trimmed)) {
    set.add(trimmed);
  }
};

export const getTableNameCandidates = (tableName = '') => {
  const sanitized = sanitizeTableName(tableName);
  if (!sanitized) {
    return [];
  }

  const candidates = new Set();
  addVariant(candidates, sanitized);

  const lowerCased = sanitized.toLowerCase();
  if (lowerCased !== sanitized) {
    addVariant(candidates, lowerCased);
  }

  if (sanitized.includes('.')) {
    const [schema, ...tableParts] = sanitized.split('.');
    const table = tableParts.join('.');
    if (schema && table) {
      const schemaLower = schema.toLowerCase();
      const tableLower = table.toLowerCase();
      addVariant(candidates, `${schema}.${table}`);
      addVariant(candidates, `${schemaLower}.${tableLower}`);
      addVariant(candidates, table);
      addVariant(candidates, tableLower);

      const underscoredTable = table.replace(/\./g, '_');
      addVariant(candidates, `${schema}_${underscoredTable}`);
      addVariant(candidates, `${schemaLower}_${underscoredTable.toLowerCase()}`);
    }
  } else if (sanitized.includes('_')) {
    const [schema, ...tableParts] = sanitized.split('_');
    if (schema && tableParts.length > 0) {
      const table = tableParts.join('_');
      const schemaLower = schema.toLowerCase();
      const tableLower = table.toLowerCase();
      addVariant(candidates, `${schema}.${table}`);
      addVariant(candidates, `${schemaLower}.${tableLower}`);
    }
  }

  return Array.from(candidates);
};

export const getEscapedTableNameCandidates = (tableName = '') => {
  return getTableNameCandidates(tableName).map((name) => ({
    raw: name,
    escaped: quoteIdentifier(name)
  }));
};

