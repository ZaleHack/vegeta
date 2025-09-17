import User from '../models/User.js';

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

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  if (req.user.admin !== 1 && req.user.admin !== "1") {
    return res.status(403).json({ error: 'Permissions administrateur requises' });
  }

  next();
};