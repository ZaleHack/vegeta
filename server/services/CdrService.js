import fs from 'fs';
import csv from 'csv-parser';
import Cdr from '../models/Cdr.js';

class CdrService {
  async importCsv(filePath) {
    return new Promise((resolve, reject) => {
      const records = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', row => {
          records.push({
            oce: row['OCE'] || null,
            type_cdr: row['Type CDR'] || null,
            date_debut: row['Date debut'] || null,
            heure_debut: row['Heure debut'] || null,
            date_fin: row['Date fin'] || null,
            heure_fin: row['Heure fin'] || null,
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
            await Cdr.bulkInsert(records);
            resolve({ inserted: records.length });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', err => reject(err));
    });
  }

  async search(identifier, { startDate = null, endDate = null } = {}) {
    const records = await Cdr.findByIdentifier(identifier, startDate, endDate);
    const contactsMap = {};
    const locationsMap = {};
    const path = [];

    for (const r of records) {
      const caller = r.numero_intl_appelant;
      const callee = r.numero_intl_appele;
      const other = caller === identifier ? callee : caller;
      const direction = caller === identifier ? 'outgoing' : 'incoming';
      const type = (r.type_cdr || '').toLowerCase();
      const isSms = type.includes('sms');

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
          direction,
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
}

export default CdrService;
