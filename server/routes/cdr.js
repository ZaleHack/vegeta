import express from 'express';
import XLSX from 'xlsx';
import { authenticate } from '../middleware/auth.js';
import Blacklist from '../models/Blacklist.js';
import UserLog from '../models/UserLog.js';
import realtimeCdrService from '../services/RealtimeCdrService.js';
import createLinkDiagramReport from '../services/LinkDiagramReportService.js';

const router = express.Router();

const isValidDate = (value) => {
  if (!value) {
    return false;
  }
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const date = new Date(text);
  return !Number.isNaN(date.getTime());
};

const isValidTime = (value) => {
  if (!value) {
    return false;
  }
  const text = String(value).trim();
  return /^\d{2}:\d{2}(?::\d{2})?$/.test(text);
};

const normalizePhoneNumber = (value) => {
  if (!value) {
    return '';
  }
  let text = String(value).trim();
  if (!text) {
    return '';
  }
  text = text.replace(/\s+/g, '');
  if (text.startsWith('+')) {
    text = text.slice(1);
  }
  while (text.startsWith('00')) {
    text = text.slice(2);
  }
  text = text.replace(/[^0-9]/g, '');
  if (!text) {
    return '';
  }
  if (text.startsWith('221')) {
    return text;
  }
  const trimmed = text.replace(/^0+/, '');
  return trimmed ? `221${trimmed}` : '';
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

router.get('/realtime/numbers', authenticate, async (req, res) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = parsePositiveInteger(req.query.limit, 200);
    const numbers = await realtimeCdrService.listRecentNumbers({ search, limit });
    res.json({ numbers });
  } catch (error) {
    console.error('Erreur chargement numéros temps réel:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des numéros' });
  }
});

router.get('/realtime/monitor', authenticate, async (req, res) => {
  try {
    const numbersParam = typeof req.query.numbers === 'string' ? req.query.numbers : '';
    const numbers = numbersParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (numbers.length === 0) {
      return res.status(400).json({ error: 'Numéros requis' });
    }

    const since = typeof req.query.since === 'string' ? req.query.since.trim() : '';
    if (since && Number.isNaN(new Date(since).getTime())) {
      return res.status(400).json({ error: 'Format de date invalide' });
    }

    const limit = parsePositiveInteger(req.query.limit, 500);
    const events = await realtimeCdrService.monitorNumbers({
      numbers,
      since,
      limit
    });
    res.json({ events });
  } catch (error) {
    console.error('Erreur flux temps réel:', error);
    res.status(500).json({ error: 'Erreur lors du chargement temps réel' });
  }
});

