import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Import des routes
import authRoutes from './routes/auth.js';
import searchRoutes from './routes/search.js';
import usersRoutes from './routes/users.js';
import statsRoutes from './routes/stats.js';
import uploadRoutes from './routes/upload.js';
import annuaireRoutes from './routes/annuaire.js';
import entreprisesRoutes from './routes/entreprises.js';
import ongRoutes from './routes/ong.js';
import vehiculesRoutes from './routes/vehicules.js';
import profilesRoutes from './routes/profiles.js';
import profileFoldersRoutes from './routes/profile-folders.js';
import casesRoutes from './routes/cases.js';
import cdrRoutes from './routes/cdr.js';
import requestsRoutes from './routes/requests.js';
import identifiedNumbersRoutes from './routes/identified-numbers.js';
import blacklistRoutes from './routes/blacklist.js';
import logsRoutes from './routes/logs.js';
import divisionsRoutes from './routes/divisions.js';
import notificationsRoutes from './routes/notifications.js';
import fraudRoutes from './routes/fraud.js';
import imeiRoutes from './routes/imei.js';
import phoneIdentifierRoutes from './routes/phone-identifier.js';
import btsRoutes from './routes/bts.js';
import { authenticate } from './middleware/auth.js';
import { payloadEncryptionMiddleware } from './middleware/payloadEncryption.js';
import requestLogger from './middleware/requestLogger.js';
import {
  ensureEnvironment,
  resolveAllowedOrigins,
  getPayloadEncryptionKey
} from './config/environment.js';

// Initialisation de la base de données
import database from './config/database.js';
import initDatabase from './scripts/init-database.js';

ensureEnvironment();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = new Set(resolveAllowedOrigins());

if (allowedOrigins.size === 0) {
  console.warn(
    '⚠️ Aucun domaine configuré dans CORS_ALLOWED_ORIGINS: seules les requêtes sans en-tête Origin seront acceptées.'
  );
}

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    const error = new Error('CORS_NOT_ALLOWED');
    error.name = 'CORSNotAllowedError';
    return callback(error);
  },
  credentials: true
});

const enforceCors = (req, res, next) => {
  corsMiddleware(req, res, (error) => {
    if (error) {
      const requestOrigin = req.headers.origin || 'unknown';
      console.warn(`❌ Requête CORS refusée depuis l'origine: ${requestOrigin}`);
      if (!res.headersSent) {
        return res.status(403).json({ error: 'Origin not allowed by CORS policy' });
      }
      return;
    }

    if (!res.headersSent) {
      next();
    }
  });
};

const app = express();

// Middlewares
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        blockAllMixedContent: [],
        fontSrc: ["'self'", 'https:', 'data:'],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        upgradeInsecureRequests: []
      }
    },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-site' }
  })
);
app.use(enforceCors);

app.use(payloadEncryptionMiddleware);
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(requestLogger);

const uploadsPath = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
const uploadsRoot = path.resolve(uploadsPath);

app.get('/uploads/*', authenticate, async (req, res) => {
  try {
    const requestedPath = req.params[0] || '';
    const normalized = path
      .normalize(requestedPath)
      .replace(/^(\.{2}(?:[\\/]|$))+/, '');
    const absolutePath = path.resolve(uploadsRoot, normalized);

    if (
      absolutePath !== uploadsRoot &&
      !absolutePath.startsWith(`${uploadsRoot}${path.sep}`)
    ) {
      return res.status(400).json({ error: 'Chemin invalide' });
    }

    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    res.sendFile(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }
    console.error('Erreur lors de la desserte de fichier uploadé:', error);
    res.status(500).json({ error: 'Impossible de récupérer le fichier demandé' });
  }
});

// Trust proxy pour obtenir la vraie IP
app.set('trust proxy', 1);

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/annuaire-gendarmerie', annuaireRoutes);
app.use('/api/entreprises', entreprisesRoutes);
app.use('/api/ong', ongRoutes);
app.use('/api/vehicules', vehiculesRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/profile-folders', profileFoldersRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/cdr', cdrRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/identified-numbers', identifiedNumbersRoutes);
app.use('/api/blacklist', blacklistRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/divisions', divisionsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/fraud-detection', fraudRoutes);
app.use('/api/imei', imeiRoutes);
app.use('/api/phone-identifier', phoneIdentifierRoutes);
app.use('/api/bts', btsRoutes);

app.get('/api/public/payload-encryption-key', (req, res) => {
  try {
    const encryptionKey = getPayloadEncryptionKey();
    res.json({ key: encryptionKey.toString('base64') });
  } catch (error) {
    console.error('Erreur lors de la récupération de la clé de chiffrement des payloads :', error);
    res.status(500).json({ error: 'PAYLOAD_ENCRYPTION_KEY_UNAVAILABLE' });
  }
});

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'MySQL'
  });
});

// Servir l'application React pour toutes les autres routes
app.get('*', (req, res) => {
  res.json({ message: 'API SORA - Utilisez /api/* pour les endpoints' });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
  if (error?.name === 'CORSNotAllowedError') {
    return res.status(403).json({ error: 'Origin not allowed by CORS policy' });
  }

  console.error('❌ Erreur non gérée:', error);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Erreur interne du serveur' 
      : error.message 
  });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Serveur SORA démarré sur le port ${PORT}`);
  console.log(`📊 Base de données: MySQL`);
  console.log(`🔒 Mode: ${process.env.NODE_ENV || 'development'}`);

  // Initialiser la base de données après le démarrage
  setTimeout(() => {
    initDatabase().catch(console.error);
  }, 3000);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`❌ Impossible de démarrer: le port ${PORT} est déjà utilisé.`);
    console.error('👉 Libérez le port ou définissez la variable d\'environnement PORT pour en utiliser un autre.');
  } else {
    console.error('❌ Erreur lors du démarrage du serveur:', error);
  }
  process.exit(1);
});

// Gestion propre de l'arrêt
const shutdown = () => {
  console.log('Arrêt du serveur SORA...');
  server.close(() => {
    database.close()
      .then(() => {
        console.log('✅ Connexions fermées');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Erreur lors de la fermeture de la base de données:', error);
        process.exit(1);
      });
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
