import fs from 'fs';
import path from 'path';
import Case from '../models/Case.js';
import CdrService from './CdrService.js';
import User from '../models/User.js';

const ALLOWED_PREFIXES = ['22177', '22176', '22178', '22170', '22175', '22133'];

class CaseService {
  constructor() {
    this.cdrService = new CdrService();
  }

  async createCase(name, userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
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

  async importFile(caseId, filePath, originalName, user, cdrNumber) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    const cdrNum = cdrNumber.startsWith('221') ? cdrNumber : `221${cdrNumber}`;
    const fileRecord = await Case.addFile(caseId, originalName, cdrNum);
    const ext = path.extname(originalName).toLowerCase();
    let result;
    if (ext === '.xlsx' || ext === '.xls') {
      result = await this.cdrService.importExcel(filePath, existingCase.name, fileRecord.id, cdrNum);
    } else {
      result = await this.cdrService.importCsv(filePath, existingCase.name, fileRecord.id, cdrNum);
    }
    await Case.updateFileLineCount(fileRecord.id, result.inserted);
    return result;
  }

  async search(caseId, identifier, options = {}, user) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    return await this.cdrService.search(identifier, { ...options, caseName: existingCase.name });
  }

  async linkDiagram(caseId, numbers, user) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    const filteredNumbers = Array.isArray(numbers)
      ? numbers.filter(n => ALLOWED_PREFIXES.some(p => String(n).startsWith(p)))
      : [];
    return await this.cdrService.findCommonContacts(filteredNumbers, existingCase.name);
  }

  async deleteCase(id, user) {
    const existingCase = await this.getCaseById(id, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    // Delete the case first to avoid dropping the CDR table if the delete fails
    await Case.delete(id);
    // Remove any CDR table associated with this case, but don't fail the whole
    // operation if the drop encounters an error
    try {
      await this.cdrService.deleteTable(existingCase.name);
    } catch (err) {
      console.error(`Failed to remove CDR table for case ${existingCase.name}`, err);
    }
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
    await this.cdrService.deleteByFile(fileId, existingCase.name);
  }
}

export default CaseService;
