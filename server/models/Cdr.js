import database from '../config/database.js';

class Cdr {
  static async bulkInsert(records, caseId = null) {
    for (const rec of records) {
      await database.query(
        `INSERT INTO autres.cdr_records (
          case_id, oce, type_cdr, date_debut, heure_debut, date_fin, heure_fin, duree,
          numero_intl_appelant, numero_intl_appele, numero_intl_appele_original,
          imei_appelant, imei_appele, imei_appele_original,
          imsi_appelant, imsi_appele,
          cgi_appelant, cgi_appele, cgi_appele_original,
          latitude, longitude, nom_localisation
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          caseId,
          rec.oce,
          rec.type_cdr,
          rec.date_debut,
          rec.heure_debut,
          rec.date_fin,
          rec.heure_fin,
          rec.duree,
          rec.numero_intl_appelant,
          rec.numero_intl_appele,
          rec.numero_intl_appele_original,
          rec.imei_appelant,
          rec.imei_appele,
          rec.imei_appele_original,
          rec.imsi_appelant,
          rec.imsi_appele,
          rec.cgi_appelant,
          rec.cgi_appele,
          rec.cgi_appele_original,
          rec.latitude,
          rec.longitude,
          rec.nom_localisation
        ]
      );
    }
  }

  static async findByIdentifier(identifier, startDate = null, endDate = null, caseId = null) {
    let query = `SELECT * FROM autres.cdr_records WHERE (
      numero_intl_appelant = ? OR
      numero_intl_appele = ? OR
      imei_appelant = ? OR
      imei_appele = ?
    )`;
    const params = [identifier, identifier, identifier, identifier];

    if (caseId) {
      query += ' AND case_id = ?';
      params.push(caseId);
    }

    if (startDate) {
      query += ` AND date_debut >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date_debut <= ?`;
      params.push(endDate);
    }

    query += ' ORDER BY date_debut, heure_debut';

    return await database.query(query, params);
  }
}

export default Cdr;
