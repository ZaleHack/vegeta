import btsDatabase from '../config/bts-database.js';

const TABLES = [
  { name: '`2g`', longitude: 'LONGITUDE', latitude: 'LATITUDE', azimut: 'AZIMUT', label: 'NOM_BTS' },
  { name: '`3g`', longitude: 'LONGITUDE', latitude: 'LATITUDE', azimut: 'AZIMUT', label: 'NOM_BTS' },
  {
    name: '`4g`',
    longitude: 'LONGITUDE',
    latitude: 'LATITUDE',
    azimut: 'AZIMUT',
    label: 'NOM_BTS'
  },
  {
    name: '`5g`',
    longitude: 'LONGITUDE',
    latitude: 'LATITUDE',
    azimut: 'AZIMUT',
    label: 'NOM_BTS'
  }
];

const normalizeCgi = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

class BtsLocationService {
  constructor() {
    this.cache = new Map();
    this.pending = new Map();
  }

  async #lookupInTable(cgi, table) {
    const sql = `
      SELECT ${table.label} AS nom_bts, ${table.longitude} AS longitude, ${table.latitude} AS latitude, ${table.azimut} AS azimut
      FROM ${table.name}
      WHERE CGI = ?
      LIMIT 1
    `;

    const rows = await btsDatabase.query(sql, [cgi]);
    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      nom_bts: row.nom_bts || null,
      longitude: parseNumber(row.longitude),
      latitude: parseNumber(row.latitude),
      azimut: parseNumber(row.azimut),
      sourceTable: table.name.replace(/`/g, '')
    };
  }

  async #fetchLocation(cgi) {
    const normalized = normalizeCgi(cgi);
    if (!normalized) {
      return null;
    }

    for (const table of TABLES) {
      try {
        const result = await this.#lookupInTable(normalized, table);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error('Erreur lors de la recherche BTS pour le CGI %s : %s', normalized, error.message);
      }
    }
    return null;
  }

  async getLocation(cgi) {
    const normalized = normalizeCgi(cgi);
    if (!normalized) {
      return null;
    }

    if (this.cache.has(normalized)) {
      return this.cache.get(normalized);
    }

    if (this.pending.has(normalized)) {
      return this.pending.get(normalized);
    }

    const promise = this.#fetchLocation(normalized)
      .then((result) => {
        this.cache.set(normalized, result);
        this.pending.delete(normalized);
        return result;
      })
      .catch((error) => {
        this.pending.delete(normalized);
        console.error('Erreur lors de la récupération de la localisation BTS:', error);
        throw error;
      });

    this.pending.set(normalized, promise);
    return promise;
  }
}

export default BtsLocationService;
