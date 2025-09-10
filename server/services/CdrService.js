import fs from 'fs';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { parse, format } from 'date-fns';
import Cdr from '../models/Cdr.js';
import database from '../config/database.js';

const ALLOWED_PREFIXES = ['22177', '22176', '22178', '22170', '22175', '22133'];

class CdrService {
  async importCsv(filePath, caseName, fileId, cdrNumber) {
    const cdrNum = cdrNumber.startsWith('221') ? cdrNumber : `221${cdrNumber}`;
    return new Promise((resolve, reject) => {
      const records = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', row => {
          const normalizeDate = (str) => {
            if (!str) return null;
            try {
              const parsed = parse(str, 'dd/MM/yyyy', new Date());
              if (isNaN(parsed)) return null;
              return format(parsed, 'yyyy-MM-dd');
            } catch {
              return null;
            }
          };
          const normalizeTime = (str) => {
            if (!str) return null;
            const parsed = new Date(`1970-01-01T${str}`);
            if (isNaN(parsed.getTime())) return null;
            return parsed.toISOString().slice(11, 19);
          };

          records.push({
            oce: row['OCE'] || null,
            type_cdr: row['Type CDR'] || null,
            cdr_numb: cdrNum,
            date_debut: normalizeDate(row['Date debut']),
            heure_debut: normalizeTime(row['Heure debut']),
            date_fin: normalizeDate(row['Date fin']),
            heure_fin: normalizeTime(row['Heure fin']),
            duree: row['Duree'] || null,
            numero_intl_appelant: row['Numero intl appelant'] || null,
            numero_intl_appele: row['Numero intl appele'] || null,
            numero_intl_appele_original: row['Numero intl appele original'] || null,
            imei_appelant: row['IMEI appelant'] || null,
            imei_appele: row['IMEI appele'] || null,
            imei_appele_original: row['IMEI appele original'] || null,
            imsi_appelant: row['IMSI appelant'] || null,
            imsi_appele: row['IMSI appele'] || null,
            cgi_appelant: row['CGI appelant'] || null,
            cgi_appele: row['CGI appele'] || null,
            cgi_appele_original: row['CGI appele original'] || null,
            latitude: row['Latitude'] || null,
            longitude: row['Longitude'] || null,
            nom_localisation: row['Nom localisation'] || null
          });
        })
        .on('end', async () => {
            try {
              await Cdr.bulkInsert(records, caseName, fileId);
              resolve({ inserted: records.length });
              } catch (err) {
                reject(err);
              }
        })
        .on('error', err => reject(err));
    });
  }

  async importExcel(filePath, caseName, fileId, cdrNumber) {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const normalizeDate = (str) => {
      if (!str) return null;
      try {
        const parsed = parse(str, 'dd/MM/yyyy', new Date());
        if (isNaN(parsed)) return null;
        return format(parsed, 'yyyy-MM-dd');
      } catch {
        return null;
      }
    };
    const normalizeTime = (str) => {
      if (!str) return null;
      const parsed = new Date(`1970-01-01T${str}`);
      if (isNaN(parsed.getTime())) return null;
      return parsed.toISOString().slice(11, 19);
    };
    const cdrNum = cdrNumber.startsWith('221') ? cdrNumber : `221${cdrNumber}`;
    const records = rows.map((row) => ({
      oce: row['OCE'] || null,
      type_cdr: row['Type CDR'] || null,
      cdr_numb: cdrNum,
      date_debut: normalizeDate(row['Date debut']),
      heure_debut: normalizeTime(row['Heure debut']),
      date_fin: normalizeDate(row['Date fin']),
      heure_fin: normalizeTime(row['Heure fin']),
      duree: row['Duree'] || null,
      numero_intl_appelant: row['Numero intl appelant'] || null,
      numero_intl_appele: row['Numero intl appele'] || null,
      numero_intl_appele_original: row['Numero intl appele original'] || null,
      imei_appelant: row['IMEI appelant'] || null,
      imei_appele: row['IMEI appele'] || null,
      imei_appele_original: row['IMEI appele original'] || null,
      imsi_appelant: row['IMSI appelant'] || null,
      imsi_appele: row['IMSI appele'] || null,
      cgi_appelant: row['CGI appelant'] || null,
      cgi_appele: row['CGI appele'] || null,
      cgi_appele_original: row['CGI appele original'] || null,
      latitude: row['Latitude'] || null,
      longitude: row['Longitude'] || null,
      nom_localisation: row['Nom localisation'] || null,
    }));
    await Cdr.bulkInsert(records, caseName, fileId);
    return { inserted: records.length };
  }

  async search(
    identifier,
    {
      startDate = null,
      endDate = null,
      startTime = null,
      endTime = null,
      location = null,
      caseName,
      direction = 'both',
      type = 'both',
    } = {}
  ) {
    const records = await Cdr.findByIdentifier(
      identifier,
      startDate,
      endDate,
      startTime,
      endTime,
      location,
      caseName
    );
    const contactsMap = {};
    const locationsMap = {};
    const path = [];

    for (const r of records) {
      const caller = r.numero_intl_appelant;
      const callee = r.numero_intl_appele;
      if (String(caller || '').startsWith('2214') || String(callee || '').startsWith('2214')) {
        continue;
      }
      const isWeb = !callee;
      const other = caller === identifier ? callee : caller;
      const directionRecord = caller === identifier ? 'outgoing' : 'incoming';
      const typeStr = (r.type_cdr || '').toLowerCase();
      const isSms = typeStr.includes('sms');
      const eventType = isWeb ? 'web' : isSms ? 'sms' : 'call';

      if (direction === 'position') {
        if (!isWeb) {
          continue;
        }
      } else {
        if (direction !== 'both' && !isWeb && directionRecord !== direction) {
          continue;
        }
        if (type !== 'both' && type !== eventType) {
          continue;
        }
      }

      if (!isWeb && other) {
        if (!contactsMap[other]) {
          contactsMap[other] = { number: other, callCount: 0, smsCount: 0 };
        }
        if (isSms) {
          contactsMap[other].smsCount++;
        } else {
          contactsMap[other].callCount++;
        }
      }

      if (r.latitude && r.longitude) {
        const key = `${r.latitude},${r.longitude}`;
        if (!locationsMap[key]) {
          locationsMap[key] = {
            latitude: r.latitude,
            longitude: r.longitude,
            nom: r.nom_localisation,
            count: 0
          };
        }
        locationsMap[key].count++;

        // Format duration for frontend display
        let duration = 'N/A';
        if (r.duree) {
          let totalSeconds = 0;
          if (typeof r.duree === 'string' && r.duree.includes(':')) {
            const parts = r.duree.split(':').map((p) => parseInt(p, 10));
            while (parts.length < 3) parts.unshift(0);
            if (parts.every((n) => !isNaN(n))) {
              totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          } else {
            const parsedDur = parseInt(r.duree, 10);
            if (!isNaN(parsedDur)) totalSeconds = parsedDur;
          }
          if (totalSeconds > 0) {
            duration = totalSeconds >= 60
              ? `${Math.round(totalSeconds / 60)} min`
              : `${totalSeconds} s`;
          }
        }

        const callDate = (() => {
          if (!r.date_debut) return 'N/A';
          const parsed = new Date(r.date_debut);
          return isNaN(parsed.getTime())
            ? r.date_debut
            : parsed.toISOString().split('T')[0];
        })();
        const endDate = (() => {
          if (!r.date_fin) return 'N/A';
          const parsed = new Date(r.date_fin);
          return isNaN(parsed.getTime())
            ? r.date_fin
            : parsed.toISOString().split('T')[0];
        })();
        const startTime = r.heure_debut
          ? r.heure_debut.toString().slice(0, 8)
          : 'N/A';
        const endTime = r.heure_fin
          ? r.heure_fin.toString().slice(0, 8)
          : 'N/A';

        const entry = {
          latitude: r.latitude,
          longitude: r.longitude,
          nom: r.nom_localisation,
          type: eventType,
          callDate,
          endDate,
          startTime,
          endTime,
          duration,
          imeiCaller: r.imei_appelant,
          imeiCalled: r.imei_appele
        };
        if (!isWeb) {
          entry.direction = directionRecord;
          entry.number = other;
        }

        path.push(entry);
      }
    }

    const contacts = Object.values(contactsMap)
      .map((c) => ({
        number: c.number,
        callCount: c.callCount,
        smsCount: c.smsCount,
        total: c.callCount + c.smsCount
      }))
      .sort((a, b) => b.total - a.total);

    const locations = Object.values(locationsMap).sort((a, b) => b.count - a.count);

    return {
      total: records.length,
      contacts,
      topContacts: contacts.slice(0, 5),
      locations,
      topLocations: locations.slice(0, 5),
      path
    };
  }

  async findCommonContacts(numbers, caseName) {
    const isAllowed = (n) => ALLOWED_PREFIXES.some((p) => String(n).startsWith(p));
    const filteredNumbers = Array.isArray(numbers) ? numbers.filter(isAllowed) : [];
    if (filteredNumbers.length === 0) {
      return { nodes: [], links: [] };
    }

    const placeholders = filteredNumbers.map(() => '?').join(',');
    const table = Cdr.escapeIdentifier(caseName);
    const query = `SELECT numero_intl_appelant, numero_intl_appele, type_cdr FROM ${table} WHERE numero_intl_appelant IN (${placeholders}) OR numero_intl_appele IN (${placeholders})`;
    const params = [...filteredNumbers, ...filteredNumbers];
    const rows = await database.query(query, params);

    const contactSources = {};
    const edgeMap = {};

    for (const r of rows) {
      const caller = r.numero_intl_appelant;
      const callee = r.numero_intl_appele;
      let source = null;
      let contact = null;

      if (filteredNumbers.includes(caller)) {
        source = caller;
        contact = callee;
      } else if (filteredNumbers.includes(callee)) {
        source = callee;
        contact = caller;
      }

      if (!contact || !isAllowed(contact)) continue;

      if (!contactSources[contact]) {
        contactSources[contact] = new Set();
      }
      contactSources[contact].add(source);

      const key = `${source}-${contact}`;
      if (!edgeMap[key]) {
        edgeMap[key] = { source, target: contact, callCount: 0, smsCount: 0 };
      }
      const isSms = (r.type_cdr || '').toLowerCase().includes('sms');
      if (isSms) {
        edgeMap[key].smsCount++;
      } else {
        edgeMap[key].callCount++;
      }
    }

    const nodes = filteredNumbers.map((n) => ({ id: n, type: 'source' }));
    const links = [];

    for (const contact in contactSources) {
      const sourcesSet = contactSources[contact];
      if (sourcesSet.size >= 2) {
        nodes.push({ id: contact, type: 'contact' });
        for (const source of sourcesSet) {
          const edgeKey = `${source}-${contact}`;
          if (edgeMap[edgeKey]) {
            links.push(edgeMap[edgeKey]);
          }
        }
      }
    }

    return { nodes, links };
  }

  async listLocations(caseName) {
    const rows = await Cdr.listLocations(caseName);
    return rows.map((r) => r.nom_localisation);
  }

  async deleteTable(caseName) {
    await Cdr.deleteTable(caseName);
  }

  async clearTable(caseName) {
    await Cdr.truncateTable(caseName);
  }

  async deleteByFile(fileId, caseName) {
    await Cdr.deleteByFileId(fileId, caseName);
  }
}

export default CdrService;
