const encryptedTables = {
  'autres.profiles': {
    primaryKey: 'id',
    columns: {
      first_name: {},
      last_name: {},
      phone: {},
      email: {},
      comment: {},
      extra_fields: {
        serialize: (value) => {
          if (value === null || value === undefined) {
            return null;
          }
          if (typeof value === 'string') {
            return value;
          }
          return JSON.stringify(value);
        },
        deserialize: (value) => {
          if (value === null || value === undefined || value === '') {
            return [];
          }
          if (typeof value !== 'string') {
            return value;
          }
          try {
            return JSON.parse(value);
          } catch (error) {
            return value;
          }
        },
        defaultValue: []
      }
    }
  },
  'autres.users': {
    primaryKey: 'id',
    columns: {
      otp_secret: {}
    }
  },
  'autres.cdr_cases': {
    primaryKey: 'id',
    columns: {
      name: {}
    }
  },
  'autres.notifications': {
    primaryKey: 'id',
    columns: {
      data: {
        serialize: (value) => {
          if (value === null || value === undefined) {
            return null;
          }
          if (typeof value === 'string') {
            return value;
          }
          return JSON.stringify(value);
        },
        deserialize: (value) => {
          if (value === null || value === undefined || value === '') {
            return null;
          }
          if (typeof value !== 'string') {
            return value;
          }
          try {
            return JSON.parse(value);
          } catch (error) {
            return value;
          }
        }
      }
    }
  }
};

export default encryptedTables;

export function getTableEncryptionConfig(tableName) {
  return encryptedTables[tableName] || null;
}

export function getEncryptedColumns(tableName) {
  const config = getTableEncryptionConfig(tableName);
  if (!config) {
    return [];
  }
  return Object.keys(config.columns || {});
}

export function getColumnConfig(tableName, column) {
  const tableConfig = getTableEncryptionConfig(tableName);
  if (!tableConfig) {
    return null;
  }
  return tableConfig.columns?.[column] || null;
}

export function isColumnEncrypted(tableName, column) {
  return Boolean(getColumnConfig(tableName, column));
}

export function listEncryptedTables() {
  return Object.keys(encryptedTables);
}

