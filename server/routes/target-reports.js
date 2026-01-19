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

    doc.moveDown(1.5);

    selectedSections.forEach((section) => {
      ensureSpace(120);
      const startY = doc.y;
      doc
        .roundedRect(doc.page.margins.left, startY, availableWidth, 90, 16)
        .fill(colors.card)
        .strokeColor(colors.border)
        .stroke();

      doc
        .fillColor(colors.title)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(section.label, doc.page.margins.left + 20, startY + 16);
      if (section.description) {
        doc
          .fillColor(colors.muted)
          .fontSize(10)
          .font('Helvetica')
          .text(section.description, doc.page.margins.left + 20, startY + 36);
      }

      doc
        .fillColor(colors.accent)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(`Volume sélectionné : ${section.limit}`, doc.page.margins.left + 20, startY + 56);
      doc.moveDown(4);
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
