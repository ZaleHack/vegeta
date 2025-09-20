import database from '../config/database.js';

class Notification {
  static async create({ user_id, type, data = null }) {
    if (!user_id || !type) {
      throw new Error('user_id and type are required');
    }
    const payload = data ? JSON.stringify(data) : null;
    const result = await database.query(
      `INSERT INTO autres.notifications (user_id, type, data) VALUES (?, ?, ?)`,
      [user_id, type, payload]
    );
    return { id: result.insertId, user_id, type, data };
  }

  static async findRecentByUser(userId, limit = 20) {
    if (!userId) {
      return [];
    }
    return await database.query(
      `SELECT id, user_id, type, data, read_at, created_at
       FROM autres.notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
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
