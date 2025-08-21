import database from '../config/database.js';
import bcrypt from 'bcryptjs';

class User {
  static async findByLogin(login) {
    try {
      const user = database.queryOne(
        'SELECT * FROM users WHERE login = ?',
        [login]
      );
      return user;
    } catch (error) {
      console.error('Erreur lors de la recherche utilisateur:', error);
      throw error;
    }
  }

  static async create(userData) {
    try {
      const { login, password, admin = 0 } = userData;
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const result = database.query(
        'INSERT INTO users (login, mdp, admin) VALUES (?, ?, ?)',
        [login, hashedPassword, admin]
      );
      
      return { id: result.lastInsertRowid, login, admin };
    } catch (error) {
      console.error('Erreur lors de la création utilisateur:', error);
      throw error;
    }
  }

  static async findAll() {
    try {
      const users = database.query(
        'SELECT id, login, admin, created_at FROM users ORDER BY created_at DESC'
      );
      return users;
    } catch (error) {
      console.error('Erreur lors de la récupération des utilisateurs:', error);
      throw error;
    }
  }

  static async updateById(id, userData) {
    try {
      const { login, password, admin } = userData;
      let query = 'UPDATE users SET login = ?, admin = ?';
      let params = [login, admin];
      
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 12);
        query += ', mdp = ?';
        params.push(hashedPassword);
      }
      
      query += ' WHERE id = ?';
      params.push(id);
      
      database.query(query, params);
      return { id, login, admin };
    } catch (error) {
      console.error('Erreur lors de la mise à jour utilisateur:', error);
      throw error;
    }
  }

  static async deleteById(id) {
    try {
      database.query('DELETE FROM users WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression utilisateur:', error);
      throw error;
    }
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error('Erreur lors de la vérification du mot de passe:', error);
      throw error;
    }
  }
}

export default User;