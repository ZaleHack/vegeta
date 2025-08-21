import express from 'express';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import database from '../config/database.js';

const router = express.Router();

// Rate limiting pour les tentatives de connexion
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives par IP
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
});

// Route de connexion
router.post('/login', loginLimiter, async (req, res) => {
  try {
    if (!database.isConnected()) {
      return res.status(503).json({
        error: 'Service d\'authentification indisponible',
        message: 'La base de données MySQL n\'est pas connectée'
      });
    }

    console.log('🔐 POST /api/auth/login - Tentative de connexion');
    console.log('📥 Body reçu:', req.body);
    
    const { login, password } = req.body;

    if (!login || !password) {
      console.log('❌ Login ou password manquant');
      return res.status(400).json({ error: 'Login et mot de passe requis' });
    }

    console.log('🔍 Recherche utilisateur:', login);
    const user = await User.findByLogin(login);
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé:', login);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    console.log('✅ Utilisateur trouvé, validation du mot de passe');
    const isValidPassword = await User.validatePassword(password, user.mdp);
    
    if (!isValidPassword) {
      console.log('❌ Mot de passe invalide pour:', login);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    console.log('✅ Mot de passe valide, génération du token');
    const token = User.generateToken(user);
    
    // Ne pas renvoyer le mot de passe
    const { mdp, ...userResponse } = user;

    console.log('✅ Connexion réussie pour:', login);
    const response = {
      message: 'Connexion réussie',
      user: {
        ...userResponse,
        role: user.admin === 1 ? 'ADMIN' : 'USER'
      },
      token: token
    };
    
    console.log('📤 Envoi de la réponse:', response);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Erreur lors de la connexion:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

// Route de déconnexion
router.post('/logout', (req, res) => {
  res.json({ message: 'Déconnexion réussie' });
});

// Vérification du token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token requis' });
    }

    const decoded = User.verifyToken(token);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    const { mdp, ...userResponse } = user;
    res.json({ 
      user: {
        ...userResponse,
        role: user.admin === 1 ? 'ADMIN' : 'USER'
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

export default router;