import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseManager {
  constructor() {
    this.db = null;
    this.init();
  }

  async init() {
    try {
      console.log('🔌 Initializing SQLite database...');
      
      // Créer le dossier data s'il n'existe pas
      const dataDir = path.join(__dirname, '../../data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const dbPath = path.join(dataDir, 'vegeta.db');
      
      // Ouvrir la base SQLite
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      // Configuration SQLite
      await this.db.exec('PRAGMA foreign_keys = ON');
      await this.db.exec('PRAGMA journal_mode = WAL');
      
      console.log('✅ SQLite database connected successfully');
      
      // Créer les tables
      await this.createSystemTables();
      
    } catch (error) {
      console.error('❌ SQLite connection error:', error);
      throw error;
    }
  }

  async createSystemTables() {
    try {
      // Table des utilisateurs
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          login TEXT UNIQUE NOT NULL,
          mdp TEXT NOT NULL,
          admin INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Table pour les logs de recherche
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS search_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          username TEXT,
          search_term TEXT,
          filters TEXT,
          tables_searched TEXT,
          results_count INTEGER DEFAULT 0,
          execution_time_ms INTEGER DEFAULT 0,
          ip_address TEXT,
          user_agent TEXT,
          search_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // Table pour l'historique des uploads
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS upload_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          table_name TEXT,
          file_name TEXT,
          total_rows INTEGER DEFAULT 0,
          success_rows INTEGER DEFAULT 0,
          error_rows INTEGER DEFAULT 0,
          upload_mode TEXT,
          errors TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // Créer les tables de données
      await this.createDataTables();

      // Créer les index
      await this.createIndexes();

      console.log('✅ System tables created successfully');
    } catch (error) {
      console.error('❌ Error creating system tables:', error);
    }
  }

  async createDataTables() {
    const dataTables = [
      // Base esolde - mytable
      `CREATE TABLE IF NOT EXISTS esolde_mytable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matricule TEXT,
        nomprenom TEXT,
        cni TEXT,
        telephone TEXT
      )`,

      // Base rhpolice - personne_concours
      `CREATE TABLE IF NOT EXISTS rhpolice_personne_concours (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenom TEXT,
        nom TEXT,
        date_naiss TEXT,
        lieu_naiss TEXT,
        sexe TEXT,
        adresse TEXT,
        email TEXT,
        telephone TEXT,
        cni TEXT,
        prenom_pere TEXT,
        nom_pere TEXT,
        nom_mere TEXT
      )`,

      // Base renseignement - agentfinance
      `CREATE TABLE IF NOT EXISTS renseignement_agentfinance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        MATRICULE TEXT,
        PRENOM TEXT,
        NOM TEXT,
        CORPS TEXT,
        EMPLOI TEXT,
        SECTION TEXT,
        CHAPITRE TEXT,
        POSTE TEXT,
        DIRECTION TEXT
      )`,

      // Base rhgendarmerie - personne
      `CREATE TABLE IF NOT EXISTS rhgendarmerie_personne (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matricule TEXT,
        prenom TEXT,
        nom TEXT,
        codesex TEXT,
        naissville TEXT,
        adresse TEXT,
        tel TEXT,
        email TEXT,
        carteidentite TEXT,
        pere TEXT,
        mere TEXT
      )`,

      // Base permis - tables
      `CREATE TABLE IF NOT EXISTS permis_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        NumeroPermis TEXT,
        DateObtention TEXT,
        Categorie TEXT,
        Prenoms TEXT,
        Nom TEXT,
        Sexe TEXT,
        DateNaissance TEXT,
        LieuNaissance TEXT,
        Adresse TEXT,
        Numeropiece TEXT
      )`,

      // Base expresso - expresso
      `CREATE TABLE IF NOT EXISTS expresso_expresso (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        prenom TEXT,
        nom TEXT,
        cni TEXT,
        date_creation TEXT,
        datefermeture TEXT
      )`,

      // Base elections - dakar
      `CREATE TABLE IF NOT EXISTS elections_dakar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_electeur TEXT,
        prenoms TEXT,
        nom TEXT,
        datenaiss TEXT,
        lieunaiss TEXT,
        CNI TEXT
      )`,

      // Base autres - Vehicules
      `CREATE TABLE IF NOT EXISTS autres_vehicules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Numero_Immatriculation TEXT,
        Code_Type TEXT,
        Numero_Serie TEXT,
        Categorie TEXT,
        Marque TEXT,
        Genre TEXT,
        Prenoms TEXT,
        Nom TEXT,
        Tel_Fixe TEXT,
        Tel_Portable TEXT
      )`,

      // Base autres - entreprises
      `CREATE TABLE IF NOT EXISTS autres_entreprises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ninea_ninet TEXT,
        raison_social TEXT,
        telephone TEXT,
        email TEXT,
        region TEXT,
        forme_juridique TEXT
      )`
    ];

    for (const sql of dataTables) {
      try {
        await this.db.exec(sql);
      } catch (error) {
        console.error('Error creating data table:', error);
      }
    }
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_search_logs_date ON search_logs(search_date)',
      'CREATE INDEX IF NOT EXISTS idx_search_logs_user ON search_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_users_login ON users(login)',
      'CREATE INDEX IF NOT EXISTS idx_esolde_cni ON esolde_mytable(cni)',
      'CREATE INDEX IF NOT EXISTS idx_rhpolice_cni ON rhpolice_personne_concours(cni)',
      'CREATE INDEX IF NOT EXISTS idx_rhgend_cni ON rhgendarmerie_personne(carteidentite)',
      'CREATE INDEX IF NOT EXISTS idx_vehicules_immat ON autres_vehicules(Numero_Immatriculation)',
      'CREATE INDEX IF NOT EXISTS idx_entreprises_ninea ON autres_entreprises(ninea_ninet)'
    ];

    for (const sql of indexes) {
      try {
        await this.db.exec(sql);
      } catch (error) {
        console.warn('Warning creating index:', error.message);
      }
    }
  }

  async query(sql, params = []) {
    try {
      const rows = await this.db.all(sql, params);
      return rows;
    } catch (error) {
      console.error('❌ SQL query error:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    try {
      const row = await this.db.get(sql, params);
      return row || null;
    } catch (error) {
      console.error('❌ SQL query error:', error);
      throw error;
    }
  }

  async run(sql, params = []) {
    try {
      const result = await this.db.run(sql, params);
      return result;
    } catch (error) {
      console.error('❌ SQL execution error:', error);
      throw error;
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
      console.log('✅ SQLite connections closed');
    }
  }

  getDb() {
    return this.db;
  }
}

export default new DatabaseManager();