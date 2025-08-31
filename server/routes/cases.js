import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import CaseService from '../services/CaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const caseService = new CaseService();

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

router.get('/', authenticate, async (req, res) => {
  try {
    const cases = await caseService.listCases();
    res.json(cases);
  } catch (err) {
    console.error('Erreur liste cases:', err);
    res.status(500).json({ error: 'Erreur récupération cases' });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    const newCase = await caseService.createCase(name);
    res.json(newCase);
  } catch (err) {
    console.error('Erreur création case:', err);
    res.status(500).json({ error: 'Erreur création case' });
  }
});

router.post('/:id/upload', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    const result = await caseService.importFile(caseId, req.file.path, req.file.originalname);
    fs.unlinkSync(req.file.path);
    res.json({ message: 'CDR importés', ...result });
  } catch (err) {
    console.error('Erreur import case:', err);
    res.status(500).json({ error: "Erreur lors de l'import du fichier" });
  }
});

router.get('/:id/search', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      return res.status(400).json({ error: 'ID de dossier invalide' });
    }
    const existingCase = await caseService.getCaseById(caseId);
    if (!existingCase) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }
    const identifier = req.query.phone || req.query.imei;
    if (!identifier) {
      return res.status(400).json({ error: 'Paramètre phone ou imei requis' });
    }
    const { start, end } = req.query;
    const isValidDate = (str) => {
      if (!str) return false;
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      if (!regex.test(str)) return false;
      return !isNaN(new Date(str).getTime());
    };
    if ((start && !isValidDate(start)) || (end && !isValidDate(end))) {
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD)' });
    }
    if (start && end && new Date(start) > new Date(end)) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin' });
    }
    const result = await caseService.search(caseId, identifier, {
      startDate: start || null,
      endDate: end || null,
    });
    res.json(result);
  } catch (err) {
    console.error('Erreur recherche case:', err);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

export default router;
