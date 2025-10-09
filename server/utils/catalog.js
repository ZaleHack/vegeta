import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import baseCatalog from '../config/tables-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CUSTOM_CATALOG_PATH = path.join(__dirname, '../config/tables-catalog.json');

const normalizeKey = (key = '') => {
  if (!key) {
    return { schema: null, table: null, qualifiedName: null };
  }

  if (key.includes('.')) {
    const [schema, ...tableParts] = key.split('.');
    const table = tableParts.join('.');
    const qualifiedName = schema && table ? `${schema}.${table}` : null;
    return { schema, table, qualifiedName };
  }

  const [schema, ...tableParts] = key.split('_');
  const table = tableParts.join('_');
  const qualifiedName = schema && table ? `${schema}.${table}` : null;
  return { schema, table, qualifiedName };
};

export const loadCatalog = () => {
  const catalog = {};

  const applyEntry = (qualifiedName, entry = {}) => {
    if (!qualifiedName) {
      return;
    }

    const existing = catalog[qualifiedName] || {};
    const merged = { ...existing, ...entry };

    if (!merged.database) {
      merged.database = qualifiedName.split('.')[0];
    }

    if (!merged.display) {
      merged.display = qualifiedName.split('.')[1] || qualifiedName;
    }

    catalog[qualifiedName] = merged;
  };

  Object.entries(baseCatalog).forEach(([key, value]) => {
    const { qualifiedName } = normalizeKey(key);
    applyEntry(qualifiedName, value);
  });

  try {
    if (fs.existsSync(CUSTOM_CATALOG_PATH)) {
      const raw = fs.readFileSync(CUSTOM_CATALOG_PATH, 'utf-8');
      const json = JSON.parse(raw);
      Object.entries(json).forEach(([key, value]) => {
        const { qualifiedName } = normalizeKey(key);
        applyEntry(qualifiedName, value);
      });
    }
  } catch (error) {
    console.error('❌ Erreur chargement catalogue personnalisé:', error);
  }

  return catalog;
};

export const watchCatalog = (callback) => {
  if (typeof callback !== 'function') {
    return () => {};
  }

  if (!fs.existsSync(CUSTOM_CATALOG_PATH)) {
    return () => {};
  }

  const watcher = fs.watch(CUSTOM_CATALOG_PATH, { persistent: false }, () => {
    try {
      callback();
    } catch (error) {
      console.error('❌ Erreur lors du rechargement du catalogue:', error);
    }
  });

  return () => {
    try {
      watcher.close();
    } catch (_) {}
  };
};

export const resolveTableComponents = (tableName = '') => {
  if (!tableName || !tableName.includes('.')) {
    return {
      schema: null,
      table: null,
      qualifiedName: tableName || null
    };
  }

  const [schema, ...tableParts] = tableName.split('.');
  const table = tableParts.join('.');
  return {
    schema,
    table,
    qualifiedName: `${schema}.${table}`
  };
};

export const enumerateDatabases = (catalog = loadCatalog()) => {
  const databases = new Map();

  Object.entries(catalog).forEach(([key, entry = {}]) => {
    const { schema, table } = resolveTableComponents(key);
    if (!schema || !table) {
      return;
    }

    const existing = databases.get(schema) || { tables: new Set(), entries: [] };
    existing.tables.add(table);
    existing.entries.push({
      key,
      table,
      schema,
      config: entry
    });
    databases.set(schema, existing);
  });

  return Array.from(databases.entries()).map(([schema, value]) => ({
    schema,
    tables: Array.from(value.tables).sort(),
    entries: value.entries
  }));
};

export default loadCatalog;
