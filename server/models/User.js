import bcrypt from 'bcrypt';
import db from '../config/database.js';

class User {
  static async findByLogin(login) {
    try {
      return await db.queryOne('SELECT * FROM users WHERE login = ?', [login]);
    } catch (error) {
      console.error('Erreur findByLogin:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      return await db.queryOne('SELECT * FROM users WHERE id = ?', [id]);
    } catch (error) {
      console.error('Erreur findById:', error);
      throw error;
    }
  }

  static async findAll() {
    try {
      return await db.query('SELECT id, login, admin, created_at, updated_at FROM users ORDER BY created_at DESC');
    } catch (error) {
      console.error('Erreur findAll:', error);
      throw error;
    }
  }

  static async create(userData) {
    try {
      const { login, password, admin = 0 } = userData;
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const result = await db.run(
        'INSERT INTO users (login, mdp, admin) VALUES (?, ?, ?)',
        [login, hashedPassword, admin]
      );
      
      return { id: result.lastID, login, admin };
    } catch (error) {
      console.error('Erreur create:', error);
      throw error;
    }
  }

  static async update(id, userData) {
    try {
      const { login, admin } = userData;
      
      await db.run(
        'UPDATE users SET login = ?, admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [login, admin, id]
      );
      
      return await this.findById(id);
    } catch (error) {
      console.error('Erreur update:', error);
      throw error;
    }
  }

  static async updatePassword(id, newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await db.run(
        'UPDATE users SET mdp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedPassword, id]
      );
      
      return true;
    } catch (error) {
      console.error('Erreur updatePassword:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      await db.run('DELETE FROM users WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Erreur delete:', error);
      throw error;
    }
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error('Erreur verifyPassword:', error);
      throw error;
    }
  }
}

export default User;