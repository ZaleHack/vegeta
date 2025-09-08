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
}

export default IdentifiedNumber;
