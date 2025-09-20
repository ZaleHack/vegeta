import express from 'express';
import { authenticate } from '../middleware/auth.js';
import Notification from '../models/Notification.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const notifications = await Notification.findRecentByUser(req.user.id, isNaN(limit) ? 20 : limit);
    const formatted = notifications.map((item) => ({
      ...item,
      data: item.data ? JSON.parse(item.data) : null
    }));
    res.json({ notifications: formatted });
  } catch (error) {
    console.error('Erreur récupération notifications:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications' });
  }
});

router.post('/:id/read', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'ID de notification invalide' });
    }
    await Notification.markAsRead(id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur mise à jour notification:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la notification' });
  }
});

router.post('/read', authenticate, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    await Notification.markManyAsRead(ids, req.user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur lecture notifications:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des notifications' });
  }
});

export default router;
