const express = require('express');
const User = require('../models/User.js');
const { authenticate, requireAdmin } = require('../middleware/auth.js');

const router = express.Router();

// Lister tous les utilisateurs (ADMIN seulement)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll();
    const usersWithRoles = users.map(user => ({
      ...user,
      role: user.admin === 1 ? 'ADMIN' : 'USER'
    }));
    res.json({ users: usersWithRoles });
  } catch (error) {
    console.error('Erreur liste utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

// Créer un nouvel utilisateur (ADMIN seulement)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { login, password, role = 'USER' } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Login et mot de passe requis' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    const allowedRoles = ['ADMIN', 'USER'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    // Vérifier l'unicité
    const existingUser = await User.findByLogin(login);
    if (existingUser) {
      return res.status(400).json({ error: 'Login déjà utilisé' });
    }

    // Créer l'utilisateur
    const admin = role === 'ADMIN' ? 1 : 0;
    const newUser = await User.create({ login, mdp: password, admin });
    
    const { mdp, ...userResponse } = newUser;
    res.status(201).json({ 
      message: 'Utilisateur créé avec succès',
      user: {
        ...userResponse,
        role: admin === 1 ? 'ADMIN' : 'USER'
      }
    });
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  }
});

// Changer le mot de passe d'un utilisateur
router.post('/:id/change-password', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { currentPassword, newPassword } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    // Vérifier les permissions (admin ou propriétaire du compte)
    if (req.user.admin !== 1 && req.user.id !== userId) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Si ce n'est pas un admin, vérifier le mot de passe actuel
    if (req.user.admin !== 1) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Mot de passe actuel requis' });
      }

      const isValidCurrentPassword = await User.validatePassword(currentPassword, targetUser.mdp);
      if (!isValidCurrentPassword) {
        return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
      }
    }

    // Changer le mot de passe
    await User.update(userId, { mdp: newPassword });

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur changement mot de passe:', error);
    res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
  }
});

// Supprimer un utilisateur (ADMIN seulement)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    // Empêcher un admin de se supprimer lui-même
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    await User.delete(userId);
    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'utilisateur' });
  }
});

module.exports = router;