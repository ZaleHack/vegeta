import express from 'express';
import { PassThrough } from 'stream';
import { authenticate } from '../middleware/auth.js';
import database from '../config/database.js';
import { REALTIME_CDR_TABLE_METADATA, REALTIME_CDR_TABLE_SQL } from '../config/realtime-table.js';
import cgiBtsEnricher from '../services/CgiBtsEnrichmentService.js';
import { normalizeCgi } from '../utils/cgi.js';

const router = express.Router();

const SECTION_CATALOG = {
  contacts: {
    label: 'Personnes en contact',
    description: 'Réseau de contacts directs et fréquents.',
    defaultLimit: 20
  },
  'top-places': {
    label: 'Lieux les plus visités',
    description: 'Localisations dominantes et points d’ancrage.',
    defaultLimit: 12
  },
  'travel-history': {
    label: 'Historique des déplacements',
    description: 'Chronologie des mouvements observés.',
    defaultLimit: 25
  },
  'recent-locations': {
    label: 'Localisations récentes',
    description: 'Dernières positions enregistrées.',
    defaultLimit: 15
  },
  'last-location': {
    label: 'Dernière localisation connue',
    description: 'Point final connu avant la génération du rapport.',
    defaultLimit: 1
  }
};

const normalizeLimit = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.min(Math.max(Math.round(parsed), 1), 200);
  }
  return fallback;
};

const parseDateInput = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const normalizePhoneNumber = (value) => {
  if (!value) {
    return '';
  }
  let text = String(value).trim();
  if (!text) {
    return '';
  }
  text = text.replace(/\s+/g, '');
  if (text.startsWith('+')) {
    text = text.slice(1);
  }
  while (text.startsWith('00')) {
    text = text.slice(2);
  }
  text = text.replace(/[^0-9]/g, '');
  if (!text) {
    return '';
  }
  if (text.startsWith('221')) {
    return text;
  }
  const trimmed = text.replace(/^0+/, '');
  return trimmed ? `221${trimmed}` : '';
};

