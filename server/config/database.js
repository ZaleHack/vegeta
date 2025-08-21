const mysql = require('mysql2/promise');
require('dotenv').config();

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.init();
  }

  async init() {
    try {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'vegeta',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4',
        multipleStatements: true
      });

      // Test de connexion
      const connection = await this.pool.getConnection();
      console.log('✅ Connexion MySQL établie avec succès');
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
      // Table pour les logs de recherche
      await this.query(`
        CREATE TABLE IF NOT EXISTS search_logs (
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
        CREATE TABLE IF NOT EXISTS upload_history (
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

module.exports = new DatabaseManager();