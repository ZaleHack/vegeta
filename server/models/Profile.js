import database from '../config/database.js';
import {
  normalizeExtraFields,
  normalizeProfileRecord,
  normalizeProfileRows,
  serializeExtraFields
} from '../utils/profile-normalizer.js';

const PROFILES_TABLE = 'autres.profiles';

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
        comment ?? '',
        serializeExtraFields(extra_fields),
        photo_path
      ]
    );
    return {
      id: result.insertId,
      user_id,
      first_name,
      last_name,
      phone,
      email,
      comment: comment ?? '',
      extra_fields: normalizeExtraFields(extra_fields),
      photo_path
    };
  }

  static async findById(id) {
    const row = await database.queryOne(`${PROFILE_BASE_SELECT} WHERE p.id = ?`, [id]);
    return normalizeProfileRecord(row);
  }

  static async update(id, data) {
    const fields = [];
    const params = [];
    if (data.first_name !== undefined) {
      fields.push('first_name = ?');
      params.push(data.first_name);
    }
    if (data.last_name !== undefined) {
      fields.push('last_name = ?');
      params.push(data.last_name);
    }
    if (data.phone !== undefined) {
      fields.push('phone = ?');
      params.push(data.phone);
    }
    if (data.email !== undefined) {
      fields.push('email = ?');
      params.push(data.email);
    }
    if (data.comment !== undefined) {
      fields.push('comment = ?');
      params.push(data.comment ?? '');
    }
    if (data.extra_fields !== undefined) {
      fields.push('extra_fields = ?');
      params.push(serializeExtraFields(data.extra_fields));
    }
    if (data.photo_path !== undefined) {
      fields.push('photo_path = ?');
      params.push(data.photo_path);
    }
    if (data.user_id !== undefined) {
      fields.push('user_id = ?');
      params.push(data.user_id);
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

  static buildAccessConditions({ userId, divisionId, isAdmin, search }) {
    const conditions = [];
    const params = [];

    if (!isAdmin) {
      if (userId == null) {
        throw new Error('User id requis');
      }
      conditions.push(
        '(p.user_id = ? OR EXISTS (SELECT 1 FROM autres.profile_shares ps WHERE ps.profile_id = p.id AND ps.user_id = ?))'
      );
      params.push(userId, userId);
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
    search = '',
    limit = 10,
    offset = 0
  }) {
    const { whereClause, params } = this.buildAccessConditions({
      userId,
      divisionId,
      isAdmin,
      search: search ? String(search) : ''
    });

    const rows = await database.query(
      `${PROFILE_BASE_SELECT}
       ${whereClause}
       ORDER BY p.created_at DESC
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

    return { rows: normalizeProfileRows(rows), total: totalRes?.count ?? 0 };
  }

  static async findAll(userId = null, limit = 10, offset = 0, options = {}) {
    const { divisionId = null, isAdmin = false } = options;
    return this.findAccessible({ userId, divisionId, isAdmin, limit, offset });
  }

  static async searchByNameOrPhone(
    term,
    userId,
    isAdmin,
    limit = 10,
    offset = 0,
    divisionId = null
  ) {
    return this.findAccessible({
      userId,
      divisionId,
      isAdmin,
      search: term,
      limit,
      offset
    });
  }
}

export default Profile;
