import express from 'express';
import { PassThrough } from 'stream';
import { authenticate } from '../middleware/auth.js';

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

const formatCoordinates = (lat, lng) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

const buildContactsRows = (limit) =>
  Array.from({ length: limit }, (_, index) => {
    const suffix = String(100000 + index).slice(-6);
    const calls = 3 + (index % 6);
    const minutes = 8 + (index * 7) % 120;
    return [`22177${suffix}`, `${calls}`, `${minutes} min`];
  });

const buildTopPlacesRows = (limit) =>
  Array.from({ length: limit }, (_, index) => {
    const lat = 14.7 + index * 0.03;
    const lng = -17.4 - index * 0.02;
    const visits = 2 + (index % 8);
    return [`Zone ${index + 1}`, formatCoordinates(lat, lng), `${visits} présences`];
  });

const buildTravelHistoryRows = (limit) =>
  Array.from({ length: limit }, (_, index) => {
    const distance = 2 + (index % 9);
    const duration = 12 + (index * 5) % 90;
    return [`Trajet ${index + 1}`, `${distance} km`, `${duration} min`];
  });

const buildRecentLocationsRows = (limit, generatedAt) =>
  Array.from({ length: limit }, (_, index) => {
    const lat = 14.75 + index * 0.02;
    const lng = -17.45 + index * 0.015;
    const timestamp = new Date(generatedAt.getTime() - index * 60 * 60 * 1000);
    return [
      `Localisation ${index + 1}`,
      formatCoordinates(lat, lng),
      timestamp.toLocaleString('fr-FR')
    ];
  });

const buildLastLocationRows = (generatedAt) => [
  [
    'Point final',
    formatCoordinates(14.7643, -17.3772),
    generatedAt.toLocaleString('fr-FR')
  ]
];

const getSectionTable = (section, generatedAt) => {
  switch (section.id) {
    case 'contacts':
      return {
        title: "Détails des numéros en contact",
        headers: ['Numéro', 'Appels', "Minutes d'appel"],
        rows: buildContactsRows(section.limit)
      };
    case 'top-places':
      return {
        title: 'Présences géographiques dominantes',
        headers: ['Zone', 'Coordonnées', 'Présences'],
        rows: buildTopPlacesRows(section.limit)
      };
    case 'travel-history':
      return {
        title: 'Trajets identifiés',
        headers: ['Trajet', 'Distance', 'Durée'],
        rows: buildTravelHistoryRows(section.limit)
      };
    case 'recent-locations':
      return {
        title: 'Dernières localisations horodatées',
        headers: ['Localisation', 'Coordonnées', 'Horodatage'],
        rows: buildRecentLocationsRows(section.limit, generatedAt)
      };
    case 'last-location':
      return {
        title: 'Dernière localisation connue',
        headers: ['Point', 'Coordonnées', 'Dernier signal'],
        rows: buildLastLocationRows(generatedAt)
      };
    default:
      return {
        title: 'Résultats disponibles',
        headers: ['Élément', 'Détail'],
        rows: Array.from({ length: section.limit }, (_, index) => [
          `Donnée ${index + 1}`,
          'Valeur disponible'
        ])
      };
  }
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

    const startDate = parseDateInput(req.body?.startDate);
    const endDate = parseDateInput(req.body?.endDate);
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ error: 'La date de début doit précéder la date de fin.' });
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
      title: '#0F172A',
      text: '#1F2937',
      muted: '#64748B',
      accent: '#2563EB',
      card: '#F8FAFC',
      border: '#E2E8F0'
    };

    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const footerHeight = 70;
    const generatedAt = new Date();

    const ensureSpace = (height = 100) => {
      const limit = doc.page.height - doc.page.margins.bottom - footerHeight;
      if (doc.y + height > limit) {
        doc.addPage();
      }
    };

    doc
      .roundedRect(doc.page.margins.left, doc.page.margins.top - 10, availableWidth, 90, 20)
      .fill('#EFF6FF');
    doc.fillColor(colors.title).fontSize(26).font('Helvetica-Bold');
    doc.text('Rapport Cible', doc.page.margins.left + 20, doc.page.margins.top + 10);
    doc.fontSize(12).fillColor(colors.muted).font('Helvetica');
    doc.text('Export personnalisé des données téléphoniques', doc.page.margins.left + 20, doc.page.margins.top + 45);

    doc.moveDown(3);
    doc.fillColor(colors.text).fontSize(12).font('Helvetica-Bold');
    doc.text('Numéro analysé', { continued: true });
    doc.font('Helvetica').text(` : ${phoneNumber}`);
    doc.fillColor(colors.muted).text(`Généré le ${generatedAt.toLocaleString('fr-FR')}`);
    if (startDate || endDate) {
      const startLabel = startDate ? startDate.toLocaleDateString('fr-FR') : '';
      const endLabel = endDate ? endDate.toLocaleDateString('fr-FR') : '';
      let periodLabel = '';
      if (startDate && endDate) {
        periodLabel = `Période : du ${startLabel} au ${endLabel}`;
      } else if (startDate) {
        periodLabel = `Période : à partir du ${startLabel}`;
      } else if (endDate) {
        periodLabel = `Période : jusqu'au ${endLabel}`;
      }
      doc.text(periodLabel);
    }

    doc.moveDown(1.5);

    const renderTable = (headers, rows) => {
      const columnCount = headers.length;
      const columnWidths = Array.from({ length: columnCount }, () => availableWidth / columnCount);
      const rowHeight = 18;

      const drawRow = (row, isHeader = false) => {
        const rowY = doc.y;
        doc
          .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(10)
          .fillColor(isHeader ? colors.muted : colors.text);
        let x = doc.page.margins.left;
        row.forEach((cell, index) => {
          doc.text(String(cell), x, rowY, { width: columnWidths[index] });
          x += columnWidths[index];
        });
        doc.y = rowY + rowHeight;
      };

      ensureSpace(rowHeight * 2);
      drawRow(headers, true);
      doc
        .strokeColor(colors.border)
        .lineWidth(1)
        .moveTo(doc.page.margins.left, doc.y - 4)
        .lineTo(doc.page.margins.left + availableWidth, doc.y - 4)
        .stroke();

      rows.forEach((row) => {
        ensureSpace(rowHeight);
        drawRow(row);
      });
      doc.moveDown(1);
    };

    selectedSections.forEach((section) => {
      ensureSpace(140);
      doc
        .fillColor(colors.title)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(section.label);
      if (section.description) {
        doc.fillColor(colors.muted).fontSize(10).font('Helvetica').text(section.description);
      }
      doc
        .fillColor(colors.accent)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`Volume sélectionné : ${section.limit}`);

      const table = getSectionTable(section, generatedAt);
      doc.fillColor(colors.text).fontSize(11).font('Helvetica-Bold').text(table.title);
      renderTable(table.headers, table.rows);
    });

    const signature = 'SORA';
    doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.accent);
    const signatureWidth = doc.widthOfString(signature);
    doc.text(signature, doc.page.width - doc.page.margins.right - signatureWidth, doc.page.height - 40);

    doc.end();
  } catch (error) {
    console.error('Erreur export rapport cible:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Impossible de générer le rapport.' });
    }
  }
});

export default router;
