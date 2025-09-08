import rateLimit from 'express-rate-limit';

export const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message || 'Trop de requêtes, veuillez réessayer plus tard'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Exempter les admins du rate limiting pour les requêtes critiques
      return req.user && req.user.role === 'ADMIN';
    }
  });
};

export const searchRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requêtes par fenêtre
  'Limite de recherches atteinte. Veuillez patienter avant de réessayer.'
);

export const authRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  10, // 10 tentatives par fenêtre
  'Trop de tentatives de connexion. Veuillez patienter.'
);

export const uploadRateLimit = createRateLimiter(
  60 * 60 * 1000, // 1 heure
  5, // 5 uploads par heure
  "Limite d'upload atteinte. Veuillez patienter."
);

export default {
  searchRateLimit,
  authRateLimit,
  uploadRateLimit,
  createRateLimiter
};

