const express = require('express');
const User = require('../models/User.cjs');
const { authRateLimit } = require('../middleware/rateLimiter.cjs');
const { authenticate, authorize } = require('../middleware/auth.cjs');

const router = express.Router();

// Route de connexion
router.post('/login', authRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username et password requis' });
    }

    const user = User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const isValidPassword = await User.validatePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = User.generateToken(user);
    
    // Ne pas renvoyer le mot de passe
    const { password_hash, ...userResponse } = user;

    res.json({
      message: 'Connexion réussie',
      user: userResponse,
      token: token
    });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route de déconnexion
router.post('/logout', authenticate, (req, res) => {
  // Côté client, supprimer le token
  res.json({ message: 'Déconnexion réussie' });
});

// Vérification du token
router.get('/verify', authenticate, (req, res) => {
  const { password_hash, ...userResponse } = req.user;
  res.json({ user: userResponse });
});

// Profil utilisateur
router.get('/profile', authenticate, (req, res) => {
  const { password_hash, ...userResponse } = req.user;
  res.json({ user: userResponse });
});

// Mise à jour du profil
router.patch('/profile', authenticate, async (req, res) => {
  try {
    const { email } = req.body;
    const allowedUpdates = { email };
    
    // Filtrer seulement les champs autorisés
    const updates = {};
    Object.keys(allowedUpdates).forEach(key => {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune mise à jour fournie' });
    }

    const updatedUser = User.update(req.user.id, updates);
    if (!updatedUser) {
      return res.status(400).json({ error: 'Mise à jour impossible' });
    }

    const { password_hash, ...userResponse } = updatedUser;
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Erreur mise à jour profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;