import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { parse as parseDate, format as formatDate } from 'date-fns';
import chokidar from 'chokidar';
import client from '../config/elasticsearch.js';
import Case from '../models/Case.js';
import { isElasticsearchEnabled } from '../config/environment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_PREFIXES = ['22177', '22176', '22178', '22170', '22175', '22133'];
const CDR_INDEX = process.env.ELASTICSEARCH_CDR_INDEX || 'cdr-events';
const SUPPORTED_EXTENSIONS = new Set(['.csv', '.xls', '.xlsx']);

const normalizePhoneNumber = (value) => {
  if (!value) return '';
  let sanitized = String(value).trim();
  if (!sanitized) return '';
  sanitized = sanitized.replace(/\s+/g, '');
  if (sanitized.startsWith('+')) {
    sanitized = sanitized.slice(1);
  }
  while (sanitized.startsWith('00')) {
    sanitized = sanitized.slice(2);
  }
  sanitized = sanitized.replace(/\D/g, '');
  if (!sanitized) return '';
  if (sanitized.startsWith('221')) {
    return sanitized;
  }
  sanitized = sanitized.replace(/^0+/, '');
  return sanitized ? `221${sanitized}` : '';
};

const normalizeDateValue = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return str;
};

const ensureDirectory = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const moveFile = async (src, dest) => {
  try {
    await fs.promises.rename(src, dest);
  } catch (error) {
    if (error.code === 'EXDEV') {
      await fs.promises.copyFile(src, dest);
      await fs.promises.unlink(src);
    } else {
      throw error;
    }
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isConnectionError = (error) =>
  error?.name === 'ConnectionError' || error?.meta?.statusCode === 0;

class CdrService {
  constructor() {
    if (CdrService.instance) {
      return CdrService.instance;
    }

    this.indexName = CDR_INDEX;
    this.elasticEnabled = isElasticsearchEnabled();
    this.baseDir = path.join(__dirname, '../../uploads/cdr');
    this.manualProcessing = new Set();

    this.ensureBaseDirectory();

    if (!CdrService.watcherInitialized) {
      this.initializeWatcher();
      CdrService.watcherInitialized = true;
    }

    CdrService.instance = this;
  }

  async ensureBaseDirectory() {
    await ensureDirectory(this.baseDir);
  }

  getCaseDirectory(caseId) {
    return path.join(this.baseDir, `case-${caseId}`);
  }

  getMetaPath(caseId, fileId) {
    return path.join(this.getCaseDirectory(caseId), `file-${fileId}.meta.json`);
  }

  getMarkerPath(filePath) {
    return `${filePath}.indexed`;
  }

  parseFileIdentifiers(filePath) {
    const relative = path.relative(this.baseDir, filePath);
    const parts = relative.split(path.sep);
    if (parts.length < 2) {
      return { caseId: null, fileId: null };
    }
    const caseMatch = parts[0]?.match(/^case-(\d+)$/);
    const fileMatch = parts[parts.length - 1]?.match(/^file-(\d+)-/);
    const caseId = caseMatch ? Number(caseMatch[1]) : null;
    const fileId = fileMatch ? Number(fileMatch[1]) : null;
    return { caseId, fileId };
  }

  async ensureIndex() {
    if (!this.elasticEnabled) {
      CdrService.indexEnsured = true;
      return;
    }
    if (CdrService.indexEnsured) {
      return;
    }
    try {
      const exists = await client.indices.exists({ index: this.indexName });
      if (!exists) {
        await client.indices.create({
          index: this.indexName,
          mappings: {
            properties: {
              case_id: { type: 'integer' },
              case_name: { type: 'keyword' },
              file_id: { type: 'integer' },
              cdr_number: { type: 'keyword' },
              type_cdr: { type: 'keyword' },
              numero_intl_appelant: { type: 'keyword' },
              numero_intl_appele: { type: 'keyword' },
              numero_intl_appele_original: { type: 'keyword' },
              imei_appelant: { type: 'keyword' },
              imei_appele: { type: 'keyword' },
              imei_appele_original: { type: 'keyword' },
              imsi_appelant: { type: 'keyword' },
              imsi_appele: { type: 'keyword' },
              cgi_appelant: { type: 'keyword' },
              cgi_appele: { type: 'keyword' },
              cgi_appele_original: { type: 'keyword' },
              nom_localisation: { type: 'keyword' },
              call_timestamp: { type: 'date' },
              date_debut: { type: 'keyword' },
              heure_debut: { type: 'keyword' },
              date_fin: { type: 'keyword' },
              heure_fin: { type: 'keyword' },
              latitude: { type: 'double' },
              longitude: { type: 'double' },
              line_number: { type: 'integer' },
              original_filename: { type: 'keyword' }
            }
          }
        });
      }
      CdrService.indexEnsured = true;
    } catch (error) {
      if (isConnectionError(error)) {
        console.error(
          'Erreur initialisation index Elasticsearch CDR:',
          error.message
        );
        console.warn(
          '⚠️ Elasticsearch indisponible. Bascule sur le moteur de recherche local pour les CDR.'
        );
        this.elasticEnabled = false;
        CdrService.indexEnsured = false;
        return;
      }
      console.error('Erreur initialisation index Elasticsearch CDR:', error);
      throw error;
    }
  }

  buildCallTimestamp(dateStr, timeStr) {
    if (!dateStr) return null;
    const sanitizedDate = String(dateStr).trim();
    if (!sanitizedDate) return null;
    const normalizedDate = normalizeDateValue(sanitizedDate);
    if (!normalizedDate) return null;
    const timePart = timeStr ? String(timeStr).trim() : '';
    const time = timePart ? (timePart.length === 5 ? `${timePart}:00` : timePart) : '00:00:00';
    const isoString = `${normalizedDate}T${time}`;
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  normalizeDate(str) {
    if (!str) return null;
    try {
      const parsed = parseDate(String(str).trim(), 'dd/MM/yyyy', new Date());
      if (Number.isNaN(parsed)) return null;
      return formatDate(parsed, 'yyyy-MM-dd');
    } catch {
      const normalized = normalizeDateValue(str);
      return normalized;
    }
  }

  normalizeTime(str) {
    if (!str) return null;
    const text = String(str).trim();
    if (!text) return null;
    if (/^\d{2}:\d{2}$/.test(text)) {
      return `${text}:00`;
    }
    if (!/^\d{2}:\d{2}:\d{2}$/.test(text)) {
      return null;
    }
    return text;
  }

  transformRow(row, cdrNumber, lineNumber) {
    const normalizePhone = (value) => {
      const normalized = normalizePhoneNumber(value);
      return normalized || null;
    };

    const dateDebut = this.normalizeDate(row['Date debut'] || row['date_debut']);
    const heureDebut = this.normalizeTime(row['Heure debut'] || row['heure_debut']);
    const dateFin = this.normalizeDate(row['Date fin'] || row['date_fin']);
    const heureFin = this.normalizeTime(row['Heure fin'] || row['heure_fin']);

    const record = {
      oce: row['OCE'] || row['oce'] || null,
      type_cdr: row['Type CDR'] || row['type_cdr'] || null,
      cdr_numb: cdrNumber,
      date_debut: dateDebut,
      heure_debut: heureDebut,
      date_fin: dateFin,
      heure_fin: heureFin,
      duree: row['Duree'] || row['duree'] || null,
      numero_intl_appelant: normalizePhone(row['Numero intl appelant'] || row['numero_intl_appelant']),
      numero_intl_appele: normalizePhone(row['Numero intl appele'] || row['numero_intl_appele']),
      numero_intl_appele_original: normalizePhone(
        row['Numero intl appele original'] || row['numero_intl_appele_original']
      ),
      imei_appelant: row['IMEI appelant'] || row['imei_appelant'] || null,
      imei_appele: row['IMEI appele'] || row['imei_appele'] || null,
      imei_appele_original: row['IMEI appele original'] || row['imei_appele_original'] || null,
      imsi_appelant: row['IMSI appelant'] || row['imsi_appelant'] || null,
      imsi_appele: row['IMSI appele'] || row['imsi_appele'] || null,
      cgi_appelant: row['CGI appelant'] || row['cgi_appelant'] || null,
      cgi_appele: row['CGI appele'] || row['cgi_appele'] || null,
      cgi_appele_original: row['CGI appele original'] || row['cgi_appele_original'] || null,
      latitude: row['Latitude'] || row['latitude'] || null,
      longitude: row['Longitude'] || row['longitude'] || null,
      nom_localisation: row['Nom localisation'] || row['nom_localisation'] || null,
      line_number: lineNumber
    };

    const callTimestamp = this.buildCallTimestamp(record.date_debut, record.heure_debut);
    if (callTimestamp) {
      record.call_timestamp = callTimestamp;
    }

    if (record.latitude !== null && record.latitude !== undefined && record.latitude !== '') {
      const lat = Number(record.latitude);
      record.latitude = Number.isNaN(lat) ? null : lat;
    }
    if (record.longitude !== null && record.longitude !== undefined && record.longitude !== '') {
      const lon = Number(record.longitude);
      record.longitude = Number.isNaN(lon) ? null : lon;
    }

    return record;
  }

  async indexRecords(metadata, records) {
    if (!Array.isArray(records) || records.length === 0) {
      return { inserted: 0, indexed: false };
    }

    if (!this.elasticEnabled) {
      return { inserted: records.length, indexed: false };
    }

    await this.ensureIndex();

    if (!this.elasticEnabled) {
      return { inserted: records.length, indexed: false };
    }

    const operations = [];
    for (const record of records) {
      const documentId = `${metadata.caseId}-${metadata.fileId}-${record.line_number}`;
      const doc = {
        case_id: metadata.caseId,
        case_name: metadata.caseName,
        file_id: metadata.fileId,
        cdr_number: metadata.cdrNumber,
        original_filename: metadata.originalName,
        ...record
      };

      if (record.latitude !== null && record.longitude !== null) {
        doc.location_point = {
          lat: record.latitude,
          lon: record.longitude
        };
      }

      operations.push({ index: { _index: this.indexName, _id: documentId } });
      operations.push(doc);
    }

    let response;
    try {
      response = await client.bulk({
        operations,
        refresh: 'wait_for'
      });
    } catch (error) {
      if (isConnectionError(error)) {
        console.error('Erreur indexation Elasticsearch CDR:', error.message);
        this.elasticEnabled = false;
        return { inserted: records.length, indexed: false };
      }
      throw error;
    }

    if (response.errors) {
      const failures = response.items?.filter((item) => item?.index?.error) || [];
      if (failures.length > 0) {
        const error = new Error('Erreur indexation Elasticsearch CDR');
        error.failures = failures;
        throw error;
      }
    }

    return { inserted: records.length, indexed: true };
  }

  async readCsvRecords(filePath, metadata) {
    return await new Promise((resolve, reject) => {
      const records = [];
      let lineNumber = 0;
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          lineNumber += 1;
          const record = this.transformRow(row, metadata.cdrNumber, lineNumber);
          records.push(record);
        })
        .on('end', () => resolve(records))
        .on('error', (error) => reject(error));
    });
  }

  async parseCsv(filePath, metadata) {
    const records = await this.readCsvRecords(filePath, metadata);
    const { inserted, indexed } = await this.indexRecords(metadata, records);
    return { inserted, indexed, records };
  }

  async readExcelRecords(filePath, metadata) {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    let lineNumber = 0;
    return rows.map((row) => {
      lineNumber += 1;
      return this.transformRow(row, metadata.cdrNumber, lineNumber);
    });
  }

  async parseExcel(filePath, metadata) {
    const records = await this.readExcelRecords(filePath, metadata);
    const { inserted, indexed } = await this.indexRecords(metadata, records);
    return { inserted, indexed, records };
  }

  async readRecordsFromFile(filePath, metadata) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.csv') {
      return await this.readCsvRecords(filePath, metadata);
    }
    if (extension === '.xls' || extension === '.xlsx') {
      return await this.readExcelRecords(filePath, metadata);
    }
    return [];
  }

  async loadRecordsForCase(caseId) {
    const caseDir = this.getCaseDirectory(caseId);
    let entries = [];
    try {
      entries = await fs.promises.readdir(caseDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const records = [];
    for (const entry of entries) {
      const extension = path.extname(entry).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        continue;
      }
      const fullPath = path.join(caseDir, entry);
      const { fileId } = this.parseFileIdentifiers(fullPath);
      if (!fileId) {
        continue;
      }
      try {
        const metadata = await this.readMetadata(caseId, fileId, entry);
        const fileRecords = await this.readRecordsFromFile(fullPath, metadata);
        const enrichedRecords = fileRecords.map((record) => ({
          ...record,
          case_id: metadata.caseId,
          case_name: metadata.caseName,
          file_id: metadata.fileId,
          cdr_number: metadata.cdrNumber,
          original_filename: metadata.originalName
        }));
        records.push(...enrichedRecords);
      } catch (error) {
        console.error('Erreur lecture fichier CDR local:', error);
      }
    }

    return records;
  }

  buildSearchResultFromRecords(records, identifier, options = {}, { assumeMatches = true } = {}) {
    if (!Array.isArray(records) || records.length === 0) {
      return {
        total: 0,
        contacts: [],
        topContacts: [],
        locations: [],
        topLocations: [],
        path: []
      };
    }

    const {
      startDate = null,
      endDate = null,
      startTime = null,
      endTime = null,
      direction = 'both',
      type = 'both',
      location = null
    } = options;

    const normalizedIdentifier = String(identifier).trim();
    const normalizedNumber = normalizePhoneNumber(normalizedIdentifier);
    const identifierSet = new Set([normalizedIdentifier]);
    if (normalizedNumber && normalizedNumber !== normalizedIdentifier) {
      identifierSet.add(normalizedNumber);
    }

    const normalizeTimeBound = (value) => {
      if (!value) return null;
      return value.length === 5 ? `${value}:00` : value;
    };

    const startTimeBound = normalizeTimeBound(startTime);
    const endTimeBound = normalizeTimeBound(endTime);

    const matchesIdentifier = (record) => {
      if (assumeMatches) {
        return true;
      }
      const candidates = [
        record.numero_intl_appelant,
        record.numero_intl_appele,
        record.numero_intl_appele_original,
        record.imei_appelant,
        record.imei_appele,
        record.imei_appele_original,
        record.imsi_appelant,
        record.imsi_appele,
        record.cdr_numb
      ];

      for (let index = 0; index < candidates.length; index += 1) {
        const value = candidates[index];
        if (value === null || value === undefined) {
          continue;
        }
        const text = String(value).trim();
        if (!text) {
          continue;
        }
        if (index <= 2 || index === 8) {
          if (identifierSet.has(text)) {
            return true;
          }
        } else if (text === normalizedIdentifier) {
          return true;
        }
      }

      return false;
    };

    const isWithinDateRange = (record) => {
      if (!startDate && !endDate) {
        return true;
      }
      const callDate =
        record.date_debut ||
        (record.call_timestamp ? record.call_timestamp.slice(0, 10) : null);
      if (startDate && (!callDate || callDate < startDate)) {
        return false;
      }
      if (endDate && (!callDate || callDate > endDate)) {
        return false;
      }
      return true;
    };

    const isWithinTimeRange = (record) => {
      if (!startTimeBound && !endTimeBound) {
        return true;
      }
      const timeValue =
        record.heure_debut ||
        (record.call_timestamp ? record.call_timestamp.slice(11, 19) : null);
      if (!timeValue) {
        return false;
      }
      const normalizedTime = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
      if (startTimeBound && normalizedTime < startTimeBound) {
        return false;
      }
      if (endTimeBound && normalizedTime > endTimeBound) {
        return false;
      }
      return true;
    };

    const matchesLocation = (record) => {
      if (!location) {
        return true;
      }
      const locationValue = (record.nom_localisation || '').trim();
      if (!locationValue) {
        console.log(
          '[matchesLocation] Ignoring record without localisation',
          {
            expected: location,
            recordId: record.id || record.identifiant_appel || null
          }
        );
        return false;
      }
      const isMatch = locationValue === location;
      if (!isMatch) {
        console.log('[matchesLocation] Localisation mismatch', {
          expected: location,
          received: locationValue,
          recordId: record.id || record.identifiant_appel || null
        });
      }
      return isMatch;
    };

    const filteredRecords = records.filter(
      (record) =>
        matchesIdentifier(record) &&
        isWithinDateRange(record) &&
        matchesLocation(record) &&
        isWithinTimeRange(record)
    );

    if (filteredRecords.length === 0) {
      return {
        total: 0,
        contacts: [],
        topContacts: [],
        locations: [],
        topLocations: [],
        path: []
      };
    }

    const contactsMap = {};
    const locationsMap = {};
    const path = [];

    const matchesNumber = (value) => {
      if (value === null || value === undefined) {
        return false;
      }
      const text = String(value).trim();
      if (!text) {
        return false;
      }
      return identifierSet.has(text);
    };

    const matchesDeviceIdentifier = (...values) => {
      if (!normalizedIdentifier || normalizedIdentifier === normalizedNumber) {
        return false;
      }
      return values.some((value) => {
        if (value === null || value === undefined) {
          return false;
        }
        const text = String(value).trim();
        if (!text) {
          return false;
        }
        return text === normalizedIdentifier;
      });
    };

    for (const record of filteredRecords) {
      const caller = record.numero_intl_appelant;
      const callee = record.numero_intl_appele;
      const originalCallee = record.numero_intl_appele_original;
      const matchesCaller = matchesNumber(caller);
      const matchesCallee = matchesNumber(callee) || matchesNumber(originalCallee);
      const isWeb = !callee;
      const eventType = this.buildEventType(record);
      const callerDeviceMatch = matchesDeviceIdentifier(
        record.imei_appelant,
        record.imsi_appelant
      );
      const calleeDeviceMatch = matchesDeviceIdentifier(
        record.imei_appele,
        record.imei_appele_original,
        record.imsi_appele
      );

      let directionRecord = 'incoming';
      let otherNumber = null;

      if (matchesCaller || callerDeviceMatch) {
        directionRecord = 'outgoing';
        otherNumber = callee || originalCallee || null;
      } else if (matchesCallee || calleeDeviceMatch) {
        directionRecord = 'incoming';
        otherNumber = caller || null;
      } else if (matchesDeviceIdentifier(record.cdr_numb)) {
        directionRecord = 'incoming';
        otherNumber = caller || callee || null;
      }

      if (direction === 'position') {
        if (!isWeb) {
          continue;
        }
      } else {
        if (direction !== 'both' && !isWeb && directionRecord !== direction) {
          continue;
        }
        if (type !== 'both' && type !== eventType) {
          continue;
        }
      }

      if (!isWeb && otherNumber) {
        if (!contactsMap[otherNumber]) {
          contactsMap[otherNumber] = { number: otherNumber, callCount: 0, smsCount: 0 };
        }
        if (eventType === 'sms') {
          contactsMap[otherNumber].smsCount += 1;
        } else if (eventType === 'call') {
          contactsMap[otherNumber].callCount += 1;
        }
      }

      if (record.latitude && record.longitude) {
        const key = `${record.latitude},${record.longitude}`;
        if (!locationsMap[key]) {
          locationsMap[key] = {
            latitude: record.latitude,
            longitude: record.longitude,
            nom: record.nom_localisation,
            count: 0
          };
        }
        locationsMap[key].count += 1;

        let duration = 'N/A';
        if (record.duree) {
          let totalSeconds = 0;
          if (typeof record.duree === 'string' && record.duree.includes(':')) {
            const parts = record.duree.split(':').map((p) => parseInt(p, 10));
            while (parts.length < 3) parts.unshift(0);
            if (parts.every((n) => !Number.isNaN(n))) {
              totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          } else {
            const parsedDur = parseInt(record.duree, 10);
            if (!Number.isNaN(parsedDur)) totalSeconds = parsedDur;
          }
          if (totalSeconds > 0) {
            duration = totalSeconds >= 60 ? `${Math.round(totalSeconds / 60)} min` : `${totalSeconds} s`;
          }
        }

        const callDate = record.date_debut || (record.call_timestamp ? record.call_timestamp.slice(0, 10) : 'N/A');
        const endDate = record.date_fin || callDate;
        const startTimeValue = record.heure_debut || (record.call_timestamp ? record.call_timestamp.slice(11, 19) : 'N/A');
        const endTimeValue = record.heure_fin || 'N/A';

        const entry = {
          latitude: record.latitude,
          longitude: record.longitude,
          nom: record.nom_localisation,
          type: eventType,
          callDate,
          endDate,
          startTime: startTimeValue,
          endTime: endTimeValue,
          duration,
          imeiCaller: record.imei_appelant,
          imeiCalled: record.imei_appele,
          caller,
          callee
        };

        if (!isWeb && otherNumber) {
          entry.direction = directionRecord;
          entry.number = otherNumber;
        }

        path.push(entry);
      }
    }

    const contacts = Object.values(contactsMap)
      .map((contact) => ({
        number: contact.number,
        callCount: contact.callCount,
        smsCount: contact.smsCount,
        total: contact.callCount + contact.smsCount
      }))
      .sort((a, b) => b.total - a.total);

    const locations = Object.values(locationsMap).sort((a, b) => b.count - a.count);

    return {
      total: filteredRecords.length,
      contacts,
      topContacts: contacts.slice(0, 10),
      locations,
      topLocations: locations.slice(0, 10),
      path
    };
  }

  async markFileIndexed(filePath, inserted, indexed = true) {
    const shouldMark = indexed || inserted > 0;
    if (!shouldMark) {
      return;
    }
    try {
      await fs.promises.writeFile(
        this.getMarkerPath(filePath),
        JSON.stringify({ indexedAt: new Date().toISOString(), inserted, indexed }, null, 2)
      );
    } catch (error) {
      console.error('Erreur écriture marqueur indexation CDR:', error);
    }
  }

  async isFileIndexed(filePath) {
    try {
      await fs.promises.access(this.getMarkerPath(filePath), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async readMetadata(caseId, fileId, fallbackFileName) {
    const metaPath = this.getMetaPath(caseId, fileId);
    try {
      const content = await fs.promises.readFile(metaPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Erreur lecture métadonnées CDR:', error);
      }
      try {
        const caseInfo = await Case.findById(caseId);
        return {
          caseId,
          caseName: caseInfo?.name || `case-${caseId}`,
          fileId,
          cdrNumber: null,
          originalName: fallbackFileName
        };
      } catch (lookupError) {
        console.error('Erreur récupération dossier CDR pour métadonnées:', lookupError);
        return {
          caseId,
          caseName: `case-${caseId}`,
          fileId,
          cdrNumber: null,
          originalName: fallbackFileName
        };
      }
    }
  }

  async writeMetadata(caseId, fileId, metadata) {
    const metaPath = this.getMetaPath(caseId, fileId);
    try {
      await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('Erreur écriture métadonnées fichier CDR:', error);
    }
  }

  async saveAndIndexFile({ caseId, caseName, fileId, cdrNumber, tempPath, originalName }) {
    const extension = path.extname(originalName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new Error('Format de fichier CDR non supporté');
    }

    await this.ensureBaseDirectory();
    const caseDir = this.getCaseDirectory(caseId);
    await ensureDirectory(caseDir);

    const storedName = `file-${fileId}-${Date.now()}${extension}`;
    const destinationPath = path.join(caseDir, storedName);
    const resolvedDestination = path.resolve(destinationPath);

    const metadata = {
      caseId,
      caseName,
      fileId,
      cdrNumber,
      originalName
    };

    await this.writeMetadata(caseId, fileId, metadata);
    this.manualProcessing.add(resolvedDestination);

    try {
      await moveFile(tempPath, destinationPath);
      const result =
        extension === '.xlsx' || extension === '.xls'
          ? await this.parseExcel(destinationPath, metadata)
          : await this.parseCsv(destinationPath, metadata);
      await this.markFileIndexed(destinationPath, result.inserted, result.indexed);
      return { inserted: result.inserted, storedName };
    } catch (error) {
      console.error('Erreur traitement fichier CDR:', error);
      try {
        await fs.promises.unlink(destinationPath);
      } catch {}
      throw error;
    } finally {
      this.manualProcessing.delete(resolvedDestination);
      try {
        await fs.promises.unlink(tempPath);
      } catch {}
    }
  }

  async handleFileAdded(filePath) {
    const resolved = path.resolve(filePath);
    if (this.manualProcessing.has(resolved)) {
      return;
    }
    if (await this.isFileIndexed(filePath)) {
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return;
    }

    const { caseId, fileId } = this.parseFileIdentifiers(filePath);
    if (!caseId || !fileId) {
      return;
    }

    const meta = await this.readMetadata(caseId, fileId, path.basename(filePath));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.size === 0) {
          await sleep(500);
          continue;
        }
        break;
      } catch {
        await sleep(500);
      }
    }

    try {
      const result =
        extension === '.xlsx' || extension === '.xls'
          ? await this.parseExcel(filePath, meta)
          : await this.parseCsv(filePath, meta);
      await this.markFileIndexed(filePath, result.inserted, result.indexed);
    } catch (error) {
      console.error('Erreur indexation automatique fichier CDR:', error);
    }
  }

  initializeWatcher() {
    const watcher = chokidar.watch(path.join(this.baseDir, '**/*'), {
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 200
      }
    });

    watcher.on('add', (filePath) => {
      if (filePath.endsWith('.indexed') || filePath.endsWith('.meta.json')) {
        return;
      }
      this.handleFileAdded(filePath);
    });

    watcher.on('error', (error) => {
      console.error('Erreur watcher fichiers CDR:', error);
    });
  }

  buildEventType(record) {
    const typeStr = (record.type_cdr || '').toLowerCase();
    if (!record.numero_intl_appele && !record.numero_intl_appelant) {
      return 'web';
    }
    if (typeStr.includes('sms')) {
      return 'sms';
    }
    if (typeStr.includes('data')) {
      return 'web';
    }
    return 'call';
  }

  async search(identifier, options = {}) {
    const {
      startDate = null,
      endDate = null,
      startTime = null,
      endTime = null,
      location = null,
      caseId,
      direction = 'both',
      type = 'both'
    } = options;

    if (!caseId) {
      throw new Error('caseId requis pour la recherche CDR');
    }

    const normalizedIdentifier = String(identifier).trim();
    if (!normalizedIdentifier) {
      return {
        total: 0,
        contacts: [],
        topContacts: [],
        locations: [],
        topLocations: [],
        path: []
      };
    }

    const baseOptions = {
      startDate,
      endDate,
      startTime,
      endTime,
      location,
      direction,
      type
    };

    const performLocalSearch = async (assumeMatches) => {
      const records = await this.loadRecordsForCase(caseId);
      return this.buildSearchResultFromRecords(records, normalizedIdentifier, baseOptions, {
        assumeMatches
      });
    };

    if (!this.elasticEnabled) {
      return performLocalSearch(false);
    }

    await this.ensureIndex();

    if (!this.elasticEnabled) {
      return performLocalSearch(false);
    }

    const must = [
      { term: { case_id: caseId } },
      {
        bool: {
          should: [
            { term: { numero_intl_appelant: normalizedIdentifier } },
            { term: { numero_intl_appele: normalizedIdentifier } },
            { term: { numero_intl_appele_original: normalizedIdentifier } },
            { term: { imei_appelant: normalizedIdentifier } },
            { term: { imei_appele: normalizedIdentifier } },
            { term: { imei_appele_original: normalizedIdentifier } },
            { term: { imsi_appelant: normalizedIdentifier } },
            { term: { imsi_appele: normalizedIdentifier } },
            { term: { cdr_numb: normalizedIdentifier } }
          ],
          minimum_should_match: 1
        }
      }
    ];

    const filter = [];
    if (startDate || endDate) {
      const range = {};
      if (startDate) {
        range.gte = `${startDate}T00:00:00.000Z`;
      }
      if (endDate) {
        range.lte = `${endDate}T23:59:59.999Z`;
      }
      filter.push({ range: { call_timestamp: range } });
    }
    if (location) {
      filter.push({ term: { nom_localisation: location } });
    }

    let response;
    try {
      response = await client.search({
        index: this.indexName,
        size: 10000,
        track_total_hits: true,
        sort: [
          { call_timestamp: { order: 'asc', unmapped_type: 'date' } },
          { line_number: { order: 'asc' } }
        ],
        query: {
          bool: {
            must,
            filter
          }
        }
      });
    } catch (error) {
      if (isConnectionError(error)) {
        console.error('Erreur recherche Elasticsearch CDR:', error.message);
        this.elasticEnabled = false;
        return performLocalSearch(false);
      }
      throw error;
    }

    const hits = response.hits?.hits || [];
    const records = hits.map((hit) => hit._source || {});

    return this.buildSearchResultFromRecords(records, normalizedIdentifier, baseOptions, {
      assumeMatches: true
    });
  }

  async findCommonContacts(numbers, caseId, options = {}) {
    const isAllowed = (n) => ALLOWED_PREFIXES.some((p) => String(n).startsWith(p));
    const filteredNumbers = Array.isArray(numbers) ? numbers.filter(isAllowed) : [];
    if (filteredNumbers.length === 0) {
      return { nodes: [], links: [] };
    }

    const filteredSet = new Set(filteredNumbers);
    const { startDate = null, endDate = null, startTime = null, endTime = null } = options;

    const normalizeTimeBound = (value) => {
      if (!value) return null;
      return value.length === 5 ? `${value}:00` : value;
    };

    const startTimeBound = normalizeTimeBound(startTime);
    const endTimeBound = normalizeTimeBound(endTime);

    const loadRecords = async () => {
      if (!this.elasticEnabled) {
        return await this.loadRecordsForCase(caseId);
      }

      await this.ensureIndex();

      if (!this.elasticEnabled) {
        return await this.loadRecordsForCase(caseId);
      }

      const filter = [
        { term: { case_id: caseId } },
        {
          bool: {
            should: [
              { terms: { numero_intl_appelant: filteredNumbers } },
              { terms: { numero_intl_appele: filteredNumbers } }
            ],
            minimum_should_match: 1
          }
        }
      ];

      if (startDate || endDate) {
        const range = {};
        if (startDate) range.gte = `${startDate}T00:00:00.000Z`;
        if (endDate) range.lte = `${endDate}T23:59:59.999Z`;
        filter.push({ range: { call_timestamp: range } });
      }

      try {
        const response = await client.search({
          index: this.indexName,
          size: 10000,
          track_total_hits: true,
          query: { bool: { must: filter } }
        });

        const hits = response.hits?.hits || [];
        return hits.map((hit) => hit._source || {});
      } catch (error) {
        if (isConnectionError(error)) {
          console.error('Erreur recherche contacts communs Elasticsearch:', error.message);
          this.elasticEnabled = false;
          return await this.loadRecordsForCase(caseId);
        }
        throw error;
      }
    };

    const records = await loadRecords();

    const withinDateRange = (record) => {
      if (!startDate && !endDate) {
        return true;
      }
      const timestamp =
        record.call_timestamp || this.buildCallTimestamp(record.date_debut, record.heure_debut);
      if (!timestamp) {
        return false;
      }
      const datePart = timestamp.slice(0, 10);
      if (startDate && datePart < startDate) {
        return false;
      }
      if (endDate && datePart > endDate) {
        return false;
      }
      return true;
    };

    const withinTimeRange = (record) => {
      if (!startTimeBound && !endTimeBound) return true;
      const timeValue =
        record.heure_debut || (record.call_timestamp ? record.call_timestamp.slice(11, 19) : null);
      if (!timeValue) return false;
      const normalized = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
      if (startTimeBound && normalized < startTimeBound) {
        return false;
      }
      if (endTimeBound && normalized > endTimeBound) {
        return false;
      }
      return true;
    };

    const contactSources = {};
    const edgeMap = {};

    for (const r of records) {
      if (!withinDateRange(r) || !withinTimeRange(r)) {
        continue;
      }

      const caller = r.numero_intl_appelant;
      const callee = r.numero_intl_appele;
      let source = null;
      let contact = null;

      if (filteredSet.has(caller)) {
        source = caller;
        contact = callee;
      } else if (filteredSet.has(callee)) {
        source = callee;
        contact = caller;
      }

      if (!source || !contact || !isAllowed(contact)) continue;

      if (!contactSources[contact]) {
        contactSources[contact] = new Set();
      }
      contactSources[contact].add(source);

      const key = `${source}-${contact}`;
      if (!edgeMap[key]) {
        edgeMap[key] = { source, target: contact, callCount: 0, smsCount: 0 };
      }
      const eventType = this.buildEventType(r);
      if (eventType === 'sms') {
        edgeMap[key].smsCount += 1;
      } else {
        edgeMap[key].callCount += 1;
      }
    }

    const nodes = filteredNumbers.map((n) => ({ id: n, type: 'source' }));
    const links = [];

    for (const contact in contactSources) {
      const sourcesSet = contactSources[contact];
      if (sourcesSet.size >= 2) {
        nodes.push({ id: contact, type: 'contact' });
        for (const source of sourcesSet) {
          const edgeKey = `${source}-${contact}`;
          if (edgeMap[edgeKey]) {
            links.push(edgeMap[edgeKey]);
          }
        }
      }
    }

    return { nodes, links };
  }

  async detectNumberChanges(caseId, { startDate = null, endDate = null, referenceNumbers = [] } = {}) {
    const normalizedReferenceNumbers = Array.isArray(referenceNumbers)
      ? referenceNumbers.map((value) => normalizePhoneNumber(value)).filter((value) => Boolean(value))
      : [];

    const referenceSet = new Set(normalizedReferenceNumbers);
    if (referenceSet.size === 0) {
      return [];
    }

    const dateMatches = (record) => {
      if (!startDate && !endDate) {
        return true;
      }
      const timestamp =
        record.call_timestamp || this.buildCallTimestamp(record.date_debut, record.heure_debut);
      if (!timestamp) {
        return false;
      }
      const datePart = timestamp.slice(0, 10);
      if (startDate && datePart < startDate) {
        return false;
      }
      if (endDate && datePart > endDate) {
        return false;
      }
      return true;
    };

    const fetchRecords = async () => {
      if (!this.elasticEnabled) {
        const localRecords = await this.loadRecordsForCase(caseId);
        return localRecords.filter((record) => dateMatches(record));
      }

      await this.ensureIndex();
      if (!this.elasticEnabled) {
        const localRecords = await this.loadRecordsForCase(caseId);
        return localRecords.filter((record) => dateMatches(record));
      }
      const filter = [{ term: { case_id: caseId } }];
      if (startDate || endDate) {
        const range = {};
        if (startDate) range.gte = `${startDate}T00:00:00.000Z`;
        if (endDate) range.lte = `${endDate}T23:59:59.999Z`;
        filter.push({ range: { call_timestamp: range } });
      }

      try {
        const collected = [];
        const scrollIterator = client.helpers.scrollSearch({
          index: this.indexName,
          size: 5000,
          track_total_hits: true,
          body: {
            query: { bool: { must: filter } }
          }
        });

        for await (const result of scrollIterator) {
          const rows =
            result.documents ||
            (result.hits?.hits || []).map((hit) => hit._source || {});
          for (const row of rows) {
            if (dateMatches(row)) {
              collected.push(row);
            }
          }
        }
        return collected;
      } catch (error) {
        if (isConnectionError(error)) {
          console.error('Erreur scroll Elasticsearch lors de la détection de changements:', error.message);
          this.elasticEnabled = false;
          const localRecords = await this.loadRecordsForCase(caseId);
          return localRecords.filter((record) => dateMatches(record));
        }
        throw error;
      }
    };

    const records = await fetchRecords();

    const imeiMap = new Map();
    for (const row of records) {
      const imeiValues = [row.imei_appelant, row.imei_appele, row.imei_appele_original];
      const numberValues = [
        row.numero_intl_appelant,
        row.numero_intl_appele,
        row.numero_intl_appele_original
      ];

      const callDate = normalizeDateValue(row.date_debut || row.call_timestamp?.slice(0, 10));

      imeiValues.forEach((imei, index) => {
        const normalizedImei = imei ? String(imei).trim() : '';
        const normalizedNumber = normalizePhoneNumber(numberValues[index]);
        if (!normalizedImei || !normalizedNumber) {
          return;
        }

        const imeiEntry =
          imeiMap.get(normalizedImei) || { numbers: new Map(), hasReferenceNumber: false };
        const numbersMap = imeiEntry.numbers;
        const numberEntry = numbersMap.get(normalizedNumber) || {
          number: normalizedNumber,
          firstSeen: null,
          lastSeen: null,
          occurrences: 0,
          roles: new Set(),
          fileIds: new Set()
        };

        numberEntry.occurrences += 1;
        if (callDate) {
          if (!numberEntry.firstSeen || callDate < numberEntry.firstSeen) {
            numberEntry.firstSeen = callDate;
          }
          if (!numberEntry.lastSeen || callDate > numberEntry.lastSeen) {
            numberEntry.lastSeen = callDate;
          }
        }

        if (index === 0) {
          numberEntry.roles.add('caller');
        } else if (index === 1) {
          numberEntry.roles.add('callee');
        } else {
          numberEntry.roles.add('target');
        }

        if (row.file_id) {
          numberEntry.fileIds.add(Number(row.file_id));
        }

        if (referenceSet.has(normalizedNumber)) {
          imeiEntry.hasReferenceNumber = true;
        }

        numbersMap.set(normalizedNumber, numberEntry);
        imeiMap.set(normalizedImei, imeiEntry);
      });
    }

    const result = [];
    for (const [imei, entry] of imeiMap.entries()) {
      if (!entry.hasReferenceNumber) {
        continue;
      }

      const numbers = Array.from(entry.numbers.values()).map((number) => ({
        number: number.number,
        firstSeen: number.firstSeen,
        lastSeen: number.lastSeen,
        occurrences: number.occurrences,
        roles: Array.from(number.roles).sort(),
        fileIds: Array.from(number.fileIds)
      }));

      if (numbers.length < 2) {
        continue;
      }

      numbers.sort((a, b) => {
        if (a.lastSeen && b.lastSeen && a.lastSeen !== b.lastSeen) {
          return a.lastSeen > b.lastSeen ? -1 : 1;
        }
        return b.occurrences - a.occurrences;
      });

      result.push({ imei, numbers });
    }

    result.sort((a, b) => a.imei.localeCompare(b.imei));
    return result;
  }

  async listLocations(caseId) {
    if (!this.elasticEnabled) {
      return [];
    }
    await this.ensureIndex();
    if (!this.elasticEnabled) {
      return [];
    }

    let response;
    try {
      response = await client.search({
        index: this.indexName,
        size: 0,
        query: {
          term: { case_id: caseId }
        },
        aggs: {
          locations: {
            terms: {
              field: 'nom_localisation',
              size: 1000
            }
          }
        }
      });
    } catch (error) {
      if (isConnectionError(error)) {
        console.error('Erreur agrégation localisations Elasticsearch:', error.message);
        this.elasticEnabled = false;
        return [];
      }
      throw error;
    }

    const buckets = response.aggregations?.locations?.buckets || [];
    return buckets.map((bucket) => bucket.key).filter((value) => value);
  }

  async getImeiNumberPairs(caseId, { startDate = null, endDate = null } = {}) {
    if (!this.elasticEnabled) {
      return [];
    }
    await this.ensureIndex();

    if (!this.elasticEnabled) {
      return [];
    }

    const must = [{ term: { case_id: caseId } }];
    if (startDate || endDate) {
      const range = {};
      if (startDate) range.gte = `${startDate}T00:00:00.000Z`;
      if (endDate) range.lte = `${endDate}T23:59:59.999Z`;
      must.push({ range: { call_timestamp: range } });
    }

    let response;
    try {
      response = await client.search({
        index: this.indexName,
        size: 10000,
        track_total_hits: true,
        query: {
          bool: { must }
        }
      });
    } catch (error) {
      if (isConnectionError(error)) {
        console.error('Erreur récupération paires IMEI/numéros Elasticsearch:', error.message);
        this.elasticEnabled = false;
        return [];
      }
      throw error;
    }

    const hits = response.hits?.hits || [];
    const rows = [];

    for (const hit of hits) {
      const record = hit._source || {};
      const callDate = normalizeDateValue(record.date_debut || record.call_timestamp?.slice(0, 10));
      const fileId = record.file_id || null;

      const pushEntry = (imei, numero, role) => {
        const normalizedImei = imei ? String(imei).trim() : '';
        const normalizedNumber = normalizePhoneNumber(numero);
        if (!normalizedImei || !normalizedNumber) {
          return;
        }
        rows.push({
          imei: normalizedImei,
          numero: normalizedNumber,
          call_date: callDate,
          file_id: fileId,
          role
        });
      };

      pushEntry(record.imei_appelant, record.numero_intl_appelant, 'caller');
      pushEntry(record.imei_appele, record.numero_intl_appele, 'callee');
      pushEntry(record.imei_appele_original, record.numero_intl_appele_original, 'target');
    }

    return rows;
  }

  async deleteByFile(fileId, caseId) {
    if (this.elasticEnabled) {
      await this.ensureIndex();
      if (this.elasticEnabled) {
        try {
          await client.deleteByQuery({
            index: this.indexName,
            query: {
              bool: {
                must: [{ term: { case_id: caseId } }, { term: { file_id: fileId } }]
              }
            }
          });
        } catch (error) {
          if (isConnectionError(error)) {
            console.error('Erreur suppression index Elasticsearch pour fichier CDR:', error.message);
            this.elasticEnabled = false;
          } else {
            console.error('Erreur suppression index Elasticsearch pour fichier CDR:', error);
          }
        }
      }
    }

    const caseDir = this.getCaseDirectory(caseId);
    try {
      const entries = await fs.promises.readdir(caseDir);
      for (const entry of entries) {
        if (entry.startsWith(`file-${fileId}-`)) {
          const fullPath = path.join(caseDir, entry);
          const markerPath = this.getMarkerPath(fullPath);
          await fs.promises.unlink(fullPath);
          try {
            await fs.promises.unlink(markerPath);
          } catch {}
        }
      }
      const metaPath = this.getMetaPath(caseId, fileId);
      try {
        await fs.promises.unlink(metaPath);
      } catch {}
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Erreur suppression fichiers locaux CDR:', error);
      }
    }
  }

  async deleteCaseData(caseId) {
    if (this.elasticEnabled) {
      await this.ensureIndex();
      if (this.elasticEnabled) {
        try {
          await client.deleteByQuery({
            index: this.indexName,
            query: {
              term: { case_id: caseId }
            }
          });
        } catch (error) {
          if (isConnectionError(error)) {
            console.error('Erreur suppression index Elasticsearch dossier CDR:', error.message);
            this.elasticEnabled = false;
          } else {
            console.error('Erreur suppression index Elasticsearch dossier CDR:', error);
          }
        }
      }
    }

    const caseDir = this.getCaseDirectory(caseId);
    try {
      await fs.promises.rm(caseDir, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Erreur suppression répertoire CDR:', error);
      }
    }
  }

  async clearTable(caseId) {
    await this.deleteCaseData(caseId);
  }
}

export default CdrService;
