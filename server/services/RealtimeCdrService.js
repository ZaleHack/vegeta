import database from '../config/database.js';

const EMPTY_RESULT = {
  total: 0,
  contacts: [],
  topContacts: [],
  locations: [],
  topLocations: [],
  path: []
};

const sanitizeNumber = (value) => {
  if (value === null || value === undefined) {
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
  return text;
};

const normalizePhoneNumber = (value) => {
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return '';
  }
  if (sanitized.startsWith('221')) {
    return sanitized;
  }
  const trimmed = sanitized.replace(/^0+/, '');
  return trimmed ? `221${trimmed}` : '';
};

const buildIdentifierVariants = (value) => {
  const variants = new Set();
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return variants;
  }
  variants.add(sanitized);
  const normalized = normalizePhoneNumber(sanitized);
  if (normalized) {
    variants.add(normalized);
    if (normalized.startsWith('221')) {
      const local = normalized.slice(3);
      if (local) {
        variants.add(local);
      }
    }
  }
  return variants;
};

const matchesIdentifier = (identifierSet, value) => {
  if (!value) {
    return false;
  }
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return false;
  }
  if (identifierSet.has(sanitized)) {
    return true;
  }
  const normalized = normalizePhoneNumber(sanitized);
  if (normalized && identifierSet.has(normalized)) {
    return true;
  }
  if (normalized.startsWith('221')) {
    const local = normalized.slice(3);
    if (identifierSet.has(local)) {
      return true;
    }
  }
  return false;
};

const normalizeForOutput = (value) => {
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return '';
  }
  const normalized = normalizePhoneNumber(sanitized);
  return normalized || sanitized;
};

const normalizeTimeBound = (value) => {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }
  if (/^\d{2}:\d{2}$/.test(text)) {
    return `${text}:00`;
  }
  return null;
};

const formatDateValue = (value) => {
  if (!value && value !== 0) {
    return 'N/A';
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  const text = String(value).trim();
  if (!text) {
    return 'N/A';
  }
  if (text.length >= 10) {
    return text.slice(0, 10);
  }
  return text;
};

const formatTimeValue = (value) => {
  if (!value && value !== 0) {
    return 'N/A';
  }
  const text = String(value).trim();
  if (!text) {
    return 'N/A';
  }
  return text.length === 5 ? `${text}:00` : text;
};

const formatDuration = (value) => {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const seconds = Math.round(value);
    if (seconds <= 0) {
      return 'N/A';
    }
    if (seconds < 60) {
      return `${seconds} s`;
    }
    return `${Math.round(seconds / 60)} min`;
  }
  const text = String(value).trim();
  if (!text) {
    return 'N/A';
  }
  if (/^\d+$/.test(text)) {
    const seconds = parseInt(text, 10);
    if (Number.isNaN(seconds) || seconds <= 0) {
      return 'N/A';
    }
    if (seconds < 60) {
      return `${seconds} s`;
    }
    return `${Math.round(seconds / 60)} min`;
  }
  if (text.includes(':')) {
    const parts = text.split(':').map((p) => parseInt(p, 10));
    if (parts.every((n) => !Number.isNaN(n))) {
      while (parts.length < 3) {
        parts.unshift(0);
      }
      const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (seconds > 0) {
        if (seconds < 60) {
          return `${seconds} s`;
        }
        return `${Math.round(seconds / 60)} min`;
      }
    }
  }
  return text;
};

const resolveEventType = (value) => {
  const text = String(value || '').toLowerCase();
  if (!text) {
    return 'call';
  }
  if (text.includes('sms')) {
    return 'sms';
  }
  if (text.includes('data') || text.includes('gprs') || text.includes('web')) {
    return 'web';
  }
  return 'call';
};

