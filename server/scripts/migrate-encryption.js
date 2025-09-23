import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import database from '../config/database.js';
import {
  encryptColumnValue,
  getEncryptedTableDefinitions,
  isValueEncrypted
} from '../utils/encrypted-storage.js';
import { getEncryptionMetadata, rotateEncryption } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupDir = path.join(__dirname, '../backups');

async function migrate({ dryRun = false, rotate = false } = {}) {
  await database.ensureInitialized();
  const definitions = getEncryptedTableDefinitions();
  const backup = {
    generatedAt: new Date().toISOString(),
    dryRun,
    rotate,
    encryption: getEncryptionMetadata(),
    tables: {}
  };

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [tableName, config] of Object.entries(definitions)) {
    const columns = Object.keys(config.columns || {});
    if (columns.length === 0) {
      continue;
    }
    const primaryKey = config.primaryKey || 'id';
    const selectCols = [primaryKey, ...columns]
      .map((col) => `\`${col}\``)
      .join(', ');

    console.log(`➡️  Traitement de ${tableName} (${columns.join(', ')})`);
    const rows = await database.query(`SELECT ${selectCols} FROM ${tableName}`);
    const tableBackup = [];
    let tableUpdated = 0;

    for (const row of rows) {
      const pkValue = row[primaryKey];
      if (pkValue === undefined || pkValue === null) {
        console.warn(`⚠️  Ligne sans clé primaire détectée dans ${tableName}, ignorée.`);
        totalSkipped++;
        continue;
      }

      const updates = {};
      const previousValues = {};

      for (const column of columns) {
        const currentValue = row[column];
        if (currentValue === null || currentValue === undefined) {
          continue;
        }
        if (isValueEncrypted(currentValue)) {
          if (!rotate) {
            continue;
          }
          const rotatedValue = rotateEncryption(currentValue);
          if (rotatedValue === currentValue) {
            continue;
          }
          updates[column] = rotatedValue;
          previousValues[column] = currentValue;
          continue;
        }
        const encryptedValue = encryptColumnValue(tableName, column, currentValue);
        if (encryptedValue === currentValue) {
          continue;
        }
        updates[column] = encryptedValue;
        previousValues[column] = currentValue;
      }

      if (Object.keys(updates).length === 0) {
        totalSkipped++;
        continue;
      }

      tableBackup.push({
        [primaryKey]: pkValue,
        previous: previousValues
      });

      if (!dryRun) {
        const setClause = Object.keys(updates)
          .map((column) => `\`${column}\` = ?`)
          .join(', ');
        const values = [...Object.values(updates), pkValue];
        await database.query(
          `UPDATE ${tableName} SET ${setClause} WHERE \`${primaryKey}\` = ?`,
          values
        );
      }

      tableUpdated++;
      totalUpdated++;
    }

    if (tableUpdated > 0) {
      backup.tables[tableName] = tableBackup;
      console.log(`✅ ${tableUpdated} lignes mises à jour pour ${tableName}`);
    } else {
      console.log(`ℹ️  Aucune mise à jour requise pour ${tableName}`);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `encryption-migration-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
  console.log(`📝 Sauvegarde écrite dans ${backupPath}`);
  console.log(`Résumé : ${totalUpdated} lignes chiffrées, ${totalSkipped} lignes ignorées.`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rotate = process.argv.includes('--rotate');
  try {
    await migrate({ dryRun, rotate });
  } catch (error) {
    console.error('❌ Migration interrompue:', error);
    process.exitCode = 1;
  } finally {
    await database.close();
  }
}

main();

