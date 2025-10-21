import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import BtsLookupService, { normalizeCgi } from './BtsLookupService.js';

const ADDITIONAL_HEADERS = ['LONGITUDE', 'LATITUDE', 'AZIMUT', 'NOM_BTS'];
const DEFAULT_DELIMITER = ';';

const escapeCsvValue = (value, delimiter) => {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = typeof value === 'string' ? value : String(value);
  const needsEscaping =
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r') ||
    stringValue.includes(delimiter);

  let escaped = stringValue.replace(/"/g, '""');

  if (needsEscaping || /^\s|\s$/.test(stringValue)) {
    escaped = `"${escaped}"`;
  }

  return escaped;
};

const detectFormat = async (filePath) =>
  new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 4096 });
    let sample = '';
    let settled = false;

    const finalize = () => {
      if (settled) {
        return;
      }
      settled = true;
      const lineEnding = sample.includes('\r\n') ? '\r\n' : '\n';
      const headerLine = sample.split(/\r?\n/)[0] || '';
      const semicolons = (headerLine.match(/;/g) || []).length;
      const commas = (headerLine.match(/,/g) || []).length;
      let delimiter = DEFAULT_DELIMITER;
      if (semicolons === 0 && commas > 0) {
        delimiter = ',';
      } else if (semicolons > commas) {
        delimiter = ';';
      } else if (commas > semicolons) {
        delimiter = ',';
      }
      resolve({ delimiter, lineEnding });
    };

    stream.on('data', (chunk) => {
      sample += chunk;
      if (sample.includes('\n')) {
        stream.destroy();
      }
    });

    stream.on('close', finalize);
    stream.on('end', finalize);
    stream.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });

const readCsv = async (filePath, delimiter) =>
  new Promise((resolve, reject) => {
    const records = [];
    let headers = [];
    let hasBom = false;

    fs.createReadStream(filePath)
      .pipe(
        csv({
          separator: delimiter,
          mapHeaders: ({ header, index }) => {
            if (index === 0 && header && header.charCodeAt(0) === 0xfeff) {
              hasBom = true;
              return header.slice(1);
            }
            return header;
          }
        })
      )
      .on('headers', (headerList) => {
        headers = headerList.map((header, index) => {
          if (index === 0 && header && header.charCodeAt(0) === 0xfeff) {
            hasBom = true;
            return header.slice(1);
          }
          return header;
        });
      })
      .on('data', (row) => {
        records.push(row);
      })
      .on('end', () => resolve({ headers, records, hasBom }))
      .on('error', (error) => reject(error));
  });

const ensureDirectory = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

class BtsCdrEnrichmentService {
  constructor(options = {}) {
    const baseDir = options.baseDir || path.join(process.cwd(), 'bts');
    this.baseDir = path.resolve(baseDir);
    this.lookupService = new BtsLookupService();
    this.ensureDirPromise = ensureDirectory(this.baseDir);
  }

  async ensureBaseDirectory() {
    return this.ensureDirPromise;
  }

  getBaseDirectory() {
    return this.baseDir;
  }

  resolvePath(filePath) {
    if (!filePath) {
      throw new Error('Chemin de fichier requis pour l\'enrichissement CDR');
    }

    const normalizedInput = path.normalize(filePath);
    let absolute;

    if (path.isAbsolute(normalizedInput)) {
      absolute = normalizedInput;
    } else {
      const candidate = path.resolve(process.cwd(), normalizedInput);
      if (candidate.startsWith(this.baseDir)) {
        absolute = candidate;
      } else {
        absolute = path.join(this.baseDir, normalizedInput);
      }
    }

    const resolved = path.resolve(absolute);

    if (!resolved.startsWith(this.baseDir)) {
      throw new Error('Le fichier CDR doit être situé dans le dossier bts/');
    }

    return resolved;
  }

  async enrichFile(filePath) {
    await this.ensureBaseDirectory();
    const resolvedPath = this.resolvePath(filePath);

    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isFile()) {
      throw new Error('Le chemin fourni ne correspond pas à un fichier CSV');
    }

    const { delimiter, lineEnding } = await detectFormat(resolvedPath);
    const { headers, records, hasBom } = await readCsv(resolvedPath, delimiter);

    if (!headers.includes('CGI')) {
      throw new Error('La colonne CGI est requise pour enrichir les CDR');
    }

    const outputHeaders = [...headers];
    for (const header of ADDITIONAL_HEADERS) {
      if (!outputHeaders.includes(header)) {
        outputHeaders.push(header);
      }
    }

    const uniqueCgis = new Set();
    for (const record of records) {
      const cgiValue = record.CGI ?? record.cgi;
      const normalized = normalizeCgi(cgiValue);
      if (normalized) {
        uniqueCgis.add(normalized);
      }
    }

    const lookupResults = await this.lookupService.lookupMultiple(uniqueCgis);

    let updatedCells = 0;
    let enrichedRows = 0;

    for (const record of records) {
      const normalized = normalizeCgi(record.CGI ?? record.cgi);
      const info = normalized ? lookupResults.get(normalized) || null : null;
      let rowHasData = false;

      for (const header of ADDITIONAL_HEADERS) {
        const currentValue =
          record[header] === null || record[header] === undefined
            ? ''
            : String(record[header]);

        if (!info) {
          if (currentValue) {
            rowHasData = true;
          }

          record[header] = currentValue;
          continue;
        }

        const rawValue = info[header];
        const nextValue =
          rawValue === null || rawValue === undefined ? '' : String(rawValue);

        if (currentValue !== nextValue) {
          updatedCells += 1;
        }

        if (nextValue) {
          rowHasData = true;
        }

        record[header] = nextValue;
      }

      if (rowHasData) {
        enrichedRows += 1;
      }
    }

    await this.writeCsv(resolvedPath, outputHeaders, records, {
      delimiter,
      lineEnding,
      hasBom
    });

    return {
      filePath: resolvedPath,
      rows: records.length,
      enrichedRows,
      updatedValues: updatedCells
    };
  }

  async writeCsv(filePath, headers, records, options) {
    const { delimiter, lineEnding, hasBom } = options;
    const directory = path.dirname(filePath);
    await ensureDirectory(directory);

    const tempPath = `${filePath}.tmp`;
    const stream = fs.createWriteStream(tempPath, { encoding: 'utf8' });

    await new Promise((resolve, reject) => {
      stream.on('error', (error) => reject(error));
      stream.on('finish', resolve);

      if (hasBom) {
        stream.write('\ufeff');
      }

      const headerLine = headers.map((header) => escapeCsvValue(header, delimiter)).join(delimiter);
      stream.write(headerLine + lineEnding);

      for (const record of records) {
        const values = headers.map((header) => record[header] ?? '');
        const line = values.map((value) => escapeCsvValue(value, delimiter)).join(delimiter);
        stream.write(line + lineEnding);
      }

      stream.end();
    });

    await fs.promises.rename(tempPath, filePath);
  }
}

export default BtsCdrEnrichmentService;
