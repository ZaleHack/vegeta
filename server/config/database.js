import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.init();
  }

  async init() {
    try {
      logger.info('🔌 Initializing MySQL connection...');
      const baseConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
      };

      // Create database if it doesn't exist
      const tmp = await mysql.createConnection(baseConfig);
      await tmp.query('CREATE DATABASE IF NOT EXISTS autres CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      await tmp.end();

      // Create pool using the "autres" database
      this.pool = mysql.createPool({ ...baseConfig, database: 'autres' });

      // Test de connexion
      const connection = await this.pool.getConnection();
      logger.info('✅ Connexion MySQL établie avec succès');
      connection.release();
    } catch (error) {
      logger.error('❌ Erreur connexion MySQL:', error);
      throw error;
    }
  }

  async query(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logger.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows[0] || null;
    } catch (error) {
      logger.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('✅ Connexions MySQL fermées');
    }
  }
}

export default new DatabaseManager();
