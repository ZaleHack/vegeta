import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeCdrService } from '../server/services/RealtimeCdrService.js';
import { REALTIME_CDR_TABLE_SQL } from '../server/config/realtime-table.js';
import { CgiBtsEnrichmentService } from '../server/services/CgiBtsEnrichmentService.js';

process.env.USE_ELASTICSEARCH = 'false';
process.env.ENRICH_CDR_WITH_BTS = 'true';

test('Realtime CDR search enriches BTS metadata via CGI', async () => {
  const sampleRow = {
    id: 1,
    seq_number: 1,
    type_appel: 'VOIX',
    statut_appel: 'COMPLET',
    cause_liberation: null,
    facturation: null,
    date_debut_appel: '2024-04-01',
    date_fin_appel: '2024-04-01',
    heure_debut_appel: '10:00:00',
    heure_fin_appel: '10:05:00',
    duree_appel: '300',
    numero_appelant: '770000000',
    imei_appelant: '358240051111110',
    numero_appele: '780000000',
    imsi_appelant: '208150999999999',
    cgi: 'CGI-001',
    route_reseau: null,
    device_id: null,
    longitude: null,
    latitude: null,
    azimut: null,
    nom_bts: null,
    source_file: null,
    inserted_at: '2024-04-01T10:00:00Z'
  };

  const databaseStub = {
    async query(sql) {
      if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) {
        return [];
      }
      if (sql.includes(`FROM ${REALTIME_CDR_TABLE_SQL}`)) {
        return [JSON.parse(JSON.stringify(sampleRow))];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };

  const enricher = new CgiBtsEnrichmentService({
    enabled: true,
    lookupExecutor: async () =>
      new Map([
        [
          'CGI-001',
          { longitude: 17.45, latitude: -14.67, azimut: 90, nom_bts: 'Alpha BTS' }
        ]
      ])
  });

  const service = new RealtimeCdrService({
    autoStart: false,
    databaseClient: databaseStub,
    cgiEnricher: enricher
  });

  const result = await service.search('770000000', { limit: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.locations.length, 1);
  const location = result.locations[0];
  assert.equal(location.nom, 'Alpha BTS');
  assert.equal(location.latitude, '-14.67');
  assert.equal(location.longitude, '17.45');
  const pathEntry = result.path[0];
  assert.equal(pathEntry?.nom, 'Alpha BTS');
  assert.equal(pathEntry?.latitude, '-14.67');
  assert.equal(pathEntry?.longitude, '17.45');
});

test('Realtime CDR search treats position events as location points', async () => {
  const sampleRow = {
    id: 2,
    seq_number: 42,
    type_appel: 'POSITION',
    statut_appel: null,
    cause_liberation: null,
    facturation: null,
    date_debut_appel: '2024-05-01',
    date_fin_appel: '2024-05-01',
    heure_debut_appel: '14:00:00',
    heure_fin_appel: '14:00:00',
    duree_appel: '0',
    numero_appelant: '770000000',
    imei_appelant: null,
    numero_appele: null,
    imsi_appelant: null,
    cgi: null,
    route_reseau: null,
    device_id: null,
    longitude: 17.89,
    latitude: -14.32,
    azimut: null,
    nom_bts: 'Position Report',
    source_file: null,
    inserted_at: '2024-05-01T14:00:00Z'
  };

  const databaseStub = {
    async query(sql) {
      if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) {
        return [];
      }
      if (sql.includes(`FROM ${REALTIME_CDR_TABLE_SQL}`)) {
        return [JSON.parse(JSON.stringify(sampleRow))];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };

  const service = new RealtimeCdrService({
    autoStart: false,
    databaseClient: databaseStub
  });

  const result = await service.search('770000000', { limit: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.contacts.length, 0);
  const pathEntry = result.path[0];
  assert.equal(pathEntry?.type, 'position');
  assert.equal(pathEntry?.nom, 'Position Report');
  assert.equal(pathEntry?.latitude, '-14.32');
  assert.equal(pathEntry?.longitude, '17.89');
});

test('Realtime CDR search ignores callee matches for position events', async () => {
  const sampleRow = {
    id: 3,
    seq_number: 99,
    type_appel: 'POSITION',
    statut_appel: null,
    cause_liberation: null,
    facturation: null,
    date_debut_appel: '2024-06-01',
    date_fin_appel: '2024-06-01',
    heure_debut_appel: '18:00:00',
    heure_fin_appel: '18:00:00',
    duree_appel: '0',
    numero_appelant: '771111111',
    imei_appelant: null,
    numero_appele: '772222222',
    imsi_appelant: null,
    cgi: null,
    route_reseau: null,
    device_id: null,
    longitude: 17.12,
    latitude: -14.98,
    azimut: null,
    nom_bts: 'Position Callee',
    source_file: null,
    inserted_at: '2024-06-01T18:00:00Z'
  };

  const databaseStub = {
    async query(sql) {
      if (/INFORMATION_SCHEMA\.COLUMNS/i.test(sql)) {
        return [];
      }
      if (sql.includes(`FROM ${REALTIME_CDR_TABLE_SQL}`)) {
        return [JSON.parse(JSON.stringify(sampleRow))];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };

  const service = new RealtimeCdrService({
    autoStart: false,
    databaseClient: databaseStub
  });

  const result = await service.search('772222222', { limit: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.path.length, 0);
  assert.equal(result.locations.length, 0);
});
