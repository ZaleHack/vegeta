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

  async search(identifier) {
    const records = await Cdr.findByIdentifier(identifier);
    const contactsMap = {};
    const locationsMap = {};

    for (const r of records) {
      const caller = r.numero_intl_appelant;
      const callee = r.numero_intl_appele;
      const other = caller === identifier ? callee : caller;
      if (other) {
        contactsMap[other] = (contactsMap[other] || 0) + 1;
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
      }
    }

    const contacts = Object.entries(contactsMap)
      .map(([number, count]) => ({ number, count }))
      .sort((a, b) => b.count - a.count);

    const locations = Object.values(locationsMap);

    return {
      total: records.length,
      contacts,
      topContacts: contacts.slice(0, 5),
      locations
    };
  }
}

export default CdrService;
