import fs from 'fs';
import path from 'path';
import Case from '../models/Case.js';
import CdrService from './CdrService.js';

class CaseService {
  constructor() {
    this.cdrService = new CdrService();
  }

  async createCase(name) {
    return await Case.create(name);
  }

  async importFile(caseId, filePath, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      return await this.cdrService.importExcel(filePath, caseId);
    }
    // default to CSV
    return await this.cdrService.importCsv(filePath, caseId);
  }

  async search(caseId, identifier, options = {}) {
    return await this.cdrService.search(identifier, { ...options, caseId });
  }
}

export default CaseService;
