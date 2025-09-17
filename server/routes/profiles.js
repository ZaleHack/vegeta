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

const parseBoolean = value => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
};

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
      const profile = await service.create(data, req.user.id, req.files || {});
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
    const { rows, total } = await service.list(req.user, req.query.q, page, limit);
    res.json({ profiles: rows, total });
  } catch (error) {
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

router.post('/:id/archive', async (req, res) => {
  try {
    const profileId = parseInt(req.params.id, 10);
    if (Number.isNaN(profileId)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const shouldArchive = parseBoolean(req.body?.archived);
    const profile = await service.setArchiveStatus(profileId, shouldArchive, req.user);
    res.json({ profile });
  } catch (error) {
    const status = error.message === 'Profil non trouvé' ? 404 : error.message === 'Accès refusé' ? 403 : 500;
    res.status(status).json({ error: error.message });
  }
});

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
