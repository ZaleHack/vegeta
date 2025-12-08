import database from '../config/database.js';

const DEVICE_IDENTIFIER_SQL =
  "COALESCE(NULLIF(msisdn, ''), NULLIF(imsi, ''), NULLIF(imei, ''))";

class GeofencingEvent {
  static async record(event) {
    const {
      msisdn = null,
      imsi = null,
      imei = null,
      cgi = null,
      lac = null,
      ci = null,
      tac = null,
      longitude = null,
      latitude = null,
      type_evenement,
      zone_id,
      zone_nom,
      timestamp_cdr
    } = event;

    if (!zone_id || !zone_nom || !timestamp_cdr || !type_evenement) {
      throw new Error('Champs événement manquants');
    }

    const result = await database.query(
      `INSERT INTO autres.cdr_geofencing_events
      (msisdn, imsi, imei, cgi, lac, ci, tac, longitude, latitude, type_evenement, zone_id, zone_nom, timestamp_cdr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msisdn,
        imsi,
        imei,
        cgi,
        lac,
        ci,
        tac,
        longitude,
        latitude,
        type_evenement,
        zone_id,
        zone_nom,
        timestamp_cdr
      ]
    );

    return { id: result.insertId, ...event };
  }

  static async latestForDevice(zoneId, { msisdn, imsi, imei }) {
    return database.queryOne(
      `SELECT * FROM autres.cdr_geofencing_events
       WHERE zone_id = ?
         AND (
           (msisdn IS NOT NULL AND msisdn = ?)
           OR (imsi IS NOT NULL AND imsi = ?)
           OR (imei IS NOT NULL AND imei = ?)
         )
       ORDER BY id DESC
       LIMIT 1`,
      [zoneId, msisdn || null, imsi || null, imei || null]
    );
  }

  static async devicesInZone(zoneId) {
    return database.query(
      `SELECT e.*
       FROM autres.cdr_geofencing_events e
       INNER JOIN (
         SELECT ${DEVICE_IDENTIFIER_SQL} AS device_key, MAX(id) AS max_id
         FROM autres.cdr_geofencing_events
         WHERE zone_id = ?
           AND ${DEVICE_IDENTIFIER_SQL} IS NOT NULL
         GROUP BY device_key
       ) latest ON latest.max_id = e.id
       WHERE e.type_evenement IN ('entree', 'interieur')
      ORDER BY e.created_at DESC`,
      [zoneId]
    );
  }

  static async findByZone(zoneId, limit = 100) {
    return database.query(
      `SELECT *
       FROM autres.cdr_geofencing_events
       WHERE zone_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [zoneId, limit]
    );
  }
}

export default GeofencingEvent;
