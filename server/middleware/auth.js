import User from '../models/User.js';
import accessControlService from '../services/AccessControlService.js';

export const authenticate = async (req, res, next) => {
  const headerToken = req.headers.authorization?.replace('Bearer ', '');
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Token d\'authentification requis' });
  }

  try {
    const decoded = User.verifyToken(token);
    const user = await User.findById(decoded.id);

    if (!user || user.active !== 1) {
      return res.status(401).json({ error: 'Utilisateur non trouvé ou désactivé' });
    }

    const securityContext = await accessControlService.getUserContext(user.id);
    let roles = securityContext.roles.map((role) => role.name);
    let permissions = securityContext.permissions;

    const isAdminFlag = user.admin === 1 || user.admin === '1';

    if (isAdminFlag && !roles.includes('administrator')) {
      await accessControlService.assignRolesToUser(user.id, ['administrator', ...roles]);
      const refreshed = await accessControlService.getUserContext(user.id);
      roles = refreshed.roles.map((role) => role.name);
      permissions = refreshed.permissions;
    }

    if (!isAdminFlag && roles.length === 0) {
      await accessControlService.assignRolesToUser(user.id, ['observer']);
      const refreshed = await accessControlService.getUserContext(user.id);
      roles = refreshed.roles.map((role) => role.name);
      permissions = refreshed.permissions;
    }

    const safeUser = User.sanitize({ ...user, roles, permissions });
    req.user = { ...safeUser, roles, permissions };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  if (!accessControlService.userHasPermission(req.user, permission)) {
    return res.status(403).json({ error: 'Permission insuffisante', permission });
  }

  next();
};

export const requireAnyPermission = (permissions) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  const granted = permissions.some((permission) =>
    accessControlService.userHasPermission(req.user, permission)
  );

  if (!granted) {
    return res.status(403).json({ error: 'Permission insuffisante', permissions });
  }

  next();
};

export const requireAdmin = requirePermission('admin:access');