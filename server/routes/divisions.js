import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import Division from '../models/Division.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const divisions = await Division.findAll();
    res.json({ divisions });
  } catch (error) {
    console.error('Erreur récupération divisions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des divisions' });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nom de division requis' });
    }
    const division = await Division.create(name.trim());
    res.status(201).json({ division });
  } catch (error) {
    console.error('Erreur création division:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la division' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const divisionId = parseInt(req.params.id, 10);
    if (!Number.isInteger(divisionId) || divisionId <= 0) {
      return res.status(400).json({ error: 'ID de division invalide' });
    }

    const division = await Division.findById(divisionId);
    if (!division) {
      return res.status(404).json({ error: 'Division non trouvée' });
    }

    const result = await Division.delete(divisionId);
    if (!result.removed) {
      return res.status(500).json({ error: 'Impossible de supprimer la division' });
    }

    res.json({ success: true, detachedUsers: result.detachedUsers });
  } catch (error) {
    console.error('Erreur suppression division:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la division' });
  }
});

router.get('/:id/users', authenticate, async (req, res) => {
  try {
    const divisionId = parseInt(req.params.id, 10);
    if (!Number.isInteger(divisionId)) {
      return res.status(400).json({ error: 'ID de division invalide' });
    }
    const division = await Division.findById(divisionId);
    if (!division) {
      return res.status(404).json({ error: 'Division non trouvée' });
    }
    const isAdmin = req.user?.admin === 1 || req.user?.admin === '1' || req.user?.admin === true;
    if (!isAdmin && req.user?.division_id !== divisionId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const includeInactive = req.query.includeInactive === 'true';
    const users = await Division.findUsers(divisionId, { includeInactive });
    res.json({ division, users });
  } catch (error) {
    console.error('Erreur récupération utilisateurs division:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

export default router;
