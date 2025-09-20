import database from '../config/database.js';

class CaseShare {
  static async getUserIds(caseId) {
    if (!caseId) return [];
    const rows = await database.query(
      `SELECT user_id FROM autres.cdr_case_shares WHERE case_id = ?`,
      [caseId]
    );
    return rows.map((row) => row.user_id);
  }

  static async getSharesForCases(caseIds = []) {
    const map = new Map();
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return map;
    }
    const placeholders = caseIds.map(() => '?').join(',');
    const rows = await database.query(
      `SELECT case_id, user_id FROM autres.cdr_case_shares WHERE case_id IN (${placeholders})`,
      caseIds
    );
    for (const row of rows) {
      if (!map.has(row.case_id)) {
        map.set(row.case_id, []);
      }
      map.get(row.case_id).push(row.user_id);
    }
    return map;
  }

  static async replaceShares(caseId, userIds) {
    if (!caseId) {
      return { added: [], removed: [] };
    }
    const normalized = Array.isArray(userIds)
      ? Array.from(new Set(userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)))
      : [];
    const current = await this.getUserIds(caseId);
    const toRemove = current.filter((id) => !normalized.includes(id));
    const toAdd = normalized.filter((id) => !current.includes(id));

    if (toRemove.length > 0) {
      const placeholders = toRemove.map(() => '?').join(',');
      await database.query(
        `DELETE FROM autres.cdr_case_shares WHERE case_id = ? AND user_id IN (${placeholders})`,
        [caseId, ...toRemove]
      );
    }

    for (const userId of toAdd) {
      await database.query(
        `INSERT INTO autres.cdr_case_shares (case_id, user_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)`,
        [caseId, userId]
      );
    }

    return { added: toAdd, removed: toRemove };
  }

  static async isSharedWithUser(caseId, userId) {
    if (!caseId || !userId) return false;
    const row = await database.queryOne(
      `SELECT 1 FROM autres.cdr_case_shares WHERE case_id = ? AND user_id = ? LIMIT 1`,
      [caseId, userId]
    );
    return Boolean(row);
  }
}

export default CaseShare;
