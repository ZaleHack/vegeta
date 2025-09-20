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
    return await database.queryOne(
      `SELECT c.*, u.login AS user_login, u.division_id, d.name AS division_name
       FROM autres.cdr_cases c
       JOIN autres.users u ON c.user_id = u.id
       LEFT JOIN autres.divisions d ON u.division_id = d.id
       WHERE c.id = ?`,
      [id]
    );
  }

  static async findAllByUser(userId) {
    return await database.query(
      'SELECT * FROM autres.cdr_cases WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  static async findAll() {
    return await database.query(
      `SELECT c.*, u.login AS user_login, u.division_id, d.name AS division_name
       FROM autres.cdr_cases c
       JOIN autres.users u ON c.user_id = u.id
       LEFT JOIN autres.divisions d ON u.division_id = d.id
       ORDER BY c.created_at DESC`
    );
  }

  static async findAllForUser(userId) {
    return await database.query(
      `SELECT DISTINCT c.*, u.login AS user_login, u.division_id, d.name AS division_name,
              CASE WHEN c.user_id = ? THEN 1 ELSE 0 END AS is_owner
         FROM autres.cdr_cases c
         JOIN autres.users u ON c.user_id = u.id
         LEFT JOIN autres.divisions d ON u.division_id = d.id
         LEFT JOIN autres.cdr_case_shares s ON c.id = s.case_id AND s.user_id = ?
         WHERE c.user_id = ? OR s.user_id = ?
         ORDER BY c.created_at DESC`,
      [userId, userId, userId, userId]
    );
  }

  static async findByIdForUser(caseId, userId) {
    return await database.queryOne(
      `SELECT c.*, u.login AS user_login, u.division_id, d.name AS division_name,
              CASE WHEN c.user_id = ? THEN 1 ELSE 0 END AS is_owner
         FROM autres.cdr_cases c
         JOIN autres.users u ON c.user_id = u.id
         LEFT JOIN autres.divisions d ON u.division_id = d.id
         LEFT JOIN autres.cdr_case_shares s ON c.id = s.case_id AND s.user_id = ?
         WHERE c.id = ? AND (c.user_id = ? OR s.user_id = ?)
         LIMIT 1`,
      [userId, userId, caseId, userId, userId]
    );
  }

  static async getShareUserIds(caseId) {
    const rows = await database.query(
      `SELECT user_id FROM autres.cdr_case_shares WHERE case_id = ?`,
      [caseId]
    );
    return rows.map((row) => row.user_id);
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
