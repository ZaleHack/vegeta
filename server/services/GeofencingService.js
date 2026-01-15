import database from '../config/database.js';
import { normalizeCgi } from '../utils/cgi.js';
import { REALTIME_CDR_TABLE_SQL } from '../config/realtime-table.js';
import {
  isPointInZone,
  getZoneCenter,
  distanceBetweenPoints,
  parseZoneGeometry
} from '../utils/geofencing.js';

const ANTENNAS_TABLE = 'autres.antennes_cgi';
const ZONES_TABLE = 'autres.zones_geofencing';
const GEOLOC_TABLE = 'autres.cdr_geolocalisations';
const ALERTS_TABLE = 'autres.alertes_geofencing';
const RULES_TABLE = 'autres.regles_alertes_zones';

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

const renderTemplate = (template, data) => {
  if (!template) {
    return '';
  }

  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
};

const normalizeCallType = (value) => {
  const text = String(value || '').toLowerCase();
  if (!text) {
    return null;
  }
  if (text.includes('entrant') || text.includes('incoming')) {
    return 'entrant';
  }
  if (text.includes('sortant') || text.includes('outgoing')) {
    return 'sortant';
  }
  if (text.includes('interne') || text.includes('internal')) {
    return 'interne';
  }
  return text;
};

const detectTriggerType = (callType) => {
  if (callType === 'entrant') {
    return 'appel_vers_zone';
  }
  if (callType === 'sortant') {
    return 'appel_depuis_zone';
  }
  if (callType === 'interne') {
    return 'appel_interne';
  }
  return 'appel_depuis_zone';
};

const matchValue = (expected, actual) => {
  if (expected === undefined || expected === null) {
    return true;
  }

  if (Array.isArray(expected)) {
    return expected.map(String).includes(String(actual));
  }

  if (typeof expected === 'string') {
    return String(actual || '').toLowerCase() === expected.toLowerCase();
  }

  return String(actual || '') === String(expected);
};

const matchesRuleConditions = (conditions, cdr) => {
  if (!conditions) {
    return true;
  }

  if (conditions.type_appel && !matchValue(conditions.type_appel, cdr.type_appel)) {
    return false;
  }

  if (conditions.statut_appel && !matchValue(conditions.statut_appel, cdr.statut_appel)) {
    return false;
  }

  if (conditions.numero_appelant && !matchValue(conditions.numero_appelant, cdr.numero_appelant)) {
    return false;
  }

  if (conditions.numero_appele && !matchValue(conditions.numero_appele, cdr.numero_appele)) {
    return false;
  }

  const duration = Number(cdr.duree_sec || cdr.duree || 0);
  if (conditions.duree_min && duration < Number(conditions.duree_min)) {
    return false;
  }

  if (conditions.duree_max && duration > Number(conditions.duree_max)) {
    return false;
  }

  return true;
};

class GeofencingService {
  async getAntennaByCgi(cgi) {
    if (!cgi) {
      return null;
    }

    const normalized = normalizeCgi(cgi);
    let antenna = await database.queryOne(
      `SELECT * FROM ${ANTENNAS_TABLE} WHERE cgi = ? LIMIT 1`,
      [normalized]
    );

    if (!antenna && normalized !== String(cgi).trim()) {
      antenna = await database.queryOne(
        `SELECT * FROM ${ANTENNAS_TABLE} WHERE cgi = ? LIMIT 1`,
        [String(cgi).trim()]
      );
    }

    return antenna || null;
  }

  async getActiveZones() {
    const rows = await database.query(
      `SELECT * FROM ${ZONES_TABLE} WHERE actif = 1 ORDER BY id ASC`
    );

    return rows.map((row) => ({
      ...row,
      coordonnees_geo: parseZoneGeometry(row.coordonnees_geo),
      horaires_surveillance: parseJsonField(row.horaires_surveillance)
    }));
  }

  async getActiveRules(zoneId) {
    if (!zoneId) {
      return [];
    }

    const rows = await database.query(
      `SELECT * FROM ${RULES_TABLE} WHERE zone_id = ? AND actif = 1 ORDER BY priorite DESC, id ASC`,
      [zoneId]
    );

    return rows.map((row) => ({
      ...row,
      conditions: parseJsonField(row.conditions),
      declencheurs: parseJsonField(row.declencheurs),
      destinataires: parseJsonField(row.destinataires)
    }));
  }

