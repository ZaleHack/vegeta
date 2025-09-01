import database from '../config/database.js';

class Cdr {
  static escapeIdentifier(name) {
    return `\`${name.replace(/`/g, '``')}\``;
  }

  static async bulkInsert(records, tableName) {
    const table = this.escapeIdentifier(tableName);
    await database.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        oce VARCHAR(50) DEFAULT NULL,
        type_cdr VARCHAR(50) DEFAULT NULL,
        date_debut DATE DEFAULT NULL,
        heure_debut TIME DEFAULT NULL,
        date_fin DATE DEFAULT NULL,
        heure_fin TIME DEFAULT NULL,
        duree INT DEFAULT NULL,
        numero_intl_appelant VARCHAR(50) DEFAULT NULL,
        numero_intl_appele VARCHAR(50) DEFAULT NULL,
        numero_intl_appele_original VARCHAR(50) DEFAULT NULL,
        imei_appelant VARCHAR(50) DEFAULT NULL,
        imei_appele VARCHAR(50) DEFAULT NULL,
        imei_appele_original VARCHAR(50) DEFAULT NULL,
        imsi_appelant VARCHAR(50) DEFAULT NULL,
        imsi_appele VARCHAR(50) DEFAULT NULL,
        cgi_appelant VARCHAR(50) DEFAULT NULL,
        cgi_appele VARCHAR(50) DEFAULT NULL,
        cgi_appele_original VARCHAR(50) DEFAULT NULL,
        latitude DECIMAL(10,6) DEFAULT NULL,
        longitude DECIMAL(10,6) DEFAULT NULL,
        nom_localisation VARCHAR(255) DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    for (const rec of records) {
      await database.query(
        `INSERT INTO ${table} (
          oce, type_cdr, date_debut, heure_debut, date_fin, heure_fin, duree,
          numero_intl_appelant, numero_intl_appele, numero_intl_appele_original,
          imei_appelant, imei_appele, imei_appele_original,
          imsi_appelant, imsi_appele,
          cgi_appelant, cgi_appele, cgi_appele_original,
          latitude, longitude, nom_localisation
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
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

  static async findByIdentifier(
    identifier,
    startDate = null,
    endDate = null,
    startTime = null,
    endTime = null,
    tableName
  ) {
    const table = this.escapeIdentifier(tableName);
    let query = `SELECT * FROM ${table} WHERE (
      numero_intl_appelant = ? OR
      numero_intl_appele = ? OR
      imei_appelant = ? OR
      imei_appele = ?
    )`;
    const params = [identifier, identifier, identifier, identifier];

    if (startDate) {
      query += ` AND date_debut >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date_debut <= ?`;
      params.push(endDate);
    }
    if (startTime) {
      query += ` AND heure_debut >= ?`;
      params.push(startTime);
    }
    if (endTime) {
      query += ` AND heure_debut <= ?`;
      params.push(endTime);
    }

    query += ' ORDER BY date_debut, heure_debut';

    return await database.query(query, params);
  }

  static async deleteTable(tableName) {
    const table = this.escapeIdentifier(tableName);
    await database.query(`DROP TABLE IF EXISTS ${table}`);
  }

  static async truncateTable(tableName) {
    const table = this.escapeIdentifier(tableName);
    await database.query(`TRUNCATE TABLE ${table}`);
  }
}

export default Cdr;
