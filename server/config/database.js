import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseManager {
  constructor() {
    this.db = null;
    this.init();
  }

  async init() {
    try {
      console.log('🔌 Initializing SQLite connection...');
      
      // Create database file in project root
      const dbPath = path.join(__dirname, '../../vegeta.db');
      
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      console.log('✅ Connexion SQLite établie avec succès');

      // Create system tables
      await this.createSystemTables();
    } catch (error) {
      console.error('❌ Erreur connexion SQLite:', error);
      throw error;
    }
  }

  async createSystemTables() {
    try {
      // Create users table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          login TEXT UNIQUE NOT NULL,
          mdp TEXT NOT NULL,
          admin INTEGER DEFAULT 0,
          email TEXT,
          role TEXT DEFAULT 'LECTEUR' CHECK(role IN ('ADMIN', 'ANALYSTE', 'LECTEUR')),
          is_active INTEGER DEFAULT 1,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create search_logs table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS search_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          username TEXT,
          search_term TEXT,
          tables_searched TEXT,
          results_count INTEGER DEFAULT 0,
          execution_time_ms INTEGER DEFAULT 0,
          ip_address TEXT,
          user_agent TEXT,
          search_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create default admin user if not exists
      const adminExists = await this.db.get('SELECT id FROM users WHERE login = ?', ['admin']);
      if (!adminExists) {
        const bcrypt = await import('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        await this.db.run(`
          INSERT INTO users (login, mdp, admin, email, role, is_active)
          VALUES (?, ?, 1, ?, 'ADMIN', 1)
        `, ['admin', hashedPassword, 'admin@vegeta.local']);
        
        console.log('✅ Utilisateur admin créé (login: admin, password: admin123)');
      }

      console.log('✅ Tables système créées avec succès');
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
    }
  }

  async query(sql, params = []) {
    try {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return await this.db.all(sql, params);
      } else {
        return await this.db.run(sql, params);
      }
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    try {
      return await this.db.get(sql, params);
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
      console.log('✅ Connexions SQLite fermées');
    }
  }
}

export default new DatabaseManager();