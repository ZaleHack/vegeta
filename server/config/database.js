import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.init();
  }

  async init() {
    try {
      console.log('🔌 Initializing MySQL connection...');
      const baseConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
      };

      // Create database if it doesn't exist
      const tmp = await mysql.createConnection(baseConfig);
      await tmp.query('CREATE DATABASE IF NOT EXISTS autres CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      await tmp.end();

      // Create pool using the "autres" database
      this.pool = mysql.createPool({ ...baseConfig, database: 'autres' });

      // Test de connexion
      const connection = await this.pool.getConnection();
      console.log('✅ Connexion MySQL établie avec succès');
      connection.release();

      // Créer les tables système
      await this.createSystemTables();
    } catch (error) {
      console.error('❌ Erreur connexion MySQL:', error);
      throw error;
    }
  }

  async createSystemTables() {
    try {
      // Créer la table users
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          login VARCHAR(255) UNIQUE NOT NULL,
          mdp VARCHAR(255) NOT NULL,
          admin TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      
      // Créer la table search_logs
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.search_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          username VARCHAR(255),
          search_term TEXT,
          search_type VARCHAR(50),
          tables_searched TEXT,
          results_count INT DEFAULT 0,
          execution_time_ms INT DEFAULT 0,
          ip_address VARCHAR(45),
          user_agent TEXT,
          search_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_search_date (search_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.annuaire_gendarmerie (
          id INT AUTO_INCREMENT PRIMARY KEY,
          Libelle VARCHAR(255) NOT NULL,
          Telephone VARCHAR(50) NOT NULL,
          SousCategorie VARCHAR(255) DEFAULT NULL,
          Secteur VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.uvs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE DEFAULT NULL,
          matricule VARCHAR(100) DEFAULT NULL,
          cniPasseport VARCHAR(100) DEFAULT NULL,
          prenom VARCHAR(255) DEFAULT NULL,
          genre VARCHAR(50) DEFAULT NULL,
          nom VARCHAR(255) DEFAULT NULL,
          email VARCHAR(255) DEFAULT NULL,
          mail_perso VARCHAR(255) DEFAULT NULL,
          telephone VARCHAR(50) DEFAULT NULL,
          adresse VARCHAR(255) DEFAULT NULL,
          eno VARCHAR(100) DEFAULT NULL,
          pole VARCHAR(100) DEFAULT NULL,
          filiere VARCHAR(100) DEFAULT NULL,
          login VARCHAR(255) DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.collections (
          id INT AUTO_INCREMENT PRIMARY KEY,
          Nom VARCHAR(255) NOT NULL,
          Prenom VARCHAR(255) NOT NULL,
          DateNaissance DATE DEFAULT NULL,
          CNI VARCHAR(100) DEFAULT NULL,
          Telephone VARCHAR(50) DEFAULT NULL,
          Localite VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.profiles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          first_name VARCHAR(255) DEFAULT NULL,
          last_name VARCHAR(255) DEFAULT NULL,
          phone VARCHAR(50) DEFAULT NULL,
          email VARCHAR(255) DEFAULT NULL,
          comment TEXT NOT NULL DEFAULT '',
          extra_fields TEXT,
          photo_path VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.identification_requests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          phone VARCHAR(50) NOT NULL,
          status ENUM('pending','identified') DEFAULT 'pending',
          profile_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Table des dossiers CDR
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.cdr_cases (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Table des fichiers importés par dossier
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.cdr_case_files (
          id INT AUTO_INCREMENT PRIMARY KEY,
          case_id INT NOT NULL,
          filename VARCHAR(255) NOT NULL,
          cdr_number VARCHAR(50) DEFAULT NULL,
          line_count INT DEFAULT 0,
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_case_id (case_id),
          FOREIGN KEY (case_id) REFERENCES autres.cdr_cases(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Table des enregistrements CDR reliés à un dossier optionnel
      await this.query(`
        CREATE TABLE IF NOT EXISTS autres.cdr_records (
          id INT AUTO_INCREMENT PRIMARY KEY,
          case_id INT DEFAULT NULL,
          file_id INT DEFAULT NULL,
          oce VARCHAR(50) DEFAULT NULL,
          type_cdr VARCHAR(50) DEFAULT NULL,
          date_debut VARCHAR(50) DEFAULT NULL,
          heure_debut TIME DEFAULT NULL,
          date_fin VARCHAR(50) DEFAULT NULL,
          heure_fin TIME DEFAULT NULL,
          duree INT DEFAULT NULL,
          numero_intl_appelant VARCHAR(50) DEFAULT NULL,
          numero_intl_appele VARCHAR(50) DEFAULT NULL,
          numero_intl_appele_original VARCHAR(50) DEFAULT NULL,
          imei_appelant VARCHAR(50) DEFAULT NULL,
          imei_appele VARCHAR(50) DEFAULT NULL,
          imei_appele_original VARCHAR(50) DEFAULT NULL,
          imsi_appelant VARCHAR(50) DEFAULT NULL,
          imsi_appele VARCHAR(50) DEFAULT NULL,
          cgi_appelant VARCHAR(50) DEFAULT NULL,
          cgi_appele VARCHAR(50) DEFAULT NULL,
          cgi_appele_original VARCHAR(50) DEFAULT NULL,
          latitude DECIMAL(10,6) DEFAULT NULL,
          longitude DECIMAL(10,6) DEFAULT NULL,
          nom_localisation VARCHAR(255) DEFAULT NULL,
          INDEX idx_case_id (case_id),
          INDEX idx_file_id (file_id),
          INDEX idx_numero_appelant (numero_intl_appelant),
          INDEX idx_numero_appele (numero_intl_appele),
          INDEX idx_imei_appelant (imei_appelant),
          INDEX idx_imei_appele (imei_appele),
          FOREIGN KEY (case_id) REFERENCES autres.cdr_cases(id) ON DELETE CASCADE,
          FOREIGN KEY (file_id) REFERENCES autres.cdr_case_files(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      console.log('✅ Tables système créées avec succès');
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
    }
  }

  async query(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows[0] || null;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ Connexions MySQL fermées');
    }
  }
}

export default new DatabaseManager();