  async detect({ cdrId, cgi, latitude, longitude }) {
    let cdr = null;
    let detectedCgi = cgi || null;

    if (cdrId) {
      cdr = await database.queryOne(
        `
          SELECT
            c.id,
            c.seq_number,
            c.cgi,
            c.type_appel,
            c.statut_appel,
            c.numero_appelant,
            c.numero_appele,
            c.duree_sec,
            c.inserted_at
          FROM ${REALTIME_CDR_TABLE_SQL} c
          WHERE c.id = ?
          LIMIT 1
        `,
        [cdrId]
      );

      if (!cdr) {
        return { error: 'CDR introuvable' };
      }

      detectedCgi = detectedCgi || cdr.cgi || null;
    }

    let lat = latitude;
    let lng = longitude;
    let antenna = null;

    if ((lat === null || lat === undefined || lng === null || lng === undefined) && detectedCgi) {
      antenna = await this.getAntennaByCgi(detectedCgi);
      if (antenna) {
        lat = Number(antenna.latitude);
        lng = Number(antenna.longitude);
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: 'Coordonnées géographiques indisponibles' };
    }

    const zones = await this.getActiveZones();
    const point = { lat, lng };
    const matchingZones = zones.filter((zone) => isPointInZone(point, zone));
    const selectedZone = matchingZones.length > 0 ? matchingZones[0] : null;
    const zoneCenter = selectedZone ? getZoneCenter(selectedZone) : null;
    const coverageRadius = antenna ? Number(antenna.rayon_couverture_m || 0) : 0;
    const distanceToCenter = zoneCenter ? distanceBetweenPoints(point, zoneCenter) : null;
    const precision = Math.min(
      coverageRadius || Number.MAX_SAFE_INTEGER,
      distanceToCenter || Number.MAX_SAFE_INTEGER
    );

    if (cdr) {
      await database.query(
        `
          INSERT INTO ${GEOLOC_TABLE}
            (cdr_id, seq_number, cgi, antenne_id, latitude_estimee, longitude_estimee, precision_m, zone_id, dans_zone, timestamp_detection)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          cdr.id,
          cdr.seq_number || null,
          detectedCgi,
          antenna?.id || null,
          lat,
          lng,
          Number.isFinite(precision) && precision !== Number.MAX_SAFE_INTEGER ? precision : null,
          selectedZone?.id || null,
          selectedZone ? 1 : 0
        ]
      );

      if (selectedZone) {
        await this.triggerAlerts({
          cdr,
          zone: selectedZone,
          detectionPoint: point,
          callType: normalizeCallType(cdr.type_appel)
        });
      }
    }

    return {
      cdrId: cdr?.id || null,
      latitude: lat,
      longitude: lng,
      antenna,
      zones: matchingZones,
      selectedZone,
      precision_m:
        Number.isFinite(precision) && precision !== Number.MAX_SAFE_INTEGER ? precision : null
    };
  }

  async triggerAlerts({ cdr, zone, detectionPoint, callType }) {
    const triggerType = detectTriggerType(callType);

    const zoneAlerts = [];
    if (callType === 'entrant' && zone.alerte_appel_entrant) {
      zoneAlerts.push('appel_vers_zone');
    }
    if (callType === 'sortant' && zone.alerte_appel_sortant) {
      zoneAlerts.push('appel_depuis_zone');
    }
    if (callType === 'interne' && zone.alerte_appel_interne) {
      zoneAlerts.push('appel_interne');
    }

    const alertsToInsert = [];

    zoneAlerts.forEach((type) => {
      alertsToInsert.push({
        type,
        message: `Appel détecté dans la zone ${zone.nom}`,
        niveau: 'warning'
      });
    });

    const rules = await this.getActiveRules(zone.id);
    for (const rule of rules) {
      const conditions = rule.conditions || {};
      const declencheurs = rule.declencheurs || [];
      const triggers = Array.isArray(declencheurs)
        ? declencheurs
        : Object.keys(declencheurs || {});

      if (triggers.length > 0 && !triggers.includes(triggerType)) {
        continue;
      }

      if (!matchesRuleConditions(conditions, cdr)) {
        continue;
      }

      const message = renderTemplate(rule.message_template, {
        numero: cdr.numero_appelant,
        zone: zone.nom,
        duree: cdr.duree_sec,
        appelant: cdr.numero_appelant,
        appele: cdr.numero_appele,
        type: cdr.type_appel
      });

      alertsToInsert.push({
        type: triggerType,
        message: message || `Règle ${rule.nom_regle} déclenchée dans la zone ${zone.nom}`,
        niveau: rule.priorite || 'info',
        destinataires: rule.destinataires || null
      });
    }

    if (alertsToInsert.length === 0) {
      return;
    }

    for (const alert of alertsToInsert) {
      await database.query(
        `
          INSERT INTO ${ALERTS_TABLE}
            (cdr_id, zone_id, type_alerte, numero_appelant, numero_appele, type_appel, cgi, message_alerte, niveau_priorite, statut, destinataires, date_alerte)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          cdr.id,
          zone.id,
          alert.type,
          cdr.numero_appelant || null,
          cdr.numero_appele || null,
          cdr.type_appel || null,
          cdr.cgi || null,
          alert.message,
          alert.niveau,
          'nouveau',
          alert.destinataires ? JSON.stringify(alert.destinataires) : null
        ]
      );
    }
  }
}

const geofencingService = new GeofencingService();

export default geofencingService;
export { GeofencingService };
