import cgiBtsEnricher from './CgiBtsEnrichmentService.js';
import GeofencingZone from '../models/GeofencingZone.js';
import GeofencingEvent from '../models/GeofencingEvent.js';
import { normalizeCgi } from '../utils/cgi.js';

const toNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const haversineDistanceMeters = (coordA, coordB) => {
  const R = 6371e3;
  const phi1 = (coordA.lat * Math.PI) / 180;
  const phi2 = (coordB.lat * Math.PI) / 180;
  const deltaPhi = ((coordB.lat - coordA.lat) * Math.PI) / 180;
  const deltaLambda = ((coordB.lng - coordA.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect = yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const normalizePattern = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');

const wildcardMatch = (value, pattern) => {
  const normalizedValue = normalizePattern(value);
  const normalizedPattern = normalizePattern(pattern);
  if (!normalizedValue || !normalizedPattern) {
    return false;
  }
  const escaped = normalizedPattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
  return regex.test(normalizedValue);
};

class GeofencingService {
  async createZone(payload) {
    const { name, type, geometry, metadata } = payload;
    if (!name || !type || !geometry) {
      throw new Error('Nom, type et géométrie requis');
    }
    if (!['circle', 'polygon', 'antenna'].includes(type)) {
      throw new Error('Type de zone invalide');
    }
    return GeofencingZone.create({ name, type, geometry, metadata });
  }

  async listZones() {
    return GeofencingZone.findAll();
  }

  async analyzeCdr(rawCdr) {
    const cdr = this.#normalizeCdr(rawCdr);
    const deviceId = cdr.msisdn || cdr.imsi || cdr.imei;
    if (!deviceId) {
      throw new Error('Aucun identifiant abonné fourni');
    }

    const location = await this.#resolveCoordinates(cdr);
    const zones = await GeofencingZone.findAll();

    const events = [];
    for (const zone of zones) {
      const isInside = this.#isInsideZone(zone, location, cdr);
      const latest = await GeofencingEvent.latestForDevice(zone.id, cdr);
      const lastState = latest?.type_evenement === 'sortie' || !latest ? 'outside' : 'inside';

      if (isInside && lastState === 'outside') {
        events.push(await this.#persistEvent('entree', zone, cdr, location));
      } else if (!isInside && lastState === 'inside') {
        events.push(await this.#persistEvent('sortie', zone, cdr, location));
      } else if (isInside && lastState === 'inside') {
        events.push(await this.#persistEvent('interieur', zone, cdr, location));
      }
    }

    return events;
  }

  async devicesInZone(zoneId) {
    return GeofencingEvent.devicesInZone(zoneId);
  }

  async #persistEvent(type, zone, cdr, location) {
    const payload = {
      msisdn: cdr.msisdn,
      imsi: cdr.imsi,
      imei: cdr.imei,
      cgi: cdr.cgi,
      lac: cdr.lac,
      ci: cdr.ci,
      tac: cdr.tac,
      longitude: location?.lng ?? null,
      latitude: location?.lat ?? null,
      type_evenement: type,
      zone_id: zone.id,
      zone_nom: zone.name,
      timestamp_cdr: cdr.timestamp
    };
    const event = await GeofencingEvent.record(payload);
    await this.#notify(event);
    return event;
  }

  async #notify(event) {
    const webhookUrl = process.env.GEOFENCING_WEBHOOK_URL;
    if (!webhookUrl) {
      return;
    }

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'geofencing_event',
          payload: event
        })
      });
    } catch (error) {
      console.error('Notification geofencing impossible:', error.message);
    }
  }

  #isInsideZone(zone, location, cdr) {
    const geometry = typeof zone.geometry === 'string' ? JSON.parse(zone.geometry) : zone.geometry;
    if (!geometry) {
      return false;
    }

    if (zone.type === 'circle') {
      if (!location?.lat || !location?.lng) return false;
      const { center, radius } = geometry;
      if (!center || !radius) return false;
      const distance = haversineDistanceMeters(location, { lat: Number(center.lat), lng: Number(center.lng) });
      return distance <= Number(radius);
    }

    if (zone.type === 'polygon') {
      if (!location?.lat || !location?.lng) return false;
      const points = Array.isArray(geometry.points)
        ? geometry.points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
        : [];
      if (points.length < 3) return false;
      return pointInPolygon(location, points);
    }

    if (zone.type === 'antenna') {
      const normalizedCgi = normalizeCgi(cdr.cgi);
      const patterns = Array.isArray(geometry.patterns) ? geometry.patterns : [];
      const cgis = Array.isArray(geometry.cgis) ? geometry.cgis : [];
      const lacs = Array.isArray(geometry.lacs) ? geometry.lacs.map(String) : [];
      const cis = Array.isArray(geometry.cis) ? geometry.cis.map(String) : [];
      const tacs = Array.isArray(geometry.tacs) ? geometry.tacs.map(String) : [];

      if (normalizedCgi && cgis.map(normalizePattern).includes(normalizePattern(normalizedCgi))) {
        return true;
      }

      for (const pattern of patterns) {
        if (wildcardMatch(normalizedCgi, pattern)) {
          return true;
        }
      }

      if (cdr.lac && lacs.includes(String(cdr.lac))) {
        return true;
      }
      if (cdr.ci && cis.includes(String(cdr.ci))) {
        return true;
      }
      if (cdr.tac && tacs.includes(String(cdr.tac))) {
        return true;
      }
      return false;
    }

    return false;
  }

  async #resolveCoordinates(cdr) {
    const lat = toNumber(cdr.latitude ?? cdr.lat);
    const lng = toNumber(cdr.longitude ?? cdr.lng);
    if (lat !== null && lng !== null) {
      return { lat, lng };
    }

    if (cdr.cgi) {
      const coords = await cgiBtsEnricher.fetchOne(cdr.cgi);
      if (coords?.latitude !== null && coords?.longitude !== null) {
        return { lat: coords.latitude, lng: coords.longitude };
      }
    }

    return null;
  }

  #normalizeCdr(cdr) {
    const normalized = { ...cdr };
    normalized.msisdn = typeof cdr.msisdn === 'string' ? cdr.msisdn.trim() : cdr.servedMSISDN || null;
    normalized.imsi = typeof cdr.imsi === 'string' ? cdr.imsi.trim() : cdr.servedIMSI || null;
    normalized.imei = typeof cdr.imei === 'string' ? cdr.imei.trim() : cdr.servedIMEI || null;
    normalized.cgi = cdr.cgi || cdr.CGI || cdr.cellId || null;
    normalized.lac = cdr.lac || cdr.LAC || null;
    normalized.ci = cdr.ci || cdr.CI || cdr.ECI || null;
    normalized.tac = cdr.tac || cdr.TAC || null;
    normalized.timestamp = cdr.timestamp_cdr || cdr.seizureTime || cdr.callDate || cdr.releaseTime || cdr.timestamp || new Date();
    return normalized;
  }
}

const geofencingService = new GeofencingService();
export default geofencingService;
export { GeofencingService };
