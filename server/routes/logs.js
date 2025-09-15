import express from 'express';
import { authenticate } from '../middleware/auth.js';
import UserLog from '../models/UserLog.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const username = req.query.username || '';
  const userId = req.query.userId ? parseInt(req.query.userId) : null;

  const { rows, total } = await UserLog.getLogs(page, limit, username, userId);
  res.json({ logs: rows, total });
});

router.get('/export', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  const username = req.query.username || '';
  const userId = req.query.userId ? parseInt(req.query.userId) : null;
  const { rows } = await UserLog.getLogs(1, 1000, username, userId);
  const headers = ['id','username','action','details','duration_ms','created_at'];
  const csv = [headers.join(',')]
    .concat(rows.map(l => headers.map(h => JSON.stringify(l[h] ?? '')).join(',')))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
  res.send(csv);
});

export default router;
