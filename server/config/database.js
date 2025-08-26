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
      
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'autres',
        multipleStatements: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
      });

      // Test de connexion
      const connection = await this.pool.getConnection();
      console.log('✅ Connexion MySQL établie avec succès');
      connection.release();

      // Créer les tables système
      await this.createSystemTables();
    } catch (error) {
      console.error('❌ Erreur connexion MySQL:', error);
      throw error;
    }
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
          search_type VARCHAR(50),
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

      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.annuaire_gendarmerie (
          id INT AUTO_INCREMENT PRIMARY KEY,
          Libelle VARCHAR(255) NOT NULL,
          Telephone VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
}

export default new DatabaseManager();