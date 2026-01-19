import express from 'express';
import database from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { normalizeCgi } from '../utils/cgi.js';
import geofencingService from '../services/GeofencingService.js';

const router = express.Router();

const ANTENNAS_TABLE = 'autres.antennes_cgi';
const ZONES_TABLE = 'autres.zones_geofencing';
const ALERTS_TABLE = 'autres.alertes_geofencing';
const RULES_TABLE = 'autres.regles_alertes_zones';

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const parseBoolean = (value, fallback = null) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'oui'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'non'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parseJsonField = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const serializeJsonField = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
};

const normalizeAntennaRow = (row) => ({
  ...row,
  latitude: row.latitude !== null ? Number(row.latitude) : null,
  longitude: row.longitude !== null ? Number(row.longitude) : null
});

const normalizeZoneRow = (row) => ({
  ...row,
  coordonnees_geo: parseJsonField(row.coordonnees_geo),
  horaires_surveillance: parseJsonField(row.horaires_surveillance)
});

router.get('/antennes', authenticate, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const limit = Math.min(parsePositiveInteger(req.query.limit, 50), 200);
    const page = Math.max(parsePositiveInteger(req.query.page, 1), 1);
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (search) {
      where.push('(cgi LIKE ? OR operateur LIKE ? OR ville LIKE ? OR region LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, totalRow] = await Promise.all([
      database.query(
        `SELECT * FROM ${ANTENNAS_TABLE} ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      database.queryOne(
        `SELECT COUNT(*) AS total FROM ${ANTENNAS_TABLE} ${whereSql}`,
        params
      )
    ]);

    res.json({
      items: rows.map(normalizeAntennaRow),
      total: totalRow?.total || 0,
      page,
      limit
    });
  } catch (error) {
    console.error('Erreur chargement antennes:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des antennes' });
  }
});

router.post('/antennes', authenticate, async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const cgi = payload.cgi ? normalizeCgi(payload.cgi) : '';

    if (!cgi) {
      return res.status(400).json({ error: 'CGI requis' });
    }

    await database.query(
      `
        INSERT INTO ${ANTENNAS_TABLE}
          (cgi, mcc, mnc, lac, cell_id, latitude, longitude, rayon_couverture_m, operateur, technologie, adresse, ville, region, actif, date_mise_service, derniere_maj)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        cgi,
        payload.mcc || null,
        payload.mnc || null,
        payload.lac || null,
        payload.cell_id || null,
        payload.latitude ?? null,
        payload.longitude ?? null,
        payload.rayon_couverture_m ?? null,
        payload.operateur || null,
        payload.technologie || null,
        payload.adresse || null,
        payload.ville || null,
        payload.region || null,
        parseBoolean(payload.actif, true) ? 1 : 0,
        payload.date_mise_service || null
      ]
    );

    const created = await database.queryOne(
      `SELECT * FROM ${ANTENNAS_TABLE} WHERE cgi = ? ORDER BY id DESC LIMIT 1`,
      [cgi]
    );

    res.status(201).json({ item: normalizeAntennaRow(created) });
  } catch (error) {
    console.error('Erreur création antenne:', error);
    res.status(500).json({ error: "Erreur lors de la création de l'antenne" });
  }
});

