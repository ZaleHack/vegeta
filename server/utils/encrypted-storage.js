import {
  encryptValue,
  decryptValue,
  isEncryptedValue
} from './encryption.js';
import encryptedTables, {
  getColumnConfig,
  getEncryptedColumns,
  getTableEncryptionConfig
} from '../config/encrypted-columns.js';

function serializeValue(tableName, column, value) {
  const columnConfig = getColumnConfig(tableName, column);
  if (!columnConfig?.serialize) {
    return value;
  }
  return columnConfig.serialize(value);
}

function deserializeValue(tableName, column, value) {
  const columnConfig = getColumnConfig(tableName, column);
  if (!columnConfig?.deserialize) {
    return value;
  }
  return columnConfig.deserialize(value);
}

export function encryptRecord(tableName, record) {
  const columns = getEncryptedColumns(tableName);
  if (columns.length === 0) {
    return { ...record };
  }
  const result = { ...record };
  for (const column of columns) {
    if (!(column in result)) {
      continue;
    }
    const serialized = serializeValue(tableName, column, result[column]);
    if (serialized === null || serialized === undefined) {
      result[column] = serialized;
      continue;
    }
    result[column] = encryptValue(serialized);
  }
  return result;
}

export function decryptRecord(tableName, record) {
  if (!record) {
    return record;
  }
  const columns = getEncryptedColumns(tableName);
  if (columns.length === 0) {
    return { ...record };
  }
  const result = { ...record };
  for (const column of columns) {
    const columnConfig = getColumnConfig(tableName, column);
    if (!(column in result)) {
      const defaultValue = columnConfig?.defaultValue;
      if (defaultValue !== undefined) {
        result[column] = Array.isArray(defaultValue)
          ? [...defaultValue]
          : defaultValue;
      }
      continue;
    }
    const value = result[column];
    if (value === null || value === undefined) {
      const defaultValue = columnConfig?.defaultValue;
      if (defaultValue !== undefined) {
        result[column] = Array.isArray(defaultValue)
          ? [...defaultValue]
          : defaultValue;
      }
      continue;
    }
    const decrypted = decryptValue(value);
    result[column] = deserializeValue(tableName, column, decrypted);
  }
  return result;
}

export function decryptRows(tableName, rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }
  return rows.map((row) => decryptRecord(tableName, row));
}

export function encryptColumnValue(tableName, column, value) {
  if (!isColumnEncrypted(tableName, column)) {
    return value;
  }
  const serialized = serializeValue(tableName, column, value);
  if (serialized === null || serialized === undefined) {
    return serialized;
  }
  return encryptValue(serialized);
}

export function decryptColumnValue(tableName, column, value) {
  if (!isColumnEncrypted(tableName, column)) {
    return value;
  }
  if (value === null || value === undefined) {
    return value;
  }
  const decrypted = decryptValue(value);
  return deserializeValue(tableName, column, decrypted);
}

export function isColumnEncrypted(tableName, column) {
  const tableConfig = getTableEncryptionConfig(tableName);
  if (!tableConfig) {
    return false;
  }
  return Boolean(tableConfig.columns?.[column]);
}

export function getEncryptedTableDefinitions() {
  return encryptedTables;
}

export function isValueEncrypted(value) {
  return isEncryptedValue(value);
}

