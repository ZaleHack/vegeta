import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const IMEICHECK_ENDPOINT = 'https://alpha.imeicheck.com/api/modelBrandName';
const REQUEST_TIMEOUT_MS = 10000;

router.get('/check', authenticate, async (req, res) => {
  const rawImei = typeof req.query.imei === 'string' ? req.query.imei : '';
  const imei = rawImei.replace(/\D/g, '');

  if (!imei) {
    return res.status(400).json({ error: 'Paramètre IMEI manquant ou invalide' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${IMEICHECK_ENDPOINT}?imei=${encodeURIComponent(imei)}&format=json`;
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = data?.result || data?.error || "Impossible de vérifier cet IMEI pour le moment.";
      return res.status(response.status).json({ error: message });
    }

    return res.json({ ...data, imei });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Délai dépassé lors de la vérification IMEI' });
    }

    console.error('Erreur lors de la vérification IMEI:', error);
    return res.status(502).json({ error: 'Erreur lors de la communication avec le service IMEI' });
  } finally {
    clearTimeout(timeoutId);
  }
});

export default router;

