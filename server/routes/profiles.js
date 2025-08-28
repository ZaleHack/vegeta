import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ProfileService from '../services/ProfileService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
const service = new ProfileService();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/profiles');
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

router.use(authenticate);

router.post('/', upload.single('photo'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.extra_fields && typeof data.extra_fields === 'string') {
      try { data.extra_fields = JSON.parse(data.extra_fields); } catch (_) {}
    }
    const profile = await service.create(data, req.user.id, req.file);
    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

router.patch('/:id', upload.single('photo'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.extra_fields && typeof data.extra_fields === 'string') {
      try { data.extra_fields = JSON.parse(data.extra_fields); } catch (_) {}
    }
    const profile = await service.update(parseInt(req.params.id), data, req.user, req.file);
    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
