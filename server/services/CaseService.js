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

  async getCaseById(id) {
    return await Case.findById(id);
  }

  async listCases() {
    return await Case.findAll();
  }

  async importFile(caseId, filePath, originalName) {
    const existingCase = await Case.findById(caseId);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    const ext = path.extname(originalName).toLowerCase();
    let result;
    if (ext === '.xlsx' || ext === '.xls') {
      result = await this.cdrService.importExcel(filePath, existingCase.name);
    } else {
      result = await this.cdrService.importCsv(filePath, existingCase.name);
    }
    await Case.addFile(caseId, originalName);
    return result;
  }

  async search(caseId, identifier, options = {}) {
    const existingCase = await Case.findById(caseId);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    return await this.cdrService.search(identifier, { ...options, caseName: existingCase.name });
  }

  async deleteCase(id) {
    await Case.delete(id);
  }

  async listFiles(caseId) {
    return await Case.listFiles(caseId);
  }

  async deleteFile(caseId, fileId) {
    const existingCase = await Case.findById(caseId);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    await Case.deleteFile(caseId, fileId);
    await this.cdrService.clearTable(existingCase.name);
  }
}

export default CaseService;
