import database from '../config/database.js';
import { ensureUserExists, handleMissingUserForeignKey } from '../utils/foreign-key-helpers.js';
import { sanitizeLimit, sanitizeOffset, toSafeInteger } from '../utils/number-utils.js';

class UserSession {
  static async start(userId) {
    if (!userId) return null;
    const safeUserId = Number(userId);
    if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
      console.warn('Session utilisateur ignorée car identifiant invalide:', userId);
      return null;
    }
    try {
      const existingUserId = await ensureUserExists(safeUserId);
      if (!existingUserId) {
        console.warn('Session utilisateur ignorée car utilisateur introuvable:', userId);
        return null;
      }

      const result = await database.query(
        `INSERT INTO autres.user_sessions (user_id, login_at)
         VALUES (?, NOW())`,
        [existingUserId]
      );
      if (!result?.affectedRows) {
        console.warn('Session utilisateur ignorée car utilisateur introuvable:', userId);
        return null;
      }
      return { id: result.insertId, user_id: safeUserId };
    } catch (error) {
      const handled = await handleMissingUserForeignKey(error);
      if (!handled) {
        throw error;
      }
      return null;
    }
  }

  static async endLatest(userId) {
    if (!userId) return false;
    const latest = await database.queryOne(
      `SELECT id FROM autres.user_sessions WHERE user_id = ? AND logout_at IS NULL ORDER BY login_at DESC LIMIT 1`,
      [userId]
    );
    if (!latest) {
      return false;
    }
    await database.query(
      `UPDATE autres.user_sessions SET logout_at = NOW() WHERE id = ?`,
      [latest.id]
    );
    return true;
  }

  static async getSessions(page = 1, limit = 20, { username = '' } = {}) {
    const pageNumber = toSafeInteger(page, { defaultValue: 1, min: 1 });
    const safeLimit = sanitizeLimit(limit, { defaultValue: 20, min: 1, max: 200 });
    const offset = sanitizeOffset((pageNumber - 1) * safeLimit, { defaultValue: 0 });
    const params = [];
    let whereClause = '';

    if (username) {
      whereClause = 'WHERE u.login LIKE ?';
      params.push(`%${username}%`);
    }

    const rows = await database.query(
      `SELECT s.id, s.user_id, u.login AS username, s.login_at, s.logout_at,
              TIMESTAMPDIFF(SECOND, s.login_at, COALESCE(s.logout_at, NOW())) AS duration_seconds
         FROM autres.user_sessions s
         JOIN autres.users u ON s.user_id = u.id
         ${whereClause}
         ORDER BY s.login_at DESC
         LIMIT ${safeLimit} OFFSET ${offset}`,
      params
    );

    const totalRow = await database.queryOne(
      `SELECT COUNT(*) AS total
         FROM autres.user_sessions s
         JOIN autres.users u ON s.user_id = u.id
         ${whereClause}`,
      params
    );

    return {
      rows,
      total: totalRow?.total || 0
    };
  }
}

export default UserSession;
