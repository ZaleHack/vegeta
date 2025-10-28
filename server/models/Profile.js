import database from '../config/database.js';
import { ensureUserExists, ensureProfileFolderExists } from '../utils/foreign-key-helpers.js';
import { sanitizeLimit, sanitizeOffset } from '../utils/number-utils.js';
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
    u.division_id AS owner_division_id,
    f.name AS folder_name
  FROM autres.profiles p
  LEFT JOIN autres.users u ON p.user_id = u.id
  LEFT JOIN autres.profile_folders f ON p.folder_id = f.id
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
      photo_path,
      folder_id
    } = data;
    const normalizedUserId = user_id !== undefined && user_id !== null ? await ensureUserExists(user_id) : null;
    if (user_id !== undefined && user_id !== null && !normalizedUserId) {
      throw new Error('Utilisateur introuvable');
    }
    const normalizedFolderId =
      folder_id !== undefined && folder_id !== null ? await ensureProfileFolderExists(folder_id) : null;
    if (folder_id !== undefined && folder_id !== null && !normalizedFolderId) {
      throw new Error('Dossier introuvable');
    }
    const result = await database.query(
      `INSERT INTO autres.profiles (user_id, folder_id, first_name, last_name, phone, email, comment, extra_fields, photo_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedUserId,
        normalizedFolderId,
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
      user_id: normalizedUserId,
      folder_id: normalizedFolderId,
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

  static async findByFolderId(folderId) {
    if (!folderId) {
      return [];
    }
    const rows = await database.query(
      `${PROFILE_BASE_SELECT} WHERE p.folder_id = ? ORDER BY p.created_at DESC`,
      [folderId]
    );
    return normalizeProfileRows(rows);
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
    if (data.folder_id !== undefined) {
      const safeFolderId =
        data.folder_id === null
          ? null
          : await ensureProfileFolderExists(data.folder_id);
      if (data.folder_id !== null && !safeFolderId) {
        throw new Error('Dossier introuvable');
      }
      fields.push('folder_id = ?');
      params.push(safeFolderId);
    }
    if (data.user_id !== undefined) {
      const safeUserId =
        data.user_id === null
          ? null
          : await ensureUserExists(data.user_id);
      if (data.user_id !== null && !safeUserId) {
        throw new Error('Utilisateur introuvable');
      }
      fields.push('user_id = ?');
      params.push(safeUserId);
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    await database.query(`UPDATE autres.profiles SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async delete(id) {
    // Ensure related shares are removed first to avoid FK constraint issues
    await database.query('DELETE FROM autres.profile_shares WHERE profile_id = ?', [id]);
    await database.query('DELETE FROM autres.profiles WHERE id = ?', [id]);
    return true;
  }

  static buildAccessConditions({ userId, divisionId, isAdmin, search, folderId }) {
    const conditions = [];
    const params = [];

    if (!isAdmin) {
      if (userId == null) {
        throw new Error('User id requis');
      }
      conditions.push(
        `(
          p.user_id = ?
          OR (
            p.folder_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM autres.profile_folder_shares pfs
              WHERE pfs.folder_id = p.folder_id AND pfs.user_id = ?
            )
          )
        )`
      );
      params.push(userId, userId);
    }

    if (search) {
      const like = `%${search}%`;
      conditions.push('(p.first_name LIKE ? OR p.last_name LIKE ? OR p.phone LIKE ?)');
      params.push(like, like, like);
    }

    if (folderId) {
      conditions.push('p.folder_id = ?');
      params.push(folderId);
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
    offset = 0,
    folderId = null
  }) {
    const { whereClause, params } = this.buildAccessConditions({
      userId,
      divisionId,
      isAdmin,
      search: search ? String(search) : '',
      folderId: folderId ? Number(folderId) : null
    });

    const safeLimit = sanitizeLimit(limit, { defaultValue: 10, min: 1, max: 100 });
    const safeOffset = sanitizeOffset(offset, { defaultValue: 0 });

    const rows = await database.query(
      `${PROFILE_BASE_SELECT}
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
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
