const express = require('express');
const User = require('../models/User.cjs');
const { authenticate, authorize } = require('../middleware/auth.cjs');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Lister tous les utilisateurs (ADMIN seulement)
router.get('/', authenticate, authorize(['ADMIN']), (req, res) => {
  try {
    const filters = {
      role: req.query.role,
      is_active: req.query.is_active !== undefined ? parseInt(req.query.is_active) : undefined
    };

    const users = User.findAll(filters);
    res.json({ users });
  } catch (error) {
    console.error('Erreur liste utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

// Créer un nouvel utilisateur (ADMIN seulement)
router.post('/', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const { username, email, password, role = 'LECTEUR' } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email et password requis' });
    }

    if (password.length < 10) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 10 caractères' });
    }

    const allowedRoles = ['ADMIN', 'ANALYSTE', 'LECTEUR'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    // Vérifier l'unicité
    const existingUser = User.findByUsername(username) || User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username ou email déjà utilisé' });
    }

    // Créer l'utilisateur
    const newUser = await User.create({ username, email, password, role });
    const { password_hash, ...userResponse } = newUser;

    res.status(201).json({ 
      message: 'Utilisateur créé avec succès',
      user: userResponse 
    });
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  }
});

// Mettre à jour un utilisateur (ADMIN seulement)
router.patch('/:id', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { email, role, is_active } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    // Validation du rôle si fourni
    if (role) {
      const allowedRoles = ['ADMIN', 'ANALYSTE', 'LECTEUR'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide' });
      }
    }

    const updates = {};
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune mise à jour fournie' });
    }

    // Vérifier que l'utilisateur existe
    const existingUser = User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Empêcher un admin de se désactiver lui-même
    if (userId === req.user.id && updates.is_active === 0) {
      return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
    }

    const updatedUser = User.update(userId, updates);
    if (!updatedUser) {
      return res.status(400).json({ error: 'Mise à jour impossible' });
    }

    const { password_hash, ...userResponse } = updatedUser;
    res.json({ 
      message: 'Utilisateur mis à jour avec succès',
      user: userResponse 
    });
  } catch (error) {
    console.error('Erreur mise à jour utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'utilisateur' });
  }
});

// Changer le mot de passe d'un utilisateur (ADMIN ou propriétaire du compte)
router.post('/:id/change-password', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { current_password, new_password } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    // Vérifier les permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }

    if (!new_password || new_password.length < 10) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 10 caractères' });
    }

    const targetUser = User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Si ce n'est pas un admin, vérifier le mot de passe actuel
    if (req.user.role !== 'ADMIN') {
      if (!current_password) {
        return res.status(400).json({ error: 'Mot de passe actuel requis' });
      }

      const isValidCurrentPassword = await User.validatePassword(current_password, targetUser.password_hash);
      if (!isValidCurrentPassword) {
        return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
      }
    }

    // Changer le mot de passe
    const hashedNewPassword = await bcrypt.hash(new_password, 12);
    User.update(userId, { password_hash: hashedNewPassword });

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur changement mot de passe:', error);
    res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
  }
});

// Obtenir les détails d'un utilisateur
router.get('/:id', authenticate, authorize(['ADMIN']), (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    const user = User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const { password_hash, ...userResponse } = user;
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Erreur détails utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'utilisateur' });
  }
});

module.exports = router;