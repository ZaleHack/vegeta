import database from '../config/database.js';

class Profile {
  static async create(data) {
    const { user_id, first_name, last_name, phone, email, extra_fields = {}, photo_path } = data;
    const result = await database.query(
      `INSERT INTO autres.profiles (user_id, first_name, last_name, phone, email, extra_fields, photo_path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, first_name, last_name, phone, email, JSON.stringify(extra_fields), photo_path]
    );
    return { id: result.insertId, ...data };
  }

  static async findById(id) {
    return database.queryOne('SELECT * FROM autres.profiles WHERE id = ?', [id]);
  }

  static async findAll(userId = null, limit = 10, offset = 0) {
    let base = 'FROM autres.profiles';
    const params = [];
    if (userId) {
      base += ' WHERE user_id = ?';
      params.push(userId);
    }
    const rows = await database.query(
      `SELECT * ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRes = await database.queryOne(`SELECT COUNT(*) as count ${base}`, params);
    return { rows, total: totalRes.count };
  }

  static async update(id, data) {
    const fields = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      params.push(key === 'extra_fields' ? JSON.stringify(value) : value);
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    await database.query(`UPDATE autres.profiles SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async delete(id) {
    await database.query('DELETE FROM autres.profiles WHERE id = ?', [id]);
    return true;
  }

  static async searchByNameOrPhone(term, userId, isAdmin, limit = 10, offset = 0) {
    let base = 'FROM autres.profiles WHERE (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?)';
    const params = [`%${term}%`, `%${term}%`, `%${term}%`];
    if (!isAdmin) {
      base += ' AND user_id = ?';
      params.push(userId);
    }
    const rows = await database.query(
      `SELECT * ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRes = await database.queryOne(`SELECT COUNT(*) as count ${base}`, params);
    return { rows, total: totalRes.count };
  }
}

export default Profile;
