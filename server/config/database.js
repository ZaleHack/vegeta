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

  static #normalizeRow(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return row;
    }

    return Object.entries(row).reduce((acc, [key, value]) => {
      if (typeof key === 'string') {
        // Conserve the original casing so that consumers relying on the
        // database column names (e.g. Numero_Immatriculation) continue to work
        // while still exposing a lowercase variant for backwards
        // compatibility with existing code paths.
        acc[key] = value;

        const lowerKey = key.toLowerCase();
        if (lowerKey !== key && !Object.prototype.hasOwnProperty.call(acc, lowerKey)) {
          acc[lowerKey] = value;
        }
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  static #normalizeRows(rows) {
    if (!Array.isArray(rows)) {
      return rows;
    }
    return rows.map((row) => DatabaseManager.#normalizeRow(row));
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
      const normalizeColumnType = (columnType) => {
        if (!columnType) {
          return 'INT';
        }

        return columnType
          .split(' ')
          .map((part) =>
            part.replace(/int(\(\d+\))?/i, (match) => match.toUpperCase()).replace(/unsigned/i, 'UNSIGNED')
          )
          .join(' ')
          .trim();
      };

      const escapeDefaultValue = (value) => {
        if (value === null) {
          return 'DEFAULT NULL';
        }

        if (value && typeof value === 'object' && 'raw' in value) {
          return `DEFAULT ${value.raw}`;
        }

        if (typeof value === 'number') {
          return `DEFAULT ${value}`;
        }

        if (typeof value === 'boolean') {
          return `DEFAULT ${value ? 1 : 0}`;
        }

        const stringValue = String(value ?? '');
        const escaped = stringValue.replace(/'/g, "''");
        return `DEFAULT '${escaped}'`;
      };

      const buildColumnDefinition = (definition) => {
        const parts = [definition.type];
        const isNullable = definition.nullable !== false;
        parts.push(isNullable ? 'NULL' : 'NOT NULL');

        const typeUpper = definition.type?.toUpperCase() || '';
        const canHaveDefault = !/(TEXT|BLOB|JSON|GEOMETRY)/.test(typeUpper);

        if (canHaveDefault && Object.prototype.hasOwnProperty.call(definition, 'default')) {
          parts.push(escapeDefaultValue(definition.default));
        }

        if (definition.extra) {
          parts.push(definition.extra);
        }

        return parts.filter(Boolean).join(' ');
      };

      const getColumnInfo = async (tableName, columnName) => {
        const [schemaName, ...rawTableParts] = tableName.split('.');
        const tableId = rawTableParts.join('.');

        if (!schemaName || !tableId) {
          throw new Error(`Table name invalide: ${tableName}`);
        }

        return queryOne(
          `
            SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
          `,
          [schemaName, tableId, columnName]
        );
      };

      const ensureColumnDefinition = async (tableName, columnName, definition, existingInfo = null) => {
        const columnInfo = existingInfo || (await getColumnInfo(tableName, columnName));
        const columnDefinition = buildColumnDefinition(definition);

        const applyColumn = async (action) => {
          const positionClause = definition.after
            ? ` AFTER \`${definition.after}\``
            : definition.first
              ? ' FIRST'
              : '';

          const sqlAction =
            action === 'add'
              ? `ALTER TABLE ${tableName} ADD COLUMN \`${columnName}\` ${columnDefinition}${positionClause}`
              : `ALTER TABLE ${tableName} MODIFY COLUMN \`${columnName}\` ${columnDefinition}`;

          await this.pool.execute(sqlAction);
        };

        if (!columnInfo) {
          await applyColumn('add');
          return { existed: false, changed: true };
        }

        const expectedType = definition.type?.trim().toUpperCase();
        const actualType = columnInfo.COLUMN_TYPE?.trim().toUpperCase();
        const typeMatches = expectedType === actualType;

        const expectedNullable = definition.nullable !== false;
        const actualNullable = columnInfo.IS_NULLABLE === 'YES';
        const nullableMatches = expectedNullable === actualNullable;

        const expectedDefault = Object.prototype.hasOwnProperty.call(definition, 'default')
          ? definition.default
          : undefined;

        let defaultMatches = true;
        if (expectedDefault !== undefined) {
          if (expectedDefault === null) {
            defaultMatches = columnInfo.COLUMN_DEFAULT === null;
          } else if (typeof expectedDefault === 'object' && expectedDefault?.raw) {
            defaultMatches = (columnInfo.COLUMN_DEFAULT || '').toUpperCase() === expectedDefault.raw.toUpperCase();
          } else {
            defaultMatches = (columnInfo.COLUMN_DEFAULT ?? '') === String(expectedDefault);
          }
        }

        const expectedExtra = definition.extra ? definition.extra.trim().toUpperCase() : '';
        const actualExtra = columnInfo.EXTRA ? columnInfo.EXTRA.trim().toUpperCase() : '';
        const extraMatches = expectedExtra === actualExtra;

        if (!typeMatches || !nullableMatches || !defaultMatches || !extraMatches) {
          await applyColumn('modify');
          return { existed: true, changed: true };
        }

        return { existed: true, changed: false };
      };

      const cleanOrphanedDivisionReferences = async () => {
        await this.pool.execute(`
          UPDATE autres.users u
          LEFT JOIN autres.divisions d ON d.id = u.division_id
          SET u.division_id = NULL
          WHERE u.division_id IS NOT NULL AND d.id IS NULL
        `);
      };

      const dropForeignKeyIfExists = async (constraintName) => {
        if (!constraintName) {
          return;
        }
        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            DROP FOREIGN KEY \`${constraintName}\`
          `);
        } catch (error) {
          if (error.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
            throw error;
          }
        }
      };

      const ensureDivisionForeignKey = async (divisionIdColumnType) => {
        const expectedConstraintName = 'fk_users_division';

        const divisionColumn = await queryOne(`
          SELECT COLUMN_TYPE, IS_NULLABLE
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = 'autres'
            AND TABLE_NAME = 'users'
            AND COLUMN_NAME = 'division_id'
        `);

        if (!divisionColumn) {
          return;
        }

        const foreignKeys = await query(`
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

        const hasExpectedConstraint = foreignKeys.some(
          (fk) => fk.CONSTRAINT_NAME === expectedConstraintName && fk.DELETE_RULE === 'SET NULL'
        );

        // Drop unexpected constraints to avoid conflicts when recreating
        for (const fk of foreignKeys) {
          if (fk.CONSTRAINT_NAME !== expectedConstraintName || fk.DELETE_RULE !== 'SET NULL') {
            await dropForeignKeyIfExists(fk.CONSTRAINT_NAME);
          }
        }

        const requiresConstraint = !hasExpectedConstraint;
        const requiresNullableColumn = divisionColumn.IS_NULLABLE !== 'YES';
        const currentColumnType = normalizeColumnType(divisionColumn.COLUMN_TYPE);

        if (requiresNullableColumn || currentColumnType !== normalizeColumnType(divisionIdColumnType)) {
          await this.pool.execute(`
            ALTER TABLE autres.users
            MODIFY COLUMN division_id ${divisionIdColumnType} NULL DEFAULT NULL
          `);
        }

        try {
          await this.pool.execute(`
            ALTER TABLE autres.users
            ADD INDEX idx_division_id (division_id)
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_KEYNAME') {
            throw error;
          }
        }

        await cleanOrphanedDivisionReferences();

        if (requiresConstraint) {
          const tryAddConstraint = async (retry = false) => {
            try {
              await this.pool.execute(`
                ALTER TABLE autres.users
                ADD CONSTRAINT \`${expectedConstraintName}\` FOREIGN KEY (division_id)
                  REFERENCES autres.divisions(id) ON DELETE SET NULL
              `);
            } catch (error) {
              if ((error.code === 'ER_DUP_KEYNAME' || error.code === 'ER_CANT_CREATE_TABLE') && !retry) {
                return;
              }
              if (error.code === 'ER_ERROR_ON_RENAME' && !retry) {
                await cleanOrphanedDivisionReferences();
                await dropForeignKeyIfExists(expectedConstraintName);
                return tryAddConstraint(true);
              }
              if (
                error.code === 'ER_DUP_KEYNAME' ||
                error.code === 'ER_CANT_CREATE_TABLE' ||
                error.code === 'ER_ERROR_ON_RENAME'
              ) {
                return;
              }
              throw error;
            }
          };

          await tryAddConstraint();
        }
      };

      // Créer les tables de division et des utilisateurs
      await query(`
        CREATE TABLE IF NOT EXISTS autres.divisions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      const divisionIdColumnInfo = await queryOne(`
        SELECT COLUMN_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'autres' AND TABLE_NAME = 'divisions' AND COLUMN_NAME = 'id'
      `);
      const divisionIdColumnType = normalizeColumnType(divisionIdColumnInfo?.COLUMN_TYPE);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          login VARCHAR(255) UNIQUE NOT NULL,
          mdp VARCHAR(255) NOT NULL,
          admin TINYINT(1) DEFAULT 0,
          active TINYINT(1) DEFAULT 1,
          division_id ${divisionIdColumnType} DEFAULT NULL,
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
            ADD COLUMN division_id ${divisionIdColumnType} NULL AFTER active
          `);
        } catch (error) {
          if (error.code !== 'ER_DUP_FIELDNAME') {
            throw error;
          }
        }
        await ensureDivisionForeignKey(divisionIdColumnType);
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

      await ensureDivisionForeignKey(divisionIdColumnType);

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
          extra_searches INT NOT NULL DEFAULT 0,
          ip_address VARCHAR(45),
          user_agent TEXT,
          search_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_search_date (search_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await this.pool.execute(`
        UPDATE autres.search_logs
        SET extra_searches = 0
        WHERE extra_searches IS NULL OR extra_searches = ''
      `);

      await ensureColumnDefinition('autres.search_logs', 'extra_searches', {
        type: 'INT',
        nullable: false,
        default: 0,
        after: 'execution_time_ms'
      });

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
          libelle VARCHAR(255) NOT NULL,
          telephone VARCHAR(50) NOT NULL,
          souscategorie VARCHAR(255) DEFAULT NULL,
          secteur VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.uvs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE DEFAULT NULL,
          matricule VARCHAR(100) DEFAULT NULL,
          cni_passeport VARCHAR(100) DEFAULT NULL,
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
          nom VARCHAR(255) NOT NULL,
          prenom VARCHAR(255) NOT NULL,
          date_naissance DATE DEFAULT NULL,
          cni VARCHAR(100) DEFAULT NULL,
          telephone VARCHAR(50) DEFAULT NULL,
          localite VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS autres.profile_folders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_profile_folder_user (user_id),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      const profileFolderIdInfo = await getColumnInfo('autres.profile_folders', 'id');
      const profileFolderIdColumnType = (profileFolderIdInfo?.COLUMN_TYPE || 'INT').toUpperCase();

      await query(`
        CREATE TABLE IF NOT EXISTS autres.profile_folder_shares (
          id INT AUTO_INCREMENT PRIMARY KEY,
          folder_id ${profileFolderIdColumnType} NOT NULL,
          user_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_profile_folder_user (folder_id, user_id),
          INDEX idx_profile_folder_share_folder (folder_id),
          INDEX idx_profile_folder_share_user (user_id),
          FOREIGN KEY (folder_id) REFERENCES autres.profile_folders(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      const profileFolderShareFolderColumnInfo = await getColumnInfo(
        'autres.profile_folder_shares',
        'folder_id'
      );
      await ensureColumnDefinition(
        'autres.profile_folder_shares',
        'folder_id',
        {
          type: profileFolderIdColumnType,
          nullable: false,
          after: 'id'
        },
        profileFolderShareFolderColumnInfo
      );

      await query(`
        CREATE TABLE IF NOT EXISTS autres.profiles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          folder_id ${profileFolderIdColumnType} DEFAULT NULL,
          first_name VARCHAR(255) DEFAULT NULL,
          last_name VARCHAR(255) DEFAULT NULL,
          phone VARCHAR(50) DEFAULT NULL,
          email VARCHAR(255) DEFAULT NULL,
          comment TEXT NOT NULL,
          extra_fields TEXT NOT NULL,
          photo_path VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_folder_id (folder_id),
          FOREIGN KEY (user_id) REFERENCES autres.users(id) ON DELETE CASCADE,
          FOREIGN KEY (folder_id) REFERENCES autres.profile_folders(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      const commentInfo = await getColumnInfo('autres.profiles', 'comment');
      if (commentInfo) {
        await this.pool.execute(
          `UPDATE autres.profiles SET comment = '' WHERE comment IS NULL OR LOWER(TRIM(comment)) = 'null'`
        );
      }
      await ensureColumnDefinition(
        'autres.profiles',
        'comment',
        {
          type: 'TEXT',
          nullable: false,
          after: 'email'
        },
        commentInfo
      );

      const extraFieldsInfo = await getColumnInfo('autres.profiles', 'extra_fields');
      if (extraFieldsInfo) {
        await this.pool.execute(
          `
            UPDATE autres.profiles
            SET extra_fields = '[]'
            WHERE extra_fields IS NULL
              OR TRIM(extra_fields) = ''
              OR LOWER(TRIM(extra_fields)) = 'null'
          `
        );
      }
      await ensureColumnDefinition(
        'autres.profiles',
        'extra_fields',
        {
          type: 'TEXT',
          nullable: false,
          after: 'comment'
        },
        extraFieldsInfo
      );

      const folderColumnInfo = await getColumnInfo('autres.profiles', 'folder_id');
      await ensureColumnDefinition(
        'autres.profiles',
        'folder_id',
        {
          type: profileFolderIdColumnType,
          nullable: true,
          after: 'user_id'
        },
        folderColumnInfo
      );

      const existingFolderFk = await queryOne(
        `
          SELECT CONSTRAINT_NAME
          FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = 'autres'
            AND TABLE_NAME = 'profiles'
            AND COLUMN_NAME = 'folder_id'
            AND REFERENCED_TABLE_NAME = 'profile_folders'
        `
      );
      if (!existingFolderFk) {
        try {
          await query(`
            UPDATE autres.profiles p
            LEFT JOIN autres.profile_folders f ON f.id = p.folder_id
            SET p.folder_id = NULL
            WHERE p.folder_id IS NOT NULL AND f.id IS NULL
          `);
          await query(`
            ALTER TABLE autres.profiles
            ADD CONSTRAINT fk_profiles_folder
            FOREIGN KEY (folder_id) REFERENCES autres.profile_folders(id)
            ON DELETE SET NULL
          `);
        } catch (error) {
          if (!String(error?.message || '').includes('Duplicate')) {
            throw error;
          }
        }
      }

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
      return DatabaseManager.#normalizeRows(rows);
    } catch (error) {
      const suppressErrorCodes = options.suppressErrorCodes || [];
      const suppressErrorLog = Boolean(options.suppressErrorLog);
      const codes = Array.isArray(suppressErrorCodes)
        ? new Set(suppressErrorCodes)
        : new Set([suppressErrorCodes].filter(Boolean));
      const shouldSuppressLog = suppressErrorLog || (codes.size > 0 && codes.has(error.code));

      if (!shouldSuppressLog) {
        console.error('❌ Erreur requête SQL:', error);
      }

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
      const [row] = DatabaseManager.#normalizeRows(rows);
      return row || null;
    } catch (error) {
      const suppressErrorCodes = options.suppressErrorCodes || [];
      const suppressErrorLog = Boolean(options.suppressErrorLog);
      const codes = Array.isArray(suppressErrorCodes)
        ? new Set(suppressErrorCodes)
        : new Set([suppressErrorCodes].filter(Boolean));
      const shouldSuppressLog = suppressErrorLog || (codes.size > 0 && codes.has(error.code));

      if (!shouldSuppressLog) {
        console.error('❌ Erreur requête SQL:', error);
      }

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
      return DatabaseManager.#normalizeRows(rows);
    };

    const wrapQueryOne = async (sql, params = []) => {
      const [rows] = await connection.execute(sql, params);
      const [row] = DatabaseManager.#normalizeRows(rows);
      return row || null;
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
