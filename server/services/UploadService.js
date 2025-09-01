import database from '../config/database.js';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Catalogue des tables chargé dynamiquement

class UploadService {
  parseTableName(tableName) {
    if (tableName.includes('.')) {
      const [database, table] = tableName.split('.');
      return { database, table };
    }
    return { database: 'autres', table: tableName };
  }
  async uploadCSV(filePath, targetTable, mode = 'insert', userId = null) {
    const startTime = Date.now();
    let totalRows = 0;
    let successRows = 0;
    let errorRows = 0;
    const errors = [];

    try {
      // Lire et analyser le CSV
      const rows = [];
      
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            rows.push(row);
          })
          .on('end', resolve)
          .on('error', reject);
      });

      totalRows = rows.length;

      if (totalRows === 0) {
        throw new Error('Le fichier CSV est vide');
      }

      // Si c'est une nouvelle table, la créer
      if (mode === 'new_table') {
        await this.createTableFromCSV(targetTable, rows[0]);
        await this.addTableToCatalog(targetTable);
      }

      // Insérer les données
      for (const [index, row] of rows.entries()) {
        try {
          await this.insertRow(targetTable, row, mode);
          successRows++;
        } catch (error) {
          errorRows++;
          errors.push(`Ligne ${index + 1}: ${error.message}`);
        }
      }

      // Enregistrer l'historique
      if (userId) {
        const { database, table } = this.parseTableName(targetTable);
        await this.logUpload({
          user_id: userId,
          table_name: `${database}.${table}`,
          file_name: filePath.split('/').pop(),
          total_rows: totalRows,
          success_rows: successRows,
          error_rows: errorRows,
          upload_mode: mode,
          errors: errors.slice(0, 10).join('\n') // Limiter les erreurs stockées
        });
      }

      return {
        success: true,
        total_rows: totalRows,
        success_rows: successRows,
        error_rows: errorRows,
        errors: errors.slice(0, 10),
        execution_time: Date.now() - startTime
      };

    } catch (error) {
      console.error('Erreur upload CSV:', error);
      throw error;
    }
  }

  async createTableFromCSV(tableName, sampleRow) {
    const { database: db, table } = this.parseTableName(tableName);
    const columns = Object.keys(sampleRow);
    const columnDefinitions = columns
      .map(col => `\`${col}\` TEXT`)
      .join(', ');

    const sql = `
      CREATE TABLE IF NOT EXISTS \`${db}\`.\`${table}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ${columnDefinitions},
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await database.query(sql);
  }

  async insertRow(tableName, row, mode) {
    const { database: db, table } = this.parseTableName(tableName);
    const columns = Object.keys(row);
    const values = Object.values(row);

    const columnNames = columns.map(col => `\`${col}\``).join(', ');
    const placeholders = columns.map(() => '?').join(', ');

    let sql;
    if (mode === 'upsert') {
      const updateClause = columns
        .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
        .join(', ');
      sql = `INSERT INTO \`${db}\`.\`${table}\` (${columnNames}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
    } else {
      sql = `INSERT INTO \`${db}\`.\`${table}\` (${columnNames}) VALUES (${placeholders})`;
    }

    await database.query(sql, values);
  }

  async uploadSQL(filePath, tableName, userId = null) {
    const startTime = Date.now();
    try {
      const { database: db, table } = this.parseTableName(tableName);
      const sql = fs.readFileSync(filePath, 'utf-8');
      await database.pool.query(sql);
      await this.addTableToCatalog(`${db}.${table}`);

      if (userId) {
        await this.logUpload({
          user_id: userId,
          table_name: `${db}.${table}`,
          file_name: path.basename(filePath),
          total_rows: 0,
          success_rows: 0,
          error_rows: 0,
          upload_mode: 'sql',
          errors: ''
        });
      }

      return { success: true, execution_time: Date.now() - startTime };
    } catch (error) {
      console.error('Erreur upload SQL:', error);
      throw error;
    }
  }

  async addTableToCatalog(tableName) {
    try {
      const { database: db, table } = this.parseTableName(tableName);
      const columns = await database.query(`SHOW COLUMNS FROM \`${db}\`.\`${table}\``);
      const columnNames = columns.map(col => col.Field);

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const catalogPath = path.join(__dirname, '../config/tables-catalog.json');
      const raw = fs.existsSync(catalogPath)
        ? fs.readFileSync(catalogPath, 'utf-8')
        : '{}';
      const catalog = JSON.parse(raw);

      const catalogKey = `${db}_${table}`;
      catalog[catalogKey] = {
        display: table,
        database: db,
        searchable: columnNames,
        preview: columnNames.slice(0, Math.min(5, columnNames.length)),
        filters: {},
        theme: 'autres'
      };

      fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    } catch (error) {
      console.error('Erreur mise à jour catalogue:', error);
    }
  }

  async logUpload(logData) {
    try {
      await database.query(`
        INSERT INTO upload_history (
          user_id, table_name, file_name, total_rows, success_rows, 
          error_rows, upload_mode, errors
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        logData.user_id,
        logData.table_name,
        logData.file_name,
        logData.total_rows,
        logData.success_rows,
        logData.error_rows,
        logData.upload_mode,
        logData.errors
      ]);
    } catch (error) {
      console.error('Erreur log upload:', error);
    }
  }

  async getUploadHistory(userId = null, limit = 20) {
    try {
      let sql = `
        SELECT uh.*, u.login as username
        FROM upload_history uh
        LEFT JOIN autres.users u ON uh.user_id = u.id
      `;
      const params = [];

      if (userId) {
        sql += ' WHERE uh.user_id = ?';
        params.push(userId);
      }

      sql += ' ORDER BY uh.created_at DESC LIMIT ?';
      params.push(limit);

      return await database.query(sql, params);
    } catch (error) {
      console.error('Erreur historique upload:', error);
      return [];
    }
  }

  async deleteUpload(id) {
    try {
      const rows = await database.query('SELECT table_name FROM upload_history WHERE id = ?', [id]);
      if (rows.length === 0) {
        throw new Error('Upload introuvable');
      }
      const { database: db, table } = this.parseTableName(rows[0].table_name);
      await database.query(`DROP TABLE IF EXISTS \`${db}\`.\`${table}\``);
      await database.query('DELETE FROM upload_history WHERE id = ?', [id]);
    } catch (error) {
      console.error('Erreur suppression upload:', error);
      throw error;
    }
  }
}

export default UploadService;