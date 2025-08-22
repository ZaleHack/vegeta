import express from 'express';
import User from '../models/User.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

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
    const { login, password, role = 'USER', admin } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Login et mot de passe requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Déterminer la valeur admin
    let adminValue = 0;
    if (admin !== undefined) {
      adminValue = admin ? 1 : 0;
    } else if (role === 'ADMIN') {
      adminValue = 1;
    }

    // Vérifier l'unicité
    const existingUser = await User.findByLogin(login);
    if (existingUser) {
      return res.status(400).json({ error: 'Login déjà utilisé' });
    }

    // Créer l'utilisateur
    const newUser = await User.create({ login, mdp: password, admin: adminValue });
    
    const { mdp, ...userResponse } = newUser;
    res.status(201).json({ 
      message: 'Utilisateur créé avec succès',
      user: {
        ...userResponse,
        role: adminValue === 1 ? 'ADMIN' : 'USER'
      }
    });
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  }
});

// Obtenir les détails d'un utilisateur
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const { mdp, ...userResponse } = user;
    res.json({ 
      user: {
        ...userResponse,
        role: user.admin === 1 ? 'ADMIN' : 'USER'
      }
    });
  } catch (error) {
    console.error('Erreur détails utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'utilisateur' });
  }
});

// Modifier un utilisateur (ADMIN seulement)
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { login, role, admin } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    const updates = {};
    if (login !== undefined) updates.login = login;
    
    // Gérer le rôle/admin
    if (admin !== undefined) {
      updates.admin = admin ? 1 : 0;
    } else if (role !== undefined) {
      updates.admin = role === 'ADMIN' ? 1 : 0;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune mise à jour fournie' });
    }

    // Vérifier que l'utilisateur existe
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Empêcher un admin de se rétrograder lui-même
    if (userId === req.user.id && updates.admin === 0) {
      return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits administrateur' });
    }

    const updatedUser = await User.update(userId, updates);
    if (!updatedUser) {
      return res.status(400).json({ error: 'Mise à jour impossible' });
    }

    const { mdp, ...userResponse } = updatedUser;
    res.json({ 
      message: 'Utilisateur mis à jour avec succès',
      user: {
        ...userResponse,
        role: updatedUser.admin === 1 ? 'ADMIN' : 'USER'
      }
    });
  } catch (error) {
    console.error('Erreur mise à jour utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'utilisateur' });
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

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
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

export default router;