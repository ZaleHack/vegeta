import database from '../config/database.js';

class IdentificationRequest {
  static async create(data) {
    const { user_id, phone } = data;
    const result = await database.query(
      `INSERT INTO autres.identification_requests (user_id, phone, status) VALUES (?, ?, 'pending')`,
      [user_id, phone]
    );
    return { id: result.insertId, user_id, phone, status: 'pending' };
  }

  static async findAll() {
    return database.query(
      `SELECT r.*, u.login as user_login FROM autres.identification_requests r
       LEFT JOIN autres.users u ON r.user_id = u.id
       ORDER BY r.created_at DESC`
    );
  }

  static async findByUser(user_id) {
    return database.query(
      `SELECT * FROM autres.identification_requests WHERE user_id = ? ORDER BY created_at DESC`,
      [user_id]
    );
  }

  static async updateStatus(id, status, profile_id = null) {
    await database.query(
      `UPDATE autres.identification_requests SET status = ?, profile_id = ? WHERE id = ?`,
      [status, profile_id, id]
    );
    return database.queryOne(
      `SELECT * FROM autres.identification_requests WHERE id = ?`,
      [id]
    );
  }
}

export default IdentificationRequest;
