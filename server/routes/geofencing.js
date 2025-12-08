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

router.get('/zones', authenticate, async (_req, res) => {
  try {
    const zones = await geofencingService.listZones();
    res.json(zones);
  } catch (error) {
    console.error('Erreur récupération zones geofencing:', error);
    res.status(500).json({ error: 'Impossible de récupérer les zones' });
  }
});

router.put('/zones/:id', authenticate, async (req, res) => {
  try {
    const zone = await geofencingService.updateZone(Number(req.params.id), req.body);
    res.json(zone);
  } catch (error) {
    console.error('Erreur mise à jour zone geofencing:', error);
    res.status(400).json({ error: error.message || 'Impossible de mettre à jour la zone' });
  }
});

router.delete('/zones/:id', authenticate, async (req, res) => {
  try {
    const result = await geofencingService.deleteZone(Number(req.params.id));
    res.json(result);
  } catch (error) {
    console.error('Erreur suppression zone geofencing:', error);
    res.status(400).json({ error: error.message || 'Impossible de supprimer la zone' });
  }
});

router.post('/zones/:id/toggle', authenticate, async (req, res) => {
  try {
    const zone = await geofencingService.toggleZoneActive(Number(req.params.id), Boolean(req.body.active));
    res.json(zone);
  } catch (error) {
    console.error('Erreur activation/désactivation zone:', error);
    res.status(400).json({ error: error.message || 'Impossible de mettre à jour le statut de la zone' });
  }
});

router.get('/zones/:id/evenements', authenticate, async (req, res) => {
  try {
    const events = await geofencingService.listEvents(Number(req.params.id));
    res.json(events);
  } catch (error) {
    console.error('Erreur récupération événements geofencing:', error);
    res.status(500).json({ error: 'Impossible de récupérer les événements' });
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