router.get('/antennes/:id', authenticate, async (req, res) => {
  try {
    const row = await database.queryOne(
      `SELECT * FROM ${ANTENNAS_TABLE} WHERE id = ? LIMIT 1`,
      [req.params.id]
    );

    if (!row) {
      return res.status(404).json({ error: 'Antenne introuvable' });
    }

    res.json({ item: normalizeAntennaRow(row) });
  } catch (error) {
    console.error('Erreur récupération antenne:', error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'antenne" });
  }
});

router.put('/antennes/:id', authenticate, async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const fields = {
      cgi: payload.cgi ? normalizeCgi(payload.cgi) : undefined,
      mcc: payload.mcc,
      mnc: payload.mnc,
      lac: payload.lac,
      cell_id: payload.cell_id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      rayon_couverture_m: payload.rayon_couverture_m,
      operateur: payload.operateur,
      technologie: payload.technologie,
      adresse: payload.adresse,
      ville: payload.ville,
      region: payload.region,
      actif: payload.actif === undefined ? undefined : parseBoolean(payload.actif, true) ? 1 : 0,
      date_mise_service: payload.date_mise_service
    };

    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    const setSql = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, value]) => value);

    await database.query(
      `UPDATE ${ANTENNAS_TABLE} SET ${setSql}, derniere_maj = NOW() WHERE id = ?`,
      [...values, req.params.id]
    );

    const updated = await database.queryOne(
      `SELECT * FROM ${ANTENNAS_TABLE} WHERE id = ? LIMIT 1`,
      [req.params.id]
    );

    res.json({ item: updated ? normalizeAntennaRow(updated) : null });
  } catch (error) {
    console.error('Erreur mise à jour antenne:', error);
    res.status(500).json({ error: "Erreur lors de la mise à jour de l'antenne" });
  }
});

router.delete('/antennes/:id', authenticate, async (req, res) => {
  try {
    await database.query(`DELETE FROM ${ANTENNAS_TABLE} WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression antenne:', error);
    res.status(500).json({ error: "Erreur lors de la suppression de l'antenne" });
  }
});

router.get('/zones', authenticate, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const actif = parseBoolean(req.query.actif, null);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 50), 200);
    const page = Math.max(parsePositiveInteger(req.query.page, 1), 1);
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (search) {
      where.push('(nom LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (type) {
      where.push('type = ?');
      params.push(type);
    }

    if (actif !== null) {
      where.push('actif = ?');
      params.push(actif ? 1 : 0);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, totalRow] = await Promise.all([
      database.query(
        `SELECT * FROM ${ZONES_TABLE} ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      database.queryOne(
        `SELECT COUNT(*) AS total FROM ${ZONES_TABLE} ${whereSql}`,
        params
      )
    ]);

    res.json({
      items: rows.map(normalizeZoneRow),
      total: totalRow?.total || 0,
      page,
      limit
    });
  } catch (error) {
    console.error('Erreur chargement zones:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des zones' });
  }
});

