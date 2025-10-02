import database from '../config/database.js';

export const ensureUserExists = async (userId) => {
  if (userId === undefined || userId === null) {
    return null;
  }
  const existing = await database.queryOne(
    'SELECT id FROM autres.users WHERE id = ? LIMIT 1',
    [userId]
  );
  return existing ? existing.id : null;
};

export const ensureCaseExists = async (caseId) => {
  if (caseId === undefined || caseId === null) {
    return null;
  }
  const existing = await database.queryOne(
    'SELECT id FROM autres.cdr_cases WHERE id = ? LIMIT 1',
    [caseId]
  );
  return existing ? existing.id : null;
};

export const ensureProfileExists = async (profileId) => {
  if (profileId === undefined || profileId === null) {
    return null;
  }
  const existing = await database.queryOne(
    'SELECT id FROM autres.profiles WHERE id = ? LIMIT 1',
    [profileId]
  );
  return existing ? existing.id : null;
};

export const filterExistingUserIds = async (userIds = []) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await database.query(
    `SELECT id FROM autres.users WHERE id IN (${placeholders})`,
    userIds
  );
  const validIds = new Set(rows.map((row) => row.id));
  return userIds.filter((id) => validIds.has(id));
};

export const handleMissingUserForeignKey = async (error, fallbackInsert) => {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.code === 'ER_NO_REFERENCED_ROW') {
    if (typeof fallbackInsert === 'function') {
      await fallbackInsert();
    }
    return true;
  }
  return false;
};
