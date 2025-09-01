import database from '../config/database.js';

class Case {
  static async create(name, userId) {
    const result = await database.query(
      'INSERT INTO autres.cdr_cases (name, user_id, created_at) VALUES (?, ?, NOW())',
      [name, userId]
    );
    return { id: result.insertId, name, user_id: userId };
  }

  static async findById(id) {
    const rows = await database.query(
      'SELECT * FROM autres.cdr_cases WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findAllByUser(userId) {
    return await database.query(
      'SELECT * FROM autres.cdr_cases WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  static async findAll() {
    return await database.query('SELECT * FROM autres.cdr_cases ORDER BY created_at DESC');
  }

  static async delete(id) {
    await database.query('DELETE FROM autres.cdr_cases WHERE id = ?', [id]);
  }

  static async addFile(caseId, filename, cdrNumber, lineCount = 0) {
    const result = await database.query(
      'INSERT INTO autres.cdr_case_files (case_id, filename, cdr_number, line_count, uploaded_at) VALUES (?, ?, ?, ?, NOW())',
      [caseId, filename, cdrNumber, lineCount]
    );
    return { id: result.insertId };
  }

  static async updateFileLineCount(fileId, lineCount) {
    await database.query(
      'UPDATE autres.cdr_case_files SET line_count = ? WHERE id = ?',
      [lineCount, fileId]
    );
  }

  static async listFiles(caseId) {
    return await database.query(
      'SELECT id, filename, uploaded_at, line_count, cdr_number FROM autres.cdr_case_files WHERE case_id = ? ORDER BY uploaded_at DESC',
      [caseId]
    );
  }

  static async deleteFile(caseId, fileId) {
    await database.query(
      'DELETE FROM autres.cdr_case_files WHERE case_id = ? AND id = ?',
      [caseId, fileId]
    );
  }
}

export default Case;