router.get('/realtime/search', authenticate, async (req, res) => {
  try {
    let searchType = 'phone';
    let identifier = '';

    if (typeof req.query.phone === 'string') {
      identifier = req.query.phone;
    } else if (typeof req.query.number === 'string') {
      identifier = req.query.number;
    } else if (typeof req.query.imei === 'string') {
      identifier = req.query.imei;
      searchType = 'imei';
    }

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Identifiant requis' });
    }

    const sanitizedIdentifier = identifier.trim();
    if (searchType === 'phone') {
      const identifierVariants = new Set([sanitizedIdentifier]);
      const normalizedIdentifier = normalizePhoneNumber(sanitizedIdentifier);
      if (normalizedIdentifier) {
        identifierVariants.add(normalizedIdentifier);
      }

      let isBlacklisted = false;
      for (const value of identifierVariants) {
        if (value && (await Blacklist.exists(value))) {
          isBlacklisted = true;
          break;
        }
      }

      if (isBlacklisted) {
        try {
          await UserLog.create({
            user_id: req.user.id,
            action: 'blacklist_search_attempt',
            details: JSON.stringify({
              alert: true,
              number: sanitizedIdentifier,
              page: 'cdr-realtime',
              message: 'Tentative de recherche sur un numéro blacklisté'
            })
          });
        } catch (logError) {
          console.error('Erreur log blacklist:', logError);
        }
        return res.status(403).json({ error: 'Aucun résultat trouvé' });
      }
    }

    const start = typeof req.query.start === 'string' ? req.query.start.trim() : '';
    const end = typeof req.query.end === 'string' ? req.query.end.trim() : '';
    const startTime = typeof req.query.startTime === 'string' ? req.query.startTime.trim() : '';
    const endTime = typeof req.query.endTime === 'string' ? req.query.endTime.trim() : '';

    if ((start && !isValidDate(start)) || (end && !isValidDate(end))) {
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD)' });
    }

    if ((startTime && !isValidTime(startTime)) || (endTime && !isValidTime(endTime))) {
      return res.status(400).json({ error: "Format d'heure invalide (HH:MM ou HH:MM:SS)" });
    }

    if (start && end && new Date(start) > new Date(end)) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin' });
    }

    const result = await realtimeCdrService.search(sanitizedIdentifier, {
      startDate: start || null,
      endDate: end || null,
      startTime: startTime || null,
      endTime: endTime || null,
      searchType
    });

    res.json(result);
  } catch (error) {
    console.error('Erreur recherche CDR temps réel:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

router.get('/realtime/export', authenticate, async (req, res) => {
  try {
    const number = typeof req.query.numero === 'string'
      ? req.query.numero
      : typeof req.query.number === 'string'
        ? req.query.number
        : '';
    const trimmedNumber = number ? number.trim() : '';

    if (!trimmedNumber) {
      return res.status(400).json({ error: 'Numéro requis' });
    }

    const start = typeof req.query.start === 'string' ? req.query.start.trim() : '';
    const end = typeof req.query.end === 'string' ? req.query.end.trim() : '';

    if ((start && !isValidDate(start)) || (end && !isValidDate(end))) {
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD)' });
    }

    if (start && end && new Date(start) > new Date(end)) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin' });
    }

    const result = await realtimeCdrService.search(trimmedNumber, {
      startDate: start || null,
      endDate: end || null,
      searchType: 'phone',
      limit: 20000
    });
    const rows = Array.isArray(result?.path) ? result.path : [];

    const headers = [
      'type_appel',
      'date_debut',
      'heure_debut',
      'duree_sec',
      'date_fin',
      'heure_fin',
      'numero_appelant',
      'numero_appele',
      'imsi_appelant',
      'imei_appelant',
      'cgi',
      'route_reseau',
      'device_id'
    ];

    const worksheetData = rows.map((row) => ({
      type_appel: row.type_appel ?? row.type ?? null,
      date_debut: row.date_debut ?? row.callDate ?? null,
      heure_debut: row.heure_debut ?? row.startTime ?? null,
      duree_sec: row.duree_sec ?? row.duration ?? null,
      date_fin: row.date_fin ?? row.endDate ?? null,
      heure_fin: row.heure_fin ?? row.endTime ?? null,
      numero_appelant: row.numero_appelant ?? row.caller ?? null,
      numero_appele: row.numero_appele ?? row.callee ?? null,
      imsi_appelant: row.imsi_appelant ?? row.imsiCaller ?? null,
      imei_appelant: row.imei_appelant ?? row.imeiCaller ?? null,
      cgi: row.cgi ?? null,
      route_reseau: row.route_reseau ?? row.networkRoute ?? null,
      device_id: row.device_id ?? row.deviceId ?? null
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'cdr_indexed');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const filename = `export-cdr-indexed-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Erreur export CDR temps réel:', error);
    return res.status(500).json({ error: "Erreur lors de l'export des données CDR" });
  }
});

router.post('/realtime/link-diagram', authenticate, async (req, res) => {
  try {
    const { numbers = [], start: startDate, end: endDate, startTime, endTime } = req.body;

    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'Liste de numéros requise' });
    }

    const result = await realtimeCdrService.buildLinkDiagram(numbers, {
      startDate: typeof startDate === 'string' && startDate.trim() ? startDate.trim() : null,
      endDate: typeof endDate === 'string' && endDate.trim() ? endDate.trim() : null,
      startTime: typeof startTime === 'string' && startTime.trim() ? startTime.trim() : null,
      endTime: typeof endTime === 'string' && endTime.trim() ? endTime.trim() : null
    });

    res.json(result);
  } catch (error) {
    console.error('Erreur diagramme des liens temps réel:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du diagramme' });
  }
});

router.post('/realtime/link-diagram/report', authenticate, async (req, res) => {
  try {
    const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
    const links = Array.isArray(req.body?.links) ? req.body.links : [];
    const root = typeof req.body?.root === 'string' ? req.body.root.trim() : '';
    const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
    const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];

    if (nodes.length === 0) {
      return res.status(400).json({ error: 'Le diagramme ne contient aucun noeud.' });
    }

    if (sections.length === 0) {
      return res.status(400).json({ error: 'Sélectionnez au moins une section.' });
    }

    const reportBuffer = await createLinkDiagramReport({
      nodes,
      links,
      root: root || null,
      filters,
      sections
    });

    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=\"rapport-diagramme-liens-${timestamp}.pdf\"`);
    return res.status(200).send(reportBuffer);
  } catch (error) {
    console.error('Erreur export rapport diagramme des liens:', error);
    return res.status(500).json({ error: 'Erreur lors de la génération du rapport.' });
  }
});

export default router;
