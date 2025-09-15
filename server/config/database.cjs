const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor() {
    const dataDir = path.join(__dirname, '../../data');
    const newDbPath = path.join(dataDir, 'sora.db');
    const oldDbPath = path.join(dataDir, 'vegeta.db');

    // Preserve existing data by migrating the old database file if needed
    if (fs.existsSync(oldDbPath) && !fs.existsSync(newDbPath)) {
      try {
        fs.renameSync(oldDbPath, newDbPath);
      } catch (err) {
        console.error('❌ Erreur lors de la migration de la base de données:', err);
      }
    }

    this.dbPath = newDbPath;
    this.db = null;
    this.init();
  }

  init() {
    try {
      // Créer le dossier data s'il n'existe pas
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Initialiser la base SQLite
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ Erreur connexion SQLite:', err);
          throw err;
        }
        console.log('✅ Base de données SQLite connectée');
      });
      
      // Configuration SQLite
      this.db.run('PRAGMA foreign_keys = ON');
      this.db.run('PRAGMA journal_mode = WAL');
      
      // Créer les tables
      this.createTables();
      
      console.log('✅ Base de données SQLite initialisée avec succès');
    } catch (error) {
      console.error('❌ Erreur initialisation base de données:', error);
      throw error;
    }
  }

  createTables() {
    const tables = [
      // Table des utilisateurs
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'LECTEUR' CHECK(role IN ('ADMIN', 'ANALYSTE', 'LECTEUR')),
        is_active BOOLEAN DEFAULT 1,
        totp_secret TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Table de journalisation des recherches
      `CREATE TABLE IF NOT EXISTS search_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        search_term TEXT,
        filters TEXT,
        tables_searched TEXT,
        results_count INTEGER,
        execution_time_ms INTEGER,
        ip_address TEXT,
        user_agent TEXT,
        search_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )`,

      // Table d'historique des uploads
      `CREATE TABLE IF NOT EXISTS upload_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        table_name TEXT,
        file_name TEXT,
        total_rows INTEGER,
        success_rows INTEGER,
        error_rows INTEGER,
        upload_mode TEXT,
        errors TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )`
    ];

    // Créer les tables de données
    const dataTables = this.getDataTableSchemas();
    tables.push(...dataTables);

    // Exécuter la création des tables
    tables.forEach((sql, index) => {
      this.db.run(sql, (err) => {
        if (err) {
          console.error(`Erreur création table ${index}:`, err);
        }
      });
    });

    // Créer les index après un délai
    setTimeout(() => {
      this.createIndexes();
    }, 1000);
  }

  getDataTableSchemas() {
    return [
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
        COD_SECTION TEXT,
        SECTION TEXT,
        COD_CHAPITRE TEXT,
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
        codereligion TEXT,
        codesituperso TEXT,
        adresse TEXT,
        tel TEXT,
        email TEXT,
        carteidentite TEXT,
        cartedelivre TEXT,
        pere TEXT,
        mere TEXT,
        cartedate TEXT,
        naissdate TEXT,
        dateentree TEXT,
        datesortie TEXT,
        dateservicemil TEXT,
        gradeservice TEXT,
        armeservice TEXT,
        origine TEXT,
        dateserment TEXT
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
        CodeLocalite TEXT,
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
        Date_Immatriculation TEXT,
        Serie_Immatriculation TEXT,
        Categorie TEXT,
        Marque TEXT,
        Appelation_Com TEXT,
        Genre TEXT,
        Carrosserie TEXT,
        Etat_Initial TEXT,
        Immat_Etrangere TEXT,
        Date_Etrangere TEXT,
        Date_Mise_Circulation TEXT,
        Date_Premiere_Immat TEXT,
        Energie TEXT,
        Puissance_Adm TEXT,
        Cylindre TEXT,
        Places_Assises INTEGER,
        PTR TEXT,
        PTAC_Code TEXT,
        Poids_Vide TEXT,
        CU TEXT,
        Prenoms TEXT,
        Nom TEXT,
        Date_Naissance TEXT,
        Exact TEXT,
        Lieu_Naissance TEXT,
        Adresse_Vehicule TEXT,
        Code_Localite TEXT,
        Tel_Fixe TEXT,
        Tel_Portable TEXT,
        PrecImmat TEXT,
        Date_PrecImmat TEXT
      )`,

      // Base autres - entreprises
      `CREATE TABLE IF NOT EXISTS autres_entreprises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ninea_ninet TEXT,
        cuci TEXT,
        raison_social TEXT,
        ensemble_sigle TEXT,
        numrc TEXT,
        syscoa1 TEXT,
        syscoa2 TEXT,
        syscoa3 TEXT,
        naemas TEXT,
        naemas_rev1 TEXT,
        citi_rev4 TEXT,
        adresse TEXT,
        telephone TEXT,
        telephone1 TEXT,
        numero_telecopie TEXT,
        email TEXT,
        bp TEXT,
        region TEXT,
        departement TEXT,
        ville TEXT,
        commune TEXT,
        quartier TEXT,
        personne_contact TEXT,
        adresse_personne_contact TEXT,
        qualite_personne_contact TEXT,
        premiere_annee_exercice INTEGER,
        forme_juridique TEXT,
        regime_fiscal TEXT,
        pays_du_siege_de_lentreprise TEXT,
        nombre_etablissement INTEGER,
        controle TEXT,
        date_reception TEXT,
        libelle_activite_principale TEXT,
        observations TEXT,
        systeme TEXT
      )`,

      // Base autres - annuaire gendarmerie
      `CREATE TABLE IF NOT EXISTS autres_annuaire_gendarmerie (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Libelle TEXT,
        Telephone TEXT,
        SousCategorie TEXT,
        Secteur TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Base autres - uvs
      `CREATE TABLE IF NOT EXISTS autres_uvs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        matricule TEXT,
        cniPasseport TEXT,
        prenom TEXT,
        genre TEXT,
        nom TEXT,
        email TEXT,
        mail_perso TEXT,
        telephone TEXT,
        adresse TEXT,
        eno TEXT,
        pole TEXT,
        filiere TEXT,
        login TEXT
      )`,

      // Base autres - collections
      `CREATE TABLE IF NOT EXISTS autres_collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Nom TEXT,
        Prenom TEXT,
        DateNaissance TEXT,
        CNI TEXT,
        Telephone TEXT,
        Localite TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Autres tables de la base "autres"
      `CREATE TABLE IF NOT EXISTS autres_affaire_etrangere (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenom TEXT,
        nom TEXT,
        cni TEXT,
        corps TEXT,
        emploi TEXT,
        lib_service TEXT,
        lib_org_niv1 TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS autres_agent_non_fonctionnaire (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenom TEXT,
        nom TEXT,
        datenaiss TEXT,
        cni TEXT,
        sexe TEXT,
        corps TEXT,
        emploi TEXT,
        lib_service TEXT,
        lib_org_niv1 TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS autres_fpublique (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cni TEXT,
        login TEXT,
        prenom TEXT,
        nom TEXT,
        email TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS autres_demdikk (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Prenom TEXT,
        Nom TEXT,
        Numero TEXT,
        PassePort TEXT
      )`
    ];
  }

  async createIndexes() {
    let catalog = {};
    try {
      const imported = await import('./tables-catalog.js');
      catalog = imported.default || imported;
    } catch (err) {
      console.warn('⚠️ Impossible de charger le catalogue des tables:', err.message);
    }

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_search_logs_date ON search_logs(search_date)',
      'CREATE INDEX IF NOT EXISTS idx_search_logs_user ON search_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)'
    ];

    for (const [table, config] of Object.entries(catalog)) {
      const sqliteTable = table.replace(/\./g, '_');
      for (const field of config.searchable || []) {
        const indexName = `idx_${sqliteTable}_${field}`;
        indexes.push(
          `CREATE INDEX IF NOT EXISTS ${indexName} ON ${sqliteTable}(${field})`
        );
      }
    }

    indexes.forEach((sql) => {
      this.db.run(sql, (err) => {
        if (err) {
          console.warn('⚠️ Avertissement création index:', err.message);
        }
      });
    });

    console.log('✅ Index créés avec succès');
  }

  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('Erreur requête SQL:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  queryOne(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('Erreur requête SQL:', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('Erreur exécution SQL:', err);
          reject(err);
        } else {
          resolve({ lastInsertRowid: this.lastID, changes: this.changes });
        }
      });
    });
  }

  getDb() {
    return this.db;
  }

  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Erreur fermeture DB:', err);
          } else {
            console.log('✅ Connexions SQLite fermées');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = new DatabaseManager();