import express from 'express';
import { authenticate } from '../middleware/auth.js';
import StatsService from '../services/StatsService.js';

const router = express.Router();
const statsService = new StatsService();

router.get('/', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  const limit = parseInt(req.query.limit) || 100;
  const username = req.query.username || '';
  const userId = req.query.userId ? parseInt(req.query.userId) : null;
  const logs = await statsService.getSearchLogs(limit, username, userId);
  res.json({ logs });
});

router.get('/export', authenticate, async (req, res) => {
  const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  const username = req.query.username || '';
  const userId = req.query.userId ? parseInt(req.query.userId) : null;
  const logs = await statsService.getSearchLogs(1000, username, userId);
  const headers = ['id','username','search_term','search_type','search_date','results_count','execution_time_ms'];
  const csv = [headers.join(',')]
    .concat(logs.map(l => headers.map(h => JSON.stringify(l[h] ?? '')).join(',')))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
  res.send(csv);
});

export default router;
