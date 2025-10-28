import database from '../config/database.js';
import { ensureProfileFolderExists, filterExistingUserIds } from '../utils/foreign-key-helpers.js';

class ProfileFolderShare {
  static async getUserIds(folderId) {
    if (!folderId) return [];
    const rows = await database.query(
      'SELECT user_id FROM autres.profile_folder_shares WHERE folder_id = ?',
      [folderId]
    );
    return rows.map(row => row.user_id);
  }

  static async getSharesForFolders(folderIds = []) {
    const map = new Map();
    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      return map;
    }
    const uniqueIds = Array.from(new Set(folderIds.filter(id => Number.isInteger(Number(id)))));
    if (!uniqueIds.length) {
      return map;
    }
    const placeholders = uniqueIds.map(() => '?').join(',');
    const rows = await database.query(
      `SELECT folder_id, user_id FROM autres.profile_folder_shares WHERE folder_id IN (${placeholders})`,
      uniqueIds
    );
    for (const row of rows) {
      if (!map.has(row.folder_id)) {
        map.set(row.folder_id, []);
      }
      map.get(row.folder_id).push(row.user_id);
    }
    return map;
  }

  static async replaceShares(folderId, userIds) {
    if (!folderId) {
      return { added: [], removed: [] };
    }
    const validFolderId = await ensureProfileFolderExists(folderId);
    if (!validFolderId) {
      return { added: [], removed: [] };
    }
    const normalized = Array.isArray(userIds)
      ? Array.from(new Set(userIds.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)))
      : [];
    const current = await this.getUserIds(validFolderId);
    const toRemove = current.filter(id => !normalized.includes(id));
    let toAdd = normalized.filter(id => !current.includes(id));

    if (toAdd.length > 0) {
      toAdd = await filterExistingUserIds(toAdd);
    }

    if (toRemove.length > 0) {
      const placeholders = toRemove.map(() => '?').join(',');
      await database.query(
        `DELETE FROM autres.profile_folder_shares WHERE folder_id = ? AND user_id IN (${placeholders})`,
        [validFolderId, ...toRemove]
      );
    }

    for (const userId of toAdd) {
      await database.query(
        `INSERT INTO autres.profile_folder_shares (folder_id, user_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)` ,
        [validFolderId, userId]
      );
    }

    return { added: toAdd, removed: toRemove };
  }

  static async isSharedWithUser(folderId, userId) {
    if (!folderId || !userId) return false;
    const row = await database.queryOne(
      'SELECT 1 FROM autres.profile_folder_shares WHERE folder_id = ? AND user_id = ? LIMIT 1',
      [folderId, userId]
    );
    return Boolean(row);
  }
}

export default ProfileFolderShare;
