import express from 'express';
import { authenticate } from '../middleware/auth.js';
import phoneIdentifierService from '../services/PhoneIdentifierService.js';

const router = express.Router();

router.use(authenticate);

router.get('/search', async (req, res) => {
  try {
    const rawNumber = typeof req.query.number === 'string' ? req.query.number : req.query.phone;

    if (!rawNumber || !String(rawNumber).trim()) {
      return res.status(400).json({ error: 'Numéro de téléphone requis' });
    }

    const result = await phoneIdentifierService.findDevicesByNumber(String(rawNumber));
    return res.json(result);
  } catch (error) {
    const message = error?.message || "Impossible d'identifier ce numéro pour le moment";
    console.error('Erreur identification téléphone:', error);
    return res.status(500).json({ error: message });
  }
});

export default router;
