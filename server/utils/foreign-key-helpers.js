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

export const handleMissingUserForeignKey = async (error, fallbackInsert) => {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.code === 'ER_NO_REFERENCED_ROW') {
    if (typeof fallbackInsert === 'function') {
      await fallbackInsert();
    }
    return true;
  }
  return false;
};
