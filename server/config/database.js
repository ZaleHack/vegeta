import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.mockMode = false;
    this.init();
  }

  async init() {
    try {
      console.log('🔌 Initializing MySQL connection...');
      
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
        connectTimeout: 5000,
        acquireTimeout: 5000
      });

      // Test de connexion
      const connection = await this.pool.getConnection();
      console.log('✅ Connexion MySQL établie avec succès');
      connection.release();

      // Créer les tables système
      await this.createSystemTables();
    } catch (error) {
      console.warn('⚠️ MySQL non disponible, passage en mode mock:', error.message);
      this.mockMode = true;
      this.pool = null;
      await this.createMockData();
    }
  }

  async createMockData() {
    console.log('🎭 Initialisation des données de démonstration...');
    // Les données mock seront gérées par le SearchService
  }
  async createSystemTables() {
    try {
      // Créer la base 'autres' si elle n'existe pas
      await this.query('CREATE DATABASE IF NOT EXISTS autres');
      
      // Créer la table users
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
      
      // Créer la table search_logs
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.search_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          username VARCHAR(255),
          search_term TEXT,
          tables_searched TEXT,
          results_count INT DEFAULT 0,
          execution_time_ms INT DEFAULT 0,
          ip_address VARCHAR(45),
          user_agent TEXT,
          search_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_search_date (search_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      console.log('✅ Tables système créées avec succès');
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
    }
  }

  async query(sql, params = []) {
    if (this.mockMode) {
      console.log('🎭 Mock query:', sql.substring(0, 100) + '...');
      return [];
    }
    
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    if (this.mockMode) {
      console.log('🎭 Mock queryOne:', sql.substring(0, 100) + '...');
      return null;
    }
    
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
}

export default new DatabaseManager();