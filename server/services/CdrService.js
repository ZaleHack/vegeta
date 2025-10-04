import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { parse as parseDate, format as formatDate } from 'date-fns';
import chokidar from 'chokidar';
import client from '../config/elasticsearch.js';
import Case from '../models/Case.js';

const ELASTICSEARCH_ENABLED = process.env.USE_ELASTICSEARCH === 'true';

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

class CdrService {
  constructor() {
    if (CdrService.instance) {
      return CdrService.instance;
    }

    this.indexName = CDR_INDEX;
    this.elasticEnabled = ELASTICSEARCH_ENABLED;
    this.baseDir = path.join(__dirname, '../../uploads/cdr');
    this.manualProcessing = new Set();

    this.ensureBaseDirectory();

    if (this.elasticEnabled && !CdrService.watcherInitialized) {
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

    const response = await client.bulk({
      operations,
      refresh: 'wait_for'
    });

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

  async parseCsv(filePath, metadata) {
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
        .on('end', async () => {
          try {
            const { inserted, indexed } = await this.indexRecords(metadata, records);
            resolve({ inserted, indexed, records });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => reject(error));
    });
  }

  async parseExcel(filePath, metadata) {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    let lineNumber = 0;
    const records = rows.map((row) => {
      lineNumber += 1;
      return this.transformRow(row, metadata.cdrNumber, lineNumber);
    });
    const { inserted, indexed } = await this.indexRecords(metadata, records);
    return { inserted, indexed, records };
  }

  async markFileIndexed(filePath, inserted, indexed = true) {
    if (!indexed) {
      return;
    }
    try {
      await fs.promises.writeFile(
        this.getMarkerPath(filePath),
        JSON.stringify({ indexedAt: new Date().toISOString(), inserted }, null, 2)
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
    if (!this.elasticEnabled) {
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
      location = null,
      caseId,
      direction = 'both',
      type = 'both'
    } = options;

    if (!caseId) {
      throw new Error('caseId requis pour la recherche CDR');
    }

    const normalizedIdentifier = String(identifier).trim();
    await this.ensureIndex();

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

    const response = await client.search({
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

    const hits = response.hits?.hits || [];
    const records = hits.map((hit) => hit._source || {});

    const withinTimeRange = (record) => {
      if (!startTime && !endTime) return true;
      const time = record.heure_debut || record.call_timestamp?.slice(11, 19) || null;
      if (!time) return false;
      if (startTime && time < (startTime.length === 5 ? `${startTime}:00` : startTime)) {
        return false;
      }
      if (endTime && time > (endTime.length === 5 ? `${endTime}:00` : endTime)) {
        return false;
      }
      return true;
    };

    const contactsMap = {};
    const locationsMap = {};
    const path = [];

    for (const r of records) {
      if (!withinTimeRange(r)) {
        continue;
      }

      const caller = r.numero_intl_appelant;
      const callee = r.numero_intl_appele;
      const isWeb = !callee;
      const other = caller === normalizedIdentifier ? callee : caller;
      const directionRecord = caller === normalizedIdentifier ? 'outgoing' : 'incoming';
      const eventType = this.buildEventType(r);

      if (direction === 'position') {
        if (!isWeb) continue;
      } else {
        if (direction !== 'both' && !isWeb && directionRecord !== direction) {
          continue;
        }
        if (type !== 'both' && type !== eventType) {
          continue;
        }
      }

      if (!isWeb && other) {
        if (!contactsMap[other]) {
          contactsMap[other] = { number: other, callCount: 0, smsCount: 0 };
        }
        if (eventType === 'sms') {
          contactsMap[other].smsCount += 1;
        } else if (eventType === 'call') {
          contactsMap[other].callCount += 1;
        }
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
        locationsMap[key].count += 1;

        let duration = 'N/A';
        if (r.duree) {
          let totalSeconds = 0;
          if (typeof r.duree === 'string' && r.duree.includes(':')) {
            const parts = r.duree.split(':').map((p) => parseInt(p, 10));
            while (parts.length < 3) parts.unshift(0);
            if (parts.every((n) => !Number.isNaN(n))) {
              totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          } else {
            const parsedDur = parseInt(r.duree, 10);
            if (!Number.isNaN(parsedDur)) totalSeconds = parsedDur;
          }
          if (totalSeconds > 0) {
            duration = totalSeconds >= 60 ? `${Math.round(totalSeconds / 60)} min` : `${totalSeconds} s`;
          }
        }

        const callDate = r.date_debut || r.call_timestamp?.slice(0, 10) || 'N/A';
        const endDate = r.date_fin || callDate;
        const startTimeValue = r.heure_debut || r.call_timestamp?.slice(11, 19) || 'N/A';
        const endTimeValue = r.heure_fin || 'N/A';

        const entry = {
          latitude: r.latitude,
          longitude: r.longitude,
          nom: r.nom_localisation,
          type: eventType,
          callDate,
          endDate,
          startTime: startTimeValue,
          endTime: endTimeValue,
          duration,
          imeiCaller: r.imei_appelant,
          imeiCalled: r.imei_appele,
          caller,
          callee
        };

        if (!isWeb) {
          entry.direction = directionRecord;
          entry.number = other;
        }

        path.push(entry);
      }
    }

    const contacts = Object.values(contactsMap)
      .map((c) => ({
        number: c.number,
        callCount: c.callCount,
        smsCount: c.smsCount,
        total: c.callCount + c.smsCount
      }))
      .sort((a, b) => b.total - a.total);

    const locations = Object.values(locationsMap).sort((a, b) => b.count - a.count);

    return {
      total: records.length,
      contacts,
      topContacts: contacts.slice(0, 10),
      locations,
      topLocations: locations.slice(0, 10),
      path
    };
  }

  async findCommonContacts(numbers, caseId, options = {}) {
    if (!this.elasticEnabled) {
      return { nodes: [], links: [] };
    }
    const isAllowed = (n) => ALLOWED_PREFIXES.some((p) => String(n).startsWith(p));
    const filteredNumbers = Array.isArray(numbers) ? numbers.filter(isAllowed) : [];
    if (filteredNumbers.length === 0) {
      return { nodes: [], links: [] };
    }

    await this.ensureIndex();

    const { startDate = null, endDate = null, startTime = null, endTime = null } = options;

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

    const response = await client.search({
      index: this.indexName,
      size: 10000,
      track_total_hits: true,
      query: { bool: { must: filter } }
    });

    const hits = response.hits?.hits || [];
    const records = hits.map((hit) => hit._source || {});

    const withinTimeRange = (record) => {
      if (!startTime && !endTime) return true;
      const time = record.heure_debut || record.call_timestamp?.slice(11, 19) || null;
      if (!time) return false;
      if (startTime && time < (startTime.length === 5 ? `${startTime}:00` : startTime)) {
        return false;
      }
      if (endTime && time > (endTime.length === 5 ? `${endTime}:00` : endTime)) {
        return false;
      }
      return true;
    };

    const contactSources = {};
    const edgeMap = {};

    for (const r of records) {
      if (!withinTimeRange(r)) {
        continue;
      }

      const caller = r.numero_intl_appelant;
      const callee = r.numero_intl_appele;
      let source = null;
      let contact = null;

      if (filteredNumbers.includes(caller)) {
        source = caller;
        contact = callee;
      } else if (filteredNumbers.includes(callee)) {
        source = callee;
        contact = caller;
      }

      if (!contact || !isAllowed(contact)) continue;

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
    if (!this.elasticEnabled) {
      return [];
    }
    await this.ensureIndex();

    const normalizedReferenceNumbers = Array.isArray(referenceNumbers)
      ? referenceNumbers.map((value) => normalizePhoneNumber(value)).filter((value) => Boolean(value))
      : [];

    const referenceSet = new Set(normalizedReferenceNumbers);
    if (referenceSet.size === 0) {
      return [];
    }

    const filter = [{ term: { case_id: caseId } }];
    if (startDate || endDate) {
      const range = {};
      if (startDate) range.gte = `${startDate}T00:00:00.000Z`;
      if (endDate) range.lte = `${endDate}T23:59:59.999Z`;
      filter.push({ range: { call_timestamp: range } });
    }

    const imeiMap = new Map();
    const scrollIterator = client.helpers.scrollSearch({
      index: this.indexName,
      size: 5000,
      track_total_hits: true,
      body: {
        query: { bool: { must: filter } }
      }
    });

    for await (const result of scrollIterator) {
      const records =
        result.documents ||
        (result.hits?.hits || []).map((hit) => hit._source || {});

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
    const response = await client.search({
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

    const buckets = response.aggregations?.locations?.buckets || [];
    return buckets.map((bucket) => bucket.key).filter((value) => value);
  }

  async getImeiNumberPairs(caseId, { startDate = null, endDate = null } = {}) {
    if (!this.elasticEnabled) {
      return [];
    }
    await this.ensureIndex();

    const must = [{ term: { case_id: caseId } }];
    if (startDate || endDate) {
      const range = {};
      if (startDate) range.gte = `${startDate}T00:00:00.000Z`;
      if (endDate) range.lte = `${endDate}T23:59:59.999Z`;
      must.push({ range: { call_timestamp: range } });
    }

    const response = await client.search({
      index: this.indexName,
      size: 10000,
      track_total_hits: true,
      query: {
        bool: { must }
      }
    });

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
        console.error('Erreur suppression index Elasticsearch pour fichier CDR:', error);
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
      try {
        await client.deleteByQuery({
          index: this.indexName,
          query: {
            term: { case_id: caseId }
          }
        });
      } catch (error) {
        console.error('Erreur suppression index Elasticsearch dossier CDR:', error);
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
