import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkImei, ImeiFunctionalError } from '../services/ImeiService.js';

const router = express.Router();

const parseImei = (value) => (typeof value === 'string' ? value.replace(/\D/g, '') : '');

const handleImeiCheck = async (rawImei, res) => {
  const imei = parseImei(rawImei);

  if (!imei) {
    return res.status(400).json({ error: 'Paramètre IMEI manquant ou invalide' });
  }

  try {
    const result = await checkImei(imei);
    return res.json(result);
  } catch (error) {
    if (error instanceof ImeiFunctionalError) {
      return res.status(404).json({ error: error.message });
    }

    console.error('Erreur lors de la vérification IMEI:', error);
    return res.status(502).json({ error: 'IMEI check API unavailable' });
  }
};

router.get('/check', authenticate, async (req, res) => {
  return handleImeiCheck(req.query.imei, res);
});

router.get('/:imei', authenticate, async (req, res) => {
  return handleImeiCheck(req.params.imei, res);
});

export default router;
