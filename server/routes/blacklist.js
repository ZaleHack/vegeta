import express from 'express';
import { authenticate } from '../middleware/auth.js';
import Blacklist from '../models/Blacklist.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  const list = await Blacklist.list();
  res.json(list);
});

router.post('/', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  const { number } = req.body;
  if (!number || !String(number).trim()) {
    return res.status(400).json({ error: 'Numéro requis' });
  }
  await Blacklist.add(String(number).trim());
  const list = await Blacklist.list();
  res.json(list);
});

router.delete('/:id', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  const id = parseInt(req.params.id, 10);
  if (!id) {
    return res.status(400).json({ error: 'ID invalide' });
  }
  await Blacklist.remove(id);
  const list = await Blacklist.list();
  res.json(list);
});

export default router;
