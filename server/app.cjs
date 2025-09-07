require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import des routes
const authRoutes = require('./routes/auth.cjs');
const searchRoutes = require('./routes/search.cjs');
const statsRoutes = require('./routes/stats.cjs');
const userRoutes = require('./routes/users.cjs');

// Initialisation de la base de données
const db = require('./config/database.cjs');

const app = express();

// Middlewares de sécurité
app.use(helmet({
  contentSecurityPolicy: false, // Désactivé pour le développement
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// Middlewares de parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy pour obtenir la vraie IP
app.set('trust proxy', 1);

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../public')));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/users', userRoutes);

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'MySQL'
  });
});

// Servir l'application frontend pour toutes les autres routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
  console.error('Erreur non gérée:', error);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Erreur interne du serveur' 
      : error.message 
  });
});

// Gestionnaire pour les routes non trouvées
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Serveur Dvine Intelligence démarré sur le port ${PORT}`);
  console.log(`📊 Base de données: MySQL (${process.env.DB_DATABASE})`);
  console.log(`🔒 Mode: ${process.env.NODE_ENV || 'development'}`);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('Arrêt du serveur Dvine Intelligence...');
  db.close().then(() => {
    console.log('✅ Connexions fermées');
    process.exit(0);
  });
});