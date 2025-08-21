import Database from 'better-sqlite3';
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
      console.log('🔌 Initializing SQLite database...');
      
      // Créer la base de données SQLite
      const dbPath = path.join(__dirname, '../../vegeta.db');
      this.db = new Database(dbPath);
      
      console.log('✅ Connexion SQLite établie avec succès');
      console.log('📁 Base de données:', dbPath);

      // Créer les tables système si elles n'existent pas
      await this.createSystemTables();
    } catch (error) {
      console.error('❌ Erreur connexion SQLite:', error);
      throw error;
    }
  }

  async createSystemTables() {
    try {
      console.log('🔧 Création des tables système...');
      
      // Créer la table users
      this.db.exec(`
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
      this.db.exec(`
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
          search_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Table pour l'historique des uploads
      this.db.exec(`
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Créer des tables d'exemple avec des données de test
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS esolde_mytable (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          matricule TEXT,
          nomprenom TEXT,
          cni TEXT,
          telephone TEXT
        )
      `);

      this.db.exec(`
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

      // Insérer des données d'exemple
      const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
      if (userCount.count === 0) {
        console.log('📊 Insertion de données d\'exemple...');
        
        // Données d'exemple pour esolde_mytable
        const insertEsolde = this.db.prepare(`
          INSERT INTO esolde_mytable (matricule, nomprenom, cni, telephone) VALUES (?, ?, ?, ?)
        `);
        
        insertEsolde.run('MAT001', 'Jean Pierre DIOP', '1234567890123', '77 123 45 67');
        insertEsolde.run('MAT002', 'Fatou NDIAYE', '2345678901234', '76 234 56 78');
        insertEsolde.run('MAT003', 'Moussa FALL', '3456789012345', '78 345 67 89');

        // Données d'exemple pour rhpolice_personne_concours
        const insertRhpolice = this.db.prepare(`
          INSERT INTO rhpolice_personne_concours (prenom, nom, date_naiss, lieu_naiss, sexe, adresse, email, telephone, cni, prenom_pere, nom_pere, nom_mere) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        insertRhpolice.run('Aminata', 'SARR', '1990-05-15', 'Dakar', 'F', 'Parcelles Assainies', 'aminata.sarr@email.com', '77 987 65 43', '4567890123456', 'Ibrahima', 'SARR', 'Aissatou DIALLO');
        insertRhpolice.run('Ousmane', 'BA', '1988-12-03', 'Saint-Louis', 'M', 'HLM Grand Yoff', 'ousmane.ba@email.com', '76 876 54 32', '5678901234567', 'Mamadou', 'BA', 'Khady SECK');
      }

      console.log('✅ Tables système créées avec succès');
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
    }
  }

  query(sql, params = []) {
    try {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return this.db.prepare(sql).all(params);
      } else {
        return this.db.prepare(sql).run(params);
      }
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  queryOne(sql, params = []) {
    try {
      return this.db.prepare(sql).get(params) || null;
    } catch (error) {
      console.error('❌ Erreur requête SQL:', error);
      throw error;
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('✅ Connexion SQLite fermée');
    }
  }

  getDb() {
    return this.db;
  }
}

export default new DatabaseManager();