import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import CdrService from '../services/CdrService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const cdrService = new CdrService();

// Ensure upload directory exists before initializing multer
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

router.post('/upload', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    const filePath = req.file.path;
    const result = await cdrService.importCsv(filePath);
    fs.unlinkSync(filePath);
    res.json({ message: 'CDR importés', ...result });
  } catch (error) {
    console.error('Erreur import CDR:', error);
    res.status(500).json({ error: "Erreur lors de l'import du fichier" });
  }
});

router.get('/search', authenticate, async (req, res) => {
  try {
    const identifier = req.query.phone || req.query.imei;
    if (!identifier) {
      return res.status(400).json({ error: 'Paramètre phone ou imei requis' });
    }
    const { start, end } = req.query;
    const result = await cdrService.search(identifier, {
      startDateTime: start || null,
      endDateTime: end || null
    });
    res.json(result);
  } catch (error) {
    console.error('Erreur recherche CDR:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

export default router;
