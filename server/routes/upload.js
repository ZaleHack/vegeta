import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import UploadService from '../services/UploadService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import DatabaseCatalogService from '../services/DatabaseCatalogService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const uploadService = new UploadService();
const databaseCatalogService = new DatabaseCatalogService();

// Configuration multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB
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

// Upload d'un fichier CSV
router.post('/csv', authenticate, requireAdmin, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { targetTable, uploadMode = 'existing' } = req.body;

    if (!targetTable) {
      return res.status(400).json({ error: 'Table cible requise' });
    }

    const filePath = req.file.path;
    
    try {
      const result = await uploadService.uploadCSV(
        filePath,
        targetTable,
        uploadMode,
        req.user.id
      );

      // Supprimer le fichier temporaire
      fs.unlinkSync(filePath);

      res.json({
        message: 'Upload terminé avec succès',
        ...result
      });
    } catch (uploadError) {
      // Supprimer le fichier en cas d'erreur
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw uploadError;
    }
  } catch (error) {
    console.error('Erreur upload CSV:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de l\'upload du fichier'
    });
  }
});

// Upload d'un fichier CSV vers une nouvelle table
router.post('/file', authenticate, requireAdmin, upload.single('dataFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { tableName } = req.body;
    if (!tableName) {
      return res.status(400).json({ error: 'Nom de table requis' });
    }

    const filePath = req.file.path;
    const result = await uploadService.uploadCSV(filePath, tableName, 'new_table', req.user.id);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Données chargées avec succès', ...result });
  } catch (error) {
    console.error('Erreur upload fichier:', error);
    res.status(500).json({ error: error.message || 'Erreur lors du chargement du fichier' });
  }
});

// Obtenir l'historique des uploads
router.get('/history', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.user.admin === 1 ? null : req.user.id; // Admin voit tout, user voit ses uploads
    
    const history = await uploadService.getUploadHistory(userId, limit);
    res.json({ history });
  } catch (error) {
    console.error('Erreur historique upload:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
  }
});

// Supprimer les données d'un upload
router.delete('/history/:id', authenticate, requireAdmin, async (req, res) => {
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

// Obtenir la liste des bases disponibles
router.get('/databases', authenticate, async (req, res) => {
  try {
    const includeAll =
      (req.user?.admin === 1 || req.user?.admin === '1') && req.query.scope === 'all';
    const databases = includeAll
      ? await databaseCatalogService.getAll()
      : await databaseCatalogService.getEnabled();
    res.json({ databases });
  } catch (error) {
    console.error('Erreur récupération catalogue bases:', error);
    res.status(500).json({ error: 'Impossible de charger le catalogue des bases' });
  }
});

// Mettre à jour une base du catalogue
router.patch('/databases/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, description, owner, tags, privacy } = req.body || {};

    const updates = {};

    if (typeof enabled === 'boolean') {
      updates.enabled = enabled;
    }

    if (typeof description === 'string') {
      updates.description = description.trim();
    }

    if (owner === null) {
      updates.owner = null;
    } else if (typeof owner === 'string') {
      updates.owner = owner.trim();
    }

    if (Array.isArray(tags)) {
      updates.tags = tags
        .filter((tag) => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }

    if (privacy && typeof privacy === 'object') {
      updates.privacy = {
        level: typeof privacy.level === 'string' ? privacy.level.trim() : undefined,
        rules: typeof privacy.rules === 'string' ? privacy.rules.trim() : undefined
      };
    }

    updates.updatedAt = new Date().toISOString();
    updates.updatedBy = req.user?.login || req.user?.id || null;

    const database = await databaseCatalogService.updateSource(id, updates);
    res.json({ database });
  } catch (error) {
    console.error('Erreur mise à jour catalogue base:', error);
    if (error?.message === 'Source introuvable') {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Impossible de mettre à jour la base' });
  }
});

export default router;
