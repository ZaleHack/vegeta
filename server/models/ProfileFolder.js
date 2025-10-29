import database from '../config/database.js';
import { ensureUserExists } from '../utils/foreign-key-helpers.js';
import { sanitizeLimit, sanitizeOffset } from '../utils/number-utils.js';

const TABLE = 'autres.profile_folders';

const BASE_SELECT = `
  SELECT
    f.*,
    u.login AS owner_login,
    u.division_id AS owner_division_id,
    COALESCE(pcounts.profiles_count, 0) AS profiles_count
  FROM ${TABLE} f
  LEFT JOIN autres.users u ON f.user_id = u.id
  LEFT JOIN (
    SELECT folder_id, COUNT(*) AS profiles_count
    FROM autres.profiles
    WHERE folder_id IS NOT NULL
    GROUP BY folder_id
  ) AS pcounts ON pcounts.folder_id = f.id
`;

class ProfileFolder {
  static async create({ user_id, name }) {
    if (!name || !name.trim()) {
      throw new Error('Nom du dossier requis');
    }
    const ownerId = await ensureUserExists(user_id);
    if (!ownerId) {
      throw new Error('Utilisateur introuvable');
    }
    const trimmedName = name.trim();
    const hasConflict = await this.existsWithName({ userId: ownerId, name: trimmedName });
    if (hasConflict) {
      throw new Error('Un dossier avec ce nom existe déjà');
    }
    const result = await database.query(
      `INSERT INTO ${TABLE} (user_id, name) VALUES (?, ?)`,
      [ownerId, trimmedName]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    if (!id) return null;
    const row = await database.queryOne(`${BASE_SELECT} WHERE f.id = ?`, [id]);
    return row ? { ...row, profiles_count: Number(row.profiles_count || 0) } : null;
  }

  static async update(id, data = {}) {
    if (!id) return null;
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Dossier introuvable');
    }
    const fields = [];
    const params = [];
    let targetOwnerId = existing.user_id;
    if (data.user_id !== undefined) {
      const ownerId = data.user_id === null ? null : await ensureUserExists(data.user_id);
      if (data.user_id !== null && !ownerId) {
        throw new Error('Utilisateur introuvable');
      }
      fields.push('user_id = ?');
      params.push(ownerId);
      targetOwnerId = ownerId;
    }
    if (data.name !== undefined) {
      const trimmed = typeof data.name === 'string' ? data.name.trim() : '';
      if (!trimmed) {
        throw new Error('Nom du dossier requis');
      }
      const ownerForCheck = targetOwnerId ?? existing.user_id;
      if (ownerForCheck) {
        const hasConflict = await this.existsWithName({
          userId: ownerForCheck,
          name: trimmed,
          excludeId: id
        });
        if (hasConflict) {
          throw new Error('Un dossier avec ce nom existe déjà');
        }
      }
      fields.push('name = ?');
      params.push(trimmed);
    }
    if (!fields.length) {
      return existing;
    }
    params.push(id);
    await database.query(`UPDATE ${TABLE} SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async delete(id, { ensureEmpty = true } = {}) {
    if (!id) return false;
    if (ensureEmpty) {
      const profiles = await database.queryOne(
        'SELECT COUNT(*) AS count FROM autres.profiles WHERE folder_id = ?',
        [id]
      );
      if (Number(profiles?.count || 0) > 0) {
        throw new Error('Impossible de supprimer un dossier contenant des profils');
      }
    }
    await database.query('DELETE FROM autres.profile_folder_shares WHERE folder_id = ?', [id]);
    await database.query(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return true;
  }

  static async findAccessible({ userId, isAdmin = false, search = '', limit = 50, offset = 0 }) {
    const filters = [];
    const params = [];

    if (!isAdmin) {
      filters.push(
        '(f.user_id = ? OR EXISTS (SELECT 1 FROM autres.profile_folder_shares pfs WHERE pfs.folder_id = f.id AND pfs.user_id = ?))'
      );
      params.push(userId, userId);
    }

    if (search) {
      const like = `%${search}%`;
      filters.push('f.name LIKE ?');
      params.push(like);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const safeLimit = sanitizeLimit(limit, { defaultValue: 50, min: 1, max: 100 });
    const safeOffset = sanitizeOffset(offset, { defaultValue: 0 });

    const rows = await database.query(
      `${BASE_SELECT}
       ${whereClause}
       ORDER BY f.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );
    const totalRow = await database.queryOne(
      `SELECT COUNT(*) AS count FROM ${TABLE} f ${whereClause}`,
      params
    );
    return {
      rows: rows.map(row => ({
        ...row,
        profiles_count: Number(row.profiles_count || 0)
      })),
      total: Number(totalRow?.count || 0)
    };
  }

  static async existsWithName({ userId, name, excludeId = null }) {
    if (!userId || !name) {
      return false;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return false;
    }
    const params = [userId, trimmed];
    let queryText = `SELECT id FROM ${TABLE} WHERE user_id = ? AND LOWER(name) = LOWER(?)`;
    if (excludeId) {
      queryText += ' AND id <> ?';
      params.push(excludeId);
    }
    queryText += ' LIMIT 1';
    const row = await database.queryOne(queryText, params);
    return Boolean(row);
  }
}

export default ProfileFolder;
