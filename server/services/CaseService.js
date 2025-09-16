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

    const caseNumbers = Array.from(
      new Set(
        files
          .map((file) => (file.cdr_number ? String(file.cdr_number).trim() : ''))
          .filter((n) => n)
      )
    );

    let insights = null;
    if (caseNumbers.length > 0) {
      try {
        insights = await this._buildCaseInsights(existingCase.name, caseNumbers);
      } catch (insightError) {
        console.error('Erreur préparation rapport opération:', insightError);
      }
    }

    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    const stream = new PassThrough();
    const chunks = [];

    doc.pipe(stream);

    return await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        title: '#0F172A',
        text: '#1F2937',
        muted: '#6B7280',
        accent: '#2563EB',
        border: '#E5E7EB',
        highlight: '#F97316',
        danger: '#DC2626',
        card: '#F8FAFC'
      };

      const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      const formatDateValue = (value) => {
        if (!value) return '-';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('fr-FR');
      };

      const formatDateTimeValue = (value) => {
        if (!value) return '-';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('fr-FR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      };

      const ensureSpace = (height = 60) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (doc.y + height > bottom) {
          doc.addPage();
        }
      };

      const drawSectionHeader = (title) => {
        ensureSpace(40);
        const headerX = doc.page.margins.left;
        const headerY = doc.y;
        doc.save();
        doc.roundedRect(headerX, headerY, availableWidth, 26, 8).fill(colors.accent);
        doc
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .fontSize(13)
          .text(title, headerX + 14, headerY + 7);
        doc.restore();
        doc.y = headerY + 32;
        doc.x = headerX;
      };

      const drawInfoGrid = () => {
        const infoEntries = [
          ["Nom de l'opération", existingCase.name],
          ['Responsable', owner?.login || 'Inconnu'],
          ['Créée le', formatDateTimeValue(existingCase.created_at)],
          ['Date du rapport', formatDateTimeValue(new Date())],
          ['Fichiers importés', files.length.toString()]
        ];

        if (insights?.lastActivity) {
          infoEntries.push(['Dernière activité CDR', formatDateTimeValue(insights.lastActivity)]);
        }

        const columns = 2;
        const columnWidth = (availableWidth - 20) / columns;
        const cellHeight = 64;
        const rows = Math.ceil(infoEntries.length / columns);
        ensureSpace(rows * cellHeight + 20);
        const startY = doc.y;
        let maxBottom = startY;

        infoEntries.forEach(([label, value], idx) => {
          const columnIndex = idx % columns;
          const rowIndex = Math.floor(idx / columns);
          const x = doc.page.margins.left + columnIndex * (columnWidth + 20);
          const y = startY + rowIndex * cellHeight;

          doc.save();
          doc.roundedRect(x, y, columnWidth, cellHeight - 12, 12).fill(colors.card);
          doc.restore();

          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor(colors.muted)
            .text(label.toUpperCase(), x + 16, y + 12, { width: columnWidth - 32 });

          doc
            .font('Helvetica')
            .fontSize(12)
            .fillColor(colors.text)
            .text(value, x + 16, y + 30, { width: columnWidth - 32 });

          const cardBottom = y + cellHeight - 12;
          if (cardBottom > maxBottom) {
            maxBottom = cardBottom;
          }
        });

        doc.y = maxBottom + 12;
        doc.x = doc.page.margins.left;
      };

      const drawFilesTable = () => {
        if (!files.length) {
          doc
            .font('Helvetica')
            .fontSize(12)
            .fillColor(colors.muted)
            .text('Aucun fichier importé pour cette opération.');
          doc.moveDown(1);
          return;
        }

        const columnWidths = [
          availableWidth * 0.38,
          availableWidth * 0.2,
          availableWidth * 0.12,
          availableWidth * 0.3
        ];
        const headerHeight = 24;
        const rowHeight = 22;
        ensureSpace(headerHeight + rowHeight * files.length + 20);
        const tableX = doc.page.margins.left;
        let currentY = doc.y;

        doc.save();
        doc.roundedRect(tableX, currentY, availableWidth, headerHeight, 8).fill(colors.accent);
        doc.restore();

        const headers = ['Fichier', 'Numéro associé', 'Lignes', 'Importé le'];
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF');
        headers.forEach((header, index) => {
          const offset = columnWidths.slice(0, index).reduce((a, b) => a + b, 0);
          doc.text(header, tableX + offset + 12, currentY + 6, {
            width: columnWidths[index] - 24
          });
        });

        currentY += headerHeight;

        files.forEach((file, index) => {
          const background = index % 2 === 0 ? colors.card : '#FFFFFF';
          doc.save();
          doc.rect(tableX, currentY, availableWidth, rowHeight).fill(background);
          doc.restore();

          const values = [
            file.filename,
            file.cdr_number || '-',
            file.line_count ? String(file.line_count) : '-',
            formatDateTimeValue(file.uploaded_at)
          ];

          doc.font('Helvetica').fontSize(10).fillColor(colors.text);
          values.forEach((value, colIdx) => {
            const offset = columnWidths.slice(0, colIdx).reduce((a, b) => a + b, 0);
            const options = colIdx === 2
              ? { width: columnWidths[colIdx] - 24, align: 'center' }
              : { width: columnWidths[colIdx] - 24 };
            doc.text(value, tableX + offset + 12, currentY + 6, options);
          });

          currentY += rowHeight;
        });

        doc.y = currentY + 12;
        doc.x = tableX;
      };

      const drawContactsTable = (contacts = []) => {
        if (!contacts.length) {
          doc
            .font('Helvetica')
            .fontSize(12)
            .fillColor(colors.muted)
            .text('Aucun contact identifié.');
          doc.moveDown(0.8);
          return;
        }

        const rows = contacts.slice(0, 8);
        const columnWidths = [
          availableWidth * 0.45,
          availableWidth * 0.18,
          availableWidth * 0.18,
          availableWidth * 0.19
        ];
        const headerHeight = 22;
        const rowHeight = 20;
        ensureSpace(headerHeight + rowHeight * rows.length + 20);
        const startX = doc.page.margins.left;
        let y = doc.y;

        doc.save();
        doc.roundedRect(startX, y, availableWidth, headerHeight, 8).fill(colors.accent);
        doc.restore();

        const headers = ['Numéro', 'Appels', 'SMS', 'Total interactions'];
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF');
        headers.forEach((header, index) => {
          const offset = columnWidths.slice(0, index).reduce((a, b) => a + b, 0);
          doc.text(header, startX + offset + 12, y + 5, {
            width: columnWidths[index] - 24
          });
        });

        y += headerHeight;

        rows.forEach((contact, index) => {
          const background = index % 2 === 0 ? colors.card : '#FFFFFF';
          doc.save();
          doc.rect(startX, y, availableWidth, rowHeight).fill(background);
          doc.restore();

          const values = [
            contact.number,
            contact.callCount.toString(),
            contact.smsCount.toString(),
            contact.total.toString()
          ];

          doc.font('Helvetica').fontSize(10).fillColor(colors.text);
          values.forEach((value, idx) => {
            const offset = columnWidths.slice(0, idx).reduce((a, b) => a + b, 0);
            const options = idx === 0
              ? { width: columnWidths[idx] - 24 }
              : { width: columnWidths[idx] - 24, align: 'center' };
            doc.text(value, startX + offset + 12, y + 5, options);
          });

          y += rowHeight;
        });

        doc.y = y + 12;
        doc.x = startX;
      };

      const drawLocationCards = (recent = [], popular = []) => {
        const sections = [
          ['Localisations récentes', recent],
          ['Lieux les plus visités', popular]
        ];

        sections.forEach(([title, data]) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .fillColor(colors.title)
            .text(title);
          doc.moveDown(0.3);

          if (!data.length) {
            doc
              .font('Helvetica')
              .fontSize(11)
              .fillColor(colors.muted)
              .text('Aucune donnée disponible.');
            doc.moveDown(0.6);
            return;
          }

          data.forEach((item) => {
            ensureSpace(60);
            const cardHeight = 48;
            const x = doc.page.margins.left;
            const y = doc.y;

            doc.save();
            doc.roundedRect(x, y, availableWidth, cardHeight, 10).fill(colors.card);
            doc.restore();

            doc
              .font('Helvetica-Bold')
              .fontSize(11)
              .fillColor(colors.title)
              .text(item.name, x + 14, y + 10, { width: availableWidth - 28 });

            const metaParts = [];
            if (item.lastSeen) metaParts.push(`Dernière activité : ${formatDateTimeValue(item.lastSeen)}`);
            metaParts.push(`Occurrences : ${item.count}`);
            if (item.source) metaParts.push(`Source ${item.source}`);

            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor(colors.muted)
              .text(metaParts.join(' • '), x + 14, y + 28, { width: availableWidth - 28 });

            doc.y = y + cardHeight + 8;
          });

          doc.moveDown(0.4);
        });
      };

      const drawMeetingPoints = (meetingPoints = []) => {
        if (!meetingPoints.length) {
          doc
            .font('Helvetica')
            .fontSize(12)
            .fillColor(colors.muted)
            .text('Aucun point de rencontre détecté.');
          doc.moveDown(0.8);
          return;
        }

        meetingPoints.forEach((mp, index) => {
          ensureSpace(80 + (mp.perNumber?.length || 0) * 12);
          const startY = doc.y;

          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(colors.danger)
            .text(`${index + 1}. ${mp.nom || 'Localisation'}`, { indent: 12 });

          const windowText = `${formatDateTimeValue(mp.start)} → ${formatDateTimeValue(mp.end)}`;
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(colors.danger)
            .text(`Fenêtre : ${windowText}`, { indent: 12 });

          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(colors.muted)
            .text(`Participants : ${mp.numbers.join(', ')}`, { indent: 12 });

          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(colors.muted)
            .text(`Durée cumulée : ${mp.duration}`, { indent: 12 });

          (mp.perNumber || []).forEach((participant) => {
            doc
              .font('Helvetica')
              .fontSize(9)
              .fillColor(colors.text)
              .text(`↳ ${participant.number} — ${participant.total}`, { indent: 24 });
          });

          const endY = doc.y;
          doc.save();
          doc.rect(doc.page.margins.left, startY, 4, endY - startY).fill(colors.danger);
          doc.restore();
          doc.moveDown(0.4);
        });
      };

      const drawSimilarTrajectories = (segments = []) => {
        if (!segments.length) {
          doc
            .font('Helvetica')
            .fontSize(12)
            .fillColor(colors.muted)
            .text('Aucune trajectoire similaire détectée.');
          doc.moveDown(0.8);
          return;
        }

        segments.forEach((segment, index) => {
          ensureSpace(60);
          const startY = doc.y;
          const startName = segment.start?.nom || `${segment.start?.lat.toFixed(3)}, ${segment.start?.lng.toFixed(3)}`;
          const endName = segment.end?.nom || `${segment.end?.lat.toFixed(3)}, ${segment.end?.lng.toFixed(3)}`;

          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(colors.accent)
            .text(`${index + 1}. ${startName} → ${endName}`, { indent: 12 });

          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(colors.muted)
            .text(`Numéros impliqués : ${segment.sources.join(', ')}`, { indent: 12 });

          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(colors.muted)
            .text(`Occurrences observées : ${segment.totalOccurrences}`, { indent: 12 });

          const endY = doc.y;
          doc.save();
          doc.rect(doc.page.margins.left, startY, 4, endY - startY).fill(colors.accent);
          doc.restore();
          doc.moveDown(0.4);
        });
      };

      const drawApproximateLocation = (approx) => {
        if (!approx) {
          doc
            .font('Helvetica')
            .fontSize(12)
            .fillColor(colors.muted)
            .text('Données insuffisantes pour estimer une localisation approximative.');
          doc.moveDown(0.8);
          return;
        }

        ensureSpace(100);
        const cardHeight = 84;
        const x = doc.page.margins.left;
        const y = doc.y;

        doc.save();
        doc.roundedRect(x, y, availableWidth, cardHeight, 12).fill('#ECFEFF');
        doc.restore();

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(colors.title)
          .text('Zone de présence estimée', x + 16, y + 12, { width: availableWidth - 32 });

        const coordinates = `Latitude ${approx.lat.toFixed(5)} • Longitude ${approx.lng.toFixed(5)}`;
        const radius = approx.radiusKm ? `${approx.radiusKm.toFixed(2)} km` : '≈0 km';
        const sources = approx.sources && approx.sources.length ? approx.sources.join(', ') : 'N/A';
        const lastSeen = approx.lastSeen ? formatDateTimeValue(approx.lastSeen) : 'Inconnue';

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(colors.text)
          .text(coordinates, x + 16, y + 30, { width: availableWidth - 32 });

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(colors.text)
          .text(`Rayon approximatif : ${radius}`, x + 16, y + 44, { width: availableWidth - 32 });

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(colors.muted)
          .text(`Sources analysées : ${sources}`, x + 16, y + 58, { width: availableWidth - 32 });

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(colors.muted)
          .text(`Dernière activité : ${lastSeen}`, x + 16, y + 72, { width: availableWidth - 32 });

        doc.y = y + cardHeight + 12;
        doc.x = x;
      };

      const drawMap = (data) => {
        if (!data || !data.mapLocations || !data.mapLocations.length || !data.mapBounds) {
          doc
            .font('Helvetica')
            .fontSize(12)
            .fillColor(colors.muted)
            .text('Aucune donnée géographique suffisante pour générer une carte.');
          doc.moveDown(0.8);
          return;
        }

        const mapHeight = 240;
        ensureSpace(mapHeight + 40);
        const mapX = doc.page.margins.left;
        const mapY = doc.y;
        const mapWidth = availableWidth;

        doc.save();
        doc.roundedRect(mapX, mapY, mapWidth, mapHeight, 16).fill('#0F172A');
        doc
          .fillColor('#E2E8F0')
          .font('Helvetica-Bold')
          .fontSize(12)
          .text('Carte analytique', mapX + 20, mapY + 16);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#94A3B8')
          .text('Visualisation des positions géolocalisées', mapX + 20, mapY + 32);

        const innerX = mapX + 20;
        const innerY = mapY + 58;
        const innerWidth = mapWidth - 40;
        const innerHeight = mapHeight - 90;
        doc.rect(innerX, innerY, innerWidth, innerHeight).fill('#111C2D');
        const bounds = data.mapBounds;
        const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
        const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
        const project = (lat, lng) => {
          const x = innerX + ((lng - bounds.minLng) / lngRange) * innerWidth;
          const y = innerY + ((bounds.maxLat - lat) / latRange) * innerHeight;
          return [x, y];
        };

        doc.strokeColor('#1E293B').lineWidth(0.6);
        const gridSteps = 4;
        for (let i = 1; i < gridSteps; i++) {
          const gy = innerY + (innerHeight / gridSteps) * i;
          const gx = innerX + (innerWidth / gridSteps) * i;
          doc.moveTo(innerX, gy).lineTo(innerX + innerWidth, gy).stroke();
          doc.moveTo(gx, innerY).lineTo(gx, innerY + innerHeight).stroke();
        }

        doc.fillColor('#38BDF8');
        data.mapLocations.forEach((loc) => {
          const [px, py] = project(loc.lat, loc.lng);
          doc.circle(px, py, 2.5).fill();
        });

        if (data.meetingPoints?.length) {
          doc.fillColor('#F97316');
          data.meetingPoints.forEach((mp) => {
            const [px, py] = project(mp.lat, mp.lng);
            doc.circle(px, py, 4).fill();
          });
        }

        if (data.similarTrajectories?.length) {
          doc.strokeColor('#22D3EE').lineWidth(1.2);
          data.similarTrajectories.forEach((seg) => {
            if (!seg.start || !seg.end) return;
            const [sx, sy] = project(seg.start.lat, seg.start.lng);
            const [ex, ey] = project(seg.end.lat, seg.end.lng);
            doc.moveTo(sx, sy).lineTo(ex, ey).stroke();
          });
        }

        if (data.approximateLocation) {
          const approx = data.approximateLocation;
          const [cx, cy] = project(approx.lat, approx.lng);
          const avgLat = (bounds.minLat + bounds.maxLat) / 2;
          const kmPerDegreeLat = 111;
          const kmPerDegreeLng = Math.max(Math.cos((avgLat * Math.PI) / 180) * 111, 0.0001);
          const radiusLatDeg = approx.radiusKm / kmPerDegreeLat;
          const radiusLngDeg = approx.radiusKm / kmPerDegreeLng;
          const radiusPx = Math.max(
            (radiusLatDeg / latRange) * innerHeight,
            (radiusLngDeg / lngRange) * innerWidth,
            6
          );
          doc.save();
          doc.dash(4, { space: 3 });
          doc.strokeColor('#F87171').lineWidth(1.1).circle(cx, cy, radiusPx).stroke();
          doc.undash();
          doc.restore();
          doc.fillColor('#F87171').circle(cx, cy, 3).fill();
        }

        const legendY = mapY + mapHeight - 24;
        let legendX = mapX + 24;
        const legendItems = [
          { type: 'circle', color: '#38BDF8', label: 'Positions connues' }
        ];
        if (data.meetingPoints?.length) {
          legendItems.push({ type: 'circle', color: '#F97316', label: 'Points de rencontre' });
        }
        if (data.similarTrajectories?.length) {
          legendItems.push({ type: 'line', color: '#22D3EE', label: 'Trajectoires similaires' });
        }
        if (data.approximateLocation) {
          legendItems.push({ type: 'circle', color: '#F87171', label: 'Zone estimée' });
        }

        doc.font('Helvetica').fontSize(9).fillColor('#E2E8F0');
        legendItems.forEach((item) => {
          if (item.type === 'circle') {
            doc.fillColor(item.color).circle(legendX, legendY, 3).fill();
            doc.fillColor('#E2E8F0').text(item.label, legendX + 8, legendY - 6);
            legendX += doc.widthOfString(item.label) + 60;
          } else {
            doc.strokeColor(item.color).lineWidth(1.2).moveTo(legendX - 2, legendY).lineTo(legendX + 10, legendY).stroke();
            doc.fillColor('#E2E8F0').text(item.label, legendX + 14, legendY - 6);
            legendX += doc.widthOfString(item.label) + 70;
          }
        });

        doc.restore();
        doc.y = mapY + mapHeight + 24;
        doc.x = mapX;
      };

      const drawSignature = () => {
        ensureSpace(80);
        const lineY = doc.y;
        doc
          .moveTo(doc.page.margins.left, lineY)
          .lineTo(doc.page.width - doc.page.margins.right, lineY)
          .strokeColor(colors.border)
          .lineWidth(1)
          .stroke();
        doc.moveDown(1);
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(colors.muted)
          .text('Rapport généré automatiquement.', { align: 'right' });
        doc
          .font('Helvetica-Bold')
          .fontSize(14)
          .fillColor(colors.title)
          .text('Signature Sora', { align: 'right' });
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(colors.accent)
          .text('Sora Intelligence Division', { align: 'right' });
      };

      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor(colors.title)
        .text("Rapport d'opération", { align: 'center' });
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor(colors.muted)
        .text('Analyse stratégique générée par Sora Intelligence', { align: 'center' });
      doc.moveDown(1.2);
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor(colors.border)
        .lineWidth(1)
        .stroke();
      doc.moveDown(1.2);

      drawSectionHeader('Synthèse opérationnelle');
      drawInfoGrid();
      doc.moveDown(0.4);

      drawSectionHeader('Historique des fichiers importés');
      drawFilesTable();
      doc.moveDown(0.4);

      if (insights) {
        drawSectionHeader('Contacts clés & interactions');
        drawContactsTable(insights.contacts || []);
        doc.moveDown(0.4);

        drawSectionHeader('Analyse des localisations');
        drawLocationCards(insights.recentLocations || [], insights.topLocations || []);
        doc.moveDown(0.4);

        drawSectionHeader('Points de rencontre stratégiques');
        drawMeetingPoints(insights.meetingPoints || []);
        doc.moveDown(0.4);

        drawSectionHeader('Trajectoires similaires');
        drawSimilarTrajectories(insights.similarTrajectories || []);
        doc.moveDown(0.4);

        drawSectionHeader('Localisation approximative');
        drawApproximateLocation(insights.approximateLocation || null);
        doc.moveDown(0.4);

        drawSectionHeader('Cartographie opérationnelle');
        drawMap(insights);
      } else {
        drawSectionHeader('Analyse des données CDR');
        doc
          .font('Helvetica')
          .fontSize(12)
          .fillColor(colors.muted)
          .text("Aucune donnée CDR n'est disponible pour cette opération.");
      }

      drawSignature();

      doc.end();
    });
  }

  async _buildCaseInsights(caseName, numbers) {
    const uniqueNumbers = Array.from(
      new Set(
        numbers
          .map((n) => (n ? String(n).trim() : ''))
          .filter((n) => n && !n.startsWith('2214'))
      )
    );

    if (uniqueNumbers.length === 0) {
      return null;
    }

    const contactMap = new Map();
    const locationMap = new Map();
    const events = [];
    let lastActivity = null;

    const parseDateTime = (dateStr, timeStr) => {
      if (!dateStr) return null;
      const safeTime = typeof timeStr === 'string' && timeStr.trim() !== '' ? timeStr : '00:00:00';
      const date = new Date(`${dateStr}T${safeTime}`);
      if (Number.isNaN(date.getTime())) return null;
      return date;
    };

    for (const rawNumber of uniqueNumbers) {
      const identifier = rawNumber.startsWith('221') ? rawNumber : `221${rawNumber}`;
      let result;
      try {
        result = await this.cdrService.search(identifier, { caseName });
      } catch (err) {
        console.error('Erreur agrégation CDR pour rapport', err);
        continue;
      }

      if (!result) continue;

      (result.contacts || []).forEach((contact) => {
        if (!contact.number) return;
        const entry = contactMap.get(contact.number) || { callCount: 0, smsCount: 0 };
        entry.callCount += contact.callCount || 0;
        entry.smsCount += contact.smsCount || 0;
        contactMap.set(contact.number, entry);
      });

      (result.path || []).forEach((point) => {
        const lat = parseFloat(point.latitude);
        const lng = parseFloat(point.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        const start = parseDateTime(point.callDate, point.startTime);
        let end = parseDateTime(point.endDate || point.callDate, point.endTime || point.startTime);
        if (start && end && end < start) {
          end = start;
        }
        const eventTime = end || start;
        if (eventTime && (!lastActivity || eventTime > lastActivity)) {
          lastActivity = eventTime;
        }

        const event = {
          source: identifier,
          lat,
          lng,
          nom: point.nom || point.nom_localisation || 'Localisation inconnue',
          type: point.type || null,
          direction: point.direction || null,
          number: point.number || null,
          start,
          end,
          callDate: point.callDate || null,
          startTime: point.startTime || null,
          endDate: point.endDate || null,
          endTime: point.endTime || null
        };
        events.push(event);

        const key = `${lat.toFixed(5)},${lng.toFixed(5)},${event.nom}`;
        const existing = locationMap.get(key) || {
          lat,
          lng,
          nom: event.nom,
          count: 0,
          lastSeen: null,
          lastSource: identifier
        };
        existing.count += 1;
        if (eventTime && (!existing.lastSeen || eventTime > existing.lastSeen)) {
          existing.lastSeen = eventTime;
          existing.lastSource = identifier;
        }
        locationMap.set(key, existing);
      });
    }

    const contacts = Array.from(contactMap.entries())
      .map(([number, stats]) => ({
        number,
        callCount: stats.callCount,
        smsCount: stats.smsCount,
        total: stats.callCount + stats.smsCount
      }))
      .sort((a, b) => b.total - a.total);

    const locations = Array.from(locationMap.values());
    const recentLocations = locations
      .filter((loc) => loc.lastSeen)
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, 5)
      .map((loc) => ({
        name: loc.nom || 'Localisation',
        lat: loc.lat,
        lng: loc.lng,
        lastSeen: loc.lastSeen,
        source: loc.lastSource,
        count: loc.count
      }));

    const topLocations = locations
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((loc) => ({
        name: loc.nom || 'Localisation',
        lat: loc.lat,
        lng: loc.lng,
        count: loc.count,
        lastSeen: loc.lastSeen,
        source: loc.lastSource
      }));

    const meetingPoints = this._computeMeetingPoints(events);
    const similarTrajectories = this._computeSimilarTrajectories(events);
    const approximateLocation = this._computeApproximateLocation(events);

    const bounds = events.length
      ? {
          minLat: Math.min(...events.map((e) => e.lat)),
          maxLat: Math.max(...events.map((e) => e.lat)),
          minLng: Math.min(...events.map((e) => e.lng)),
          maxLng: Math.max(...events.map((e) => e.lng))
        }
      : null;

    return {
      contacts,
      recentLocations,
      topLocations,
      meetingPoints,
      similarTrajectories,
      approximateLocation,
      mapLocations: locations,
      mapBounds: bounds,
      numbers: uniqueNumbers,
      lastActivity,
      events
    };
  }

  _computeMeetingPoints(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return [];
    }

    const byLocation = new Map();

    events.forEach((event) => {
      if (!event.source) return;
      if (!event.start || !event.end) return;
      const key = `${event.lat.toFixed(5)},${event.lng.toFixed(5)}`;
      if (!byLocation.has(key)) {
        byLocation.set(key, {
          lat: event.lat,
          lng: event.lng,
          nom: event.nom,
          events: []
        });
      }
      byLocation.get(key).events.push(event);
    });

    const formatDuration = (seconds) => {
      if (!seconds || seconds <= 0) return '0s';
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const parts = [];
      if (hrs) parts.push(`${hrs}h`);
      if (mins) parts.push(`${mins}m`);
      if (!hrs && !mins) parts.push(`${secs}s`);
      return parts.join(' ');
    };

    const results = [];

    byLocation.forEach((group) => {
      const evs = group.events.filter((e) => e.start && e.end);
      if (evs.length < 2) return;

      const timeline = [];
      evs.forEach((e, idx) => {
        timeline.push({ time: e.start, type: 'start', index: idx });
        timeline.push({ time: e.end, type: 'end', index: idx });
      });

      timeline.sort((a, b) => {
        const diff = a.time.getTime() - b.time.getTime();
        if (diff !== 0) return diff;
        if (a.type === b.type) return 0;
        return a.type === 'end' ? -1 : 1;
      });

      const active = new Set();
      const windows = [];
      let windowStart = null;

      const getActiveSources = () =>
        new Set(Array.from(active).map((i) => evs[i].source).filter(Boolean));

      timeline.forEach(({ time, type, index }) => {
        if (type === 'start') {
          active.add(index);
          const sources = getActiveSources();
          if (windowStart === null && sources.size >= 2) {
            windowStart = time;
          }
        } else {
          const wasMeeting = windowStart !== null;
          active.delete(index);
          const sources = getActiveSources();
          if (wasMeeting && sources.size < 2) {
            windows.push({ start: windowStart, end: time });
            windowStart = null;
          }
        }
      });

      windows.forEach(({ start, end }) => {
        if (!start || !end || end <= start) return;
        const overlapping = evs.filter((e) => e.start < end && start < e.end);
        const numbers = Array.from(new Set(overlapping.map((e) => e.source).filter(Boolean)));
        if (numbers.length < 2) return;

        const perNumber = numbers
          .map((number) => {
            const entries = overlapping
              .filter((e) => e.source === number)
              .map((e) => {
                const overlapStart = e.start > start ? e.start : start;
                const overlapEnd = e.end < end ? e.end : end;
                const durationSec = Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / 1000);
                return {
                  date: overlapStart.toISOString().split('T')[0],
                  start: overlapStart.toTimeString().slice(0, 8),
                  end: overlapEnd.toTimeString().slice(0, 8),
                  durationSec
                };
              })
              .filter((entry) => entry.durationSec > 0);
            const totalSec = entries.reduce((sum, entry) => sum + entry.durationSec, 0);
            if (!entries.length) return null;
            return {
              number,
              total: formatDuration(totalSec),
              totalSec,
              events: entries.map(({ date, start: s, end: e, durationSec }) => ({
                date,
                start: s,
                end: e,
                duration: formatDuration(durationSec)
              }))
            };
          })
          .filter(Boolean);

        if (perNumber.length < 2) return;

        const totalSec = perNumber.reduce((sum, entry) => sum + entry.totalSec, 0);

        results.push({
          lat: group.lat,
          lng: group.lng,
          nom: group.nom,
          numbers,
          start,
          end,
          duration: formatDuration(totalSec),
          perNumber: perNumber.map(({ totalSec: _t, ...rest }) => rest)
        });
      });
    });

    return results
      .sort((a, b) => {
        const diff = (b.numbers?.length || 0) - (a.numbers?.length || 0);
        if (diff !== 0) return diff;
        const timeA = a.start ? a.start.getTime() : 0;
        const timeB = b.start ? b.start.getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 5);
  }

  _computeSimilarTrajectories(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return [];
    }

    const eventsBySource = new Map();
    events.forEach((event) => {
      if (!event.source) return;
      if (!eventsBySource.has(event.source)) {
        eventsBySource.set(event.source, []);
      }
      eventsBySource.get(event.source).push(event);
    });

    const segmentsMap = new Map();

    eventsBySource.forEach((list, source) => {
      const sorted = list
        .filter((e) => !Number.isNaN(e.lat) && !Number.isNaN(e.lng))
        .sort((a, b) => {
          const aTime = (a.start || a.end || new Date(0)).getTime();
          const bTime = (b.start || b.end || new Date(0)).getTime();
          return aTime - bTime;
        });

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (!prev || !curr) continue;
        const key = `${prev.lat.toFixed(5)},${prev.lng.toFixed(5)}|${curr.lat.toFixed(5)},${curr.lng.toFixed(5)}`;
        const entry = segmentsMap.get(key) || {
          start: { lat: prev.lat, lng: prev.lng, nom: prev.nom },
          end: { lat: curr.lat, lng: curr.lng, nom: curr.nom },
          counts: new Map()
        };
        entry.counts.set(source, (entry.counts.get(source) || 0) + 1);
        segmentsMap.set(key, entry);
      }
    });

    const segments = Array.from(segmentsMap.values())
      .map((seg) => {
        const sources = Array.from(seg.counts.entries())
          .filter(([, count]) => count > 0)
          .map(([src, count]) => ({ source: src, count }));
        const totalSources = sources.length;
        const totalOccurrences = sources.reduce((sum, item) => sum + item.count, 0);
        return {
          start: seg.start,
          end: seg.end,
          sources: sources.map((s) => s.source),
          totalSources,
          totalOccurrences
        };
      })
      .filter((seg) => {
        if (seg.totalSources > 1) return true;
        return seg.totalOccurrences > 1;
      })
      .sort((a, b) => {
        if (b.totalSources !== a.totalSources) return b.totalSources - a.totalSources;
        return b.totalOccurrences - a.totalOccurrences;
      })
      .slice(0, 5);

    return segments;
  }

  _computeApproximateLocation(events) {
    if (!Array.isArray(events) || events.length === 0) {
      return null;
    }

    const latestBySource = new Map();

    events.forEach((event) => {
      if (!event.source) return;
      if (Number.isNaN(event.lat) || Number.isNaN(event.lng)) return;
      const reference = event.end || event.start;
      if (!reference) return;
      const current = latestBySource.get(event.source);
      if (!current || reference > (current.end || current.start || new Date(0))) {
        latestBySource.set(event.source, event);
      }
    });

    const latestEvents = Array.from(latestBySource.values());
    if (!latestEvents.length) {
      return null;
    }

    const centroidLat = latestEvents.reduce((sum, e) => sum + e.lat, 0) / latestEvents.length;
    const centroidLng = latestEvents.reduce((sum, e) => sum + e.lng, 0) / latestEvents.length;

    const toRadians = (deg) => (deg * Math.PI) / 180;
    const haversine = (lat1, lng1, lat2, lng2) => {
      const R = 6371;
      const dLat = toRadians(lat2 - lat1);
      const dLng = toRadians(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const distances = latestEvents.map((event) =>
      haversine(event.lat, event.lng, centroidLat, centroidLng)
    );
    const maxRadius = distances.length ? Math.max(...distances) : 0;

    const lastSeen = latestEvents.reduce((latest, event) => {
      const reference = event.end || event.start;
      if (!reference) return latest;
      if (!latest || reference > latest) return reference;
      return latest;
    }, null);

    return {
      lat: centroidLat,
      lng: centroidLng,
      radiusKm: maxRadius,
      sources: latestEvents.map((e) => e.source),
      lastSeen
    };
  }
}

export default CaseService;
