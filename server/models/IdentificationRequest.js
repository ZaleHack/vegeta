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
    const rows = await database.query(
      `SELECT r.*, u.login as user_login,
              p.first_name as profile_first_name,
              p.last_name as profile_last_name,
              p.phone as profile_phone,
              p.email as profile_email,
              p.comment as profile_comment,
              p.extra_fields as profile_extra_fields,
              p.photo_path as profile_photo_path
         FROM autres.identification_requests r
         LEFT JOIN autres.users u ON r.user_id = u.id
         LEFT JOIN autres.profiles p ON r.profile_id = p.id
         ORDER BY r.created_at DESC`
    );
    return rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      phone: row.phone,
      status: row.status,
      profile_id: row.profile_id,
      created_at: row.created_at,
      user_login: row.user_login,
      profile: row.profile_id ? {
        id: row.profile_id,
        first_name: row.profile_first_name,
        last_name: row.profile_last_name,
        phone: row.profile_phone,
        email: row.profile_email,
        comment: row.profile_comment,
        extra_fields: row.profile_extra_fields
          ? JSON.parse(row.profile_extra_fields)
          : [],
        photo_path: row.profile_photo_path
      } : null
    }));
  }

  static async findByUser(user_id) {
    const rows = await database.query(
      `SELECT r.*,
              p.first_name as profile_first_name,
              p.last_name as profile_last_name,
              p.phone as profile_phone,
              p.email as profile_email,
              p.comment as profile_comment,
              p.extra_fields as profile_extra_fields,
              p.photo_path as profile_photo_path
         FROM autres.identification_requests r
         LEFT JOIN autres.profiles p ON r.profile_id = p.id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC`,
      [user_id]
    );
    return rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      phone: row.phone,
      status: row.status,
      profile_id: row.profile_id,
      created_at: row.created_at,
      profile: row.profile_id ? {
        id: row.profile_id,
        first_name: row.profile_first_name,
        last_name: row.profile_last_name,
        phone: row.profile_phone,
        email: row.profile_email,
        comment: row.profile_comment,
        extra_fields: row.profile_extra_fields
          ? JSON.parse(row.profile_extra_fields)
          : [],
        photo_path: row.profile_photo_path
      } : null
    }));
  }

  static async findById(id) {
    return database.queryOne(
      `SELECT * FROM autres.identification_requests WHERE id = ?`,
      [id]
    );
  }

  static async delete(id) {
    await database.query(
      `DELETE FROM autres.identification_requests WHERE id = ?`,
      [id]
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
