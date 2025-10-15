import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import UploadService from '../services/UploadService.js';
import catalogService from '../services/CatalogService.js';
import ingestionQueue from '../services/IngestionQueue.js';
import { authenticate, requirePermission, requireAnyPermission } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const uploadService = new UploadService();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers CSV sont autorisés'));
    }
  }
});

const requireUploadsManage = requirePermission('uploads:manage');
const requireUploadsView = requireAnyPermission(['uploads:view', 'uploads:manage']);
const requireCatalogManage = requirePermission('catalog:manage');

router.post('/csv', authenticate, requireUploadsManage, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { targetTable, uploadMode = 'existing' } = req.body;

    if (!targetTable) {
      await fsp.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Table cible requise' });
    }

    try {
      const job = uploadService.queueCsvUpload({
        filePath: req.file.path,
        targetTable,
        uploadMode,
        user: req.user
      });

      res.status(202).json({
        message: 'Traitement asynchrone planifié',
        job
      });
    } catch (uploadError) {
      await fsp.unlink(req.file.path).catch(() => {});
      throw uploadError;
    }
  } catch (error) {
    console.error('Erreur upload CSV:', error);
    res.status(500).json({
      error: error.message || "Erreur lors de l'upload du fichier"
    });
  }
});

router.post('/file', authenticate, requireUploadsManage, upload.single('dataFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { tableName } = req.body;
    if (!tableName) {
      await fsp.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'Nom de table requis' });
    }

    try {
      const job = uploadService.queueCsvUpload({
        filePath: req.file.path,
        targetTable: tableName,
        uploadMode: 'new_table',
        user: req.user
      });

      res.status(202).json({
        message: 'Création de table planifiée',
        job
      });
    } catch (error) {
      await fsp.unlink(req.file.path).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error('Erreur upload fichier:', error);
    res.status(500).json({ error: error.message || 'Erreur lors du chargement du fichier' });
  }
});

router.get('/history', authenticate, requireUploadsView, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const canSeeAll = Array.isArray(req.user.permissions)
      ? req.user.permissions.includes('uploads:manage')
      : req.user.admin === 1 || req.user.admin === '1';

    const userId = canSeeAll ? null : req.user.id;
    const history = await uploadService.getUploadHistory(userId, limit);
    res.json({ history });
  } catch (error) {
    console.error('Erreur historique upload:', error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'historique" });
  }
});

router.delete('/history/:id', authenticate, requireUploadsManage, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }
    await uploadService.deleteUpload(id);
    res.json({ message: 'Données supprimées' });
  } catch (error) {
    console.error('Erreur suppression upload:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de la suppression' });
  }
});

router.get('/jobs/:id', authenticate, requireUploadsView, (req, res) => {
  const job = ingestionQueue.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job introuvable' });
  }

  const canInspectAll = Array.isArray(req.user.permissions)
    ? req.user.permissions.includes('uploads:manage')
    : req.user.admin === 1 || req.user.admin === '1';

  if (!canInspectAll && job.meta?.userId && job.meta.userId !== req.user.id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  res.json({ job });
});

router.get('/jobs', authenticate, requireUploadsManage, (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  const jobs = ingestionQueue.listJobs({ limit });
  res.json({ jobs });
});

router.get('/databases', authenticate, requireUploadsView, async (req, res) => {
  try {
    const canSeeInactive = Array.isArray(req.user.permissions)
      ? req.user.permissions.includes('catalog:manage')
      : false;
    const databases = await catalogService.listSources({ includeInactive: canSeeInactive });
    res.json({ databases });
  } catch (error) {
    console.error('Erreur catalogue bases:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du catalogue' });
  }
});

router.post('/databases', authenticate, requireCatalogManage, async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.id) {
      return res.status(400).json({ error: 'Identifiant de source requis' });
    }
    const database = await catalogService.upsertSource(payload);
    res.status(201).json({ database });
  } catch (error) {
    console.error('Erreur ajout source:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de la mise à jour du catalogue' });
  }
});

router.patch('/databases/:id', authenticate, requireCatalogManage, async (req, res) => {
  try {
    const update = { ...req.body, id: req.params.id };
    const database = await catalogService.upsertSource(update);
    res.json({ database });
  } catch (error) {
    console.error('Erreur mise à jour source:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de la mise à jour du catalogue' });
  }
});

router.post('/databases/:id/toggle', authenticate, requireCatalogManage, async (req, res) => {
  try {
    const { active } = req.body;
    const database = await catalogService.setSourceActive(req.params.id, Boolean(active));
    res.json({ database });
  } catch (error) {
    console.error('Erreur activation source:', error);
    res.status(500).json({ error: error.message || "Erreur lors de l'activation de la source" });
  }
});

router.delete('/databases/:id', authenticate, requireCatalogManage, async (req, res) => {
  try {
    await catalogService.removeSource(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression source:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de la suppression de la source' });
  }
});

export default router;
