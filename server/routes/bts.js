import express from 'express';
import database from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const PROVIDER_DATABASES = {
  orange: 'bts_orange',
  free: 'bts_free',
  expresso: 'bts_expresso'
};

const resolveDatabaseName = (provider) => PROVIDER_DATABASES[provider];

const normalizeColumn = (row) => ({
  name: row.COLUMN_NAME || row.column_name,
  dataType: row.DATA_TYPE || row.data_type,
  isNullable: (row.IS_NULLABLE || row.is_nullable) === 'YES',
  isPrimary: (row.COLUMN_KEY || row.column_key) === 'PRI',
  isAutoIncrement: String(row.EXTRA || row.extra || '').toLowerCase().includes('auto_increment')
});

const fetchTableList = async (databaseName) => {
  const rows = await database.query(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `,
    [databaseName]
  );
  return rows
    .map((row) => row.TABLE_NAME || row.table_name)
    .filter(Boolean);
};

const fetchColumnsForDatabase = async (databaseName) => {
  const rows = await database.query(
    `
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `,
    [databaseName]
  );
  return rows;
};

const fetchColumnsForTable = async (databaseName, tableName) => {
  const rows = await database.query(
    `
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
    [databaseName, tableName]
  );
  return rows.map(normalizeColumn).filter((column) => column.name);
};

const ensureTableExists = async (databaseName, tableName) => {
  const row = await database.queryOne(
    `
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
    `,
    [databaseName, tableName]
  );
  return Boolean(row);
};

router.get('/:provider/metadata', authenticate, async (req, res) => {
  try {
    const databaseName = resolveDatabaseName(req.params.provider);
    if (!databaseName) {
      return res.status(400).json({ error: 'Opérateur BTS invalide.' });
    }

    const [tableNames, columnRows] = await Promise.all([
      fetchTableList(databaseName),
      fetchColumnsForDatabase(databaseName)
    ]);

    const columnsByTable = columnRows.reduce((acc, row) => {
      const tableName = row.TABLE_NAME || row.table_name;
      if (!tableName) {
        return acc;
      }
      if (!acc.has(tableName)) {
        acc.set(tableName, []);
      }
      acc.get(tableName).push(normalizeColumn(row));
      return acc;
    }, new Map());

    const tables = tableNames.map((name) => ({
      name,
      columns: columnsByTable.get(name) || []
    }));

    return res.json({ database: databaseName, tables });
  } catch (error) {
    console.error('Erreur récupération metadata BTS:', error);
    return res.status(500).json({ error: 'Erreur lors de la récupération des tables BTS.' });
  }
});

router.get('/:provider/tables/:tableName', authenticate, async (req, res) => {
  try {
    const databaseName = resolveDatabaseName(req.params.provider);
    if (!databaseName) {
      return res.status(400).json({ error: 'Opérateur BTS invalide.' });
    }

    const tableName = req.params.tableName;
    if (!tableName) {
      return res.status(400).json({ error: 'Table BTS invalide.' });
    }

    const exists = await ensureTableExists(databaseName, tableName);
    if (!exists) {
      return res.status(404).json({ error: 'Table BTS introuvable.' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const [columns, rows, totalRow] = await Promise.all([
      fetchColumnsForTable(databaseName, tableName),
      database.query(
        `SELECT * FROM \`${databaseName}\`.\`${tableName}\` LIMIT ? OFFSET ?`,
        [limit, offset]
      ),
      database.queryOne(`SELECT COUNT(*) AS total FROM \`${databaseName}\`.\`${tableName}\``)
    ]);

    return res.json({
      table: tableName,
      columns,
      rows,
      total: totalRow?.total || 0,
      page,
      limit
    });
  } catch (error) {
    console.error('Erreur récupération données BTS:', error);
    return res.status(500).json({ error: 'Erreur lors de la récupération des données BTS.' });
  }
});

router.post('/:provider/tables/:tableName', authenticate, async (req, res) => {
  try {
    const databaseName = resolveDatabaseName(req.params.provider);
    if (!databaseName) {
      return res.status(400).json({ error: 'Opérateur BTS invalide.' });
    }

    const tableName = req.params.tableName;
    if (!tableName) {
      return res.status(400).json({ error: 'Table BTS invalide.' });
    }

    const exists = await ensureTableExists(databaseName, tableName);
    if (!exists) {
      return res.status(404).json({ error: 'Table BTS introuvable.' });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const columns = await fetchColumnsForTable(databaseName, tableName);
    const allowedColumns = columns.filter((column) => !column.isAutoIncrement);
    const allowedNames = new Set(allowedColumns.map((column) => column.name));

    const entries = Object.entries(payload).filter(
      ([key, value]) => allowedNames.has(key) && value !== undefined
    );

    if (entries.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée valide à insérer.' });
    }

    const columnNames = entries.map(([key]) => key);
    const values = entries.map(([, value]) => (value === '' ? null : value));
    const placeholders = columnNames.map(() => '?').join(', ');
    const columnsSql = columnNames.map((name) => `\`${name}\``).join(', ');

    await database.query(
      `INSERT INTO \`${databaseName}\`.\`${tableName}\` (${columnsSql}) VALUES (${placeholders})`,
      values
    );

    return res.status(201).json({ message: 'Donnée BTS ajoutée avec succès.' });
  } catch (error) {
    console.error('Erreur ajout BTS:', error);
    return res.status(500).json({ error: "Erreur lors de l'ajout dans la table BTS." });
  }
});

export default router;