router.post('/zones', authenticate, async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const nom = String(payload.nom || '').trim();

    if (!nom) {
      return res.status(400).json({ error: 'Nom de zone requis' });
    }

    const coordonneesGeo = serializeJsonField(payload.coordonnees_geo);
    if (!coordonneesGeo) {
      return res.status(400).json({ error: 'Coordonnées géographiques requises' });
    }

    const horaires = serializeJsonField(payload.horaires_surveillance);

    await database.query(
      `
        INSERT INTO ${ZONES_TABLE}
          (nom, type, description, coordonnees_geo, rayon_m, couleur_carte, alerte_appel_entrant, alerte_appel_sortant, alerte_appel_interne, horaires_surveillance, actif, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        nom,
        payload.type || null,
        payload.description || null,
        coordonneesGeo,
        payload.rayon_m ?? null,
        payload.couleur_carte || null,
        parseBoolean(payload.alerte_appel_entrant, false) ? 1 : 0,
        parseBoolean(payload.alerte_appel_sortant, false) ? 1 : 0,
        parseBoolean(payload.alerte_appel_interne, false) ? 1 : 0,
        horaires,
        parseBoolean(payload.actif, true) ? 1 : 0
      ]
    );

    const created = await database.queryOne(
      `SELECT * FROM ${ZONES_TABLE} WHERE nom = ? ORDER BY id DESC LIMIT 1`,
      [nom]
    );

    res.status(201).json({ item: created ? normalizeZoneRow(created) : null });
  } catch (error) {
    console.error('Erreur création zone:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la zone' });
  }
});

router.get('/zones/:id', authenticate, async (req, res) => {
  try {
    const row = await database.queryOne(
      `SELECT * FROM ${ZONES_TABLE} WHERE id = ? LIMIT 1`,
      [req.params.id]
    );

    if (!row) {
      return res.status(404).json({ error: 'Zone introuvable' });
    }

    res.json({ item: normalizeZoneRow(row) });
  } catch (error) {
    console.error('Erreur récupération zone:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la zone' });
  }
});

router.put('/zones/:id', authenticate, async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const fields = {
      nom: payload.nom,
      type: payload.type,
      description: payload.description,
      coordonnees_geo: serializeJsonField(payload.coordonnees_geo),
      rayon_m: payload.rayon_m,
      couleur_carte: payload.couleur_carte,
      alerte_appel_entrant:
        payload.alerte_appel_entrant === undefined
          ? undefined
          : parseBoolean(payload.alerte_appel_entrant, false)
            ? 1
            : 0,
      alerte_appel_sortant:
        payload.alerte_appel_sortant === undefined
          ? undefined
          : parseBoolean(payload.alerte_appel_sortant, false)
            ? 1
            : 0,
      alerte_appel_interne:
        payload.alerte_appel_interne === undefined
          ? undefined
          : parseBoolean(payload.alerte_appel_interne, false)
            ? 1
            : 0,
      horaires_surveillance: serializeJsonField(payload.horaires_surveillance),
      actif: payload.actif === undefined ? undefined : parseBoolean(payload.actif, true) ? 1 : 0
    };

    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    const setSql = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, value]) => value);

    await database.query(
      `UPDATE ${ZONES_TABLE} SET ${setSql}, updated_at = NOW() WHERE id = ?`,
      [...values, req.params.id]
    );

    const updated = await database.queryOne(
      `SELECT * FROM ${ZONES_TABLE} WHERE id = ? LIMIT 1`,
      [req.params.id]
    );

    res.json({ item: updated ? normalizeZoneRow(updated) : null });
  } catch (error) {
    console.error('Erreur mise à jour zone:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la zone' });
  }
});

router.delete('/zones/:id', authenticate, async (req, res) => {
  try {
    await database.query(`DELETE FROM ${ZONES_TABLE} WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression zone:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la zone' });
  }
});

