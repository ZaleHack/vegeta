import fs from 'fs';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { parse, format } from 'date-fns';
import Cdr from '../models/Cdr.js';

class CdrService {
  async importCsv(filePath, caseName) {
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
            await Cdr.bulkInsert(records, caseName);
            resolve({ inserted: records.length });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', err => reject(err));
    });
  }

  async importExcel(filePath, caseName) {
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
    const records = rows.map((row) => ({
      oce: row['OCE'] || null,
      type_cdr: row['Type CDR'] || null,
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
    await Cdr.bulkInsert(records, caseName);
    return { inserted: records.length };
  }

  async search(
    identifier,
    {
      startDate = null,
      endDate = null,
      startTime = null,
      endTime = null,
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
      caseName
    );
    const contactsMap = {};
    const locationsMap = {};
    const path = [];

    for (const r of records) {
      const caller = r.numero_intl_appelant;
      const callee = r.numero_intl_appele;
      const other = caller === identifier ? callee : caller;
      const directionRecord = caller === identifier ? 'outgoing' : 'incoming';
      const typeStr = (r.type_cdr || '').toLowerCase();
      const isSms = typeStr.includes('sms');

      if (direction !== 'both' && directionRecord !== direction) {
        continue;
      }
      if (type !== 'both') {
        if (type === 'sms' && !isSms) continue;
        if (type === 'call' && isSms) continue;
      }

      if (other) {
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
        const startTime = r.heure_debut
          ? r.heure_debut.toString().slice(0, 8)
          : 'N/A';
        const endTime = r.heure_fin
          ? r.heure_fin.toString().slice(0, 8)
          : 'N/A';

        path.push({
          latitude: r.latitude,
          longitude: r.longitude,
          nom: r.nom_localisation,
          type: isSms ? 'sms' : 'call',
          direction: directionRecord,
          number: other,
          callDate,
          startTime,
          endTime,
          duration
        });
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

  async deleteTable(caseName) {
    await Cdr.deleteTable(caseName);
  }

  async clearTable(caseName) {
    await Cdr.truncateTable(caseName);
  }
}

export default CdrService;
