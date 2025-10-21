import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class BtsDatabaseManager {
  constructor() {
    this.pool = null;
    this.initPromise = null;
  }

  async init() {
    if (!this.initPromise) {
      this.initPromise = this.#initInternal();
    }
    return this.initPromise;
  }

  async #initInternal() {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.BTS_DB_NAME || 'bts_orange',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    };

    this.pool = mysql.createPool(config);

    // Test the connection once during initialization to surface issues early.
    const connection = await this.pool.getConnection();
    connection.release();
  }

  async ensureInitialized() {
    await this.init();
    if (!this.pool) {
      throw new Error('BTS database connection pool not initialized');
    }
  }

  async query(sql, params = []) {
    await this.ensureInitialized();
    const [rows] = await this.pool.execute(sql, params);
    return rows;
  }
}

const btsDatabase = new BtsDatabaseManager();

export default btsDatabase;
