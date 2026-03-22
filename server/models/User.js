import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateSecret as generateTotpSecret } from '../utils/totp.js';
import database from '../config/database.js';
import { getJwtSecret } from '../config/environment.js';
const USERS_TABLE = 'autres.users';

class User {
  static normalizePagePermissions(value) {
    if (!value) return null;
    try {
      const parsed = Array.isArray(value) ? value : JSON.parse(value);
      if (!Array.isArray(parsed)) return null;
      const cleaned = parsed
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
      return cleaned.length > 0 ? cleaned : null;
    } catch {
      return null;
    }
  }

  static hydrateUserRow(row) {
    if (!row) return null;
    return {
      ...row,
      page_permissions: this.normalizePagePermissions(row.page_permissions)
    };
  }

  static async create(userData) {
    const { login, mdp, admin = 0, active = 1, division_id, page_permissions = null } = userData;
    const hashedPassword = await bcrypt.hash(mdp, 12);

    const normalizedDivisionId = division_id ?? null;
    const normalizedPagePermissions = this.normalizePagePermissions(page_permissions);

    const result = await database.query(
      'INSERT INTO autres.users (login, mdp, admin, active, division_id, page_permissions) VALUES (?, ?, ?, ?, ?, ?)',
      [login, hashedPassword, admin, active, normalizedDivisionId, normalizedPagePermissions ? JSON.stringify(normalizedPagePermissions) : null]
    );

    return {
      id: result.insertId,
      login,
      mdp: hashedPassword,
      admin,
      active,
      division_id: normalizedDivisionId,
      page_permissions: normalizedPagePermissions,
      otp_enabled: 0
    };
  }

  static async findById(id) {
    const row = await database.queryOne(
      `SELECT u.*, d.name AS division_name
       FROM autres.users u
       LEFT JOIN autres.divisions d ON u.division_id = d.id
       WHERE u.id = ?`,
      [id]
    );
    return this.hydrateUserRow(row);
  }

  static async findByLogin(login) {
    try {
      const user = await database.queryOne(
        `SELECT u.*, d.name AS division_name
         FROM autres.users u
         LEFT JOIN autres.divisions d ON u.division_id = d.id
         WHERE u.login = ?`,
        [login]
      );
      return this.hydrateUserRow(user);
    } catch (error) {
      console.error('❌ Erreur lors de la recherche utilisateur:', error);
      throw error;
    }
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        login: user.login,
        admin: user.admin
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );
  }

  static verifyToken(token) {
    return jwt.verify(token, getJwtSecret());
  }

  static sanitize(user) {
    if (!user) return null;
    const { mdp, otp_secret, ...safeUser } = user;
    return safeUser;
  }

  static async findAll() {
    const rows = await database.query(
      `SELECT u.id, u.login, u.admin, u.active, u.created_at, u.division_id, u.page_permissions, d.name AS division_name
       FROM autres.users u
       LEFT JOIN autres.divisions d ON u.division_id = d.id
       ORDER BY u.id DESC`
    );
    return rows.map((row) => this.hydrateUserRow(row));
  }

  static async findActive({ excludeId } = {}) {
    const params = [];
    let sql = `SELECT u.id, u.login, u.admin, u.active, u.created_at
               FROM autres.users u
               WHERE u.active = 1`;

    if (excludeId) {
      sql += ' AND u.id != ?';
      params.push(excludeId);
    }

    sql += ' ORDER BY u.login';

    const rows = await database.query(sql, params);
    return rows;
  }

  static async update(id, userData) {
    const fields = [];
    const values = [];

    Object.keys(userData).forEach(key => {
      if (key !== 'id' && userData[key] !== undefined) {
        if (key === 'mdp') {
          fields.push('mdp = ?');
          values.push(bcrypt.hashSync(userData[key], 12));
        } else if (key === 'division_id') {
          fields.push('division_id = ?');
          values.push(userData[key]);
        } else if (key === 'otp_secret') {
          fields.push('otp_secret = ?');
          values.push(userData[key]);
        } else if (key === 'page_permissions') {
          fields.push('page_permissions = ?');
          const normalized = this.normalizePagePermissions(userData[key]);
          values.push(normalized ? JSON.stringify(normalized) : null);
        } else {
          fields.push(`${key} = ?`);
          values.push(userData[key]);
        }
      }
    });
    
    if (fields.length === 0) return null;
    
    values.push(id);
    
    await database.query(
      `UPDATE autres.users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return await this.findById(id);
  }

  static async delete(id) {
    await database.query('DELETE FROM autres.users WHERE id = ?', [id]);
    return true;
  }

  static generateOtpSecret(login) {
    return generateTotpSecret(login);
  }

  static async saveOtpSecret(id, secret) {
    await database.query(
      `UPDATE autres.users
       SET otp_secret = ?, otp_enabled = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [secret, id]
    );
    return this.findById(id);
  }

  static async resetOtpSecret(id) {
    await database.query(
      `UPDATE autres.users
       SET otp_secret = NULL, otp_enabled = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );
    return this.findById(id);
  }
}

export default User;
