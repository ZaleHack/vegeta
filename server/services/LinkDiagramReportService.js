import { PassThrough } from 'stream';

const formatDateLabel = (value) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('fr-FR');
};

const formatDateTimeLabel = (value) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatNumberLabel = (value) => {
  if (!value) return '—';
  const text = String(value).trim();
  if (!text) return '—';
  const digits = text.replace(/\D/g, '');
  if (digits.startsWith('221') && digits.length === 12) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return text;
};

const normalizeId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.id === 'string') return value.id;
  return String(value);
};

const normalizeCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildDegreeMap = (links) => {
  const map = new Map();
  links.forEach((link) => {
    const source = normalizeId(link.source);
    const target = normalizeId(link.target);
    if (!source || !target) return;
    map.set(source, (map.get(source) || 0) + 1);
    map.set(target, (map.get(target) || 0) + 1);
  });
  return map;
};

const buildRootConnections = (links, root) => {
  if (!root) return [];
  const summary = new Map();
  links.forEach((link) => {
    const source = normalizeId(link.source);
    const target = normalizeId(link.target);
    if (source !== root && target !== root) return;
    const neighbor = source === root ? target : source;
    const previous = summary.get(neighbor) || { callCount: 0, smsCount: 0 };
    summary.set(neighbor, {
      callCount: previous.callCount + normalizeCount(link.callCount),
      smsCount: previous.smsCount + normalizeCount(link.smsCount)
    });
  });

  return Array.from(summary.entries())
    .map(([number, stats]) => ({
      number,
      callCount: stats.callCount,
      smsCount: stats.smsCount,
      total: stats.callCount + stats.smsCount
    }))
    .sort((a, b) => b.total - a.total);
};

