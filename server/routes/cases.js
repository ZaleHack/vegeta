import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import CaseService from '../services/CaseService.js';
import Blacklist from '../models/Blacklist.js';
import UserLog from '../models/UserLog.js';

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
    console.error('Erreur liste cases:', err);
    res.status(500).json({ error: 'Erreur récupération cases' });
  }
});

router.get('/:id/share', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(caseId)) {
      return res.status(400).json({ error: 'ID de dossier invalide' });
    }
    const info = await caseService.getShareInfo(caseId, req.user);
    res.json(info);
  } catch (err) {
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (err.message === 'Case not found') {
      return res.status(404).json({ error: 'Opération introuvable' });
    }
    console.error('Erreur récupération partage:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des partages' });
  }
});

router.post('/:id/share', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(caseId)) {
      return res.status(400).json({ error: 'ID de dossier invalide' });
    }
    const shareAll = req.body.shareAll === true || req.body.shareAll === 'true';
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
    const result = await caseService.shareCase(caseId, req.user, { userIds, shareAll });
    res.json(result);
  } catch (err) {
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (err.message === 'Case not found') {
      return res.status(404).json({ error: 'Opération introuvable' });
    }
    if (err.message === 'Division not found for owner') {
      return res.status(400).json({ error: 'Division introuvable pour le responsable' });
    }
    console.error('Erreur mise à jour partage:', err);
    res.status(500).json({ error: 'Erreur lors du partage de l\'opération' });
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
    console.error('Erreur création case:', err);
    if (err.message === 'User not found') {
      return res.status(400).json({ error: 'Utilisateur inexistant' });
    }
    res.status(500).json({ error: 'Erreur création case' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(caseId)) {
      return res.status(400).json({ error: 'ID de dossier invalide' });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nom requis' });
    }

    const updated = await caseService.renameCase(caseId, name.trim(), req.user);
    res.json({ id: updated.id, name: updated.name });
  } catch (err) {
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (err.message === 'Case not found') {
      return res.status(404).json({ error: 'Opération introuvable' });
    }
    console.error('Erreur renommage case:', err);
    res.status(500).json({ error: "Erreur lors de la mise à jour de l'opération" });
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
    const existingCase = await caseService.getCaseById(caseId, req.user);
    if (!existingCase) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }
    const identifier = req.query.phone || req.query.imei;
    if (!identifier) {
      return res.status(400).json({ error: 'Paramètre phone ou imei requis' });
    }
    const sanitizedIdentifier = String(identifier).trim();
    if (await Blacklist.exists(sanitizedIdentifier)) {
      try {
        await UserLog.create({
          user_id: req.user.id,
          action: 'blacklist_search_attempt',
          details: JSON.stringify({
            alert: true,
            number: sanitizedIdentifier,
            case_id: caseId,
            page: 'cdr-case',
            message: 'Tentative de recherche sur un numéro blacklisté'
          })
        });
      } catch (logError) {
        console.error('Erreur log blacklist:', logError);
      }
      return res.status(403).json({ error: 'Aucun résultat trouvé' });
    }
    const { start, end, startTime, endTime, direction = 'both', type = 'both', location } = req.query;
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
    const validDirections = ['incoming', 'outgoing', 'position', 'both'];
    const validTypes = ['call', 'sms', 'web', 'both'];
    const dirParam = typeof direction === 'string' && validDirections.includes(direction) ? direction : 'both';
    const typeParam = typeof type === 'string' && validTypes.includes(type) ? type : 'both';
    const locParam = typeof location === 'string' && location.trim() ? location.trim() : null;
    const result = await caseService.search(caseId, identifier, {
      startDate: start || null,
      endDate: end || null,
      startTime: startTime || null,
      endTime: endTime || null,
      direction: dirParam,
      type: typeParam,
      location: locParam,
    }, req.user);
    res.json(result);
  } catch (err) {
    console.error('Erreur recherche case:', err);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

router.get('/:id/fraud-detection', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      return res.status(400).json({ error: 'ID de dossier invalide' });
    }

    const { start, end } = req.query;
    const numberParams = req.query.numbers;
    const targetNumbers = [];
    if (Array.isArray(numberParams)) {
      for (const value of numberParams) {
        if (typeof value === 'string' && value.trim()) {
          targetNumbers.push(value.trim());
        }
      }
    } else if (typeof numberParams === 'string' && numberParams.trim()) {
      for (const value of numberParams.split(',')) {
        if (value && value.trim()) {
          targetNumbers.push(value.trim());
        }
      }
    }
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

    const result = await caseService.detectFraud(
      caseId,
      {
        startDate: start || null,
        endDate: end || null,
        targetNumbers
      },
      req.user
    );

    const suspiciousNumbers = new Set();
    for (const imeiEntry of result.imeis || []) {
      for (const numberEntry of imeiEntry.numbers || []) {
        if (numberEntry.status === 'nouveau') {
          suspiciousNumbers.add(numberEntry.number);
        }
      }
    }

    const blacklistHits = [];
    for (const number of suspiciousNumbers) {
      if (await Blacklist.exists(number)) {
        blacklistHits.push(number);
      }
    }

    if (blacklistHits.length > 0) {
      try {
        await UserLog.create({
          user_id: req.user.id,
          action: 'blacklist_fraud_detection',
          details: JSON.stringify({
            alert: true,
            numbers: blacklistHits,
            case_id: caseId,
            page: 'cdr-case',
            message: 'Détection de fraude - numéro blacklisté'
          })
        });
      } catch (logError) {
        console.error('Erreur log blacklist fraude:', logError);
      }
    }

    res.json(result);
  } catch (err) {
    if (err.message === 'Case not found') {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }
    console.error('Erreur détection de fraude:', err);
    res.status(500).json({ error: 'Erreur lors de la détection de fraude' });
  }
});

