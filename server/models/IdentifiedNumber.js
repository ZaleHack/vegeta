import database from '../config/database.js';

class IdentifiedNumber {
  static archivedAtStrategy = null;

  static async resolveArchivedAtStrategy() {
    if (this.archivedAtStrategy) {
      return this.archivedAtStrategy;
    }

    const row = await database.queryOne(
      `SELECT IS_NULLABLE AS is_nullable, COLUMN_DEFAULT AS column_default
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres'
          AND TABLE_NAME = 'identified_numbers'
          AND COLUMN_NAME = 'archived_at'
        LIMIT 1`
    );

    if (!row) {
      this.archivedAtStrategy = 'none';
      return this.archivedAtStrategy;
    }

    const isNullable = String(row.is_nullable || '').toUpperCase() === 'YES';
    const hasDefault = row.column_default !== null;

    this.archivedAtStrategy = isNullable || hasDefault ? 'set_null' : 'set_now';
    return this.archivedAtStrategy;
  }

  static async upsert(phone, data) {
    const archivedAtStrategy = await this.resolveArchivedAtStrategy();
    const payload = JSON.stringify(data);

    if (archivedAtStrategy === 'set_null') {
      await database.query(
        `INSERT INTO autres.identified_numbers (phone, data, archived_at)
         VALUES (?, ?, NULL)
         ON DUPLICATE KEY UPDATE
           data = VALUES(data),
           archived_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [phone, payload]
      );
      return;
    }

    if (archivedAtStrategy === 'set_now') {
      await database.query(
        `INSERT INTO autres.identified_numbers (phone, data, archived_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           data = VALUES(data),
           updated_at = CURRENT_TIMESTAMP`,
        [phone, payload]
      );
      return;
    }

    await database.query(
      `INSERT INTO autres.identified_numbers (phone, data)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [phone, payload]
    );
  }

  static async findByPhone(phone) {
    const row = await database.queryOne(
      `SELECT * FROM autres.identified_numbers WHERE phone = ?`,
      [phone]
    );
    if (!row) return null;
    return {
      id: row.id,
      phone: row.phone,
      data: row.data ? JSON.parse(row.data) : null,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

export default IdentifiedNumber;
