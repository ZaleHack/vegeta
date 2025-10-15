import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateSecret as generateTotpSecret } from '../utils/totp.js';
import database from '../config/database.js';
import { getJwtSecret } from '../config/environment.js';
import accessControlService from '../services/AccessControlService.js';
const USERS_TABLE = 'autres.users';

class User {
  static async create(userData) {
    const { login, mdp, admin = 0, active = 1, division_id } = userData;
    const hashedPassword = await bcrypt.hash(mdp, 12);

    const normalizedDivisionId = division_id ?? null;

    const result = await database.query(
      'INSERT INTO autres.users (login, mdp, admin, active, division_id) VALUES (?, ?, ?, ?, ?)',
      [login, hashedPassword, admin, active, normalizedDivisionId]
    );

    const defaultRoles = Array.isArray(userData.roles)
      ? userData.roles
      : admin === 1 || admin === '1'
        ? ['administrator']
        : ['observer'];

    try {
      await accessControlService.assignRolesToUser(result.insertId, defaultRoles);
    } catch (error) {
      console.error('❌ Impossible d\'assigner les rôles par défaut:', error);
    }

    return {
      id: result.insertId,
      login,
      mdp: hashedPassword,
      admin,
      active,
      division_id: normalizedDivisionId,
      otp_enabled: 0,
      roles: defaultRoles
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
    return row;
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
      return user;
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
    if (user.roles) {
      safeUser.roles = user.roles;
    }
    if (user.permissions) {
      safeUser.permissions = user.permissions;
    }
    return safeUser;
  }

  static async findAll() {
    const rows = await database.query(
      `SELECT u.id, u.login, u.admin, u.active, u.created_at, u.division_id, d.name AS division_name
       FROM autres.users u
       LEFT JOIN autres.divisions d ON u.division_id = d.id
       ORDER BY u.id DESC`
    );
    return rows;
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
        if (key === 'roles') {
          return;
        }
        if (key === 'mdp') {
          fields.push('mdp = ?');
          values.push(bcrypt.hashSync(userData[key], 12));
        } else if (key === 'division_id') {
          fields.push('division_id = ?');
          values.push(userData[key]);
        } else if (key === 'otp_secret') {
          fields.push('otp_secret = ?');
          values.push(userData[key]);
        } else {
          fields.push(`${key} = ?`);
          values.push(userData[key]);
        }
      }
    });
    
    if (fields.length > 0) {
      values.push(id);

      await database.query(
        `UPDATE autres.users SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }

    if (Array.isArray(userData.roles)) {
      await accessControlService.assignRolesToUser(id, userData.roles);
    }

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