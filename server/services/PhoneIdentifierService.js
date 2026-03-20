import database from '../config/database.js';
import { REALTIME_CDR_TABLE_SQL } from '../config/realtime-table.js';
import client from '../config/elasticsearch.js';
import { isElasticsearchEnabled, isElasticsearchForced } from '../config/environment.js';
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
const REALTIME_INDEX = process.env.ELASTICSEARCH_CDR_REALTIME_INDEX || 'cdr-realtime-events';

const normalizeDateTime = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch (error) {
    return null;
  }
};

const computeImeiCheckDigit = (baseImei) => {
  const digits = String(baseImei || '').replace(/\D/g, '');
  if (digits.length !== 14) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    if (Number.isNaN(digit)) {
      return 0;
    }

    const isEvenPosition = (index + 1) % 2 === 0;
    if (isEvenPosition) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
  }

  return (10 - (sum % 10)) % 10;
};

const normalizeImeiWithCheckDigit = (imei) => {
  const digits = String(imei || '').replace(/\D/g, '');
  if (digits.length < 14) {
    return imei;
  }

  const base = digits.slice(0, 14);
  const checkDigit = computeImeiCheckDigit(base);
  return `${base}${checkDigit}`;
};

const resolveImeiDetails = async (imeis = []) => {
  const results = await Promise.all(
    imeis.map(async (imei) => {
      const normalizedImei = normalizeImeiWithCheckDigit(imei);
      const tac = normalizedImei ? String(normalizedImei).replace(/\D/g, '').slice(0, 8) : '';

      try {
        const data = await checkImei(normalizedImei);
        const brand = data.object?.brand || data.brand || '';
        const model = data.object?.model || data.model || '';
        const name = data.object?.name || data.name || [brand, model].filter(Boolean).join(' ').trim();

        return [imei, {
          brand,
          model,
          name,
          tac,
          tacInfo: data.tacInfo ?? null,
          status: data.status ?? data.rawStatus ?? '',
          result: data.result ?? data.rawResult ?? ''
        }];
      } catch (error) {
        const reason =
          error instanceof ImeiFunctionalError
            ? 'IMEI introuvable ou invalide'
            : "Impossible de récupérer les informations IMEI";

        return [imei, { brand: '', model: '', name: '', tac, tacInfo: null, error: reason }];
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

  let rows = [];
  const elasticEnabled = isElasticsearchEnabled();
  const elasticForced = isElasticsearchForced();

  if (elasticEnabled) {
    try {
      const response = await client.search({
        index: REALTIME_INDEX,
        size: Math.min(MAX_ASSOCIATIONS * 40, 5000),
        _source: [
          'numero_appelant',
          'numero_appelant_normalized',
          'imsi_appelant',
          'imei_appelant',
          'call_timestamp',
          'date_debut_appel',
          'heure_debut_appel',
          'date_debut',
          'heure_debut'
        ],
        query: {
          bool: {
            filter: [
              {
                bool: {
                  should: [
                    { terms: { numero_appelant: variants } },
                    { terms: { numero_appelant_normalized: variants } },
                    { terms: { caller_variants: variants } }
                  ],
                  minimum_should_match: 1
                }
              },
              { exists: { field: 'imei_appelant' } }
            ]
          }
        },
        sort: [
          { call_timestamp: { order: 'desc', unmapped_type: 'date' } },
          { inserted_at: { order: 'desc', unmapped_type: 'date' } },
          { record_id: { order: 'desc' } }
        ],
        track_total_hits: false
      });

      const grouped = new Map();
      const hits = response?.hits?.hits || [];

      hits.forEach((hit) => {
        const source = hit?._source || {};
        const imei = source.imei_appelant ? String(source.imei_appelant).trim() : '';
        if (!imei) {
          return;
        }

        const number = source.numero_appelant || source.numero_appelant_normalized || '';
        const normalizedNumber = normalizePhoneNumber(number) || sanitizeNumber(number) || '';
        if (!normalizedNumber) {
          return;
        }

        const imsi = source.imsi_appelant ? String(source.imsi_appelant).trim() : '';
        const stamp = source.call_timestamp
          || (source.date_debut_appel || source.date_debut
            ? `${source.date_debut_appel || source.date_debut}T${source.heure_debut_appel || source.heure_debut || '00:00:00'}`
            : null);

        const key = `${normalizedNumber}::${imsi}::${imei}`;
        const current = grouped.get(key) || {
          number: normalizedNumber,
          imsi: imsi || null,
          imei,
          first_seen: stamp,
          last_seen: stamp,
          occurrences: 0
        };

        current.occurrences += 1;
        if (!current.first_seen || (stamp && stamp < current.first_seen)) {
          current.first_seen = stamp;
        }
        if (!current.last_seen || (stamp && stamp > current.last_seen)) {
          current.last_seen = stamp;
        }

        grouped.set(key, current);
      });

      rows = Array.from(grouped.values())
        .sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || '')))
        .slice(0, MAX_ASSOCIATIONS);
    } catch (error) {
      if (elasticForced) {
        throw error;
      }
    }
  }

  if (rows.length === 0 && !elasticForced) {
    rows = await database.query(
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
  }

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