router.post('/:id/link-diagram', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const { numbers, start: startDate, end: endDate, startTime, endTime } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'Liste de numéros requise' });
    }
    const filters = {
      startDate: typeof startDate === 'string' && startDate.trim() ? startDate.trim() : null,
      endDate: typeof endDate === 'string' && endDate.trim() ? endDate.trim() : null,
      startTime: typeof startTime === 'string' && startTime.trim() ? startTime.trim() : null,
      endTime: typeof endTime === 'string' && endTime.trim() ? endTime.trim() : null
    };
    const result = await caseService.linkDiagram(caseId, numbers, req.user, filters);
    res.json(result);
  } catch (err) {
    console.error('Erreur diagramme des liens:', err);
    res.status(500).json({ error: 'Erreur diagramme des liens' });
  }
});

router.get('/:id/locations', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const locations = await caseService.listLocations(caseId, req.user);
    res.json(locations);
  } catch (err) {
    console.error('Erreur liste localisations case:', err);
    res.status(500).json({ error: 'Erreur récupération localisations' });
  }
});

router.get('/:id/files', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const files = await caseService.listFiles(caseId, req.user);
    res.json(files);
  } catch (err) {
    console.error('Erreur liste fichiers case:', err);
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
    console.error('Erreur suppression fichier case:', err);
    res.status(500).json({ error: 'Erreur suppression fichier' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    await caseService.deleteCase(caseId, req.user);
    res.json({ message: 'Case supprimé' });
  } catch (err) {
    console.error('Erreur suppression case:', err);
    if (err.message === 'Case not found') {
      return res.status(404).json({ error: 'Opération introuvable' });
    }
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    res.status(500).json({ error: 'Erreur suppression case' });
  }
});

router.get('/:id/report', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    if (!Number.isInteger(caseId)) {
      return res.status(400).json({ error: 'ID de dossier invalide' });
    }
    const pdf = await caseService.generateReport(caseId, req.user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="operation-${caseId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'Opération introuvable' });
    }
    console.error('Erreur export rapport case:', err);
    res.status(500).json({ error: 'Erreur export rapport' });
  }
});

export default router;
