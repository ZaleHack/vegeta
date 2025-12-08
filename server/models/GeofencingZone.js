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

  static async update(id, { name, type, geometry, metadata }) {
    const payload = geometry ? (typeof geometry === 'string' ? geometry : JSON.stringify(geometry)) : null;
    const meta =
      metadata !== undefined ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Zone introuvable');
    }

    const updatedName = name ?? existing.name;
    const updatedType = type ?? existing.type;
    const updatedGeometry = payload ?? existing.geometry;
    const updatedMetadata = meta ?? existing.metadata;

    await database.query(
      `UPDATE autres.cdr_geofencing_zones
       SET name = ?, type = ?, geometry = CAST(? AS JSON), metadata = CAST(? AS JSON)
       WHERE id = ?`,
      [updatedName, updatedType, updatedGeometry, updatedMetadata, id]
    );

    return {
      id,
      name: updatedName,
      type: updatedType,
      geometry: typeof updatedGeometry === 'string' ? JSON.parse(updatedGeometry) : updatedGeometry,
      metadata: updatedMetadata ? (typeof updatedMetadata === 'string' ? JSON.parse(updatedMetadata) : updatedMetadata) : null
    };
  }

  static async delete(id) {
    await database.query('DELETE FROM autres.cdr_geofencing_zones WHERE id = ?', [id]);
  }
}

export default GeofencingZone;
