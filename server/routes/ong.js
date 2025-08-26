import express from 'express';
import database from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await database.query(
      'SELECT id, OrganizationName, Type, Name, Title, EmailAddress, Telephone, SelectAreaofInterest, SelectSectorsofInterest, created_at FROM ong ORDER BY id'
    );
    res.json({ entries: rows });
  } catch (error) {
    console.error('Erreur récupération ONG:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des ONG' });
  }
});

export default router;
