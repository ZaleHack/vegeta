import database from '../config/database.js';

const DEFAULT_PERMISSIONS = {
  'admin:access': "Accès aux fonctionnalités d'administration",
  'admin:manage_users': 'Gestion des comptes utilisateurs',
  'admin:manage_divisions': 'Gestion des divisions et rattachements',
  'uploads:manage': "Gestion complète des imports de données",
  'uploads:view': 'Consultation des historiques et jobs d’import',
  'catalog:manage': 'Administration du catalogue des bases importables',
  'requests:manage': 'Gestion des demandes d’identification',
  'requests:view': 'Consultation des demandes d’identification',
  'identified_numbers:manage': 'Administration des numéros identifiés',
  'cases:manage': 'Gestion des dossiers et analyses CDR',
  'cases:view': 'Consultation des dossiers',
  'profiles:manage': 'Création et modification des profils',
  'profiles:view': 'Consultation des profils',
  'search:execute': 'Exécution des recherches transverses'
};

const DEFAULT_ROLES = {
  administrator: {
    description: 'Accès complet à la plateforme SORA',
    permissions: [
      'admin:access',
      'admin:manage_users',
      'admin:manage_divisions',
      'uploads:manage',
      'uploads:view',
      'catalog:manage',
      'requests:manage',
      'identified_numbers:manage',
      'cases:manage',
      'profiles:manage',
      'search:execute'
    ]
  },
  analyst: {
    description: 'Pilotage opérationnel des enquêtes',
    permissions: [
      'search:execute',
      'cases:manage',
      'profiles:manage',
      'uploads:view',
      'requests:view'
    ]
  },
  reviewer: {
    description: 'Contrôle et revue des activités',
    permissions: [
      'uploads:view',
      'catalog:manage',
      'requests:manage',
      'cases:view',
      'profiles:view'
    ]
  },
  observer: {
    description: 'Lecture seule des informations autorisées',
    permissions: [
      'search:execute',
      'cases:view',
      'profiles:view',
      'uploads:view',
      'requests:view'
    ]
  }
};

class AccessControlService {
  constructor() {
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    await this.#seedPermissionsAndRoles();
    this.initialized = true;
  }

  async #seedPermissionsAndRoles() {
    for (const [code, description] of Object.entries(DEFAULT_PERMISSIONS)) {
      await database.query(
        `INSERT INTO autres.permissions (code, description) VALUES (?, ?) \
         ON DUPLICATE KEY UPDATE description = VALUES(description)`,
        [code, description]
      );
    }

    for (const [name, { description }] of Object.entries(DEFAULT_ROLES)) {
      await database.query(
        `INSERT INTO autres.roles (name, description) VALUES (?, ?) \
         ON DUPLICATE KEY UPDATE description = VALUES(description)`,
        [name, description]
      );
    }

    for (const [roleName, { permissions }] of Object.entries(DEFAULT_ROLES)) {
      const role = await database.queryOne('SELECT id FROM autres.roles WHERE name = ?', [roleName]);
      if (!role?.id) {
        continue;
      }

      const existing = await database.query(
        `SELECT p.code FROM autres.role_permissions rp
         JOIN autres.permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ?`,
        [role.id]
      );

      const existingCodes = new Set(existing.map((row) => row.code));
      const desiredCodes = new Set(permissions);

      for (const code of desiredCodes) {
        const permission = await database.queryOne('SELECT id FROM autres.permissions WHERE code = ?', [code]);
        if (!permission?.id) {
          continue;
        }
        if (!existingCodes.has(code)) {
          await database.query(
            'INSERT INTO autres.role_permissions (role_id, permission_id) VALUES (?, ?) \
             ON DUPLICATE KEY UPDATE permission_id = permission_id',
            [role.id, permission.id]
          );
        }
      }

      if (!desiredCodes.size) {
        await database.query('DELETE FROM autres.role_permissions WHERE role_id = ?', [role.id]);
      } else if (existingCodes.size) {
        const codesToKeep = Array.from(desiredCodes);
        const placeholders = codesToKeep.map(() => '?').join(', ');
        await database.query(
          `DELETE rp FROM autres.role_permissions rp
           JOIN autres.permissions p ON p.id = rp.permission_id
           WHERE rp.role_id = ? AND p.code NOT IN (${placeholders})`,
          [role.id, ...codesToKeep]
        );
      }
    }
  }

  async assignRolesToUser(userId, roles) {
    if (!userId) {
      throw new Error('Utilisateur requis pour assignation des rôles');
    }

    await this.ensureInitialized();

    const uniqueRoles = Array.from(new Set(roles || []));

    return database.transaction(async ({ query }) => {
      await query('DELETE FROM autres.user_roles WHERE user_id = ?', [userId]);

      if (uniqueRoles.length === 0) {
        return [];
      }

      const roleIds = [];
      for (const roleName of uniqueRoles) {
        const role = await query('SELECT id FROM autres.roles WHERE name = ?', [roleName]);
        const roleId = Array.isArray(role) ? role[0]?.id : role?.id;
        if (roleId) {
          roleIds.push(roleId);
        }
      }

      if (!roleIds.length) {
        return [];
      }

      const placeholders = roleIds.map(() => '(?, ?)').join(', ');
      const values = roleIds.flatMap((roleId) => [userId, roleId]);
      await query(`INSERT INTO autres.user_roles (user_id, role_id) VALUES ${placeholders}`, values);
      return roleIds;
    });
  }

  async getUserContext(userId) {
    if (!userId) {
      return { roles: [], permissions: [] };
    }

    await this.ensureInitialized();

    const roles = await database.query(
      `SELECT r.name, r.description
       FROM autres.user_roles ur
       JOIN autres.roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.name`,
      [userId]
    );

    const permissions = await database.query(
      `SELECT DISTINCT p.code
       FROM autres.user_roles ur
       JOIN autres.role_permissions rp ON rp.role_id = ur.role_id
       JOIN autres.permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ?`,
      [userId]
    );

    return {
      roles: (roles || []).map((role) => ({ name: role.name, description: role.description })),
      permissions: (permissions || []).map((permission) => permission.code)
    };
  }

  async refreshUserContext(userId) {
    this.initialized = false;
    await this.ensureInitialized();
    return this.getUserContext(userId);
  }

  userHasPermission(user, permission) {
    if (!user) {
      return false;
    }

    if (user.admin === 1 || user.admin === '1') {
      return true;
    }

    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    return permissions.includes(permission) || permissions.includes('*');
  }
}

const accessControlService = new AccessControlService();
export default accessControlService;
