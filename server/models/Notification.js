import database from '../config/database.js';
import { ensureUserExists, handleMissingUserForeignKey } from '../utils/foreign-key-helpers.js';
import { sanitizeLimit } from '../utils/number-utils.js';

function serializeData(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

class Notification {
  static async create({ user_id, type, data = null }) {
    if (!type) {
      throw new Error('type is required');
    }
    if (user_id === undefined || user_id === null) {
      console.warn('Notification ignorée: user_id manquant');
      return null;
    }
    const safeUserId = await ensureUserExists(user_id);
    if (!safeUserId) {
      console.warn('Notification ignorée car utilisateur introuvable:', user_id);
      return null;
    }
    try {
      const result = await database.query(
        `INSERT INTO autres.notifications (user_id, type, data) VALUES (?, ?, ?)`,
        [safeUserId, type, serializeData(data)]
      );
      return { id: result.insertId, user_id: safeUserId, type, data };
    } catch (error) {
      const handled = await handleMissingUserForeignKey(error);
      if (handled) {
        return null;
      }
      throw error;
    }
  }

  static async findRecentByUser(userId, limit = 20) {
    if (!userId) {
      return [];
    }

    const safeLimit = sanitizeLimit(limit, { defaultValue: 20, min: 1, max: 100 });
    const rows = await database.query(
      `SELECT id, user_id, type, data, read_at, created_at
       FROM autres.notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${safeLimit}`,
      [userId]
    );
    return rows;
  }

  static async markAsRead(id, userId) {
    if (!id || !userId) return false;
    await database.query(
      `UPDATE autres.notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL`,
      [id, userId]
    );
    return true;
  }

  static async markManyAsRead(ids = [], userId) {
    if (!Array.isArray(ids) || ids.length === 0 || !userId) {
      return false;
    }
    const placeholders = ids.map(() => '?').join(',');
    await database.query(
      `UPDATE autres.notifications
         SET read_at = NOW()
       WHERE user_id = ? AND id IN (${placeholders}) AND read_at IS NULL`,
      [userId, ...ids]
    );
    return true;
  }
}

export default Notification;
