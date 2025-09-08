import express from 'express';
import logger from '../utils/logger.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
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
    const cases = await caseService.listCases(req.user);
    res.json(cases);
  } catch (err) {
    logger.error('Erreur liste cases:', err);
    res.status(500).json({ error: 'Erreur récupération cases' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    const newCase = await caseService.createCase(name.trim(), req.user.id);
    res.json(newCase);
  } catch (err) {
    logger.error('Erreur création case:', err);
    if (err.message === 'User not found') {
      return res.status(400).json({ error: 'Utilisateur inexistant' });
    }
    res.status(500).json({ error: 'Erreur création case' });
  }
});

router.post('/:id/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const number = (req.body.cdrNumber || '').toString().trim();
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    if (!number) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Numéro CDR requis' });
    }
    const result = await caseService.importFile(caseId, req.file.path, req.file.originalname, req.user, number);
    fs.unlinkSync(req.file.path);
    res.json({ message: 'CDR importés', ...result });
  } catch (err) {
    logger.error('Erreur import case:', err);
    res.status(500).json({ error: "Erreur lors de l'import du fichier" });
  }
});

router.get('/:id/search', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      return res.status(400).json({ error: 'ID de dossier invalide' });
    }
    const existingCase = await caseService.getCaseById(caseId, req.user);
    if (!existingCase) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }
    const identifier = req.query.phone || req.query.imei;
    if (!identifier) {
      return res.status(400).json({ error: 'Paramètre phone ou imei requis' });
    }
    const { start, end, startTime, endTime, direction = 'both', type = 'both' } = req.query;
    const isValidDate = (str) => {
      if (!str) return false;
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      if (!regex.test(str)) return false;
      return !isNaN(new Date(str).getTime());
    };
    const isValidTime = (str) => {
      const regex = /^\d{2}:\d{2}(?::\d{2})?$/;
      return regex.test(str);
    };
    if ((start && !isValidDate(start)) || (end && !isValidDate(end))) {
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD)' });
    }
    if ((startTime && !isValidTime(startTime)) || (endTime && !isValidTime(endTime))) {
      return res.status(400).json({ error: "Format d'heure invalide (HH:MM ou HH:MM:SS)" });
    }
    if (start && end && new Date(start) > new Date(end)) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin' });
    }
    const validDirections = ['incoming', 'outgoing', 'both'];
    const validTypes = ['call', 'sms', 'both'];
    const dirParam = typeof direction === 'string' && validDirections.includes(direction) ? direction : 'both';
    const typeParam = typeof type === 'string' && validTypes.includes(type) ? type : 'both';
    const result = await caseService.search(caseId, identifier, {
      startDate: start || null,
      endDate: end || null,
      startTime: startTime || null,
      endTime: endTime || null,
      direction: dirParam,
      type: typeParam,
    }, req.user);
    res.json(result);
  } catch (err) {
    logger.error('Erreur recherche case:', err);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

router.post('/:id/link-diagram', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const { numbers } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'Liste de numéros requise' });
    }
    const result = await caseService.linkDiagram(caseId, numbers, req.user);
    res.json(result);
  } catch (err) {
    logger.error('Erreur diagramme des liens:', err);
    res.status(500).json({ error: 'Erreur diagramme des liens' });
  }
});

router.get('/:id/files', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const files = await caseService.listFiles(caseId, req.user);
    res.json(files);
  } catch (err) {
    logger.error('Erreur liste fichiers case:', err);
    res.status(500).json({ error: 'Erreur récupération fichiers' });
  }
});

router.delete('/:id/files/:fileId', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const fileId = parseInt(req.params.fileId, 10);
    await caseService.deleteFile(caseId, fileId, req.user);
    res.json({ message: 'Fichier supprimé' });
  } catch (err) {
    logger.error('Erreur suppression fichier case:', err);
    res.status(500).json({ error: 'Erreur suppression fichier' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    await caseService.deleteCase(caseId, req.user);
    res.json({ message: 'Case supprimé' });
  } catch (err) {
    logger.error('Erreur suppression case:', err);
    res.status(500).json({ error: 'Erreur suppression case' });
  }
});

export default router;

