import CaseService from './CaseService.js';
import Cdr from '../models/Cdr.js';

const normalizePhoneNumber = (value) => {
  if (!value) return '';
  let sanitized = String(value).trim();
  if (!sanitized) return '';
  sanitized = sanitized.replace(/\s+/g, '');
  if (sanitized.startsWith('+')) {
    sanitized = sanitized.slice(1);
  }
  while (sanitized.startsWith('00')) {
    sanitized = sanitized.slice(2);
  }
  sanitized = sanitized.replace(/\D/g, '');
  if (!sanitized) return '';
  if (sanitized.startsWith('221')) {
    return sanitized;
  }
  sanitized = sanitized.replace(/^0+/, '');
  return sanitized ? `221${sanitized}` : '';
};

const normalizeDateValue = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return str;
};

const normalizeImei = (value) => {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').trim();
  return digits.length >= 5 ? digits : '';
};

class FraudDetectionService {
  constructor() {
    this.caseService = new CaseService();
  }

  async detectAcrossCases(options = {}, user) {
    const { startDate = null, endDate = null, identifier = '' } = options;

    const cases = await this.caseService.listCases(user);
    const caseMetaMap = new Map();
    const caseNames = [];

    for (const item of cases || []) {
      const name = item?.name ? String(item.name).trim() : '';
      if (!name) {
        continue;
      }

      if (!caseMetaMap.has(name)) {
        caseMetaMap.set(name, {
          id: item.id,
          name,
          owner: item.user_login || null,
          division: item.division_name || null,
        });
        caseNames.push(name);
      }
    }

    if (caseNames.length === 0) {
      return { imeis: [], updatedAt: new Date().toISOString() };
    }

    const trimmedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
    const normalizedNumberFilter = trimmedIdentifier ? normalizePhoneNumber(trimmedIdentifier) : '';
    const normalizedImeiFilter = trimmedIdentifier ? normalizeImei(trimmedIdentifier) : '';
    const hasFilter = Boolean(trimmedIdentifier);

    const imeiMap = new Map();
    const numberMap = new Map();

    for (const caseName of caseNames) {
      try {
        const rows = await Cdr.getImeiNumberPairs(caseName, { startDate, endDate });
        const caseMeta = caseMetaMap.get(caseName);

        for (const row of rows) {
          const imei = String(row.imei || '').trim();
          const normalizedNumber = normalizePhoneNumber(row.numero);
          if (!imei || !normalizedNumber) {
            continue;
          }

          const matchesNumber = normalizedNumberFilter
            ? normalizedNumber === normalizedNumberFilter
            : false;
          const matchesImei = normalizedImeiFilter ? imei === normalizedImeiFilter : false;

          if (hasFilter && !matchesNumber && !matchesImei) {
            continue;
          }

          const normalizedDate = normalizeDateValue(row.call_date);
          const role = String(row.role || '').trim();

          let imeiEntry = imeiMap.get(imei);
          if (!imeiEntry) {
            imeiEntry = {
              imei,
              numbers: new Map(),
            };
            imeiMap.set(imei, imeiEntry);
          }

          let numberEntry = imeiEntry.numbers.get(normalizedNumber);
          if (!numberEntry) {
            numberEntry = {
              number: normalizedNumber,
              firstSeen: null,
              lastSeen: null,
              occurrences: 0,
              roles: new Set(),
              cases: new Map(),
            };
            imeiEntry.numbers.set(normalizedNumber, numberEntry);
          }

          numberEntry.occurrences += 1;
          if (normalizedDate) {
            if (!numberEntry.firstSeen || normalizedDate < numberEntry.firstSeen) {
              numberEntry.firstSeen = normalizedDate;
            }
            if (!numberEntry.lastSeen || normalizedDate > numberEntry.lastSeen) {
              numberEntry.lastSeen = normalizedDate;
            }
          }

          if (role) {
            numberEntry.roles.add(role);
          }

          if (caseMeta) {
            numberEntry.cases.set(caseMeta.id, caseMeta);
          }

          let numberInfo = numberMap.get(normalizedNumber);
          if (!numberInfo) {
            numberInfo = {
              number: normalizedNumber,
              imeis: new Map(),
            };
            numberMap.set(normalizedNumber, numberInfo);
          }

          let imeiInfo = numberInfo.imeis.get(imei);
          if (!imeiInfo) {
            imeiInfo = {
              imei,
              firstSeen: null,
              lastSeen: null,
              occurrences: 0,
              roles: new Set(),
              cases: new Map(),
            };
            numberInfo.imeis.set(imei, imeiInfo);
          }

          imeiInfo.occurrences += 1;
          if (normalizedDate) {
            if (!imeiInfo.firstSeen || normalizedDate < imeiInfo.firstSeen) {
              imeiInfo.firstSeen = normalizedDate;
            }
            if (!imeiInfo.lastSeen || normalizedDate > imeiInfo.lastSeen) {
              imeiInfo.lastSeen = normalizedDate;
            }
          }

          if (role) {
            imeiInfo.roles.add(role);
          }

          if (caseMeta) {
            imeiInfo.cases.set(caseMeta.id, caseMeta);
          }
        }
      } catch (error) {
        console.error(`Erreur détection fraude globale pour ${caseName}:`, error);
      }
    }

    const result = [];
    const suspiciousNumbers = [];

    for (const [imei, entry] of imeiMap.entries()) {
      const numbers = Array.from(entry.numbers.values()).map((number) => ({
        number: number.number,
        firstSeen: number.firstSeen,
        lastSeen: number.lastSeen,
        occurrences: number.occurrences,
        roles: Array.from(number.roles).sort(),
        cases: Array.from(number.cases.values()),
      }));

      if (numbers.length < 2) {
        continue;
      }

      const callerSet = new Set(
        numbers
          .filter((n) => n.roles.includes('caller'))
          .map((n) => n.number)
      );
      const calleeSet = new Set(
        numbers
          .filter((n) => n.roles.includes('callee'))
          .map((n) => n.number)
      );

      if (callerSet.size < 2 && calleeSet.size < 2) {
        continue;
      }

      numbers.sort((a, b) => {
        if (a.lastSeen && b.lastSeen && a.lastSeen !== b.lastSeen) {
          return a.lastSeen > b.lastSeen ? -1 : 1;
        }
        return b.occurrences - a.occurrences;
      });

      const caseAccumulator = new Map();
      for (const num of numbers) {
        for (const info of num.cases) {
          caseAccumulator.set(info.id, info);
        }
      }

      result.push({
        imei,
        numbers,
        roleSummary: {
          caller: callerSet.size,
          callee: calleeSet.size,
        },
        cases: Array.from(caseAccumulator.values()),
      });
    }

    result.sort((a, b) => {
      const aSuspicious = Math.max(a.roleSummary.caller, a.roleSummary.callee);
      const bSuspicious = Math.max(b.roleSummary.caller, b.roleSummary.callee);
      if (aSuspicious !== bSuspicious) {
        return bSuspicious - aSuspicious;
      }
      if (a.numbers.length !== b.numbers.length) {
        return b.numbers.length - a.numbers.length;
      }
      return a.imei.localeCompare(b.imei);
    });

    for (const [number, entry] of numberMap.entries()) {
      const imeis = Array.from(entry.imeis.values()).map((info) => ({
        imei: info.imei,
        firstSeen: info.firstSeen,
        lastSeen: info.lastSeen,
        occurrences: info.occurrences,
        roles: Array.from(info.roles).sort(),
        cases: Array.from(info.cases.values()),
      }));

      if (imeis.length < 2) {
        continue;
      }

      const callerSet = new Set(
        imeis
          .filter((i) => i.roles.includes('caller'))
          .map((i) => i.imei)
      );
      const calleeSet = new Set(
        imeis
          .filter((i) => i.roles.includes('callee'))
          .map((i) => i.imei)
      );

      if (callerSet.size < 2 && calleeSet.size < 2) {
        continue;
      }

      imeis.sort((a, b) => {
        if (a.lastSeen && b.lastSeen && a.lastSeen !== b.lastSeen) {
          return a.lastSeen > b.lastSeen ? -1 : 1;
        }
        return b.occurrences - a.occurrences;
      });

      const caseAccumulator = new Map();
      for (const imeiEntry of imeis) {
        for (const info of imeiEntry.cases) {
          caseAccumulator.set(info.id, info);
        }
      }

      suspiciousNumbers.push({
        number,
        imeis,
        roleSummary: {
          caller: callerSet.size,
          callee: calleeSet.size,
        },
        cases: Array.from(caseAccumulator.values()),
      });
    }

    suspiciousNumbers.sort((a, b) => {
      const aSuspicious = Math.max(a.roleSummary.caller, a.roleSummary.callee);
      const bSuspicious = Math.max(b.roleSummary.caller, b.roleSummary.callee);
      if (aSuspicious !== bSuspicious) {
        return bSuspicious - aSuspicious;
      }
      if (a.imeis.length !== b.imeis.length) {
        return b.imeis.length - a.imeis.length;
      }
      return a.number.localeCompare(b.number);
    });

    return {
      imeis: result,
      numbers: suspiciousNumbers,
      updatedAt: new Date().toISOString(),
    };
  }
}

export default FraudDetectionService;
