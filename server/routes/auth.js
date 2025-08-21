import express from 'express';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';

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
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Login et mot de passe requis' });
    }

    const user = await User.findByLogin(login);
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const isValidPassword = await User.validatePassword(password, user.mdp);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = User.generateToken(user);
    
    // Ne pas renvoyer le mot de passe
    const { mdp, ...userResponse } = user;

    res.json({
      message: 'Connexion réussie',
      user: {
        ...userResponse,
        role: user.admin === 1 ? 'ADMIN' : 'USER'
      },
      token: token
    });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
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