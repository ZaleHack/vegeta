import express from 'express';
import { authenticate } from '../middleware/auth.js';
import tacDbService from '../services/tacDbService.js';

const router = express.Router();

const normalizeTac = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const digits = String(value).replace(/\D/g, '').trim();
  return digits.length === 8 ? digits : '';
};

router.use(authenticate);

router.get('/search', (req, res) => {
  const { brand, model } = req.query;

  if (!brand && !model) {
    return res.status(400).json({ error: 'Paramètre brand ou model requis' });
  }

  if (brand) {
    const results = tacDbService.searchByBrand(brand);
    return res.json({ query: { brand }, results });
  }

  const results = tacDbService.searchByModel(model);
  return res.json({ query: { model }, results });
});

router.get('/:tac', (req, res) => {
  const tac = normalizeTac(req.params.tac);
  if (!tac) {
    return res.status(400).json({ error: 'TAC invalide (8 chiffres attendus)' });
  }

  const info = tacDbService.getTacInfo(tac);
  if (!info) {
    return res.status(404).json({ error: 'TAC inconnue' });
  }

  return res.json({ tac, ...info });
});

export default router;
