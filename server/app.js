import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Import des routes
import authRoutes from './routes/auth.js';
import searchRoutes from './routes/search.js';
import usersRoutes from './routes/users.js';
import statsRoutes from './routes/stats.js';

// Initialisation de la base de données
import database from './config/database.js';
import initDatabase from './scripts/init-database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares
app.use(cors({
  origin: true,
  credentials: true
}));

// Middleware de logging pour déboguer
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', req.body);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy pour obtenir la vraie IP
app.set('trust proxy', 1);

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/stats', statsRoutes);

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
  res.json({ message: 'API VEGETA - Utilisez /api/* pour les endpoints' });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
  console.error('❌ Erreur non gérée:', error);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Erreur interne du serveur' 
      : error.message 
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Serveur VEGETA démarré sur le port ${PORT}`);
  console.log(`📊 Base de données: MySQL`);
  console.log(`🔒 Mode: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialiser la base de données après le démarrage
  setTimeout(() => {
    initDatabase().catch(console.error);
  }, 3000);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('Arrêt du serveur VEGETA...');
  database.close().then(() => {
    console.log('✅ Connexions fermées');
    process.exit(0);
  });
});