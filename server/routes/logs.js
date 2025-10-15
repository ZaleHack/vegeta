import express from 'express';
import { authenticate } from '../middleware/auth.js';
import UserLog from '../models/UserLog.js';
import UserSession from '../models/UserSession.js';

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

router.post('/', authenticate, async (req, res) => {
  const { action, details, duration_ms } = req.body;
  try {
    await UserLog.create({
      user_id: req.user.id,
      action,
      details: details ? JSON.stringify(details) : null,
      duration_ms: duration_ms || null
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur création log:', err);
    res.status(500).json({ error: 'Erreur création log' });
  }
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

router.delete('/clear', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });

  try {
    await UserLog.clearAll();
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression logs:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression des logs' });
  }
});

router.get('/sessions', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const username = typeof req.query.username === 'string' ? req.query.username : '';

  try {
    const { rows, total } = await UserSession.getSessions(page, limit, { username });
    res.json({ sessions: rows, total });
  } catch (error) {
    console.error('Erreur récupération sessions utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des sessions' });
  }
});

export default router;