const createLinkDiagramReport = async ({ nodes, links, root, filters, sections }) => {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ margin: 50, compress: false });
  const stream = new PassThrough();
  const chunks = [];

  doc.pipe(stream);

  return await new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const colors = {
      title: '#0B1120',
      text: '#1F2937',
      muted: '#64748B',
      accent: '#4F46E5',
      accentLight: '#EEF2FF',
      border: '#E2E8F0',
      card: '#F8FAFC',
      hero: '#F1F5F9'
    };

    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const footerHeight = 80;
    const selectedSections = new Set(sections);

    const ensureSpace = (height = 60) => {
      const bottomLimit = doc.page.height - doc.page.margins.bottom - footerHeight;
      if (doc.y + height > bottomLimit) {
        doc.addPage();
      }
    };

    const drawSignature = () => {
      const previousX = doc.x;
      const previousY = doc.y;

      doc.save();

      const signatureWidth = 120;
      const signatureX = doc.page.width - doc.page.margins.right - signatureWidth;
      const signatureY = doc.page.height - doc.page.margins.bottom - 42;

      doc
        .moveTo(signatureX, signatureY)
        .lineTo(signatureX + signatureWidth, signatureY)
        .lineWidth(1)
        .stroke(colors.border);

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(colors.title)
        .text('SORA', signatureX, signatureY + 6, {
          width: signatureWidth,
          align: 'right'
        });

      doc.restore();
      doc.x = previousX;
      doc.y = previousY;
    };

    drawSignature();
    doc.on('pageAdded', drawSignature);

    const drawSectionHeader = (title, subtitle) => {
      ensureSpace(subtitle ? 70 : 56);
      const startY = doc.y;
      const headerX = doc.page.margins.left;
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(colors.title)
        .text(title, headerX, startY, { width: availableWidth });
      if (subtitle) {
        doc
          .moveDown(0.3)
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor(colors.muted)
          .text(subtitle, headerX, doc.y, { width: availableWidth });
      }
      doc
        .moveTo(headerX, doc.y + 6)
        .lineTo(headerX + 120, doc.y + 6)
        .lineWidth(2)
        .strokeColor(colors.accent)
        .stroke();
      doc.y += 18;
    };

    const drawHeroHeader = () => {
      const heroHeight = 160;
      const heroX = doc.page.margins.left;
      const heroY = doc.page.margins.top;
      doc.save();
      doc.roundedRect(heroX, heroY, availableWidth, heroHeight, 26).fill(colors.hero);
      doc
        .lineWidth(0.5)
        .strokeColor(colors.border)
        .roundedRect(heroX, heroY, availableWidth, heroHeight, 26)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor(colors.title)
        .text('Rapport diagramme des liens', heroX + 24, heroY + 24, {
          width: availableWidth - 48
        });
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(colors.muted)
        .text('Synthèse des interactions et relations observées.', heroX + 24, heroY + 52, {
          width: availableWidth - 48
        });

      const infoTop = heroY + 84;
      const lineGap = 18;
      const numberLabel = formatNumberLabel(filters?.number || root);
      const periodLabel = filters?.start || filters?.end
        ? `${formatDateLabel(filters?.start)} → ${formatDateLabel(filters?.end)}`
        : 'Période complète';

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(colors.muted)
        .text('Numéro racine', heroX + 24, infoTop);
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(colors.text)
        .text(numberLabel, heroX + 24, infoTop + 10);

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(colors.muted)
        .text('Période analysée', heroX + 220, infoTop);
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(colors.text)
        .text(periodLabel, heroX + 220, infoTop + 10);

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(colors.muted)
        .text('Généré le', heroX + 420, infoTop);
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(colors.text)
        .text(formatDateTimeLabel(new Date()), heroX + 420, infoTop + 10);

      doc.restore();
      doc.y = heroY + heroHeight + 24;
    };

    const drawStatCards = (stats) => {
      const cardGap = 12;
      const cardWidth = (availableWidth - cardGap * (stats.length - 1)) / stats.length;
      const cardHeight = 72;
      const startX = doc.page.margins.left;
      const startY = doc.y;

      stats.forEach((stat, index) => {
        const x = startX + index * (cardWidth + cardGap);
        doc.save();
        doc.roundedRect(x, startY, cardWidth, cardHeight, 16).fill(colors.card);
        doc
          .lineWidth(0.5)
          .strokeColor(colors.border)
          .roundedRect(x, startY, cardWidth, cardHeight, 16)
          .stroke();
        doc
          .font('Helvetica-Bold')
          .fontSize(16)
          .fillColor(colors.title)
          .text(stat.value, x + 16, startY + 18, { width: cardWidth - 32 });
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(colors.muted)
          .text(stat.label, x + 16, startY + 40, { width: cardWidth - 32 });
        doc.restore();
      });

      doc.y = startY + cardHeight + 24;
    };

    const drawTable = ({ title, subtitle, columns, rows }) => {
      drawSectionHeader(title, subtitle);
      if (rows.length === 0) {
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(colors.muted)
          .text('Aucune donnée disponible pour cette section.', doc.page.margins.left);
        doc.y += 12;
        return;
      }

      const columnWidth = availableWidth / columns.length;
      const headerHeight = 22;
      const rowHeight = 20;
      const startX = doc.page.margins.left;

      ensureSpace(headerHeight + rowHeight);
      doc.save();
      doc.rect(startX, doc.y, availableWidth, headerHeight).fill(colors.accentLight);
      doc
        .lineWidth(0.5)
        .strokeColor(colors.border)
        .rect(startX, doc.y, availableWidth, headerHeight)
        .stroke();
      columns.forEach((col, index) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(colors.title)
          .text(col, startX + index * columnWidth + 8, doc.y + 6, { width: columnWidth - 16 });
      });
      doc.restore();
      doc.y += headerHeight;

      rows.forEach((row, rowIndex) => {
        ensureSpace(rowHeight + 6);
        if (rowIndex % 2 === 0) {
          doc.save();
          doc.rect(startX, doc.y, availableWidth, rowHeight).fill('#FFFFFF');
          doc.restore();
        }
        row.forEach((cell, index) => {
          doc
            .font('Helvetica')
            .fontSize(9.5)
            .fillColor(colors.text)
            .text(cell, startX + index * columnWidth + 8, doc.y + 6, {
              width: columnWidth - 16
            });
        });
        doc.y += rowHeight;
      });

      doc.y += 12;
    };

    const degreeMap = buildDegreeMap(links);
    const totalCalls = links.reduce((sum, link) => sum + normalizeCount(link.callCount), 0);
    const totalSms = links.reduce((sum, link) => sum + normalizeCount(link.smsCount), 0);
    const rootConnections = buildRootConnections(links, root);

    drawHeroHeader();
    drawStatCards([
      { label: 'Noeuds analysés', value: nodes.length.toString() },
      { label: 'Relations détectées', value: links.length.toString() },
      { label: 'Interactions totales', value: `${totalCalls + totalSms}` }
    ]);

    if (selectedSections.has('summary')) {
      const summaryRows = [
        ['Numéro racine', formatNumberLabel(root || filters?.number)],
        ['Total appels', totalCalls.toString()],
        ['Total SMS', totalSms.toString()],
        ['Contacts uniques', new Set(nodes.map((node) => node.id)).size.toString()]
      ];
      drawTable({
        title: 'Synthèse générale',
        subtitle: 'Résumé des indicateurs clés du diagramme.',
        columns: ['Indicateur', 'Valeur'],
        rows: summaryRows
      });
    }

    if (selectedSections.has('nodes')) {
      const nodeRows = nodes
        .map((node) => ({
          id: node.id,
          type: node.type || '—',
          degree: degreeMap.get(node.id) || 0
        }))
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 18)
        .map((node) => [formatNumberLabel(node.id), node.type, node.degree.toString()]);

      drawTable({
        title: 'Noeuds principaux',
        subtitle: 'Liste des numéros classés par niveau de connexion.',
        columns: ['Numéro', 'Type', 'Degré'],
        rows: nodeRows
      });
    }

    if (selectedSections.has('links')) {
      const linkRows = links
        .map((link) => ({
          source: normalizeId(link.source),
          target: normalizeId(link.target),
          callCount: normalizeCount(link.callCount),
          smsCount: normalizeCount(link.smsCount)
        }))
        .sort((a, b) => b.callCount + b.smsCount - (a.callCount + a.smsCount))
        .slice(0, 18)
        .map((link) => [
          formatNumberLabel(link.source),
          formatNumberLabel(link.target),
          `${link.callCount} appels / ${link.smsCount} SMS`
        ]);

      drawTable({
        title: 'Relations observées',
        subtitle: 'Interactions triées par volume de communications.',
        columns: ['Source', 'Destination', 'Volume'],
        rows: linkRows
      });
    }

    if (selectedSections.has('rootConnections')) {
      const rootRows = rootConnections
        .slice(0, 18)
        .map((entry) => [formatNumberLabel(entry.number), `${entry.callCount} appels`, `${entry.smsCount} SMS`]);

      drawTable({
        title: 'Connexions directes de la racine',
        subtitle: 'Contacts les plus sollicités par le numéro principal.',
        columns: ['Contact', 'Appels', 'SMS'],
        rows: rootRows
      });
    }

    doc.end();
  });
};

export default createLinkDiagramReport;
