import database from '../config/database.js';

const PROFILE_BASE_SELECT = `
  SELECT
    p.*, 
    u.login AS owner_login,
    u.division_id AS owner_division_id
  FROM autres.profiles p
  LEFT JOIN autres.users u ON p.user_id = u.id
`;

class Profile {
  static async create(data) {
    const {
      user_id,
      first_name,
      last_name,
      phone,
      email,
      comment = '',
      extra_fields = [],
      photo_path
    } = data;
    const result = await database.query(
      `INSERT INTO autres.profiles (user_id, first_name, last_name, phone, email, comment, extra_fields, photo_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        first_name,
        last_name,
        phone,
        email,
        comment,
        JSON.stringify(extra_fields),
        photo_path
      ]
    );
    return { id: result.insertId, ...data };
  }

  static async findById(id) {
    return database.queryOne(`${PROFILE_BASE_SELECT} WHERE p.id = ?`, [id]);
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

  static buildAccessConditions({
    userId,
    divisionId,
    isAdmin,
    includeArchived,
    search
  }) {
    const conditions = [];
    const params = [];

    if (includeArchived) {
      conditions.push('p.archived_at IS NOT NULL');
    } else {
      conditions.push('p.archived_at IS NULL');
    }

    if (!isAdmin) {
      if (userId == null) {
        throw new Error('User id requis');
      }
      const normalizedDivisionId =
        divisionId !== undefined && divisionId !== null ? Number(divisionId) : null;
      if (normalizedDivisionId) {
        conditions.push('(p.user_id = ? OR u.division_id = ?)');
        params.push(userId, normalizedDivisionId);
      } else {
        conditions.push('p.user_id = ?');
        params.push(userId);
      }
    }

    if (search) {
      const like = `%${search}%`;
      conditions.push('(p.first_name LIKE ? OR p.last_name LIKE ? OR p.phone LIKE ?)');
      params.push(like, like, like);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  static async findAccessible({
    userId = null,
    divisionId = null,
    isAdmin = false,
    includeArchived = false,
    search = '',
    limit = 10,
    offset = 0
  }) {
    const { whereClause, params } = this.buildAccessConditions({
      userId,
      divisionId,
      isAdmin,
      includeArchived,
      search: search ? String(search) : ''
    });

    const rows = await database.query(
      `${PROFILE_BASE_SELECT}
       ${whereClause}
       ORDER BY p.archived_at IS NULL DESC, p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const totalRes = await database.queryOne(
      `SELECT COUNT(*) as count
       FROM autres.profiles p
       LEFT JOIN autres.users u ON p.user_id = u.id
       ${whereClause}`,
      params
    );

    return { rows, total: totalRes?.count ?? 0 };
  }

  static async findAll(userId = null, limit = 10, offset = 0, options = {}) {
    const { divisionId = null, isAdmin = false, includeArchived = false } = options;
    return this.findAccessible({ userId, divisionId, isAdmin, includeArchived, limit, offset });
  }

  static async searchByNameOrPhone(
    term,
    userId,
    isAdmin,
    limit = 10,
    offset = 0,
    divisionId = null,
    includeArchived = false
  ) {
    return this.findAccessible({
      userId,
      divisionId,
      isAdmin,
      includeArchived,
      search: term,
      limit,
      offset
    });
  }
}

export default Profile;
