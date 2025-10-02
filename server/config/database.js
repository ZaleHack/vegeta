import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.initPromise = null;
    this.isInitialized = false;
    this.init();
  }

  async init() {
    if (!this.initPromise) {
      this.initPromise = this.#initInternal();
    }
    return this.initPromise;
  }

  async #initInternal() {
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
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Erreur connexion MySQL:', error);
      throw error;
    }
  }

  async ensureInitialized() {
    try {
      await this.init();
    } catch (error) {
      throw error;
    }

    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
  }

  async createSystemTables() {
    try {
      const query = (sql, params = []) => this.query(sql, params, { skipInitWait: true });
      const queryOne = (sql, params = []) => this.queryOne(sql, params, { skipInitWait: true });

      // Créer les tables de division et des utilisateurs
      await query(`
        CREATE TABLE IF NOT EXISTS autres.divisions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          login VARCHAR(255) UNIQUE NOT NULL,
          mdp VARCHAR(255) NOT NULL,
          admin TINYINT(1) DEFAULT 0,
          active TINYINT(1) DEFAULT 1,
          division_id INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          otp_secret VARCHAR(255) DEFAULT NULL,
          otp_enabled TINYINT(1) DEFAULT 0,
          INDEX idx_division_id (division_id),
          CONSTRAINT fk_users_division FOREIGN KEY (division_id) REFERENCES autres.divisions(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      const hasActive = await queryOne(`
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'active'
      `);

      if (!hasActive) {
        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD COLUMN active TINYINT(1) DEFAULT 1 AFTER admin
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_FIELDNAME') {
            throw error;
          }
        }
      }

      const hasDivision = await queryOne(`
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'division_id'
      `);

      if (!hasDivision) {
        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD COLUMN division_id INT NULL AFTER active
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_FIELDNAME') {
            throw error;
          }
        }
        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD CONSTRAINT fk_users_division FOREIGN KEY (division_id)
              REFERENCES autres.divisions(id) ON DELETE SET NULL
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_KEYNAME') {
            throw error;
          }
        }
      }

      const hasCreatedAt = await queryOne(`
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'created_at'
      `);

      if (!hasCreatedAt) {
        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER division_id
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_FIELDNAME') {
            throw error;
          }
        }
      }

      const hasUpdatedAt = await queryOne(`
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'updated_at'
      `);

      if (!hasUpdatedAt) {
        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_FIELDNAME') {
            throw error;
          }
        }
      }

      const hasOtpSecret = await queryOne(`
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'otp_secret'
      `);

      if (!hasOtpSecret) {
        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD COLUMN otp_secret VARCHAR(255) DEFAULT NULL AFTER updated_at
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_FIELDNAME') {
            throw error;
          }
        }
      }

      const hasOtpEnabled = await queryOne(`
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'otp_enabled'
      `);

      if (!hasOtpEnabled) {
        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD COLUMN otp_enabled TINYINT(1) DEFAULT 0 AFTER otp_secret
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_FIELDNAME') {
            throw error;
          }
        }
      }

      const defaultDivisions = [
        'Division Cybersecurité',
        'Division Analyse',
        'Division Digitale',
        'Division Recherche Opération',
        'Division Protection'
      ];

      for (const name of defaultDivisions) {
        await query(
          `INSERT INTO autres.divisions (name)
           SELECT ? FROM DUAL WHERE NOT EXISTS (
             SELECT 1 FROM autres.divisions WHERE name = ?
           )`,
          [name, name]
        );
      }

      const fallbackDivision = await queryOne(
        `SELECT id FROM autres.divisions ORDER BY id ASC LIMIT 1`
      );

      if (fallbackDivision?.id) {
        await this.pool.execute(
          `UPDATE autres.users SET division_id = ? WHERE division_id IS NULL AND admin = 0`,
          [fallbackDivision.id]
        );
      }

      const divisionColumn = await queryOne(`
        SELECT IS_NULLABLE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres'
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'division_id'
      `);

      const divisionForeignKey = await queryOne(`
        SELECT kcu.CONSTRAINT_NAME, rc.DELETE_RULE
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
          ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
         AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        WHERE kcu.TABLE_SCHEMA = 'autres'
          AND kcu.TABLE_NAME = 'users'
          AND kcu.COLUMN_NAME = 'division_id'
          AND kcu.REFERENCED_TABLE_NAME = 'divisions'
      `);

      const currentConstraintName = divisionForeignKey?.CONSTRAINT_NAME;
      const currentDeleteRule = divisionForeignKey?.DELETE_RULE;
      const expectedConstraintName = 'fk_users_division';

      const requiresNullableColumn = divisionColumn && divisionColumn.IS_NULLABLE !== 'YES';
      const requiresConstraintUpdate =
        !divisionForeignKey ||
        currentConstraintName !== expectedConstraintName ||
        currentDeleteRule !== 'SET NULL';

      if (requiresNullableColumn || requiresConstraintUpdate) {
        const constraintToDrop = currentConstraintName || expectedConstraintName;

        if (constraintToDrop) {
          try {
            await this.pool.execute(`
              ALTER TABLE autres.users
              DROP FOREIGN KEY \`${constraintToDrop}\`
            `);
          } catch (error) {
            if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
              throw error;
            }
          }
        }

        // Rendre la colonne nullable pour pouvoir nettoyer les lignes orphelines
        await this.pool.execute(`
          ALTER TABLE autres.users
          MODIFY COLUMN division_id INT NULL
        `);

        // Nettoyer les valeurs orphelines avant de recréer la contrainte
        await this.pool.execute(`
          UPDATE autres.users u
          LEFT JOIN autres.divisions d ON d.id = u.division_id
          SET u.division_id = NULL
          WHERE u.division_id IS NOT NULL AND d.id IS NULL
        `);

        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD CONSTRAINT \`${expectedConstraintName}\` FOREIGN KEY (division_id)
              REFERENCES autres.divisions(id) ON DELETE SET NULL
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_KEYNAME' && error.code !== 'ER_CANT_CREATE_TABLE') {
            throw error;
          }
        }
      }

      // Créer la table search_logs
      await query(`
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

      // Table de journalisation des actions utilisateur
      await query(`
        CREATE TABLE IF NOT EXISTS autres.user_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          action VARCHAR(50) NOT NULL,
          details TEXT,
          duration_ms INT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.annuaire_gendarmerie (
          id INT AUTO_INCREMENT PRIMARY KEY,
          Libelle VARCHAR(255) NOT NULL,
          Telephone VARCHAR(50) NOT NULL,
          SousCategorie VARCHAR(255) DEFAULT NULL,
          Secteur VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
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

      await query(`
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

      await query(`
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

      await query(`
        CREATE TABLE IF NOT EXISTS autres.profile_attachments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          profile_id INT NOT NULL,
          file_path VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_profile_id (profile_id),
          FOREIGN KEY (profile_id) REFERENCES autres.profiles(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.profile_shares (
          id INT AUTO_INCREMENT PRIMARY KEY,
          profile_id INT NOT NULL,
          user_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_profile_user (profile_id, user_id),
          INDEX idx_profile_share_profile (profile_id),
          INDEX idx_profile_share_user (user_id),
          FOREIGN KEY (profile_id) REFERENCES autres.profiles(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.identified_numbers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          phone VARCHAR(50) NOT NULL UNIQUE,
          data JSON DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
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

      await query(`
        CREATE TABLE IF NOT EXISTS autres.blacklist (
          id INT AUTO_INCREMENT PRIMARY KEY,
          number VARCHAR(50) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Table des dossiers CDR
      await query(`
        CREATE TABLE IF NOT EXISTS autres.cdr_cases (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.cdr_case_shares (
          id INT AUTO_INCREMENT PRIMARY KEY,
          case_id INT NOT NULL,
          user_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_case_user (case_id, user_id),
          INDEX idx_share_case (case_id),
          INDEX idx_share_user (user_id),
          FOREIGN KEY (case_id) REFERENCES autres.cdr_cases(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Table des fichiers importés par dossier
      await query(`
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
      await query(`
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

      await query(`
        CREATE TABLE IF NOT EXISTS autres.notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          type VARCHAR(50) NOT NULL,
          data TEXT DEFAULT NULL,
          read_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_notification_user (user_id),
          INDEX idx_notification_read (user_id, read_at),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.user_sessions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          logout_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_session_user (user_id),
          INDEX idx_session_login (login_at),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      console.log('✅ Tables système créées avec succès');
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
    }
  }

  async query(sql, params = [], options = {}) {
    try {
      const skipInitWait = Boolean(options.skipInitWait);

      if (!this.pool) {
        await this.ensureInitialized();
      }

      if (!skipInitWait && !this.isInitialized) {
        await this.ensureInitialized();
      }
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async queryOne(sql, params = [], options = {}) {
    try {
      const skipInitWait = Boolean(options.skipInitWait);

      if (!this.pool) {
        await this.ensureInitialized();
      }

      if (!skipInitWait && !this.isInitialized) {
        await this.ensureInitialized();
      }

      const [rows] = await this.pool.execute(sql, params);
      return rows[0] || null;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async transaction(callback) {
    if (!this.pool) {
      await this.ensureInitialized();
    }

    if (!this.isInitialized) {
      await this.ensureInitialized();
    }

    const connection = await this.pool.getConnection();

    const wrapQuery = async (sql, params = []) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    };

    const wrapQueryOne = async (sql, params = []) => {
      const [rows] = await connection.execute(sql, params);
      return rows[0] || null;
    };

    try {
      await connection.beginTransaction();
      const result = await callback({
        query: wrapQuery,
        queryOne: wrapQueryOne
      });
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch (_) {
        // L'initialisation peut avoir échoué, dans ce cas il n'y a rien à fermer
      }
    }

    if (this.pool) {
      await this.pool.end();
      console.log('✅ Connexions MySQL fermées');
    }
  }
}

export default new DatabaseManager();
