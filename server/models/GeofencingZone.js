import database from '../config/database.js';

class GeofencingZone {
  static async create({ name, type, geometry, metadata = null }) {
    if (!name || !type || !geometry) {
      throw new Error('Nom, type et géométrie sont requis');
    }

    const payload = typeof geometry === 'string' ? geometry : JSON.stringify(geometry);
    const meta = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

    const result = await database.query(
      `INSERT INTO autres.cdr_geofencing_zones (name, type, geometry, metadata) VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON))`,
      [name, type, payload, meta]
    );

    return {
      id: result.insertId,
      name,
      type,
      geometry: typeof geometry === 'string' ? JSON.parse(payload) : geometry,
      metadata: metadata ?? null
    };
  }

  static async findById(id) {
    return database.queryOne('SELECT * FROM autres.cdr_geofencing_zones WHERE id = ?', [id]);
  }

  static async findAll() {
    return database.query('SELECT * FROM autres.cdr_geofencing_zones ORDER BY created_at DESC');
  }
}

export default GeofencingZone;
