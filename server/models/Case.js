import database from '../config/database.js';

class Case {
  static async create(name) {
    const result = await database.query(
      'INSERT INTO autres.cdr_cases (name, created_at) VALUES (?, NOW())',
      [name]
    );
    return { id: result.insertId, name };
  }

  static async findById(id) {
    const rows = await database.query(
      'SELECT * FROM autres.cdr_cases WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findAll() {
    return await database.query('SELECT * FROM autres.cdr_cases ORDER BY created_at DESC');
  }

  static async delete(id) {
    await database.query('DELETE FROM autres.cdr_cases WHERE id = ?', [id]);
  }

  static async addFile(caseId, filename) {
    await database.query(
      'INSERT INTO autres.cdr_case_files (case_id, filename, uploaded_at) VALUES (?, ?, NOW())',
      [caseId, filename]
    );
  }

  static async listFiles(caseId) {
    return await database.query(
      'SELECT id, filename, uploaded_at FROM autres.cdr_case_files WHERE case_id = ? ORDER BY uploaded_at DESC',
      [caseId]
    );
  }
}

export default Case;
