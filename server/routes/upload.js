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
router.get('/databases', authenticate, (req, res) => {
  const databases = [
    { id: 'autres.affaire_etrangere', name: 'autres - affaire_etrangere', description: 'Agents des affaires étrangères' },
    { id: 'autres.agents_collectes_ansd', name: 'autres - agents_collectes_ansd', description: 'Agents de collecte ANSD' },
    { id: 'autres.agents_penitentiare', name: 'autres - agents_penitentiare', description: 'Agents de l’administration pénitentiaire' },
    { id: 'autres.agent_non_fonctionnaire', name: 'autres - agent_non_fonctionnaire', description: 'Agents non fonctionnaires' },
    { id: 'autres.alignement_janvier2024', name: 'autres - alignement_janvier2024', description: 'Alignement janvier 2024' },
    { id: 'autres.annuaire_gendarmerie', name: 'autres - annuaire_gendarmerie', description: 'Annuaire des unités de gendarmerie' },
    { id: 'autres.candidats_ansd', name: 'autres - candidats_ansd', description: 'Candidats ANSD' },
    { id: 'autres.collectes1', name: 'autres - collectes1', description: 'Données collecte population' },
    { id: 'autres.collections', name: 'autres - collections', description: 'Collectes diverses' },
    { id: 'autres.comptable_local', name: 'autres - comptable_local', description: 'Comptables locaux' },
    { id: 'autres.conseil_constitutionel', name: 'autres - conseil_constitutionel', description: 'Personnel du Conseil constitutionnel' },
    { id: 'autres.demdikk', name: 'autres - demdikk', description: 'Personnel Dem Dikk' },
    { id: 'autres.divisions', name: 'autres - divisions', description: 'Divisions administratives internes' },
    { id: 'autres.education', name: 'autres - education', description: 'Agents du ministère de l’éducation' },
    { id: 'autres.entreprises', name: 'autres - entreprises', description: 'Registre des entreprises' },
    { id: 'autres.esolde_new', name: 'autres - esolde_new', description: 'Référentiel esolde (nouvelle version)' },
    { id: 'autres.fichemilitaire', name: 'autres - fichemilitaire', description: 'Fiches militaires' },
    { id: 'autres.fpublique', name: 'autres - fpublique', description: 'Fonction publique' },
    { id: 'autres.identification_requests', name: 'autres - identification_requests', description: 'Demandes d’identification' },
    { id: 'autres.identified_numbers', name: 'autres - identified_numbers', description: 'Numéros identifiés' },
    { id: 'autres.ong', name: 'autres - ong', description: 'Organisations non gouvernementales' },
    { id: 'autres.petrosen', name: 'autres - petrosen', description: 'Contacts Petrosen' },
    { id: 'autres.sanctions', name: 'autres - sanctions', description: 'Sanctions administratives' },
    { id: 'autres.sde_clients', name: 'autres - sde_clients', description: 'Clients SDE' },
    { id: 'autres.search_logs', name: 'autres - search_logs', description: 'Journaux de recherche' },
    { id: 'autres.tresor', name: 'autres - tresor', description: 'Personnel du Trésor' },
    { id: 'autres.uvs', name: 'autres - uvs', description: 'Université virtuelle du Sénégal' },
    { id: 'autres.Vehicules', name: 'autres - vehicules', description: 'Immatriculations véhicules' },
    { id: 'esolde.mytable', name: 'esolde - mytable', description: 'Référentiel esolde historique' },
    { id: 'elections.dakar', name: 'elections - dakar', description: 'Électeurs région de Dakar' },
    { id: 'expresso.expresso', name: 'expresso - expresso', description: 'Données Expresso Money' },
    { id: 'permis.tables', name: 'permis - tables', description: 'Permis de conduire' },
    { id: 'renseignement.agentfinance', name: 'renseignement - agentfinance', description: 'Agents finances publiques' },
    { id: 'rhgendarmerie.personne', name: 'rhgendarmerie - personne', description: 'Personnel gendarmerie' },
    { id: 'rhpolice.personne_concours', name: 'rhpolice - personne_concours', description: 'Concours police nationale' }
  ];

  res.json({ databases });
});

export default router;