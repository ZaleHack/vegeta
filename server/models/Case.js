import database from '../config/database.js';

class Case {
  static async create(name) {
    const [result] = await database.query(
      'INSERT INTO autres.cdr_cases (name, created_at) VALUES (?, NOW())',
      [name]
    );
    return { id: result.insertId, name };
  }

  static async findById(id) {
    const [rows] = await database.query(
      'SELECT * FROM autres.cdr_cases WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }
}

export default Case;
