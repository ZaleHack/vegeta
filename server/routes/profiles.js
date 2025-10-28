import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ProfileService from '../services/ProfileService.js';
import { authenticate } from '../middleware/auth.js';
import UserLog from '../models/UserLog.js';

const router = express.Router();
const service = new ProfileService();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = file.fieldname === 'photo' ? 'profiles' : 'profile-attachments';
    const dir = path.join(__dirname, '../../uploads', subDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

const parseAttachmentPayload = data => {
  if (data.extra_fields && typeof data.extra_fields === 'string') {
    try {
      data.extra_fields = JSON.parse(data.extra_fields);
    } catch (_) {
      data.extra_fields = [];
    }
  }
  if (data.remove_attachment_ids && typeof data.remove_attachment_ids === 'string') {
    try {
      const parsed = JSON.parse(data.remove_attachment_ids);
      data.remove_attachment_ids = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      data.remove_attachment_ids = [];
    }
  }
  if (typeof data.remove_photo === 'string') {
    const lowered = data.remove_photo.toLowerCase();
    data.remove_photo = lowered === '1' || lowered === 'true' || lowered === 'on';
  }
  return data;
};

router.use(authenticate);

router.post(
  '/',
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'attachments', maxCount: 20 }
  ]),
  async (req, res) => {
    try {
      const data = parseAttachmentPayload({ ...req.body });
      const profile = await service.create(data, req.user, req.files || {});
      try {
        await UserLog.create({
          user_id: req.user.id,
          action: 'create_profile',
          details: JSON.stringify({ profile_id: profile.id })
        });
      } catch (_) {}
      res.json({ profile });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const rawFolderId = req.query.folderId;
    let folderId = null;
    if (rawFolderId !== undefined) {
      const trimmed = String(rawFolderId).trim();
      if (trimmed) {
        const parsed = Number(trimmed);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'Identifiant de dossier invalide' });
        }
        folderId = parsed;
      }
    }
    const includeUnassigned = req.query.unassigned === 'true' || req.query.unassigned === '1';
    const { rows, total } = await service.list(
      req.user,
      req.query.q,
      page,
      limit,
      folderId,
      includeUnassigned
    );
    res.json({ profiles: rows, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/share', async (req, res) => {
  try {
    const profileId = parseInt(req.params.id, 10);
    if (!Number.isInteger(profileId)) {
      return res.status(400).json({ error: 'ID de profil invalide' });
    }
    const info = await service.getShareInfo(profileId, req.user);
    res.json(info);
  } catch (error) {
    if (error.message === 'Profil non trouvé') {
      return res.status(404).json({ error: 'Profil introuvable' });
    }
    if (error.message === 'Accès refusé') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/share', async (req, res) => {
  try {
    const profileId = parseInt(req.params.id, 10);
    if (!Number.isInteger(profileId)) {
      return res.status(400).json({ error: 'ID de profil invalide' });
    }
    const shareAll = req.body.shareAll === true || req.body.shareAll === 'true';
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
    const result = await service.shareProfile(profileId, req.user, {
      userIds,
      shareAll
    });
    res.json(result);
  } catch (error) {
    if (error.message === 'Profil non trouvé') {
      return res.status(404).json({ error: 'Profil introuvable' });
    }
    if (error.message === 'Accès refusé') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (error.message === 'Division introuvable pour le propriétaire') {
      return res.status(400).json({ error: "Division introuvable pour le propriétaire du profil" });
    }
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const profile = await service.get(parseInt(req.params.id), req.user);
    if (!profile) return res.status(404).json({ error: 'Profil non trouvé' });
    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch(
  '/:id',
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'attachments', maxCount: 20 }
  ]),
  async (req, res) => {
    try {
      const data = parseAttachmentPayload({ ...req.body });
      const profile = await service.update(parseInt(req.params.id), data, req.user, req.files || {});
      res.json({ profile });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.delete('/:id', async (req, res) => {
  try {
    await service.delete(parseInt(req.params.id), req.user);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const profile = await service.get(parseInt(req.params.id), req.user);
    if (!profile) return res.status(404).json({ error: 'Profil non trouvé' });
    const pdf = await service.generatePDF(profile);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=profile-${profile.id}.pdf`);
    res.send(pdf);
    try {
      await UserLog.create({
        user_id: req.user.id,
        action: 'export_profile',
        details: JSON.stringify({ profile_id: profile.id })
      });
    } catch (_) {}
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