router.get('/alertes', authenticate, async (req, res) => {
  try {
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : null;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const limit = Math.min(parsePositiveInteger(req.query.limit, 50), 200);
    const page = Math.max(parsePositiveInteger(req.query.page, 1), 1);
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (zoneId) {
      where.push('zone_id = ?');
      params.push(zoneId);
    }

    if (status) {
      where.push('statut = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows, totalRow] = await Promise.all([
      database.query(
        `SELECT * FROM ${ALERTS_TABLE} ${whereSql} ORDER BY date_alerte DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      database.queryOne(`SELECT COUNT(*) AS total FROM ${ALERTS_TABLE} ${whereSql}`, params)
    ]);

    res.json({
      items: rows.map((row) => ({
        ...row,
        destinataires: parseJsonField(row.destinataires)
      })),
      total: totalRow?.total || 0,
      page,
      limit
    });
  } catch (error) {
    console.error('Erreur chargement alertes:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des alertes' });
  }
});

router.put('/alertes/:id/status', authenticate, async (req, res) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
    if (!status) {
      return res.status(400).json({ error: 'Statut requis' });
    }

    await database.query(
      `UPDATE ${ALERTS_TABLE} SET statut = ?, traite_le = NOW() WHERE id = ?`,
      [status, req.params.id]
    );

    const updated = await database.queryOne(
      `SELECT * FROM ${ALERTS_TABLE} WHERE id = ? LIMIT 1`,
      [req.params.id]
    );

    res.json({ item: updated });
  } catch (error) {
    console.error('Erreur mise à jour alerte:', error);
    res.status(500).json({ error: "Erreur lors de la mise à jour de l'alerte" });
  }
});

router.get('/regles', authenticate, async (req, res) => {
  try {
    const zoneId = req.query.zoneId ? Number(req.query.zoneId) : null;
    const actif = parseBoolean(req.query.actif, null);
    const where = [];
    const params = [];

    if (zoneId) {
      where.push('zone_id = ?');
      params.push(zoneId);
    }

    if (actif !== null) {
      where.push('actif = ?');
      params.push(actif ? 1 : 0);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await database.query(
      `SELECT * FROM ${RULES_TABLE} ${whereSql} ORDER BY priorite DESC, id DESC`,
      params
    );

    res.json({
      items: rows.map((row) => ({
        ...row,
        conditions: parseJsonField(row.conditions),
        declencheurs: parseJsonField(row.declencheurs),
        destinataires: parseJsonField(row.destinataires)
      }))
    });
  } catch (error) {
    console.error('Erreur chargement règles:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des règles' });
  }
});

router.post('/regles', authenticate, async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const zoneId = Number(payload.zone_id);

    if (!zoneId) {
      return res.status(400).json({ error: 'Zone requise' });
    }

    const nomRegle = String(payload.nom_regle || '').trim();
    if (!nomRegle) {
      return res.status(400).json({ error: 'Nom de règle requis' });
    }

    await database.query(
      `
        INSERT INTO ${RULES_TABLE}
          (zone_id, nom_regle, conditions, declencheurs, destinataires, message_template, actif, priorite, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        zoneId,
        nomRegle,
        serializeJsonField(payload.conditions),
        serializeJsonField(payload.declencheurs),
        serializeJsonField(payload.destinataires),
        payload.message_template || null,
        parseBoolean(payload.actif, true) ? 1 : 0,
        payload.priorite || 'info'
      ]
    );

    const created = await database.queryOne(
      `SELECT * FROM ${RULES_TABLE} WHERE zone_id = ? ORDER BY id DESC LIMIT 1`,
      [zoneId]
    );

    res.status(201).json({
      item: created
        ? {
            ...created,
            conditions: parseJsonField(created.conditions),
            declencheurs: parseJsonField(created.declencheurs),
            destinataires: parseJsonField(created.destinataires)
          }
        : null
    });
  } catch (error) {
    console.error('Erreur création règle:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la règle' });
  }
});

router.put('/regles/:id', authenticate, async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const fields = {
      zone_id: payload.zone_id,
      nom_regle: payload.nom_regle,
      conditions: serializeJsonField(payload.conditions),
      declencheurs: serializeJsonField(payload.declencheurs),
      destinataires: serializeJsonField(payload.destinataires),
      message_template: payload.message_template,
      actif: payload.actif === undefined ? undefined : parseBoolean(payload.actif, true) ? 1 : 0,
      priorite: payload.priorite
    };

    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    const setSql = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, value]) => value);

    await database.query(`UPDATE ${RULES_TABLE} SET ${setSql} WHERE id = ?`, [
      ...values,
      req.params.id
    ]);

    const updated = await database.queryOne(
      `SELECT * FROM ${RULES_TABLE} WHERE id = ? LIMIT 1`,
      [req.params.id]
    );

    res.json({
      item: updated
        ? {
            ...updated,
            conditions: parseJsonField(updated.conditions),
            declencheurs: parseJsonField(updated.declencheurs),
            destinataires: parseJsonField(updated.destinataires)
          }
        : null
    });
  } catch (error) {
    console.error('Erreur mise à jour règle:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la règle' });
  }
});

router.delete('/regles/:id', authenticate, async (req, res) => {
  try {
    await database.query(`DELETE FROM ${RULES_TABLE} WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression règle:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la règle' });
  }
});

router.post('/detect', authenticate, async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await geofencingService.detect({
      cdrId: payload.cdr_id || payload.cdrId || null,
      cgi: payload.cgi || null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    return res.json(result);
  } catch (error) {
    console.error('Erreur détection géofencing:', error);
    res.status(500).json({ error: 'Erreur lors de la détection de zone' });
  }
});

export default router;
