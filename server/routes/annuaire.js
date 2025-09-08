import express from 'express';
import logger from '../utils/logger.js';
import database from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await database.query(
      'SELECT id, Libelle, Telephone, SousCategorie, Secteur, created_at FROM annuaire_gendarmerie ORDER BY id'
    );
    res.json({ entries: rows });
  } catch (error) {
    logger.error('Erreur annuaire gendarmerie:', error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'annuaire" });
  }
});

export default router;

