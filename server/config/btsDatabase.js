import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let pool = null;

const createPool = () =>
  mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    database: 'bts_orange',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  });

export const getBtsPool = () => {
  if (!pool) {
    pool = createPool();
  }
  return pool;
};

export const closeBtsPool = async () => {
  if (pool) {
    const currentPool = pool;
    pool = null;
    await currentPool.end();
  }
};
