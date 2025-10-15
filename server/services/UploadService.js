import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';
import database from '../config/database.js';
import statsCache from './stats-cache.js';
import ingestionQueue from './IngestionQueue.js';
import catalogService from './CatalogService.js';

const DEFAULT_BATCH_SIZE = Number(process.env.UPLOAD_BATCH_SIZE) || 500;
const MAX_COLUMNS = Number(process.env.UPLOAD_MAX_COLUMNS) || 200;
const ERROR_SAMPLE_SIZE = Number(process.env.UPLOAD_ERROR_SAMPLE) || 10;

const PROGRESS_MIN_PERCENT = 5;

const resolveTableNameParts = (tableName) => {
  if (!tableName) {
    throw new Error('Table cible requise');
  }
  if (tableName.includes('.')) {
    const [databaseName, table] = tableName.split('.');
    return { database: databaseName, table };
  }
  return { database: 'autres', table: tableName };
};

class UploadService {
  constructor() {
    this.batchSize = DEFAULT_BATCH_SIZE;
  }

  invalidateStatisticsCaches() {
    try {
      statsCache.clear('dataStats');
      statsCache.clear('overview:');
      statsCache.clear('regionDistribution');
    } catch (error) {
      console.warn('⚠️ Impossible de vider le cache des statistiques:', error.message);
    }
  }

  parseTableName(tableName) {
    return resolveTableNameParts(tableName);
  }

