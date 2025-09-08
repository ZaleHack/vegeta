import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import IdentificationRequest from '../models/IdentificationRequest.js';

const router = express.Router();

// Créer une nouvelle demande d'identification
router.post('/', authenticate, async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Numéro requis' });
  }
  try {
    const request = await IdentificationRequest.create({
      user_id: req.user.id,
      phone
    });
    res.json(request);
  } catch (error) {
    console.error('Erreur création demande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des demandes
router.get('/', authenticate, async (req, res) => {
  try {
    let requests;
    if (req.user.admin === 1 || req.user.admin === '1') {
      requests = await IdentificationRequest.findAll();
    } else {
      requests = await IdentificationRequest.findByUser(req.user.id);
    }
    res.json(requests);
  } catch (error) {
    console.error('Erreur récupération demandes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mise à jour du statut d'une demande (admin)
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  const { status, profile_id } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Statut requis' });
  }
  try {
    const updated = await IdentificationRequest.updateStatus(req.params.id, status, profile_id);
    res.json(updated);
  } catch (error) {
    console.error('Erreur mise à jour demande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une demande
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const request = await IdentificationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    const isAdmin = req.user.admin === 1 || req.user.admin === '1';
    if (!isAdmin && request.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    await IdentificationRequest.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression demande:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
