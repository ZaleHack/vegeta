import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import Case from '../models/Case.js';
import CdrService from './CdrService.js';
import User from '../models/User.js';

const ALLOWED_PREFIXES = ['22177', '22176', '22178', '22170', '22175', '22133'];

class CaseService {
  constructor() {
    this.cdrService = new CdrService();
  }

  _isAdmin(user) {
    return user.admin === 1 || user.admin === '1' || user.admin === true;
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
    if (!this._isAdmin(user) && c.user_id !== user.id) return null;
    return c;
  }

  async listCases(user) {
    if (this._isAdmin(user)) {
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

  async listLocations(caseId, user) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    return await this.cdrService.listLocations(existingCase.name);
  }

  async deleteFile(caseId, fileId, user) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      throw new Error('Case not found');
    }
    await Case.deleteFile(caseId, fileId);
    await this.cdrService.deleteByFile(fileId, existingCase.name);
  }

  async generateReport(caseId, user) {
    const existingCase = await this.getCaseById(caseId, user);
    if (!existingCase) {
      const error = new Error('Case not found');
      error.status = 404;
      throw error;
    }

    const [files, owner] = await Promise.all([
      Case.listFiles(caseId),
      User.findById(existingCase.user_id)
    ]);

    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    const stream = new PassThrough();
    const chunks = [];

    doc.pipe(stream);

    const formatDate = (value) => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('fr-FR');
    };

    return await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const titleColor = '#1F2937';
      const textColor = '#4B5563';
      const accentColor = '#2563EB';

      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor(titleColor)
        .text("Rapport d'opération", { align: 'center' });

      doc.moveDown(1.5);

      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(accentColor)
        .text('Informations générales');

      doc.moveDown(0.75);

      const infoEntries = [
        ["Nom de l'opération", existingCase.name],
        ['Créée le', formatDate(existingCase.created_at)],
        ['Responsable', owner?.login || 'Inconnu'],
        ['Date du rapport', formatDate(new Date())],
        ['Nombre de fichiers importés', files.length.toString()]
      ];

      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor(textColor);

      infoEntries.forEach(([label, value]) => {
        doc
          .font('Helvetica-Bold')
          .fillColor(titleColor)
          .text(`${label} : `, { continued: true })
          .font('Helvetica')
          .fillColor(textColor)
          .text(value)
          .moveDown(0.3);
      });

      doc.moveDown(1);

      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(accentColor)
        .text('Historique des fichiers importés');

      doc.moveDown(0.75);

      if (!files.length) {
        doc
          .font('Helvetica')
          .fontSize(12)
          .fillColor(textColor)
          .text('Aucun fichier importé pour cette opération.');
      } else {
        const columnWidths = [200, 120, 70, 120];
        const headers = ['Fichier', 'Numéro associé', 'Lignes', 'Importé le'];

        const tableStartX = doc.page.margins.left;

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(titleColor);

        const headerY = doc.y;
        headers.forEach((header, index) => {
          const x = tableStartX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0);
          doc.text(header, x, headerY, { width: columnWidths[index] });
        });

        doc.moveDown(0.8);

        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor(textColor);

        files.forEach((file) => {
          const rowY = doc.y;
          const values = [
            file.filename,
            file.cdr_number || '-',
            file.line_count ? String(file.line_count) : '-',
            formatDate(file.uploaded_at)
          ];

          values.forEach((value, index) => {
            const x = tableStartX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0);
            const options = index === 2
              ? { width: columnWidths[index], align: 'center' }
              : { width: columnWidths[index] };
            doc.text(value, x, rowY, options);
          });

          doc.moveDown(0.6);
        });
      }

      doc.end();
    });
  }
}

export default CaseService;
