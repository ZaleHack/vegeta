import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import Blacklist from '../models/Blacklist.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  if (!req.file) {
    return res.status(400).json({ error: 'Fichier requis' });
  }
  const content = req.file.buffer.toString('utf-8');
  const numbers = content
    .split(/[\r\n,;]+/)
    .map(n => n.trim())
    .filter(n => n);
  for (const num of numbers) {
    await Blacklist.add(num);
  }
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
