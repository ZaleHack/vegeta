import sqlite3 from 'sqlite3';
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
      
      return new Promise((resolve, reject) => {
        this.db = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            console.error('❌ Erreur connexion SQLite:', err);
            reject(err);
          } else {
            console.log('✅ Connexion SQLite établie avec succès');
            console.log('📁 Base de données:', dbPath);
            this.createSystemTables().then(resolve).catch(reject);
          }
        });
      });
    } catch (error) {
      console.error('❌ Erreur connexion SQLite:', error);
      throw error;
    }
  }

  async createSystemTables() {
    try {
      console.log('🔧 Création des tables système...');
      
      return new Promise((resolve, reject) => {
        // Créer la table users
        this.db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login TEXT UNIQUE NOT NULL,
            mdp TEXT NOT NULL,
            admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            console.error('❌ Erreur création table users:', err);
            reject(err);
            return;
          }

          // Table pour les logs de recherche
          this.db.run(`
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
          `, (err) => {
            if (err) {
              console.error('❌ Erreur création table search_logs:', err);
              reject(err);
              return;
            }

            // Table pour l'historique des uploads
            this.db.run(`
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
            `, (err) => {
              if (err) {
                console.error('❌ Erreur création table upload_history:', err);
                reject(err);
                return;
              }

              // Créer des tables d'exemple avec des données de test
              this.db.run(`
                CREATE TABLE IF NOT EXISTS esolde_mytable (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  matricule TEXT,
                  nomprenom TEXT,
                  cni TEXT,
                  telephone TEXT
                )
              `, (err) => {
                if (err) {
                  console.error('❌ Erreur création table esolde_mytable:', err);
                  reject(err);
                  return;
                }

                this.db.run(`
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
                `, (err) => {
                  if (err) {
                    console.error('❌ Erreur création table rhpolice_personne_concours:', err);
                    reject(err);
                    return;
                  }

                  // Insérer des données d'exemple
                  this.insertSampleData().then(() => {
                    console.log('✅ Tables système créées avec succès');
                    resolve();
                  }).catch(reject);
                });
              });
            });
          });
        });
      });
    } catch (error) {
      console.error('❌ Erreur création tables système:', error);
      throw error;
    }
  }

  async insertSampleData() {
    return new Promise((resolve, reject) => {
      // Vérifier si des données existent déjà
      this.db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row.count === 0) {
          console.log('📊 Insertion de données d\'exemple...');
          
          // Insérer des données d'exemple pour esolde_mytable
          const insertEsolde = [
            ['MAT001', 'Jean Pierre DIOP', '1234567890123', '77 123 45 67'],
            ['MAT002', 'Fatou NDIAYE', '2345678901234', '76 234 56 78'],
            ['MAT003', 'Moussa FALL', '3456789012345', '78 345 67 89']
          ];

          insertEsolde.forEach(data => {
            this.db.run(
              'INSERT INTO esolde_mytable (matricule, nomprenom, cni, telephone) VALUES (?, ?, ?, ?)',
              data
            );
          });

          // Insérer des données d'exemple pour rhpolice_personne_concours
          const insertRhpolice = [
            ['Aminata', 'SARR', '1990-05-15', 'Dakar', 'F', 'Parcelles Assainies', 'aminata.sarr@email.com', '77 987 65 43', '4567890123456', 'Ibrahima', 'SARR', 'Aissatou DIALLO'],
            ['Ousmane', 'BA', '1988-12-03', 'Saint-Louis', 'M', 'HLM Grand Yoff', 'ousmane.ba@email.com', '76 876 54 32', '5678901234567', 'Mamadou', 'BA', 'Khady SECK']
          ];

          insertRhpolice.forEach(data => {
            this.db.run(
              'INSERT INTO rhpolice_personne_concours (prenom, nom, date_naiss, lieu_naiss, sexe, adresse, email, telephone, cni, prenom_pere, nom_pere, nom_mere) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              data
            );
          });
        }
        resolve();
      });
    });
  }

  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        this.db.all(sql, params, (err, rows) => {
          if (err) {
            console.error('❌ Erreur requête SQL:', err);
            reject(err);
          } else {
            resolve(rows);
          }
        });
      } else {
        this.db.run(sql, params, function(err) {
          if (err) {
            console.error('❌ Erreur requête SQL:', err);
            reject(err);
          } else {
            resolve({ lastID: this.lastID, changes: this.changes });
          }
        });
      }
    });
  }

  queryOne(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('❌ Erreur requête SQL:', err);
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('❌ Erreur fermeture SQLite:', err);
        } else {
          console.log('✅ Connexion SQLite fermée');
        }
      });
    }
  }

  getDb() {
    return this.db;
  }
}

export default new DatabaseManager();