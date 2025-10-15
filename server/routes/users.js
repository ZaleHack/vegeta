import express from 'express';
import User from '../models/User.js';
import Division from '../models/Division.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import accessControlService from '../services/AccessControlService.js';

const router = express.Router();

// Lister tous les utilisateurs (ADMIN seulement)
router.get('/', authenticate, requirePermission('admin:manage_users'), async (req, res) => {
  try {
    const users = await User.findAll();
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const context = await accessControlService.getUserContext(user.id);
        const { mdp, otp_secret, ...safeUser } = user;
        return {
          ...safeUser,
          roles: context.roles.map((role) => role.name),
          permissions: context.permissions
        };
      })
    );
    res.json({ users: enrichedUsers });
  } catch (error) {
    console.error('Erreur liste utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

// Obtenir un utilisateur spécifique (ADMIN seulement)
router.get('/:id', authenticate, requirePermission('admin:manage_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const context = await accessControlService.getUserContext(userId);
    const { mdp, otp_secret, ...userResponse } = user;
    res.json({
      user: {
        ...userResponse,
        roles: context.roles.map((role) => role.name),
        permissions: context.permissions
      }
    });
  } catch (error) {
    console.error('Erreur détails utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'utilisateur' });
  }
});

// Créer un nouvel utilisateur (ADMIN seulement)
router.post('/', authenticate, requirePermission('admin:manage_users'), async (req, res) => {
  try {
    const { login, password, role = 'USER', roles: incomingRoles, active = true, divisionId } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Login et mot de passe requis' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    const normalizedRoles = Array.isArray(incomingRoles) && incomingRoles.length
      ? incomingRoles.map((name) => String(name))
      : role === 'ADMIN'
        ? ['administrator']
        : ['observer'];

    const isAdminRole = normalizedRoles.includes('administrator');
    let division_id = null;
    let divisionName = null;
    if (!isAdminRole) {
      const parsedDivisionId = Number(divisionId);
      if (!Number.isInteger(parsedDivisionId) || parsedDivisionId <= 0) {
        return res.status(400).json({ error: 'Division invalide' });
      }

      const division = await Division.findById(parsedDivisionId);
      if (!division) {
        return res.status(400).json({ error: 'Division inexistante' });
      }

      division_id = parsedDivisionId;
      divisionName = division.name;
    }

    // Vérifier l'unicité
    const existingUser = await User.findByLogin(login);
    if (existingUser) {
      return res.status(400).json({ error: 'Login déjà utilisé' });
    }

    // Créer l'utilisateur
    const admin = isAdminRole ? 1 : 0;
    const newUser = await User.create({
      login,
      mdp: password,
      admin,
      active: active ? 1 : 0,
      division_id,
      roles: normalizedRoles
    });

    const context = await accessControlService.getUserContext(newUser.id);
    const { mdp, otp_secret, ...userResponse } = newUser;
    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      user: {
        ...userResponse,
        division_name: divisionName,
        roles: context.roles.map((r) => r.name),
        permissions: context.permissions
      }
    });
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  }
});

// Modifier un utilisateur (ADMIN seulement)
router.patch('/:id', authenticate, requirePermission('admin:manage_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { login, admin, password, active, divisionId, roles: incomingRoles, role } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    const updates = {};
    if (login !== undefined) updates.login = login;
    if (admin !== undefined) updates.admin = admin;
    if (active !== undefined) updates.active = active ? 1 : 0;
    if (password !== undefined) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
      }
      updates.mdp = password;
    }

    let rolesToAssign = null;
    if (Array.isArray(incomingRoles)) {
      rolesToAssign = incomingRoles.map((name) => String(name));
    } else if (typeof role === 'string') {
      rolesToAssign = role === 'ADMIN' ? ['administrator'] : ['observer'];
    }

    if (rolesToAssign) {
      updates.admin = rolesToAssign.includes('administrator') ? 1 : 0;
    }

    if (divisionId !== undefined) {
      if (divisionId === null) {
        updates.division_id = null;
      } else {
        const division_id = Number(divisionId);
        if (!Number.isInteger(division_id) || division_id <= 0) {
          return res.status(400).json({ error: 'Division invalide' });
        }
        const division = await Division.findById(division_id);
        if (!division) {
          return res.status(400).json({ error: 'Division inexistante' });
        }
        updates.division_id = division_id;
      }
    }

    if (Object.keys(updates).length === 0 && !rolesToAssign) {
      return res.status(400).json({ error: 'Aucune mise à jour fournie' });
    }

    // Vérifier que l'utilisateur existe
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier l'unicité du login si modifié
    if (login && login !== existingUser.login) {
      const duplicateUser = await User.findByLogin(login);
      if (duplicateUser) {
        return res.status(400).json({ error: 'Login déjà utilisé' });
      }
    }

    const updatedUser = await User.update(userId, {
      ...updates,
      ...(rolesToAssign ? { roles: rolesToAssign } : {})
    });
    if (!updatedUser) {
      return res.status(400).json({ error: 'Mise à jour impossible' });
    }

    const context = await accessControlService.getUserContext(userId);
    const { mdp, otp_secret, ...userResponse } = updatedUser;
    res.json({
      message: 'Utilisateur mis à jour avec succès',
      user: {
        ...userResponse,
        roles: context.roles.map((r) => r.name),
        permissions: context.permissions
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
    const canManageUsers = Array.isArray(req.user.permissions)
      ? req.user.permissions.includes('admin:manage_users')
      : req.user.admin === 1 || req.user.admin === '1' || req.user.admin === true;
    if (!canManageUsers && req.user.id !== userId) {
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
    if (!canManageUsers) {
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
router.delete('/:id', authenticate, requirePermission('admin:manage_users'), async (req, res) => {
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