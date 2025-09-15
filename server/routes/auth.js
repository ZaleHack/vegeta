import express from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import UserLog from '../models/UserLog.js';

const router = express.Router();

// Route de connexion
router.post('/login', async (req, res) => {
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
      const { mdp, ...userResponse } = user;

      res.json({
        message: 'Connexion réussie',
      user: {
        ...userResponse,
        role: user.admin === 1 ? 'ADMIN' : 'USER'
        },
        token
      });

      // Journaliser la connexion
      try {
        await UserLog.create({ user_id: user.id, action: 'login' });
      } catch (_) {}
    } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
});

  // Route de déconnexion
  router.post('/logout', authenticate, async (req, res) => {
    try {
      let duration = null;
      try {
        const lastLogin = await UserLog.getLastAction(req.user.id, 'login');
        if (lastLogin) {
          duration = Date.now() - new Date(lastLogin.created_at).getTime();
        }
      } catch (_) {}
      await UserLog.create({ user_id: req.user.id, action: 'logout', duration_ms: duration });
    } catch (_) {}
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
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

export default router;
