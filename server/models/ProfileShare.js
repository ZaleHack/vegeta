import database from '../config/database.js';

class ProfileShare {
  static async getUserIds(profileId) {
    if (!profileId) return [];
    const rows = await database.query(
      `SELECT user_id FROM autres.profile_shares WHERE profile_id = ?`,
      [profileId]
    );
    return rows.map((row) => row.user_id);
  }

  static async getSharesForProfiles(profileIds = []) {
    const map = new Map();
    if (!Array.isArray(profileIds) || profileIds.length === 0) {
      return map;
    }
    const placeholders = profileIds.map(() => '?').join(',');
    const rows = await database.query(
      `SELECT profile_id, user_id FROM autres.profile_shares WHERE profile_id IN (${placeholders})`,
      profileIds
    );
    for (const row of rows) {
      if (!map.has(row.profile_id)) {
        map.set(row.profile_id, []);
      }
      map.get(row.profile_id).push(row.user_id);
    }
    return map;
  }

  static async replaceShares(profileId, userIds) {
    if (!profileId) {
      return { added: [], removed: [] };
    }
    const normalized = Array.isArray(userIds)
      ? Array.from(new Set(userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)))
      : [];
    const current = await this.getUserIds(profileId);
    const toRemove = current.filter((id) => !normalized.includes(id));
    const toAdd = normalized.filter((id) => !current.includes(id));

    if (toRemove.length > 0) {
      const placeholders = toRemove.map(() => '?').join(',');
      await database.query(
        `DELETE FROM autres.profile_shares WHERE profile_id = ? AND user_id IN (${placeholders})`,
        [profileId, ...toRemove]
      );
    }

    for (const userId of toAdd) {
      await database.query(
        `INSERT INTO autres.profile_shares (profile_id, user_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)`,
        [profileId, userId]
      );
    }

    return { added: toAdd, removed: toRemove };
  }

  static async isSharedWithUser(profileId, userId) {
    if (!profileId || !userId) return false;
    const row = await database.queryOne(
      `SELECT 1 FROM autres.profile_shares WHERE profile_id = ? AND user_id = ? LIMIT 1`,
      [profileId, userId]
    );
    return Boolean(row);
  }
}

export default ProfileShare;
