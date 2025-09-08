import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  await connection.query('CREATE DATABASE IF NOT EXISTS autres');
  await connection.changeUser({ database: 'autres' });

  const migrationsDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      logger.info(`Running migration ${file}`);
      await connection.query(sql);
    }
  }

  await connection.end();
  logger.info('Migrations completed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => {
    logger.error('Migration failed', err);
    process.exit(1);
  });
}

export default run;

