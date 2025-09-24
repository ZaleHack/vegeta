import express from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import UserLog from '../models/UserLog.js';
import UserSession from '../models/UserSession.js';
import totpService from '../services/totpService.js';
import { loginRateLimiter, formatRetryAfter } from '../middleware/rateLimit.js';
import searchAccessManager from '../utils/search-access-manager.js';

const router = express.Router();

const appendRemainingAttempts = (attempt, payload = {}) => {
  if (attempt && typeof attempt.remaining === 'number' && attempt.remaining >= 0) {
    return { ...payload, remainingAttempts: attempt.remaining };
  }
  return payload;
};

const handleLoginFailure = (req, res, statusCode, payload) => {
  const attempt = req.loginRateLimit?.recordFailure?.();
  if (attempt?.blocked) {
    if (attempt.retryAfterMs) {
      res.setHeader('Retry-After', Math.ceil(attempt.retryAfterMs / 1000));
    }
    return res.status(429).json({
      error: `Trop de tentatives de connexion. Veuillez réessayer dans ${formatRetryAfter(attempt.retryAfterMs)}.`
    });
  }

  const responsePayload = appendRemainingAttempts(attempt, payload);
  return res.status(statusCode).json(responsePayload);
};

const sanitizeUserForResponse = (user) => {
  const sanitized = User.sanitize(user);
  if (!sanitized) return null;
  return {
    ...sanitized,
    role: sanitized.admin === 1 ? 'ADMIN' : 'USER'
  };
};

// Route de connexion
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { login, password, totp } = req.body;

    if (!login || !password) {
      return handleLoginFailure(req, res, 400, { error: 'Login et mot de passe requis' });
    }

    const user = await User.findByLogin(login);

    if (!user) {
      return handleLoginFailure(req, res, 401, { error: 'Identifiants invalides' });
    }

    if (user.active !== 1) {
      return handleLoginFailure(req, res, 403, { error: 'Compte désactivé' });
    }

    const isValidPassword = await User.validatePassword(password, user.mdp);

    if (!isValidPassword) {
      return handleLoginFailure(req, res, 401, { error: 'Identifiants invalides' });
    }

    if (user.otp_enabled === 1) {
      if (!user.otp_secret) {
        return res.status(500).json({ error: 'Configuration 2FA invalide, contactez un administrateur' });
      }

      if (!totp) {
        req.loginRateLimit?.recordSuccess?.();
        return res.status(200).json({
          requireTotp: true,
          message: 'Code de vérification requis'
        });
      }

      const isValidTotp = totpService.verify(totp, user.otp_secret, 1);

      if (!isValidTotp) {
        const payload = { error: 'Code de vérification invalide', requireTotp: true };
        return handleLoginFailure(req, res, 401, payload);
      }
    }

    const token = User.generateToken(user);
    const userResponse = sanitizeUserForResponse(user);

    req.loginRateLimit?.recordSuccess?.();

    try {
      searchAccessManager.revokeUser(user.id);
    } catch (_) {}

    res.json({
      message: 'Connexion réussie',
      user: userResponse,
      token
    });

    try {
      await UserLog.create({ user_id: user.id, action: 'login' });
    } catch (_) {}

    try {
      await UserSession.start(user.id);
    } catch (sessionError) {
      console.error('Erreur création session utilisateur:', sessionError);
    }
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

  try {
    await UserSession.endLatest(req.user.id);
  } catch (error) {
    console.error('Erreur clôture session utilisateur:', error);
  }

  try {
    searchAccessManager.revokeUser(req.user.id);
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

    if (!user || user.active !== 1) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({
      user: sanitizeUserForResponse(user)
    });
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    if (req.user.otp_enabled === 1) {
      return res.status(400).json({ error: 'La double authentification est déjà activée' });
    }

    const setupData = await totpService.generateSetup(req.user);

    res.json({
      message: 'Secret TOTP généré',
      ...setupData
    });
  } catch (error) {
    console.error('Erreur génération secret TOTP:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la génération du secret' });
  }
});

router.post('/2fa/confirm', authenticate, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Code de vérification requis' });
    }

    const pendingSecret = totpService.getPendingSecret(req.user.id);

    if (!pendingSecret) {
      if (req.user.otp_enabled === 1) {
        return res.status(400).json({ error: 'La double authentification est déjà active' });
      }
      return res.status(400).json({ error: 'Aucun secret TOTP en attente, relancez la configuration' });
    }

    const isValid = totpService.verify(token, pendingSecret, 1);

    if (!isValid) {
      return res.status(400).json({ error: 'Code TOTP invalide' });
    }

    const updatedUser = await User.saveOtpSecret(req.user.id, pendingSecret);
    totpService.clearPendingSecret(req.user.id);
    req.user = updatedUser;

    res.json({
      message: 'Authentification à deux facteurs activée',
      user: sanitizeUserForResponse(updatedUser)
    });
  } catch (error) {
    console.error('Erreur confirmation TOTP:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la confirmation du code' });
  }
});

router.delete('/2fa', authenticate, async (req, res) => {
  try {
    if (req.user.otp_enabled !== 1) {
      return res.status(400).json({ error: 'La double authentification est déjà désactivée' });
    }

    const { password, token } = req.body || {};

    if (!password && !token) {
      return res.status(400).json({ error: 'Mot de passe ou code TOTP requis pour désactiver la double authentification' });
    }

    let isVerified = false;

    if (password) {
      const isValidPassword = await User.validatePassword(password, req.user.mdp);
      if (isValidPassword) {
        isVerified = true;
      } else if (!token) {
        return res.status(401).json({ error: 'Mot de passe invalide' });
      }
    }

    if (!isVerified && token) {
      if (!req.user.otp_secret) {
        return res.status(400).json({ error: 'Aucun secret TOTP actif, contactez un administrateur' });
      }

      const isValidTotp = totpService.verify(token, req.user.otp_secret, 1);
      if (!isValidTotp) {
        return res.status(401).json({ error: 'Code TOTP invalide' });
      }
      isVerified = true;
    }

    if (!isVerified) {
      return res.status(401).json({ error: 'Vérification requise pour désactiver la double authentification' });
    }

    const updatedUser = await User.resetOtpSecret(req.user.id);
    totpService.clearPendingSecret(req.user.id);
    req.user = updatedUser;

    res.json({
      message: 'Authentification à deux facteurs désactivée',
      user: sanitizeUserForResponse(updatedUser)
    });
  } catch (error) {
    console.error('Erreur désactivation TOTP:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la désactivation du TOTP' });
  }
});

export default router;
