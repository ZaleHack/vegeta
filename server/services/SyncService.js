import database from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import baseCatalog from '../config/tables-catalog.js';
import logger from '../utils/logger.js';

/**
 * Service utilitaire pour synchroniser les tables configurées.
 * TODO: implémenter la logique de synchronisation spécifique aux besoins.
 */
class SyncService {
  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.catalogPath = path.join(__dirname, '../config/tables-catalog.json');
  }

  loadCatalog() {
    let catalog = { ...baseCatalog };
    try {
      if (fs.existsSync(this.catalogPath)) {
        const raw = fs.readFileSync(this.catalogPath, 'utf-8');
        const json = JSON.parse(raw);
        for (const [key, value] of Object.entries(json)) {
          const [db, ...tableParts] = key.split('_');
          const tableName = `${db}.${tableParts.join('_')}`;
          catalog[tableName] = value;
        }
      }
    } catch (error) {
      logger.error('Erreur chargement catalogue', error);
    }
    return catalog;
  }

  async syncTable(tableName) {
    try {
      // Vérifie l'accès à la table en effectuant une requête simple.
      await database.queryOne(`SELECT 1 FROM ${tableName} LIMIT 1`);
      logger.info(`Table ${tableName} synchronisée`);
    } catch (error) {
      logger.error(`Synchronisation échouée pour ${tableName}: ${error.message}`);
    }
  }

  async syncAllTables() {
    const catalog = this.loadCatalog();
    for (const tableName of Object.keys(catalog)) {
      await this.syncTable(tableName);
    }
  }
}

export default SyncService;

