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
    console.log('🔐 Login attempt received');
    console.log('🔐 Request body:', req.body);
    
    const { login, password } = req.body;

    if (!login || !password) {
      console.log('❌ Missing login or password');
      return res.status(400).json({ error: 'Login et mot de passe requis' });
    }

    console.log('🔍 Searching for user:', login);
    const user = await User.findByLogin(login);
    if (!user) {
      console.log('❌ User not found:', login);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    console.log('✅ User found, validating password');
    const isValidPassword = await User.validatePassword(password, user.mdp);
    if (!isValidPassword) {
      console.log('❌ Invalid password for:', login);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    console.log('✅ Password valid, generating token');
    const token = User.generateToken(user);
    
    // Ne pas renvoyer le mot de passe
    const { mdp, ...userResponse } = user;

    console.log('✅ Login successful for:', login);
    const response = {
      message: 'Connexion réussie',
      user: {
        ...userResponse,
        role: user.admin === 1 ? 'ADMIN' : 'USER'
      },
      token: token
    };
    
    console.log('📤 Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('❌ Login error:', error);
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