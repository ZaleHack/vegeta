import express from 'express';
import { authenticate } from '../middleware/auth.js';
import CdrService from '../services/CdrService.js';

const router = express.Router();
const cdrService = new CdrService();

const isValidDate = (str) => {
  if (!str) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(str)) return false;
  return !Number.isNaN(new Date(str).getTime());
};

const isValidTime = (str) => {
  const regex = /^\d{2}:\d{2}(?::\d{2})?$/;
  return regex.test(str);
};

router.get('/search', authenticate, async (req, res) => {
  try {
    const identifier = (req.query.identifier || req.query.phone || req.query.imei || '')
      .toString()
      .trim();

    if (!identifier) {
      return res.status(400).json({ error: 'Identifiant requis' });
    }

    const start = req.query.start ? String(req.query.start) : null;
    const end = req.query.end ? String(req.query.end) : null;
    const startTime = req.query.startTime ? String(req.query.startTime) : null;
    const endTime = req.query.endTime ? String(req.query.endTime) : null;
    const location = req.query.location ? String(req.query.location) : null;
    const direction = ['incoming', 'outgoing', 'position', 'both'].includes(
      String(req.query.direction || 'both')
    )
      ? String(req.query.direction || 'both')
      : 'both';
    const type = ['call', 'sms', 'web', 'both'].includes(String(req.query.type || 'both'))
      ? String(req.query.type || 'both')
      : 'both';

    if ((start && !isValidDate(start)) || (end && !isValidDate(end))) {
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD)' });
    }

    if ((startTime && !isValidTime(startTime)) || (endTime && !isValidTime(endTime))) {
      return res.status(400).json({ error: "Format d'heure invalide (HH:MM ou HH:MM:SS)" });
    }

    if (start && end && new Date(start) > new Date(end)) {
      return res
        .status(400)
        .json({ error: 'La date de début doit précéder la date de fin' });
    }

    const result = await cdrService.search(identifier, {
      caseId: cdrService.getGlobalCaseId(),
      startDate: start,
      endDate: end,
      startTime,
      endTime,
      direction,
      type,
      location
    });

    res.json(result);
  } catch (error) {
    console.error('Erreur recherche CDR globale:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche CDR' });
  }
});

export default router;
