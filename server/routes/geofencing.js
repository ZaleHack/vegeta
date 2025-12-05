import express from 'express';
import { authenticate } from '../middleware/auth.js';
import geofencingService from '../services/GeofencingService.js';

const router = express.Router();

router.post('/zones', authenticate, async (req, res) => {
  try {
    const zone = await geofencingService.createZone(req.body);
    res.status(201).json(zone);
  } catch (error) {
    console.error('Erreur création zone geofencing:', error);
    res.status(400).json({ error: error.message || 'Impossible de créer la zone' });
  }
});

router.get('/zones/:id/appareils', authenticate, async (req, res) => {
  try {
    const devices = await geofencingService.devicesInZone(Number(req.params.id));
    res.json(devices);
  } catch (error) {
    console.error('Erreur récupération appareils zone:', error);
    res.status(500).json({ error: 'Impossible de récupérer les appareils' });
  }
});

router.post('/analyser', authenticate, async (req, res) => {
  try {
    const events = await geofencingService.analyzeCdr(req.body);
    res.json({ events });
  } catch (error) {
    console.error('Erreur analyse geofencing:', error);
    res.status(400).json({ error: error.message || 'Analyse impossible' });
  }
});

export default router;
