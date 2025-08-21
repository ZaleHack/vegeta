import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
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
      console.log('🔌 Initializing SQLite connection...');
      
      // Créer le répertoire data s'il n'existe pas
      const dbPath = path.join(__dirname, '../../data/vegeta.db');
      
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      console.log('✅ Connexion SQLite établie avec succès');

      // Créer les tables système
      await this.createSystemTables();
    } catch (error) {
      console.error('❌ Erreur connexion SQLite:', error);
      throw error;
    }
  }

  async createSystemTables() {
    try {
      // Créer la table users
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
      
      // Créer la table search_logs
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS search_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          username TEXT,
          search_term TEXT,
          tables_searched TEXT,
          results_count INTEGER DEFAULT 0,
          execution_time_ms INTEGER DEFAULT 0,
          ip_address TEXT,
          user_agent TEXT,
          search_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Créer des tables de démonstration avec des données d'exemple
      await this.createDemoTables();

      console.log('✅ Tables système créées avec succès');
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
    }
  }

  async createDemoTables() {
    try {
      // Table esolde.mytable
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS esolde_mytable (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          matricule TEXT,
          nomprenom TEXT,
          cni TEXT,
          telephone TEXT
        )
      `);

      // Table rhpolice.personne_concours
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS rhpolice_personne_concours (
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
        )
      `);

      // Table autres.entreprises
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS autres_entreprises (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ninea_ninet TEXT,
          raison_social TEXT,
          region TEXT,
          telephone TEXT,
          email TEXT,
          adresse TEXT
        )
      `);

      // Insérer des données de démonstration
      await this.insertDemoData();

    } catch (error) {
      console.error('❌ Erreur création tables de démonstration:', error);
    }
  }

  async insertDemoData() {
    try {
      // Vérifier si des données existent déjà
      const existingData = await this.db.get('SELECT COUNT(*) as count FROM esolde_mytable');
      if (existingData.count > 0) {
        return; // Données déjà présentes
      }

      // Données de démonstration pour esolde
      await this.db.run(`
        INSERT INTO esolde_mytable (matricule, nomprenom, cni, telephone) VALUES
        ('MAT001', 'Jean Pierre Dupont', '1234567890123', '77 123 45 67'),
        ('MAT002', 'Marie Claire Diallo', '2345678901234', '76 234 56 78'),
        ('MAT003', 'Amadou Ba', '3456789012345', '78 345 67 89')
      `);

      // Données de démonstration pour rhpolice
      await this.db.run(`
        INSERT INTO rhpolice_personne_concours (prenom, nom, date_naiss, lieu_naiss, sexe, adresse, email, telephone, cni, prenom_pere, nom_pere, nom_mere) VALUES
        ('Fatou', 'Sall', '1990-05-15', 'Dakar', 'F', '123 Rue de la Paix', 'fatou.sall@email.com', '77 987 65 43', '4567890123456', 'Moussa', 'Sall', 'Aissatou Diop'),
        ('Omar', 'Ndiaye', '1985-12-03', 'Thiès', 'M', '456 Avenue Bourguiba', 'omar.ndiaye@email.com', '76 876 54 32', '5678901234567', 'Ibrahima', 'Ndiaye', 'Khady Fall')
      `);

      // Données de démonstration pour entreprises
      await this.db.run(`
        INSERT INTO autres_entreprises (ninea_ninet, raison_social, region, telephone, email, adresse) VALUES
        ('SN-DKR-2023-A-12345', 'SONATEL SA', 'Dakar', '33 839 90 00', 'contact@sonatel.sn', 'Plateau, Dakar'),
        ('SN-DKR-2023-B-67890', 'SENELEC SA', 'Dakar', '33 839 55 55', 'info@senelec.sn', 'Hann, Dakar')
      `);

      console.log('✅ Données de démonstration insérées');
    } catch (error) {
      console.error('❌ Erreur insertion données de démonstration:', error);
    }
  }

  async query(sql, params = []) {
    try {
      const result = await this.db.all(sql, params);
      return result;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    try {
      const result = await this.db.get(sql, params);
      return result || null;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  async run(sql, params = []) {
    try {
      const result = await this.db.run(sql, params);
      return result;
    } catch (error) {
      console.error('❌ Erreur exécution SQL:', error);
      throw error;
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
      console.log('✅ Connexion SQLite fermée');
    }
  }
}

export default new DatabaseManager();