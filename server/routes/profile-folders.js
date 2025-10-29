import express from 'express';
import ProfileService from '../services/ProfileService.js';
import { authenticate } from '../middleware/auth.js';
import UserLog from '../models/UserLog.js';

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
    if (error.message === 'Un dossier avec ce nom existe déjà') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const folderId = Number(req.params.id);
    if (!Number.isInteger(folderId) || folderId <= 0) {
      return res.status(400).json({ error: 'Identifiant de dossier invalide' });
    }
    const { name } = req.body || {};
    const folder = await service.renameFolder(folderId, name, req.user);
    res.json({ folder });
  } catch (error) {
    if (error.message === 'Nom du dossier requis') {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === 'Dossier introuvable') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Accès refusé') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Un dossier avec ce nom existe déjà') {
      return res.status(409).json({ error: error.message });
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
    const result = await service.deleteFolder(folderId, req.user);
    res.json(result);
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

router.get('/:id/pdf', async (req, res) => {
  const folderId = Number(req.params.id);
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return res.status(400).json({ error: 'Identifiant de dossier invalide' });
  }

  try {
    const { buffer, folder, profileCount } = await service.exportFolderPDF(folderId, req.user);
    const rawName = typeof folder?.name === 'string' ? folder.name.trim() : '';
    const normalized = rawName
      ? rawName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase()
      : '';
    const fileName = `${normalized || `dossier-${folderId}`}-profils.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);

    try {
      await UserLog.create({
        user_id: req.user.id,
        action: 'export_profile_folder',
        details: JSON.stringify({ folder_id: folderId, profile_count: profileCount })
      });
    } catch (_) {}
  } catch (error) {
    if (error.message === 'Dossier introuvable') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Accès refusé') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Aucun profil dans ce dossier') {
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
