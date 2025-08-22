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
      
      const dbPath = path.join(__dirname, '../../data/vegeta.db');
      
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      console.log('✅ Connexion SQLite établie avec succès');

      // Créer les tables système
      await this.createSystemTables();
    } catch (error) {
      console.error('❌ Erreur connexion SQLite:', error);
      throw error;
    }
  }

  async createSystemTables() {
    try {
      // Créer la table users
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          login TEXT UNIQUE NOT NULL,
          mdp TEXT NOT NULL,
          admin INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Créer la table search_logs
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

      // Créer un utilisateur admin par défaut s'il n'existe pas
      const adminExists = await this.db.get('SELECT id FROM users WHERE login = ?', ['admin']);
      if (!adminExists) {
        const bcrypt = await import('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await this.db.run(
          'INSERT INTO users (login, mdp, admin) VALUES (?, ?, ?)',
          ['admin', hashedPassword, 1]
        );
        console.log('✅ Utilisateur admin créé (login: admin, mot de passe: admin123)');
      }

      console.log('✅ Tables système créées avec succès');
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
    }
  }

  async query(sql, params = []) {
    try {
      return await this.db.all(sql, params);
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    try {
      return await this.db.get(sql, params) || null;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async run(sql, params = []) {
    try {
      return await this.db.run(sql, params);
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
      console.log('✅ Connexion SQLite fermée');
    }
  }
}

export default new DatabaseManager();