const formatDurationMinutes = (seconds) => {
  const totalSeconds = Number(seconds);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0 min';
  }
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} min`;
};

const formatDateValue = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString('fr-FR');
  }
  return String(value);
};

const formatTimeValue = (value) => {
  if (!value) return '';
  return String(value).trim();
};

const formatDateTimeValue = (dateValue, timeValue) => {
  const dateLabel = formatDateValue(dateValue);
  const timeLabel = formatTimeValue(timeValue);
  if (!timeLabel || timeLabel === '-') {
    return dateLabel;
  }
  return `${dateLabel} ${timeLabel}`;
};

const buildNumberVariants = (phoneNumber) => {
  const variants = new Set([phoneNumber]);
  const normalized = normalizePhoneNumber(phoneNumber);
  if (normalized) {
    variants.add(normalized);
  }
  return Array.from(variants).filter(Boolean);
};

const buildPhoneFilter = (variants) => {
  const placeholders = variants.map(() => '?').join(', ');
  const condition = `(c.numero_appelant IN (${placeholders}) OR c.numero_appele IN (${placeholders}))`;
  const params = [...variants, ...variants];
  return { condition, params, placeholders };
};

const buildWhereClause = ({ variants, startDate, endDate }) => {
  const conditions = [];
  const params = [];
  const { condition, params: numberParams, placeholders } = buildPhoneFilter(variants);
  conditions.push(condition);
  params.push(...numberParams);
  if (startDate) {
    conditions.push('c.date_debut >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('c.date_debut <= ?');
    params.push(endDate);
  }
  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    placeholders
  };
};

router.post('/export', authenticate, async (req, res) => {
  try {
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Numéro requis pour générer le rapport.' });
    }

    const rawSections = Array.isArray(req.body?.sections) ? req.body.sections : [];
    const selectedSections = rawSections
      .filter((section) => section && typeof section === 'object' && section.enabled !== false)
      .map((section) => {
        const id = typeof section.id === 'string' ? section.id : '';
        const catalogEntry = id && SECTION_CATALOG[id] ? SECTION_CATALOG[id] : null;
        const label =
          typeof section.label === 'string' && section.label.trim()
            ? section.label.trim()
            : catalogEntry?.label || 'Données ciblées';
        const description = catalogEntry?.description || '';
        const fallbackLimit = catalogEntry?.defaultLimit || 10;
        const limit = normalizeLimit(section.limit, fallbackLimit);
        return { id: id || label, label, description, limit };
      })
      .filter((section) => section.label);

    if (selectedSections.length === 0) {
      return res.status(400).json({ error: 'Sélectionnez au moins une catégorie de données.' });
    }

    const startDateRaw = typeof req.body?.startDate === 'string' ? req.body.startDate.trim() : '';
    const endDateRaw = typeof req.body?.endDate === 'string' ? req.body.endDate.trim() : '';
    const startDate = parseDateInput(startDateRaw);
    const endDate = parseDateInput(endDateRaw);
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin.' });
    }

    const numberVariants = buildNumberVariants(phoneNumber);
    if (numberVariants.length === 0) {
      return res.status(400).json({ error: 'Numéro invalide pour générer le rapport.' });
    }

    const sectionIds = new Set(selectedSections.map((section) => section.id));
    const sectionLimits = selectedSections.reduce((acc, section) => {
      acc[section.id] = section.limit;
      return acc;
    }, {});
    const { whereClause, params: baseParams, placeholders } = buildWhereClause({
      variants: numberVariants,
      startDate: startDateRaw || null,
      endDate: endDateRaw || null
    });
    const appendWhereClause = (current, extraCondition) =>
      current ? `${current} AND ${extraCondition}` : `WHERE ${extraCondition}`;

    const caseParams = [...numberVariants, ...numberVariants];
    const summaryParams = [...caseParams, ...baseParams];
    const summaryRow = await database.queryOne(
      `
        SELECT
          COUNT(*) AS total_calls,
          MIN(c.date_debut) AS first_date,
          MAX(c.date_debut) AS last_date,
          COUNT(DISTINCT CASE
            WHEN c.numero_appelant IN (${placeholders}) THEN c.numero_appele
            WHEN c.numero_appele IN (${placeholders}) THEN c.numero_appelant
            ELSE NULL
          END) AS unique_contacts,
          COUNT(DISTINCT c.cgi) AS unique_cgi
        FROM ${REALTIME_CDR_TABLE_SQL} c
        ${whereClause}
      `,
      summaryParams
    );

    const contactsPromise = sectionIds.has('contacts')
      ? database.query(
          `
            SELECT
              CASE
                WHEN c.numero_appelant IN (${placeholders}) THEN c.numero_appele
                ELSE c.numero_appelant
              END AS contact_number,
              COUNT(*) AS total_calls,
              SUM(c.duree_sec) AS total_duration
            FROM ${REALTIME_CDR_TABLE_SQL} c
            ${whereClause}
            GROUP BY contact_number
            ORDER BY total_calls DESC, total_duration DESC
            LIMIT ?
          `,
          [...caseParams, ...baseParams, sectionLimits['contacts']]
        )
      : Promise.resolve([]);

    const topPlacesPromise = sectionIds.has('top-places')
      ? database.query(
          `
            SELECT
              c.cgi,
              COUNT(*) AS total_hits,
              MAX(c.date_debut) AS last_date,
              MAX(c.heure_debut) AS last_time
            FROM ${REALTIME_CDR_TABLE_SQL} c
            ${appendWhereClause(whereClause, "c.cgi IS NOT NULL AND c.cgi <> ''")}
            GROUP BY c.cgi
            ORDER BY total_hits DESC, last_date DESC, last_time DESC
            LIMIT ?
          `,
          [...baseParams, sectionLimits['top-places']]
        )
      : Promise.resolve([]);

    const travelHistoryPromise = sectionIds.has('travel-history')
      ? database.query(
          `
            SELECT
              c.numero_appelant,
              c.numero_appele,
              c.type_appel,
              c.duree_sec,
              c.date_debut,
              c.heure_debut,
              c.cgi
            FROM ${REALTIME_CDR_TABLE_SQL} c
            ${whereClause}
            ORDER BY c.date_debut DESC, c.heure_debut DESC, c.id DESC
            LIMIT ?
          `,
          [...baseParams, sectionLimits['travel-history']]
        )
      : Promise.resolve([]);

    const recentLocationsPromise = sectionIds.has('recent-locations')
      ? database.query(
          `
            SELECT
              c.date_debut,
              c.heure_debut,
              c.cgi
            FROM ${REALTIME_CDR_TABLE_SQL} c
            ${appendWhereClause(whereClause, "c.cgi IS NOT NULL AND c.cgi <> ''")}
            ORDER BY c.date_debut DESC, c.heure_debut DESC, c.id DESC
            LIMIT ?
          `,
          [...baseParams, sectionLimits['recent-locations']]
        )
      : Promise.resolve([]);

    const lastLocationPromise = sectionIds.has('last-location')
      ? database.queryOne(
          `
            SELECT
              c.date_debut,
              c.heure_debut,
              c.cgi
            FROM ${REALTIME_CDR_TABLE_SQL} c
            ${appendWhereClause(whereClause, "c.cgi IS NOT NULL AND c.cgi <> ''")}
            ORDER BY c.date_debut DESC, c.heure_debut DESC, c.id DESC
            LIMIT 1
          `,
          baseParams
        )
      : Promise.resolve(null);

    const [contactsRows, topPlacesRows, travelHistoryRows, recentLocationsRows, lastLocationRow] =
      await Promise.all([
        contactsPromise,
        topPlacesPromise,
        travelHistoryPromise,
        recentLocationsPromise,
        lastLocationPromise
      ]);

    const cgiSet = new Set();
    const collectCgi = (row) => {
      const key = normalizeCgi(row?.cgi);
      if (key) {
        cgiSet.add(key);
      }
    };
    topPlacesRows.forEach(collectCgi);
    travelHistoryRows.forEach(collectCgi);
    recentLocationsRows.forEach(collectCgi);
    if (lastLocationRow) {
      collectCgi(lastLocationRow);
    }

    const cgiMap = cgiSet.size > 0 ? await cgiBtsEnricher.fetchMany(Array.from(cgiSet)) : new Map();
    const getNomBts = (cgiValue) => {
      const key = normalizeCgi(cgiValue);
      if (!key) {
        return 'Inconnu';
      }
      const cell = cgiMap.get(key);
      return cell?.nom_bts || cell?.NOM_BTS || 'Inconnu';
    };

    const numberVariantSet = new Set(numberVariants);
    const isNumberMatch = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return false;
      }
      if (numberVariantSet.has(trimmed)) {
        return true;
      }
      const normalized = normalizePhoneNumber(trimmed);
      return Boolean(normalized && numberVariantSet.has(normalized));
    };
    const emptyRowFallback = (columnCount, label = 'Aucune donnée disponible') =>
      Array.from({ length: columnCount }, (_, index) => (index === 0 ? label : '—'));

    const sectionTables = new Map();

    if (sectionIds.has('contacts')) {
      const rows =
        contactsRows.length > 0
          ? contactsRows.map((row) => [
              row.contact_number || 'Inconnu',
              row.total_calls ?? 0,
              formatDurationMinutes(row.total_duration)
            ])
          : [emptyRowFallback(3)];
      sectionTables.set('contacts', {
        title: "Détails des numéros en contact",
        headers: ['Numéro', 'Appels', "Minutes d'appel"],
        rows
      });
    }

    if (sectionIds.has('top-places')) {
      const rows =
        topPlacesRows.length > 0
          ? topPlacesRows.map((row) => [
              getNomBts(row.cgi),
              row.cgi || '—',
              `${row.total_hits ?? 0} présences`,
              formatDateTimeValue(row.last_date, row.last_time)
            ])
          : [emptyRowFallback(4)];
      sectionTables.set('top-places', {
        title: 'Présences géographiques dominantes',
        headers: ['Lieu (Nom BTS)', 'CGI', 'Présences', 'Dernier signal'],
        rows
      });
    }

    if (sectionIds.has('travel-history')) {
      const rows =
        travelHistoryRows.length > 0
          ? travelHistoryRows.map((row) => {
              const isCaller = isNumberMatch(row.numero_appelant);
              const contact = isCaller ? row.numero_appele : row.numero_appelant;
              return [
                formatDateTimeValue(row.date_debut, row.heure_debut),
                contact || '—',
                row.type_appel || '—',
                getNomBts(row.cgi)
              ];
            })
          : [emptyRowFallback(4)];
      sectionTables.set('travel-history', {
        title: 'Historique des interactions',
        headers: ['Horodatage', 'Contact', "Type d'appel", 'Lieu (Nom BTS)'],
        rows
      });
    }

    if (sectionIds.has('recent-locations')) {
      const rows =
        recentLocationsRows.length > 0
          ? recentLocationsRows.map((row) => [
              formatDateTimeValue(row.date_debut, row.heure_debut),
              row.cgi || '—',
              getNomBts(row.cgi)
            ])
          : [emptyRowFallback(3)];
      sectionTables.set('recent-locations', {
        title: 'Dernières localisations horodatées',
        headers: ['Horodatage', 'CGI', 'Lieu (Nom BTS)'],
        rows
      });
    }

    if (sectionIds.has('last-location')) {
      const rows = lastLocationRow
        ? [
            [
              formatDateTimeValue(lastLocationRow.date_debut, lastLocationRow.heure_debut),
              lastLocationRow.cgi || '—',
              getNomBts(lastLocationRow.cgi)
            ]
          ]
        : [emptyRowFallback(3)];
      sectionTables.set('last-location', {
        title: 'Dernière localisation connue',
        headers: ['Dernier signal', 'CGI', 'Lieu (Nom BTS)'],
        rows
      });
    }

    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ margin: 50, compress: false });
    const stream = new PassThrough();
    const chunks = [];

    doc.pipe(stream);

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="rapport-cible-${phoneNumber}.pdf"`);
      res.send(buffer);
    });

    doc.on('error', (error) => {
      console.error('Erreur génération PDF rapport cible:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Impossible de générer le rapport.' });
      }
    });

    const colors = {
      title: '#0B1120',
      text: '#1F2937',
      muted: '#64748B',
      accent: '#2563EB',
      accentSoft: '#DBEAFE',
      card: '#F8FAFC',
      border: '#E2E8F0',
      headerBg: '#EEF2FF'
    };

    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const footerHeight = 80;
    const generatedAt = new Date();

    const ensureSpace = (height = 100) => {
      const limit = doc.page.height - doc.page.margins.bottom - footerHeight;
      if (doc.y + height > limit) {
        doc.addPage();
      }
    };

    const drawSignature = () => {
      doc.save();
      const signature = 'SORA';
      const signatureWidth = doc.widthOfString(signature);
      const x = doc.page.width - doc.page.margins.right - signatureWidth;
      const y = doc.page.height - doc.page.margins.bottom - 30;
      doc
        .moveTo(x - 30, y - 4)
        .lineTo(x + signatureWidth, y - 4)
        .lineWidth(1)
        .strokeColor(colors.border)
        .stroke();
      doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.accent).text(signature, x, y);
      doc.restore();
    };

    drawSignature();
    doc.on('pageAdded', drawSignature);

    doc
      .roundedRect(doc.page.margins.left, doc.page.margins.top - 12, availableWidth, 105, 22)
      .fill(colors.headerBg);
    doc.fillColor(colors.title).fontSize(26).font('Helvetica-Bold');
    doc.text('Rapport Cible', doc.page.margins.left + 24, doc.page.margins.top + 6);
    doc.fontSize(12).fillColor(colors.muted).font('Helvetica');
    doc.text(
      'Synthèse détaillée issue de la table cdr_temps_reel',
      doc.page.margins.left + 24,
      doc.page.margins.top + 40
    );
    doc
      .fontSize(10)
      .fillColor(colors.muted)
      .text(`Source : ${REALTIME_CDR_TABLE_METADATA.table}`, doc.page.margins.left + 24, doc.page.margins.top + 62);

    doc.moveDown(3.1);
    doc.fillColor(colors.text).fontSize(12).font('Helvetica-Bold');
    doc.text('Numéro analysé', { continued: true });
    doc.font('Helvetica').text(` : ${phoneNumber}`);
    doc.fillColor(colors.muted).font('Helvetica').text(`Généré le ${generatedAt.toLocaleString('fr-FR')}`);
    const startLabel = startDate ? startDate.toLocaleDateString('fr-FR') : '';
    const endLabel = endDate ? endDate.toLocaleDateString('fr-FR') : '';
    if (startDate || endDate) {
      let periodLabel = '';
      if (startDate && endDate) {
        periodLabel = `Période : du ${startLabel} au ${endLabel}`;
      } else if (startDate) {
        periodLabel = `Période : à partir du ${startLabel}`;
      } else if (endDate) {
        periodLabel = `Période : jusqu'au ${endLabel}`;
      }
      doc.text(periodLabel);
    } else if (summaryRow?.first_date || summaryRow?.last_date) {
      const periodLabel = `Période observée : du ${formatDateValue(summaryRow.first_date)} au ${formatDateValue(
        summaryRow.last_date
      )}`;
      doc.text(periodLabel);
    }

    doc.moveDown(1.4);

    const drawStatCard = (label, value, x, y, width, height) => {
      doc
        .roundedRect(x, y, width, height, 14)
        .fill(colors.card)
        .strokeColor(colors.border)
        .lineWidth(1)
        .stroke();
      doc
        .fillColor(colors.muted)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(label, x + 14, y + 10, { width: width - 28 });
      doc
        .fillColor(colors.title)
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(String(value ?? '—'), x + 14, y + 26, { width: width - 28 });
    };

    const cardGap = 14;
    const cardWidth = (availableWidth - cardGap) / 2;
    const cardHeight = 58;
    const cardsStartY = doc.y;
    drawStatCard('Total événements', summaryRow?.total_calls ?? 0, doc.page.margins.left, cardsStartY, cardWidth, cardHeight);
    drawStatCard(
      'Contacts uniques',
      summaryRow?.unique_contacts ?? 0,
      doc.page.margins.left + cardWidth + cardGap,
      cardsStartY,
      cardWidth,
      cardHeight
    );
    drawStatCard(
      'BTS distincts',
      summaryRow?.unique_cgi ?? 0,
      doc.page.margins.left,
      cardsStartY + cardHeight + cardGap,
      cardWidth,
      cardHeight
    );
    drawStatCard(
      'Modules exportés',
      selectedSections.length,
      doc.page.margins.left + cardWidth + cardGap,
      cardsStartY + cardHeight + cardGap,
      cardWidth,
      cardHeight
    );

    doc.y = cardsStartY + cardHeight * 2 + cardGap * 2 + 6;

    const drawSectionHeader = (title, description) => {
      ensureSpace(description ? 70 : 56);
      doc.fillColor(colors.title).fontSize(13).font('Helvetica-Bold').text(title);
      if (description) {
        doc.fillColor(colors.muted).fontSize(9).font('Helvetica').text(description);
      }
      doc
        .moveTo(doc.page.margins.left, doc.y + 4)
        .lineTo(doc.page.margins.left + 80, doc.y + 4)
        .lineWidth(2)
        .strokeColor(colors.accent)
        .stroke();
      doc.moveDown(0.6);
    };

    const renderTable = (headers, rows) => {
      const columnCount = headers.length;
      const defaultWeights =
        columnCount === 4 ? [0.28, 0.2, 0.2, 0.32] : Array.from({ length: columnCount }, () => 1);
      const totalWeight = defaultWeights.reduce((sum, value) => sum + value, 0);
      const columnWidths = defaultWeights.map((weight) => (availableWidth * weight) / totalWeight);
      const rowHeight = 20;

      const drawRow = (row, options = {}) => {
        const rowY = doc.y;
        if (options.background) {
          doc
            .rect(doc.page.margins.left, rowY - 2, availableWidth, rowHeight + 2)
            .fill(options.background);
        }
        doc
          .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(options.fontSize || 9.5)
          .fillColor(options.color || colors.text);
        let x = doc.page.margins.left;
        row.forEach((cell, index) => {
          doc.text(String(cell), x + 4, rowY, { width: columnWidths[index] - 8 });
          x += columnWidths[index];
        });
        doc.y = rowY + rowHeight;
      };

      ensureSpace(rowHeight * 2);
      drawRow(headers, { bold: true, color: colors.title, background: colors.accentSoft, fontSize: 9.5 });
      doc
        .strokeColor(colors.border)
        .lineWidth(1)
        .moveTo(doc.page.margins.left, doc.y - 2)
        .lineTo(doc.page.margins.left + availableWidth, doc.y - 2)
        .stroke();

      rows.forEach((row, index) => {
        ensureSpace(rowHeight);
        drawRow(row, { background: index % 2 === 0 ? '#FFFFFF' : '#F8FAFC' });
      });
      doc.moveDown(1);
    };

    selectedSections.forEach((section) => {
      const table = sectionTables.get(section.id);
      if (!table) {
        return;
      }
      drawSectionHeader(section.label, section.description);
      doc
        .fillColor(colors.accent)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`Volume sélectionné : ${section.limit}`);
      doc.fillColor(colors.text).fontSize(11).font('Helvetica-Bold').text(table.title);
      renderTable(table.headers, table.rows);
    });

    doc.end();
  } catch (error) {
    console.error('Erreur export rapport cible:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Impossible de générer le rapport.' });
    }
  }
});

export default router;
