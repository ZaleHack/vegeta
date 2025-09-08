import database from '../config/database.js';

class IdentifiedNumber {
  static async upsert(phone, data) {
    await database.query(
      `INSERT INTO autres.identified_numbers (phone, data)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [phone, JSON.stringify(data)]
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
