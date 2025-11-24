import express from 'express';
import { authenticate } from '../middleware/auth.js';
import realtimeCdrService from '../services/RealtimeCdrService.js';

const router = express.Router();

const isValidDate = (value) => {
  if (!value) return false;
  const str = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const date = new Date(str);
  return !Number.isNaN(date.getTime());
};

router.get('/', authenticate, async (req, res) => {
  try {
    const { identifier = '', start, end } = req.query;
    const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';

    if (!trimmedIdentifier) {
      return res.status(400).json({ error: 'Numéro ou IMEI requis' });
    }

    if ((start && !isValidDate(start)) || (end && !isValidDate(end))) {
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD)' });
    }

    if (start && end && new Date(start) > new Date(end)) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin' });
    }

    const result = await realtimeCdrService.findAssociations(trimmedIdentifier, {
      startDate: start || null,
      endDate: end || null,
    });

    res.json(result);
  } catch (error) {
    console.error('Erreur détection fraude globale:', error);
    res.status(500).json({ error: 'Erreur lors de la détection de fraude' });
  }
});

export default router;
