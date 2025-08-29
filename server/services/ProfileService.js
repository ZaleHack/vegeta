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
      photo_path: file ? path.join('uploads/profiles', file.filename) : null
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
      photo_path: file ? path.join('uploads/profiles', file.filename) : existing.photo_path
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

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('FICHE PROFIL', {
          align: 'center'
        });
        doc.moveDown();

        const startY = doc.y;
        const imageWidth = 120;
        const textStartX = doc.page.margins.left;
        let textWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        // Add photo if available
        if (profile.photo_path) {
          try {
            let imageBuffer;
            if (/^https?:\/\//.test(profile.photo_path)) {
              const res = await fetch(profile.photo_path);
              const arr = await res.arrayBuffer();
              imageBuffer = Buffer.from(arr);
            } else {
              const imgPath = path.join(__dirname, '../../', profile.photo_path);
              if (fs.existsSync(imgPath)) {
                imageBuffer = fs.readFileSync(imgPath);
              }
            }
            if (imageBuffer) {
              const x = doc.page.width - doc.page.margins.right - imageWidth;
              doc.image(imageBuffer, x, startY, { width: imageWidth, height: imageWidth, fit: [imageWidth, imageWidth] });
              textWidth -= imageWidth + 20; // leave space for image
            }
          } catch (_) {
            // ignore image errors
          }
        }

        let y = startY;
        const addField = (label, value) => {
          if (value === undefined || value === null || value === '') return;
          doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .text(`${label}: `, textStartX, y, {
              continued: true,
              width: textWidth
            })
            .font('Helvetica')
            .text(String(value), { width: textWidth });
          y = doc.y;
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
                doc.moveDown(0.5);
                doc.font('Helvetica-Bold').text(cat.title, textStartX, y, { width: textWidth });
                y = doc.y;
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
          addField('Commentaire', profile.comment);
        }

        doc.end();
      });
    } catch (error) {
      return Buffer.from('PDF generation not available');
    }
  }
}

export default ProfileService;
