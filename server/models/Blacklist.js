import database from '../config/database.js';

class Blacklist {
  static async list() {
    return database.query('SELECT id, number, created_at FROM autres.blacklist ORDER BY created_at DESC');
  }

  static async add(number) {
    await database.query('INSERT IGNORE INTO autres.blacklist (number) VALUES (?)', [number]);
  }

  static async remove(id) {
    await database.query('DELETE FROM autres.blacklist WHERE id = ?', [id]);
  }

  static async exists(number) {
    const rows = await database.query('SELECT id FROM autres.blacklist WHERE number = ?', [number]);
    return rows.length > 0;
  }
}

export default Blacklist;
