import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import UploadService from '../services/UploadService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const uploadService = new UploadService();

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
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
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

// Obtenir la liste des bases disponibles
router.get('/databases', authenticate, (req, res) => {
  const databases = [
    { id: 'esolde.mytable', name: 'esolde - mytable', description: 'Données employés esolde' },
    { id: 'rhpolice.personne_concours', name: 'rhpolice - personne_concours', description: 'Concours police nationale' },
    { id: 'renseignement.agentfinance', name: 'renseignement - agentfinance', description: 'Agents finances publiques' },
    { id: 'rhgendarmerie.personne', name: 'rhgendarmerie - personne', description: 'Personnel gendarmerie' },
    { id: 'permis.tables', name: 'permis - tables', description: 'Permis de conduire' },
    { id: 'expresso.expresso', name: 'expresso - expresso', description: 'Données Expresso Money' },
    { id: 'elections.dakar', name: 'elections - dakar', description: 'Électeurs région Dakar' },
    { id: 'autres.Vehicules', name: 'autres - vehicules', description: 'Immatriculations véhicules' },
    { id: 'autres.entreprises', name: 'autres - entreprises', description: 'Registre des entreprises' }
  ];

  res.json({ databases });
});

export default router;