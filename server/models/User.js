import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import database from '../config/database.js';

class User {
  static async create(userData) {
    const { login, mdp, admin = 0 } = userData;
    const hashedPassword = await bcrypt.hash(mdp, 12);
    
    const result = await database.query(
      'INSERT INTO autres.users (login, mdp, admin) VALUES (?, ?, ?)',
      [login, hashedPassword, admin]
    );
    
    return { 
      id: result.insertId, 
      login, 
      mdp: hashedPassword, 
      admin 
    };
  }

  static async findById(id) {
    return await database.queryOne(
      'SELECT * FROM autres.users WHERE id = ?',
      [id]
    );
  }

  static async findByLogin(login) {
    try {
      const user = await database.queryOne(
        'SELECT * FROM autres.users WHERE login = ?',
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
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
  }

  static verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  }

  static async findAll() {
    return await database.query(
      'SELECT id, login, admin FROM autres.users ORDER BY id DESC'
    );
  }

  static async update(id, userData) {
    const fields = [];
    const values = [];
    
    Object.keys(userData).forEach(key => {
      if (key !== 'id' && userData[key] !== undefined) {
        if (key === 'mdp') {
          fields.push('mdp = ?');
          values.push(bcrypt.hashSync(userData[key], 12));
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
}

export default User;