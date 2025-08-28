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
    if (user.admin !== 1 && existing.user_id !== user.id) {
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
    if (user.admin !== 1 && existing.user_id !== user.id) {
      throw new Error('Accès refusé');
    }
    return Profile.delete(id);
  }

  async get(id, user) {
    const profile = await Profile.findById(id);
    if (!profile) return null;
    if (user.admin !== 1 && profile.user_id !== user.id) return null;
    return profile;
  }

  async list(user, search, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    if (search) {
      return Profile.searchByNameOrPhone(search, user.id, user.admin === 1, limit, offset);
    }
    return Profile.findAll(user.admin === 1 ? null : user.id, limit, offset);
  }

  async generatePDF(profile) {
    try {
      const { default: PDFDocument } = await import('pdfkit');
      const doc = new PDFDocument();
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});

      doc.fontSize(18).text('Fiche de Profil', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Nom: ${profile.first_name || ''} ${profile.last_name || ''}`);
      doc.text(`Téléphone: ${profile.phone || ''}`);
      doc.text(`Email: ${profile.email || ''}`);
      if (profile.comment) {
        doc.text(`Commentaire: ${profile.comment}`);
      }
      if (profile.extra_fields) {
        try {
          const extras = JSON.parse(profile.extra_fields);
          extras.forEach(cat => {
            if (cat.title) doc.text(cat.title);
            cat.fields.forEach(f => {
              doc.text(`${f.key}: ${f.value}`);
            });
          });
        } catch (_) {}
      }
      doc.end();
      return Buffer.concat(chunks);
    } catch (error) {
      return Buffer.from('PDF generation not available');
    }
  }
}

export default ProfileService;
