import database from '../config/database.js';

class Cdr {
  static escapeIdentifier(name) {
    return `\`${name.replace(/`/g, '``')}\``;
  }

  static async bulkInsert(records, tableName, fileId) {
    const table = this.escapeIdentifier(tableName);
    await database.query(
        `CREATE TABLE IF NOT EXISTS ${table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          oce VARCHAR(50) DEFAULT NULL,
          type_cdr VARCHAR(50) DEFAULT NULL,
          cdr_numb VARCHAR(50) DEFAULT NULL,
          date_debut VARCHAR(50) DEFAULT NULL,
          heure_debut TIME DEFAULT NULL,
          date_fin VARCHAR(50) DEFAULT NULL,
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
          nom_localisation VARCHAR(255) DEFAULT NULL,
          file_id INT DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );

    for (const rec of records) {
      await database.query(
          `INSERT INTO ${table} (
            oce, type_cdr, cdr_numb, date_debut, heure_debut, date_fin, heure_fin, duree,
            numero_intl_appelant, numero_intl_appele, numero_intl_appele_original,
            imei_appelant, imei_appele, imei_appele_original,
            imsi_appelant, imsi_appele,
            cgi_appelant, cgi_appele, cgi_appele_original,
            latitude, longitude, nom_localisation, file_id
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            rec.oce,
            rec.type_cdr,
            rec.cdr_numb,
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
            rec.nom_localisation,
            fileId
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
    location = null,
    tableName
  ) {
    const table = this.escapeIdentifier(tableName);
    let query = `SELECT * FROM ${table} WHERE (
      numero_intl_appelant = ? OR
      numero_intl_appele = ? OR
      imei_appelant = ? OR
      imei_appele = ? OR
      cdr_numb = ?
    )`;
    const params = [identifier, identifier, identifier, identifier, identifier];

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
    if (location) {
      query += ` AND nom_localisation = ?`;
      params.push(location);
    }

    query += ' ORDER BY date_debut, heure_debut';

    return await database.query(query, params);
  }

  static async listLocations(tableName) {
    const table = this.escapeIdentifier(tableName);
    return await database.query(
      `SELECT DISTINCT nom_localisation FROM ${table} WHERE nom_localisation IS NOT NULL AND nom_localisation <> '' ORDER BY nom_localisation`
    );
  }

  static async deleteTable(tableName) {
    const table = this.escapeIdentifier(tableName);
    await database.query(`DROP TABLE IF EXISTS ${table}`);
  }

  static async truncateTable(tableName) {
    const table = this.escapeIdentifier(tableName);
    await database.query(`TRUNCATE TABLE ${table}`);
  }

  static async deleteByFileId(fileId, tableName) {
    const table = this.escapeIdentifier(tableName);
    await database.query(`DELETE FROM ${table} WHERE file_id = ?`, [fileId]);
  }
}

export default Cdr;
