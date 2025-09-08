const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../config/database.cjs');

class User {
  static async create(userData) {
    const { username, email, password, role = 'LECTEUR' } = userData;
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const result = database.run(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role]
    );
    
    return { id: result.lastInsertRowid, username, email, password_hash: hashedPassword, role };
  }

  static async findById(id) {
    return database.queryOne(
      'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
      [id]
    );
  }

  static async findByUsername(username) {
    return database.queryOne(
      'SELECT * FROM users WHERE username = ? AND is_active = TRUE',
      [username]
    );
  }

  static async findByEmail(email) {
    return database.queryOne(
      'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static generateToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
  }

  static verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
  }

  static async findAll(filters = {}) {
    return database.query(
      'SELECT id, username, email, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
  }

  static async update(id, userData) {
    const fields = [];
    const values = [];
    
    Object.keys(userData).forEach(key => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(userData[key]);
      }
    });
    
    if (fields.length === 0) return null;
    
    values.push(id);
    
    database.run(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
    
    return this.findById(id);
  }
}

module.exports = User;