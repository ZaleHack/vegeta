const RAW_EXCLUDED_TABLES = [
  'autres.profile_attachments',
  'autres.profile_shares',
  'autres.upload_history',
  'autres.users',
  'autres.user_logs',
  'autres.user_sessions',
  'autres.search_logs',
  'autres.blacklist',
  'autres.leaks',
  'autres.sanctions',
  'autres.notifications',
  'autres.identification_requests',
  'autres.profiles',
  'autres.cdr_cases',
  'autres.cdr_case_files',
  'autres.cdr_case_shares',
  'autres.cdr_de_test',
  'autres.cdr_records',
  'profile_attachments',
  'profile_shares',
  'upload_history',
  'users',
  'user_logs',
  'user_sessions',
  'search_logs',
  'blacklist',
  'leaks',
  'sanctions',
  'notifications',
  'identification_requests',
  'profiles',
  'cdr_cases',
  'cdr_case_files',
  'cdr_case_shares',
  'cdr_de_test',
  'cdr_records'
];

const normalizeTableName = (name = '') => {
  if (!name) {
    return '';
  }

  const trimmed = String(name).trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes('.')) {
    const [schema, ...tableParts] = trimmed.split('.');
    if (!schema || tableParts.length === 0) {
      return trimmed.toLowerCase();
    }
    const table = tableParts.join('.');
    return `${schema.trim()}.${table.trim()}`.toLowerCase();
  }

  if (trimmed.includes('_')) {
    const [schema, ...tableParts] = trimmed.split('_');
    if (!schema || tableParts.length === 0) {
      return trimmed.toLowerCase();
    }
    return `${schema.trim()}.${tableParts.join('_').trim()}`.toLowerCase();
  }

  return trimmed.toLowerCase();
};

const EXCLUDED_TABLES = new Set(
  RAW_EXCLUDED_TABLES.map((table) => normalizeTableName(table)).filter(Boolean)
);

export const isTableExcluded = (tableName = '') => {
  const normalized = normalizeTableName(tableName);
  if (!normalized) {
    return false;
  }

  return EXCLUDED_TABLES.has(normalized);
};

export { EXCLUDED_TABLES, normalizeTableName };