  queueCsvUpload({ filePath, targetTable, uploadMode = 'insert', user }) {
    if (!filePath) {
      throw new Error('Chemin de fichier manquant pour la mise en file');
    }

    const userId = user?.id ?? null;
    const meta = {
      type: 'csv-upload',
      targetTable,
      uploadMode,
      fileName: path.basename(filePath),
      userId
    };

    let jobId;
    const job = ingestionQueue.enqueue(meta, async ({ update }) => {
      try {
        update({ message: 'Initialisation du traitement du CSV', progress: PROGRESS_MIN_PERCENT });
        const result = await this.#processCsvUpload({
          filePath,
          targetTable,
          mode: uploadMode,
          userId,
          onProgress: update,
          jobId
        });
        update({ message: 'Nettoyage du fichier temporaire…' });
        await fsp.unlink(filePath).catch(() => {});
        return result;
      } catch (error) {
        await fsp.unlink(filePath).catch(() => {});
        throw error;
      }
    });

    jobId = job.id;
    return job;
  }

  async #processCsvUpload({ filePath, targetTable, mode, userId, onProgress, jobId }) {
    const startTime = Date.now();
    let totalRows = 0;
    let successRows = 0;
    let errorRows = 0;
    const errors = [];
    const buffer = [];

    let uploadId = null;
    let columnsValidated = false;

    const progressPayload = () => {
      const processed = successRows + errorRows;
      const ratio = totalRows === 0 ? 0 : Math.min(99, Math.round((processed / totalRows) * 100));
      return {
        progress: Math.max(PROGRESS_MIN_PERCENT, ratio),
        message: `Traitement ${processed}/${totalRows || '?'} lignes`,
        meta: { totalRows, successRows, errorRows }
      };
    };

    const registerUploadHistory = async () => {
      if (!userId || uploadId) {
        return;
      }
      const { database: db, table } = this.parseTableName(targetTable);
      await this.ensureUploadColumn(targetTable);
      uploadId = await this.logUpload({
        user_id: userId,
        table_name: `${db}.${table}`,
        file_name: path.basename(filePath),
        total_rows: 0,
        success_rows: 0,
        error_rows: 0,
        upload_mode: mode,
        job_id: jobId,
        status: 'processing',
        errors: ''
      });
    };

    const persistBatch = async () => {
      if (buffer.length === 0) {
        return;
      }

      const rows = buffer.map((entry) => entry.row);
      try {
        await this.insertBatch(targetTable, rows, mode, uploadId);
        successRows += rows.length;
      } catch (batchError) {
        for (const entry of buffer) {
          try {
            await this.insertRow(targetTable, entry.row, mode, uploadId);
            successRows += 1;
          } catch (rowError) {
            errorRows += 1;
            if (errors.length < ERROR_SAMPLE_SIZE) {
              errors.push(`Ligne ${entry.index}: ${rowError.message}`);
            }
          }
        }
      } finally {
        buffer.length = 0;
        if (onProgress) {
          onProgress(progressPayload());
        }
      }
    };

    const stream = fs.createReadStream(filePath);
    const parser = stream.pipe(csv());

    try {
      for await (const row of parser) {
        totalRows += 1;

        if (!columnsValidated) {
          const columnCount = Object.keys(row).length;
          if (columnCount === 0) {
            throw new Error('Le fichier CSV est vide');
          }
          if (columnCount > MAX_COLUMNS) {
            throw new Error(
              `Le fichier contient ${columnCount} colonnes, la limite autorisée est ${MAX_COLUMNS}`
            );
          }
          columnsValidated = true;
          if (mode === 'new_table') {
            await this.createTableFromCSV(targetTable, row);
            await this.addTableToCatalog(targetTable);
            await catalogService.upsertSource({
              id: targetTable,
              name: targetTable,
              description: `Table importée depuis ${path.basename(filePath)}`,
              tags: ['import-csv'],
              owner: userId,
              active: true
            });
          }
          await registerUploadHistory();
        }

        buffer.push({ row, index: totalRows });

        if (buffer.length >= this.batchSize) {
          await persistBatch();
        }
      }

      await persistBatch();

      if (uploadId) {
        await this.updateUploadLog(uploadId, {
          total_rows: totalRows,
          success_rows: successRows,
          error_rows: errorRows,
          status: 'completed',
          errors: errors.join('\n'),
          completed_at: new Date()
        });
      }

      this.invalidateStatisticsCaches();

      return {
        success: true,
        total_rows: totalRows,
        success_rows: successRows,
        error_rows: errorRows,
        errors,
        execution_time: Date.now() - startTime,
        upload_id: uploadId
      };
    } catch (error) {
      if (uploadId) {
        await this.updateUploadLog(uploadId, {
          total_rows: totalRows,
          success_rows: successRows,
          error_rows: errorRows,
          status: 'failed',
          errors: [error.message, ...errors].slice(0, ERROR_SAMPLE_SIZE).join('\n')
        });
      }
      throw error;
    } finally {
      stream.destroy();
    }
  }

  async uploadCSV(filePath, targetTable, mode = 'insert', userId = null) {
    return this.#processCsvUpload({ filePath, targetTable, mode, userId, onProgress: null, jobId: null });
  }

  async createTableFromCSV(tableName, sampleRow) {
    const { database: db, table } = this.parseTableName(tableName);
    const columns = Object.keys(sampleRow);
    const idColumn = columns.find((col) => col && col.trim().toLowerCase() === 'id');
    const hasIdColumn = Boolean(idColumn);

    const columnDefinitions = columns
      .filter(Boolean)
      .map((col) => {
        const normalized = col.trim().toLowerCase();

        if (normalized === 'id') {
          return `\`${col}\` VARCHAR(191)`;
        }

        return `\`${col}\` TEXT`;
      });

    const tableDefinitions = [];

    if (!hasIdColumn) {
      tableDefinitions.push('id INT AUTO_INCREMENT PRIMARY KEY');
    }

    tableDefinitions.push('upload_id INT');
    tableDefinitions.push(...columnDefinitions);
    tableDefinitions.push('created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    if (hasIdColumn) {
      tableDefinitions.push(`PRIMARY KEY (\`${idColumn}\`)`);
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS \`${db}\`.\`${table}\` (
        ${tableDefinitions.join(',\n        ')}
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await database.query(sql);
  }

  async ensureUploadColumn(tableName) {
    const { database: db, table } = this.parseTableName(tableName);
    const columns = await database.query(
      `SHOW COLUMNS FROM \`${db}\`.\`${table}\` LIKE 'upload_id'`
    );
    if (columns.length === 0) {
      await database.query(`ALTER TABLE \`${db}\`.\`${table}\` ADD COLUMN upload_id INT`);
    }
  }

  async insertBatch(tableName, rows, mode, uploadId = null) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return 0;
    }

    const { database: db, table } = this.parseTableName(tableName);
    const columnSet = new Set();
    for (const row of rows) {
      Object.keys(row || {}).forEach((column) => {
        if (column) {
          columnSet.add(column);
        }
      });
    }

    const columns = Array.from(columnSet);
    if (uploadId !== null) {
      columns.push('upload_id');
    }

    const columnNames = columns.map((col) => `\`${col}\``).join(', ');
    const placeholders = `(${columns.map(() => '?').join(', ')})`;
    const values = [];

    for (const row of rows) {
      for (const column of columns) {
        if (column === 'upload_id') {
          values.push(uploadId);
        } else {
          values.push(Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null);
        }
      }
    }

    const multiplePlaceholders = rows.map(() => placeholders).join(', ');

    let sql;
    if (mode === 'upsert') {
      const updateClause = columns
        .filter((column) => column !== 'upload_id')
        .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
        .join(', ');
      sql = `INSERT INTO \`${db}\`.\`${table}\` (${columnNames}) VALUES ${multiplePlaceholders} ON DUPLICATE KEY UPDATE ${updateClause}`;
    } else {
      sql = `INSERT INTO \`${db}\`.\`${table}\` (${columnNames}) VALUES ${multiplePlaceholders}`;
    }

    await database.query(sql, values);
    return rows.length;
  }

  async insertRow(tableName, row, mode, uploadId = null) {
    const { database: db, table } = this.parseTableName(tableName);
    const columns = Object.keys(row);
    const values = Object.values(row);

    if (uploadId !== null) {
      columns.push('upload_id');
      values.push(uploadId);
    }

    const columnNames = columns.map((col) => `\`${col}\``).join(', ');
    const placeholders = columns.map(() => '?').join(', ');

    let sql;
    if (mode === 'upsert') {
      const updateClause = columns
        .filter((col) => col !== 'upload_id')
        .map((col) => `\`${col}\` = VALUES(\`${col}\`)`)
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
      const sql = await fsp.readFile(filePath, 'utf-8');
      await database.pool.query(sql);
      await this.addTableToCatalog(`${db}.${table}`);
      await catalogService.upsertSource({
        id: `${db}.${table}`,
        name: `${db}.${table}`,
        description: `Import SQL ${path.basename(filePath)}`,
        tags: ['import-sql'],
        owner: userId,
        active: true
      });
      this.invalidateStatisticsCaches();

      if (userId) {
        await this.logUpload({
          user_id: userId,
          table_name: `${db}.${table}`,
          file_name: path.basename(filePath),
          total_rows: 0,
          success_rows: 0,
          error_rows: 0,
          upload_mode: 'sql',
          job_id: null,
          status: 'completed',
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
      const columnNames = columns.map((col) => col.Field || col.field || col.COLUMN_NAME).filter(Boolean);

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const catalogPath = path.join(__dirname, '../config/tables-catalog.json');
      const raw = fs.existsSync(catalogPath) ? await fsp.readFile(catalogPath, 'utf-8') : '{}';
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

      await fsp.writeFile(catalogPath, JSON.stringify(catalog, null, 2));
      this.invalidateStatisticsCaches();
    } catch (error) {
      console.error('Erreur mise à jour catalogue:', error);
    }
  }

  async logUpload(logData) {
    try {
      const result = await database.query(
        `
        INSERT INTO upload_history (
          user_id, table_name, file_name, total_rows, success_rows,
          error_rows, upload_mode, errors, job_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          logData.user_id,
          logData.table_name,
          logData.file_name,
          logData.total_rows,
          logData.success_rows,
          logData.error_rows,
          logData.upload_mode,
          logData.errors,
          logData.job_id ?? null,
          logData.status ?? 'pending'
        ]
      );
      return result.insertId;
    } catch (error) {
      console.error('Erreur log upload:', error);
      throw error;
    }
  }

  async updateUploadLog(id, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'errors' && Array.isArray(value)) {
        fields.push('errors = ?');
        values.push(value.slice(0, ERROR_SAMPLE_SIZE).join('\n'));
      } else if (key === 'completed_at') {
        fields.push('completed_at = ?');
        values.push(value instanceof Date ? value : new Date(value));
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return;
    }

    values.push(id);
    await database.query(`UPDATE upload_history SET ${fields.join(', ')} WHERE id = ?`, values);
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
      const rows = await database.query(
        'SELECT table_name, upload_mode FROM upload_history WHERE id = ?',
        [id]
      );
      if (rows.length === 0) {
        throw new Error('Upload introuvable');
      }
      const { database: db, table } = this.parseTableName(rows[0].table_name);
      if (rows[0].upload_mode === 'new_table' || rows[0].upload_mode === 'sql') {
        await database.query(`DROP TABLE IF EXISTS \`${db}\`.\`${table}\``);
      } else {
        const columns = await database.query(
          `SHOW COLUMNS FROM \`${db}\`.\`${table}\` LIKE 'upload_id'`
        );
        if (columns.length === 0) {
          await database.query(`DROP TABLE IF EXISTS \`${db}\`.\`${table}\``);
        } else {
          await database.query(`DELETE FROM \`${db}\`.\`${table}\` WHERE upload_id = ?`, [id]);
        }
      }
      await database.query('DELETE FROM upload_history WHERE id = ?', [id]);
    } catch (error) {
      console.error('Erreur suppression upload:', error);
      throw error;
    }
  }
}

export default UploadService;
