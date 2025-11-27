import database from '../config/database.js';
import { REALTIME_CDR_TABLE_SQL } from '../config/realtime-table.js';
import { checkImei, ImeiFunctionalError } from './ImeiService.js';

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

const buildNumberVariants = (value) => {
  const sanitized = sanitizeNumber(value);
  const normalized = normalizePhoneNumber(value);
  const variants = new Set([sanitized, normalized].filter(Boolean));

  return {
    sanitized,
    normalized,
    variants: [...variants]
  };
};

const MAX_ASSOCIATIONS = 120;

const normalizeDateTime = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch (error) {
    return null;
  }
};

const resolveImeiDetails = async (imeis = []) => {
  const results = await Promise.all(
    imeis.map(async (imei) => {
      try {
        const data = await checkImei(imei);
        const brand = data.object?.brand || data.brand || '';
        const model = data.object?.model || data.model || '';
        const name = data.object?.name || data.name || [brand, model].filter(Boolean).join(' ').trim();

        return [imei, {
          brand,
          model,
          name,
          status: data.status ?? data.rawStatus ?? '',
          result: data.result ?? data.rawResult ?? ''
        }];
      } catch (error) {
        const reason =
          error instanceof ImeiFunctionalError
            ? 'IMEI introuvable ou invalide'
            : "Impossible de récupérer les informations IMEI";

        return [imei, { brand: '', model: '', name: '', error: reason }];
      }
    })
  );

  return new Map(results);
};

export const findDevicesByNumber = async (inputNumber) => {
  const { variants, normalized } = buildNumberVariants(inputNumber);

  if (variants.length === 0) {
    throw new Error('Numéro de téléphone invalide');
  }

  const placeholders = variants.map(() => '?').join(', ');

  const rows = await database.query(
    `
      SELECT
        c.numero_appelant AS number,
        c.imsi_appelant AS imsi,
        c.imei_appelant AS imei,
        MIN(CONCAT_WS('T', c.date_debut, COALESCE(c.heure_debut, '00:00:00'))) AS first_seen,
        MAX(CONCAT_WS('T', c.date_debut, COALESCE(c.heure_debut, '00:00:00'))) AS last_seen,
        COUNT(*) AS occurrences
      FROM ${REALTIME_CDR_TABLE_SQL} c
      WHERE c.imei_appelant IS NOT NULL
        AND c.imei_appelant <> ''
        AND c.numero_appelant IN (${placeholders})
      GROUP BY c.numero_appelant, c.imsi_appelant, c.imei_appelant
      ORDER BY last_seen DESC
      LIMIT ${MAX_ASSOCIATIONS}
    `,
    variants
  );

  const uniqueImeis = [...new Set(rows.map((row) => row.imei).filter(Boolean))];
  const uniqueImsis = new Set(rows.map((row) => row.imsi).filter(Boolean));
  const imeiDetails = await resolveImeiDetails(uniqueImeis);

  const devices = rows.map((row) => ({
    number: row.number,
    imsi: row.imsi || null,
    imei: row.imei,
    occurrences: Number(row.occurrences) || 0,
    firstSeen: normalizeDateTime(row.first_seen),
    lastSeen: normalizeDateTime(row.last_seen),
    imeiInfo: imeiDetails.get(row.imei) || null
  }));

  const orderedByLastSeen = devices
    .slice()
    .sort((a, b) => {
      const aDate = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
      const bDate = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      return bDate - aDate;
    });

  const stats = {
    totalAssociations: devices.length,
    uniqueImeis: uniqueImeis.length,
    uniqueImsis: uniqueImsis.size,
    lastSeen: orderedByLastSeen[0]?.lastSeen || null,
    firstSeen: orderedByLastSeen[orderedByLastSeen.length - 1]?.firstSeen || null
  };

  return {
    query: {
      input: inputNumber,
      normalized: normalized || variants[0] || '',
      variants
    },
    devices: orderedByLastSeen,
    stats
  };
};

export default {
  findDevicesByNumber
};
