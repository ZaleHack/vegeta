import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.init();
  }

  async init() {
    try {
      console.log('🔌 Initializing MySQL connection...');
      console.log('🔌 Config:', {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD ? '***' : '(empty)'
      });
      
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'autres',
        multipleStatements: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4',
        acquireTimeout: 60000,
        timeout: 60000
      });

      // Test de connexion
      console.log('🔌 Testing connection...');
      const connection = await this.pool.getConnection();
      console.log('✅ Connexion MySQL établie avec succès');
      
      // Tester l'accès aux bases
      try {
        const [databases] = await connection.execute('SHOW DATABASES');
        console.log('📊 Bases disponibles:', databases.map(db => db.Database));
        
        // Tester spécifiquement la table users si elle existe
        try {
          const [users] = await connection.execute('SELECT COUNT(*) as count FROM autres.users');
          console.log('👥 Nombre d\'utilisateurs dans autres.users:', users[0].count);
        } catch (err) {
          console.log('⚠️ Table users pas encore créée');
        }
      } catch (err) {
        console.warn('⚠️ Impossible de lister les bases:', err.message);
      }
      
      connection.release();

      // Créer les tables système si elles n'existent pas
      await this.createSystemTables();
    } catch (error) {
      console.error('❌ Erreur connexion MySQL:', error);
      throw error;
    }
  }

  async createSystemTables() {
    try {
      // Créer la base 'autres' si elle n'existe pas (sans USE)
      await this.query('CREATE DATABASE IF NOT EXISTS autres');
      
      // Créer la table users si elle n'existe pas (avec nom complet)
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          login VARCHAR(255) UNIQUE NOT NULL,
          mdp VARCHAR(255) NOT NULL,
          admin TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      
      // Insérer un utilisateur admin par défaut s'il n'existe pas
      const existingAdmin = await this.queryOne('SELECT COUNT(*) as count FROM autres.users WHERE login = ?', ['admin']);
      if (existingAdmin.count === 0) {
        // Mot de passe: admin123 (hashé avec bcrypt)
        await this.query(`
          INSERT INTO autres.users (login, mdp, admin) VALUES 
          ('admin', '$2a$12$LQv3c1yqBwEHFl5aysHdsOu/1oKxIRS/VKxMRUnAYF5.ZjjQK5YTC', 1)
        `);
        console.log('👤 Utilisateur admin créé (login: admin, password: admin123)');
      }
      
      // Table pour les logs de recherche
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.search_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          username VARCHAR(255),
          search_term TEXT,
          filters JSON,
          tables_searched JSON,
          results_count INT DEFAULT 0,
          execution_time_ms INT DEFAULT 0,
          ip_address VARCHAR(45),
          user_agent TEXT,
          search_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_search_date (search_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Table pour l'historique des uploads
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.upload_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          table_name VARCHAR(255),
          file_name VARCHAR(255),
          total_rows INT DEFAULT 0,
          success_rows INT DEFAULT 0,
          error_rows INT DEFAULT 0,
          upload_mode VARCHAR(50),
          errors TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      console.log('✅ Tables système créées avec succès');
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
    }
  }

  async query(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows[0] || null;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ Connexions MySQL fermées');
    }
  }

  getPool() {
    return this.pool;
  }
}

export default new DatabaseManager();