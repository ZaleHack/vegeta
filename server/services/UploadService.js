const database = require('../config/database.js');
const csv = require('csv-parser');
const fs = require('fs');

class UploadService {
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
        await this.logUpload({
          user_id: userId,
          table_name: targetTable,
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
    const columns = Object.keys(sampleRow);
    const columnDefinitions = columns.map(col => {
      return `\`${col}\` TEXT`;
    }).join(', ');

    const sql = `
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ${columnDefinitions},
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await database.query(sql);
  }

  async insertRow(tableName, row, mode) {
    const columns = Object.keys(row);
    const values = Object.values(row);
    
    const columnNames = columns.map(col => `\`${col}\``).join(', ');
    const placeholders = columns.map(() => '?').join(', ');

    let sql;
    if (mode === 'upsert') {
      const updateClause = columns.map(col => `\`${col}\` = VALUES(\`${col}\`)`).join(', ');
      sql = `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
    } else {
      sql = `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders})`;
    }

    await database.query(sql, values);
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
}

module.exports = UploadService;