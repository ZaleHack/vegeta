import express from 'express';
import { authenticate } from '../middleware/auth.js';
import Blacklist from '../models/Blacklist.js';
import UserLog from '../models/UserLog.js';
import realtimeCdrService from '../services/RealtimeCdrService.js';

const router = express.Router();

const isValidDate = (value) => {
  if (!value) {
    return false;
  }
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const date = new Date(text);
  return !Number.isNaN(date.getTime());
};

const isValidTime = (value) => {
  if (!value) {
    return false;
  }
  const text = String(value).trim();
  return /^\d{2}:\d{2}(?::\d{2})?$/.test(text);
};

const normalizePhoneNumber = (value) => {
  if (!value) {
    return '';
  }
  let text = String(value).trim();
  if (!text) {
    return '';
  }
  text = text.replace(/\s+/g, '');
  if (text.startsWith('+')) {
    text = text.slice(1);
  }
  while (text.startsWith('00')) {
    text = text.slice(2);
  }
  text = text.replace(/[^0-9]/g, '');
  if (!text) {
    return '';
  }
  if (text.startsWith('221')) {
    return text;
  }
  const trimmed = text.replace(/^0+/, '');
  return trimmed ? `221${trimmed}` : '';
};

router.get('/realtime/search', authenticate, async (req, res) => {
  try {
    let searchType = 'phone';
    let identifier = '';

    if (typeof req.query.phone === 'string') {
      identifier = req.query.phone;
    } else if (typeof req.query.number === 'string') {
      identifier = req.query.number;
    } else if (typeof req.query.imei === 'string') {
      identifier = req.query.imei;
      searchType = 'imei';
    }

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Identifiant requis' });
    }

    const sanitizedIdentifier = identifier.trim();
    if (searchType === 'phone') {
      const identifierVariants = new Set([sanitizedIdentifier]);
      const normalizedIdentifier = normalizePhoneNumber(sanitizedIdentifier);
      if (normalizedIdentifier) {
        identifierVariants.add(normalizedIdentifier);
      }

      let isBlacklisted = false;
      for (const value of identifierVariants) {
        if (value && (await Blacklist.exists(value))) {
          isBlacklisted = true;
          break;
        }
      }

      if (isBlacklisted) {
        try {
          await UserLog.create({
            user_id: req.user.id,
            action: 'blacklist_search_attempt',
            details: JSON.stringify({
              alert: true,
              number: sanitizedIdentifier,
              page: 'cdr-realtime',
              message: 'Tentative de recherche sur un numéro blacklisté'
            })
          });
        } catch (logError) {
          console.error('Erreur log blacklist:', logError);
        }
        return res.status(403).json({ error: 'Aucun résultat trouvé' });
      }
    }

    const start = typeof req.query.start === 'string' ? req.query.start.trim() : '';
    const end = typeof req.query.end === 'string' ? req.query.end.trim() : '';
    const startTime = typeof req.query.startTime === 'string' ? req.query.startTime.trim() : '';
    const endTime = typeof req.query.endTime === 'string' ? req.query.endTime.trim() : '';

    if ((start && !isValidDate(start)) || (end && !isValidDate(end))) {
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD)' });
    }

    if ((startTime && !isValidTime(startTime)) || (endTime && !isValidTime(endTime))) {
      return res.status(400).json({ error: "Format d'heure invalide (HH:MM ou HH:MM:SS)" });
    }

    if (start && end && new Date(start) > new Date(end)) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin' });
    }

    const result = await realtimeCdrService.search(sanitizedIdentifier, {
      startDate: start || null,
      endDate: end || null,
      startTime: startTime || null,
      endTime: endTime || null,
      searchType
    });

    res.json(result);
  } catch (error) {
    console.error('Erreur recherche CDR temps réel:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

router.post('/realtime/link-diagram', authenticate, async (req, res) => {
  try {
    const { numbers = [], start: startDate, end: endDate, startTime, endTime } = req.body;

    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'Liste de numéros requise' });
    }

    const result = await realtimeCdrService.buildLinkDiagram(numbers, {
      startDate: typeof startDate === 'string' && startDate.trim() ? startDate.trim() : null,
      endDate: typeof endDate === 'string' && endDate.trim() ? endDate.trim() : null,
      startTime: typeof startTime === 'string' && startTime.trim() ? startTime.trim() : null,
      endTime: typeof endTime === 'string' && endTime.trim() ? endTime.trim() : null
    });

    res.json(result);
  } catch (error) {
    console.error('Erreur diagramme des liens temps réel:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du diagramme' });
  }
});

export default router;
