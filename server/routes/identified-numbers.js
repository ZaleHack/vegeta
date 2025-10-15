import express from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import IdentifiedNumber from '../models/IdentifiedNumber.js';

const router = express.Router();

router.use(authenticate);
router.use(requirePermission('identified_numbers:manage'));

router.get('/:phone', async (req, res) => {
  try {
    const number = await IdentifiedNumber.findByPhone(req.params.phone);
    if (!number) {
      return res.status(404).json({ error: 'Numéro non trouvé' });
    }
    res.json({ number });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:phone', async (req, res) => {
  try {
    let { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'Données requises' });
    }
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (_) {}
    }
    await IdentifiedNumber.upsert(req.params.phone, data);
    const number = await IdentifiedNumber.findByPhone(req.params.phone);
    res.json({ number });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