class RealtimeCdrService {
  async search(identifier, options = {}) {
    const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
    if (!trimmedIdentifier) {
      return { ...EMPTY_RESULT };
    }

    const identifierVariants = buildIdentifierVariants(trimmedIdentifier);
    if (identifierVariants.size === 0) {
      return { ...EMPTY_RESULT };
    }

    const {
      startDate = null,
      endDate = null,
      startTime = null,
      endTime = null,
      limit = 2000
    } = options;

    const conditions = [];
    const params = [];

    const variantList = Array.from(identifierVariants);
    if (variantList.length > 0) {
      const numberConditions = variantList.map(() => '(numero_appelant = ? OR numero_appele = ?)');
      conditions.push(`(${numberConditions.join(' OR ')})`);
      variantList.forEach((variant) => {
        params.push(variant, variant);
      });
    }

    if (startDate) {
      conditions.push('date_debut_appel >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('date_debut_appel <= ?');
      params.push(endDate);
    }

    const startTimeBound = normalizeTimeBound(startTime);
    const endTimeBound = normalizeTimeBound(endTime);

    if (startTimeBound) {
      conditions.push('heure_debut_appel >= ?');
      params.push(startTimeBound);
    }
    if (endTimeBound) {
      conditions.push('heure_debut_appel <= ?');
      params.push(endTimeBound);
    }

    const limitValue = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 10000);
    params.push(limitValue);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        id,
        type_appel,
        date_debut_appel,
        date_fin_appel,
        heure_debut_appel,
        heure_fin_appel,
        duree_appel,
        numero_appelant,
        imei_appelant,
        numero_appele,
        imsi_appelant,
        cgi,
        longitude,
        latitude,
        azimut,
        nom_bts,
        source_file,
        inserted_at
      FROM autres.cdr_realtime
      ${whereClause}
      ORDER BY date_debut_appel ASC, heure_debut_appel ASC, id ASC
      LIMIT ?
    `;

    const rows = await database.query(sql, params);
    return this.#buildResult(rows, identifierVariants);
  }

  #buildResult(rows, identifierSet) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ...EMPTY_RESULT };
    }

    const contactsMap = new Map();
    const locationsMap = new Map();
    const path = [];

    for (const row of rows) {
      const caller = row.numero_appelant ? normalizeForOutput(row.numero_appelant) : '';
      const callee = row.numero_appele ? normalizeForOutput(row.numero_appele) : '';

      const matchesCaller = matchesIdentifier(identifierSet, row.numero_appelant);
      const matchesCallee = matchesIdentifier(identifierSet, row.numero_appele);

      if (!matchesCaller && !matchesCallee) {
        continue;
      }

      const eventType = resolveEventType(row.type_appel);

      let direction = 'incoming';
      let otherNumber = '';

      if (matchesCaller && !matchesCallee) {
        direction = 'outgoing';
        otherNumber = callee;
      } else if (!matchesCaller && matchesCallee) {
        direction = 'incoming';
        otherNumber = caller;
      } else if (matchesCaller && matchesCallee) {
        direction = 'outgoing';
        otherNumber = callee || caller;
      }

      const normalizedOtherNumber = otherNumber ? normalizeForOutput(otherNumber) : '';
      if (normalizedOtherNumber && eventType !== 'web') {
        const entry = contactsMap.get(normalizedOtherNumber) || { callCount: 0, smsCount: 0 };
        if (eventType === 'sms') {
          entry.smsCount += 1;
        } else {
          entry.callCount += 1;
        }
        contactsMap.set(normalizedOtherNumber, entry);
      }

      const latitude = row.latitude !== null && row.latitude !== undefined ? String(row.latitude) : '';
      const longitude = row.longitude !== null && row.longitude !== undefined ? String(row.longitude) : '';

      if (latitude && longitude) {
        const locationName = row.nom_bts ? String(row.nom_bts).trim() : '';
        const key = `${latitude},${longitude},${locationName}`;
        const locationEntry = locationsMap.get(key) || {
          latitude,
          longitude,
          nom: locationName,
          count: 0
        };
        locationEntry.count += 1;
        locationsMap.set(key, locationEntry);

        path.push({
          latitude,
          longitude,
          nom: locationName,
          type: eventType,
          direction,
          number: normalizedOtherNumber || undefined,
          caller: caller || undefined,
          callee: callee || undefined,
          callDate: formatDateValue(row.date_debut_appel),
          endDate: formatDateValue(row.date_fin_appel),
          startTime: formatTimeValue(row.heure_debut_appel),
          endTime: formatTimeValue(row.heure_fin_appel),
          duration: formatDuration(row.duree_appel),
          imeiCaller: row.imei_appelant ? String(row.imei_appelant).trim() : undefined,
          imeiCalled: undefined
        });
      }
    }

    const contacts = Array.from(contactsMap.entries())
      .map(([number, stats]) => ({
        number,
        callCount: stats.callCount,
        smsCount: stats.smsCount,
        total: stats.callCount + stats.smsCount
      }))
      .sort((a, b) => b.total - a.total);

    const locations = Array.from(locationsMap.values()).sort((a, b) => b.count - a.count);

    return {
      total: rows.length,
      contacts,
      topContacts: contacts.slice(0, 10),
      locations,
      topLocations: locations.slice(0, 10),
      path
    };
  }
}

export default new RealtimeCdrService();
