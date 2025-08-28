import database from '../config/database.js';

async function createProfilesTable() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS autres.profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      first_name VARCHAR(255) DEFAULT NULL,
      last_name VARCHAR(255) DEFAULT NULL,
      phone VARCHAR(50) DEFAULT NULL,
      email VARCHAR(255) DEFAULT NULL,
      extra_fields TEXT,
      photo_path VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createProfilesTable()
    .then(() => {
      console.log('✅ Table profiles prête');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Erreur création table profiles:', err);
      process.exit(1);
    });
}

export default createProfilesTable;
