import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Profile from '../models/Profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProfileService {
  constructor() {
    this.photosDir = path.join(__dirname, '../../uploads/profiles');
    if (!fs.existsSync(this.photosDir)) {
      fs.mkdirSync(this.photosDir, { recursive: true });
    }
  }

  async create(data, userId, file) {
    const profileData = {
      user_id: userId,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      phone: data.phone || null,
      email: data.email || null,
      comment: data.comment ?? '',
      extra_fields: data.extra_fields || [],
      // Use POSIX-style paths for storage so that paths work across OSes
      photo_path: file ? path.posix.join('uploads/profiles', file.filename) : null
    };
    return Profile.create(profileData);
  }

  async update(id, data, user, file) {
    const existing = await Profile.findById(id);
    if (!existing) throw new Error('Profil non trouvé');
    const isAdmin = user.admin === 1 || user.admin === '1' || user.admin === true;
    if (!isAdmin && existing.user_id !== user.id) {
      throw new Error('Accès refusé');
    }
    const updateData = {
      first_name: data.first_name ?? existing.first_name,
      last_name: data.last_name ?? existing.last_name,
      phone: data.phone ?? existing.phone,
      email: data.email ?? existing.email,
      comment: data.comment ?? existing.comment ?? '',
      extra_fields: data.extra_fields || JSON.parse(existing.extra_fields || '[]'),
      // Normalize existing paths to use forward slashes to avoid issues on different OSes
      photo_path: file
        ? path.posix.join('uploads/profiles', file.filename)
        : existing.photo_path
            ? existing.photo_path.replace(/\\/g, '/')
            : existing.photo_path
    };
    return Profile.update(id, updateData);
  }

  async delete(id, user) {
    const existing = await Profile.findById(id);
    if (!existing) throw new Error('Profil non trouvé');
    const isAdmin = user.admin === 1 || user.admin === '1' || user.admin === true;
    if (!isAdmin && existing.user_id !== user.id) {
      throw new Error('Accès refusé');
    }
    return Profile.delete(id);
  }

  async get(id, user) {
    const profile = await Profile.findById(id);
    if (!profile) return null;
    const isAdmin = user.admin === 1 || user.admin === '1' || user.admin === true;
    if (!isAdmin && profile.user_id !== user.id) return null;
    return profile;
  }

  async list(user, search, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const isAdmin = user.admin === 1 || user.admin === '1' || user.admin === true;
    if (search) {
      return Profile.searchByNameOrPhone(search, user.id, isAdmin, limit, offset);
    }
    return Profile.findAll(isAdmin ? null : user.id, limit, offset);
  }

  async generatePDF(profile) {
    try {
      const { default: PDFDocument } = await import('pdfkit');
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      return await new Promise(async (resolve, reject) => {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header block
        const pageWidth = doc.page.width;
        const headerHeight = 80;
        const margin = doc.page.margins.left;
        const innerWidth = pageWidth - margin * 2;
        doc.rect(0, 0, pageWidth, headerHeight).fill('#4F46E5');
        doc
          .fillColor('white')
          .fontSize(26)
          .font('Helvetica-Bold')
          .text('FICHE PROFIL', 0, headerHeight / 2 - 13, {
            width: pageWidth,
            align: 'center'
          });
        doc.fillColor('black');

        // Body positioning
        let y = headerHeight + 20;
        let textX = margin;
        let textWidth = innerWidth;
        const photoSize = 140;

        // Add photo if available
        if (profile.photo_path) {
          try {
            let imageBuffer;
            if (/^https?:\/\//.test(profile.photo_path)) {
              const res = await fetch(profile.photo_path);
              const arr = await res.arrayBuffer();
              imageBuffer = Buffer.from(arr);
            } else {
              // Always resolve the photo path relative to the project root
              const normalizedPath = profile.photo_path
                .split(/[/\\]+/)
                .join(path.sep)
                .replace(/^[/\\]+/, '');
              const imgPath = path.join(process.cwd(), normalizedPath);
              if (fs.existsSync(imgPath)) {
                imageBuffer = fs.readFileSync(imgPath);
              }
            }
            if (imageBuffer) {
              doc.image(imageBuffer, textX, y, {
                fit: [photoSize, photoSize],
                align: 'center',
                valign: 'center'
              });
              doc.rect(textX, y, photoSize, photoSize).stroke('#4F46E5');
              textX += photoSize + 20;
              textWidth -= photoSize + 20;
            }
          } catch (_) {
            // ignore image errors
          }
        }

        const addField = (label, value) => {
          if (!value) return;
          doc
            .fillColor('#111827')
            .font('Helvetica-Bold')
            .fontSize(12)
            .text(`${label}:`, textX, y, { continued: true });
          doc
            .fillColor('#374151')
            .font('Helvetica')
            .text(String(value), { width: textWidth });
          y = doc.y + 8;
        };

        addField('Nom', profile.last_name);
        addField('Prénom', profile.first_name);
        addField('Téléphone', profile.phone);
        addField('Email', profile.email);

        if (profile.extra_fields) {
          try {
            const extras = Array.isArray(profile.extra_fields)
              ? profile.extra_fields
              : JSON.parse(profile.extra_fields);
            extras.forEach(cat => {
              if (cat.title) {
                doc.moveDown(0.5).fillColor('#4F46E5').font('Helvetica-Bold').text(cat.title, textX, y);
                y = doc.y + 6;
              }
              (cat.fields || []).forEach(f => {
                addField(f.key, f.value);
              });
            });
          } catch (_) {
            // ignore parsing errors
          }
        }

        if (profile.comment) {
          doc.moveDown(0.5);
          doc
            .fillColor('#111827')
            .font('Helvetica-Bold')
            .fontSize(12)
            .text('Commentaire', textX, y);
          y = doc.y + 4;
          doc
            .fillColor('#374151')
            .font('Helvetica')
            .fontSize(12)
            .text(String(profile.comment), textX, y, { width: textWidth });
        }

        doc.end();
      });
    } catch (error) {
      return Buffer.from('PDF generation not available');
    }
  }
}

export default ProfileService;
