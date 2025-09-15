import database from '../config/database.js';

class UserLog {
  static async create({ user_id, action, details = null, duration_ms = null }) {
    await database.query(
      `INSERT INTO autres.user_logs (user_id, action, details, duration_ms) VALUES (?, ?, ?, ?)`,
      [user_id, action, details, duration_ms]
    );
  }

  static async getLogs(page = 1, limit = 20, username = '', userId = null) {
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (userId) {
      conditions.push('l.user_id = ?');
      params.push(userId);
    } else if (username) {
      conditions.push('u.login LIKE ?');
      params.push(`%${username}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const logs = await database.query(
      `SELECT l.*, u.login AS username
       FROM autres.user_logs l
       LEFT JOIN autres.users u ON l.user_id = u.id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totalRow = await database.queryOne(
      `SELECT COUNT(*) as count
       FROM autres.user_logs l
       LEFT JOIN autres.users u ON l.user_id = u.id
       ${where}`,
      params
    );

    return { rows: logs, total: totalRow?.count || 0 };
  }

  static async getLastAction(user_id, action) {
    return database.queryOne(
      `SELECT * FROM autres.user_logs WHERE user_id = ? AND action = ? ORDER BY created_at DESC LIMIT 1`,
      [user_id, action]
    );
  }
}

export default UserLog;
