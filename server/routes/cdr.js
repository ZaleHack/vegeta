import express from 'express';
import XLSX from 'xlsx';
import { authenticate } from '../middleware/auth.js';
import database from '../config/database.js';
import Blacklist from '../models/Blacklist.js';
import UserLog from '../models/UserLog.js';
import realtimeCdrService from '../services/RealtimeCdrService.js';
import cgiBtsEnricher from '../services/CgiBtsEnrichmentService.js';
import { REALTIME_CDR_TABLE_SQL } from '../config/realtime-table.js';
import { normalizeCgi } from '../utils/cgi.js';

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
    const params = [];
    const conditions = ['c.numero_appelant IS NOT NULL', "c.numero_appelant <> ''"];

    if (search) {
      conditions.push('c.numero_appelant LIKE ?');
      params.push(`%${search}%`);
    }

    params.push(limit);
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await database.query(
      `
        SELECT c.numero_appelant AS number, MAX(c.inserted_at) AS lastSeen
        FROM ${REALTIME_CDR_TABLE_SQL} c
        ${whereClause}
        GROUP BY c.numero_appelant
        ORDER BY lastSeen DESC
        LIMIT ?
      `,
      params
    );

    res.json({ numbers: rows.map((row) => ({ number: row.number, lastSeen: row.lastSeen })) });
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
    const lastId = parsePositiveInteger(req.query.lastId, null);
    const placeholders = numbers.map(() => '?').join(', ');
    const params = [...numbers];

    let whereClause = `WHERE c.numero_appelant IN (${placeholders})`;
    if (since) {
      if (lastId) {
        whereClause += ' AND (c.inserted_at > ? OR (c.inserted_at = ? AND c.id > ?))';
        params.push(since, since, lastId);
      } else {
        whereClause += ' AND c.inserted_at >= ?';
        params.push(since);
      }
    }

    params.push(limit);
    const rows = await database.query(
      `
        SELECT
          c.id,
          c.numero_appelant,
          c.numero_appele,
          c.cgi,
          c.date_debut,
          c.heure_debut,
          c.date_fin,
          c.heure_fin,
          c.type_appel,
          c.inserted_at
        FROM ${REALTIME_CDR_TABLE_SQL} c
        ${whereClause}
        ORDER BY c.inserted_at ASC, c.id ASC
        LIMIT ?
      `,
      params
    );

    const cgiList = rows.map((row) => row.cgi).filter(Boolean);
    const cgiMap = await cgiBtsEnricher.fetchMany(cgiList);
    const coverageRadiusMeters = parsePositiveInteger(process.env.CGI_COVERAGE_RADIUS_METERS, 500);

    const events = rows.map((row) => {
      const cgiKey = row.cgi ? normalizeCgi(row.cgi) : '';
      const cell = cgiKey ? cgiMap.get(cgiKey) : null;
      const latitude = cell?.latitude ? Number(cell.latitude) : null;
      const longitude = cell?.longitude ? Number(cell.longitude) : null;
      return {
        id: row.id,
        number: row.numero_appelant,
        cgi: row.cgi ?? null,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        coverageRadiusMeters,
        insertedAt: row.inserted_at ?? null,
        dateStart: row.date_debut ?? null,
        timeStart: row.heure_debut ?? null,
        dateEnd: row.date_fin ?? null,
        timeEnd: row.heure_fin ?? null,
        callType: row.type_appel ?? null
      };
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

    const identifierVariants = new Set([trimmedNumber]);
    const normalizedIdentifier = normalizePhoneNumber(trimmedNumber);
    if (normalizedIdentifier) {
      identifierVariants.add(normalizedIdentifier);
    }

    const variantList = Array.from(identifierVariants).filter(Boolean);
    const params = [];
    const conditions = [];

    if (variantList.length > 0) {
      const placeholders = variantList.map(() => '?').join(', ');
      conditions.push(`(c.numero_appelant IN (${placeholders}) OR c.numero_appele IN (${placeholders}))`);
      params.push(...variantList, ...variantList);
    }

    if (start) {
      conditions.push('c.date_debut >= ?');
      params.push(start);
    }

    if (end) {
      conditions.push('c.date_debut <= ?');
      params.push(end);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await database.query(
      `
        SELECT
          c.type_appel,
          c.date_debut,
          c.heure_debut,
          c.duree_sec,
          c.date_fin,
          c.heure_fin,
          c.numero_appelant,
          c.numero_appele,
          c.imsi_appelant,
          c.imei_appelant,
          c.cgi,
          c.route_reseau,
          c.device_id
        FROM autres.cdr_temps_reel c
        ${whereClause}
        ORDER BY c.date_debut DESC, c.heure_debut DESC, c.id DESC
      `,
      params
    );

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
      type_appel: row.type_appel ?? null,
      date_debut: row.date_debut ?? null,
      heure_debut: row.heure_debut ?? null,
      duree_sec: row.duree_sec ?? null,
      date_fin: row.date_fin ?? null,
      heure_fin: row.heure_fin ?? null,
      numero_appelant: row.numero_appelant ?? null,
      numero_appele: row.numero_appele ?? null,
      imsi_appelant: row.imsi_appelant ?? null,
      imei_appelant: row.imei_appelant ?? null,
      cgi: row.cgi ?? null,
      route_reseau: row.route_reseau ?? null,
      device_id: row.device_id ?? null
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'cdr_temps_reel');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const filename = `export-cdr-temps-reel-${timestamp}.xlsx`;

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

export default router;
