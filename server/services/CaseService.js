import fs from 'fs';
import path from 'path';
import Case from '../models/Case.js';
import CdrService from './CdrService.js';

class CaseService {
  constructor() {
    this.cdrService = new CdrService();
  }

  async createCase(name, userId) {
    return await Case.create(name, userId);
  }

  async getCaseById(id, user) {
    const c = await Case.findById(id);
    if (!c) return null;
    if (!user.admin && c.user_id !== user.id) return null;
    return c;
  }

  async listCases(user) {
    if (user.admin) {
      return await Case.findAll();
    }
    return await Case.findAllByUser(user.id);
  }

  async importFile(caseId, filePath, originalName, user) {
    const existingCase = await this.getCaseById(caseId, user);
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

  async search(caseId, identifier, options = {}, user) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    return await this.cdrService.search(identifier, { ...options, caseName: existingCase.name });
  }

  async deleteCase(id, user) {
    const existingCase = await this.getCaseById(id, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    await Case.delete(id);
  }

  async listFiles(caseId, user) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    return await Case.listFiles(caseId);
  }

  async deleteFile(caseId, fileId, user) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    await Case.deleteFile(caseId, fileId);
    await this.cdrService.deleteTable(existingCase.name);
  }
}

export default CaseService;
