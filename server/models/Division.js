import database from '../config/database.js';

class Division {
  static async findAll() {
    return await database.query(
      `SELECT id, name, created_at FROM autres.divisions ORDER BY name`
    );
  }

  static async findById(id) {
    return await database.queryOne(
      `SELECT id, name, created_at FROM autres.divisions WHERE id = ?`,
      [id]
    );
  }

  static async create(name) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) {
      throw new Error('Division name is required');
    }
    const result = await database.query(
      `INSERT INTO autres.divisions (name) VALUES (?)`,
      [trimmed]
    );
    return {
      id: result.insertId,
      name: trimmed
    };
  }

  static async delete(id) {
    const divisionId = Number(id);
    if (!Number.isInteger(divisionId) || divisionId <= 0) {
      throw new Error('Invalid division id');
    }

    const detachResult = await database.query(
      'UPDATE autres.users SET division_id = NULL WHERE division_id = ?',
      [divisionId]
    );

    const result = await database.query(
      'DELETE FROM autres.divisions WHERE id = ?',
      [divisionId]
    );

    return {
      removed: result.affectedRows > 0,
      detachedUsers: detachResult.affectedRows ?? 0
    };
  }

  static async findUsers(divisionId, { includeInactive = false } = {}) {
    if (!divisionId) {
      return [];
    }
    const condition = includeInactive ? '' : 'AND u.active = 1';
    return await database.query(
      `SELECT u.id, u.login, u.admin, u.active, u.created_at
       FROM autres.users u
       WHERE u.division_id = ? ${condition}
       ORDER BY u.login`,
      [divisionId]
    );
  }
}

export default Division;
