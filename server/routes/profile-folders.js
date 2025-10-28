import express from 'express';
import ProfileService from '../services/ProfileService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const service = new ProfileService();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q : '';
    const { folders } = await service.listFolders(req.user, search);
    res.json({ folders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body || {};
    const folder = await service.createFolder(name, req.user);
    res.status(201).json({ folder });
  } catch (error) {
    if (error.message === 'Nom du dossier requis') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    if (!Number.isInteger(folderId) || folderId <= 0) {
      return res.status(400).json({ error: 'Identifiant de dossier invalide' });
    }
    await service.deleteFolder(folderId, req.user);
    res.json({ success: true });
  } catch (error) {
    if (error.message === 'Dossier introuvable') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Accès refusé') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Impossible de supprimer un dossier contenant des profils') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/share', async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    if (!Number.isInteger(folderId) || folderId <= 0) {
      return res.status(400).json({ error: 'Identifiant de dossier invalide' });
    }
    const info = await service.getFolderShareInfo(folderId, req.user);
    res.json(info);
  } catch (error) {
    if (error.message === 'Dossier introuvable') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Accès refusé') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/share', async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    if (!Number.isInteger(folderId) || folderId <= 0) {
      return res.status(400).json({ error: 'Identifiant de dossier invalide' });
    }
    const shareAll = req.body?.shareAll === true || req.body?.shareAll === 'true';
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const result = await service.shareFolder(folderId, req.user, { userIds, shareAll });
    res.json(result);
  } catch (error) {
    if (error.message === 'Dossier introuvable') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Accès refusé') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Division introuvable pour le propriétaire') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
