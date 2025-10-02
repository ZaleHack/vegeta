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

    return await database.transaction(async ({ query, queryOne }) => {
      const fallbackDivision = await queryOne(
        'SELECT id FROM autres.divisions WHERE id != ? ORDER BY id ASC LIMIT 1',
        [divisionId]
      );

      const { count: userCount = 0 } =
        (await queryOne(
          'SELECT COUNT(*) AS count FROM autres.users WHERE division_id = ?',
          [divisionId]
        )) ?? {};

      if (userCount > 0 && !fallbackDivision?.id) {
        const error = new Error(
          "Impossible de supprimer la division: des utilisateurs y sont encore affectés et aucune division de remplacement n'est disponible."
        );
        error.code = 'DIVISION_DELETE_FORBIDDEN';
        throw error;
      }

      let detachedUsers = 0;

      if (fallbackDivision?.id) {
        const detachResult = await query(
          'UPDATE autres.users SET division_id = ? WHERE division_id = ?',
          [fallbackDivision.id, divisionId]
        );
        detachedUsers = detachResult.affectedRows ?? 0;
      }

      const { count: remainingUsers = 0 } =
        (await queryOne(
          'SELECT COUNT(*) AS count FROM autres.users WHERE division_id = ?',
          [divisionId]
        )) ?? {};

      if (remainingUsers > 0) {
        const nullifyResult = await query(
          'UPDATE autres.users SET division_id = NULL WHERE division_id = ?',
          [divisionId]
        );
        detachedUsers += nullifyResult.affectedRows ?? 0;
      }

      const result = await query(
        'DELETE FROM autres.divisions WHERE id = ?',
        [divisionId]
      );

      return {
        removed: result.affectedRows > 0,
        detachedUsers
      };
    });
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
