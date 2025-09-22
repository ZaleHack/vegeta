import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PassThrough } from 'stream';
import Profile from '../models/Profile.js';
import ProfileAttachment from '../models/ProfileAttachment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProfileService {
  constructor() {
    this.photosDir = path.join(__dirname, '../../uploads/profiles');
    this.attachmentsDir = path.join(__dirname, '../../uploads/profile-attachments');
    [this.photosDir, this.attachmentsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  normalizeStoredPath(value) {
    return value ? value.replace(/\\/g, '/') : value;
  }

  resolveStoragePath(storedPath) {
    if (!storedPath) return null;
    const normalized = this.normalizeStoredPath(storedPath).replace(/^[/\\]+/, '');
    const parts = normalized.split(/[/\\]+/);
    return path.resolve(__dirname, '../../', parts.join(path.sep));
  }

  removeStoredFile(storedPath) {
    const absolute = this.resolveStoragePath(storedPath);
    if (!absolute) return;
    try {
      if (fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
      }
    } catch (_) {}
  }

  async withAttachments(profile) {
    if (!profile) return null;
    const attachments = await ProfileAttachment.findByProfileId(profile.id);
    return {
      ...profile,
      photo_path: this.normalizeStoredPath(profile.photo_path),
      attachments: attachments.map(att => ({
        ...att,
        file_path: this.normalizeStoredPath(att.file_path)
      }))
    };
  }

  async removeAttachments(profileId, attachmentIds) {
    if (!attachmentIds || attachmentIds.length === 0) return;
    const existing = await ProfileAttachment.findByProfileId(profileId);
    const ids = attachmentIds
      .map(id => parseInt(id, 10))
      .filter(id => Number.isInteger(id));
    if (ids.length === 0) return;
    const toDelete = existing.filter(att => ids.includes(att.id));
    if (toDelete.length === 0) return;
    await ProfileAttachment.deleteByIds(profileId, ids);
    toDelete.forEach(att => this.removeStoredFile(att.file_path));
  }

  async create(data, userId, files = {}) {
    const photoFile = Array.isArray(files.photo) ? files.photo[0] : null;
    const attachmentFiles = Array.isArray(files.attachments) ? files.attachments : [];
    const profileData = {
      user_id: userId,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      phone: data.phone || null,
      email: data.email || null,
      comment: data.comment ?? '',
      extra_fields: data.extra_fields || [],
      // Use POSIX-style paths for storage so that paths work across OSes
      photo_path: photoFile ? path.posix.join('uploads/profiles', photoFile.filename) : null
    };
    const created = await Profile.create(profileData);
    if (attachmentFiles.length) {
      await ProfileAttachment.createMany(
        created.id,
        attachmentFiles.map(file => ({
          file_path: path.posix.join('uploads/profile-attachments', file.filename),
          original_name: file.originalname
        }))
      );
    }
    const fresh = await Profile.findById(created.id);
    return this.withAttachments(fresh);
  }

  async update(id, data, user, files = {}) {
    const existing = await Profile.findById(id);
    if (!existing) throw new Error('Profil non trouvé');
    const isAdmin = user.admin === 1 || user.admin === '1' || user.admin === true;
    if (!isAdmin && existing.user_id !== user.id) {
      throw new Error('Accès refusé');
    }
    const photoFile = Array.isArray(files.photo) ? files.photo[0] : null;
    const attachmentFiles = Array.isArray(files.attachments) ? files.attachments : [];
    const removalIds = Array.isArray(data.remove_attachment_ids)
      ? data.remove_attachment_ids
      : [];
    let photoPath = this.normalizeStoredPath(existing.photo_path);
    if (photoFile) {
      if (photoPath) {
        this.removeStoredFile(photoPath);
      }
      photoPath = path.posix.join('uploads/profiles', photoFile.filename);
    } else if (data.remove_photo) {
      if (photoPath) {
        this.removeStoredFile(photoPath);
      }
      photoPath = null;
    }
    const updateData = {
      first_name: data.first_name ?? existing.first_name,
      last_name: data.last_name ?? existing.last_name,
      phone: data.phone ?? existing.phone,
      email: data.email ?? existing.email,
      comment: data.comment ?? existing.comment ?? '',
      extra_fields: data.extra_fields || JSON.parse(existing.extra_fields || '[]'),
      // Normalize existing paths to use forward slashes to avoid issues on different OSes
      photo_path: photoPath
    };
    await Profile.update(id, updateData);
    if (removalIds.length) {
      await this.removeAttachments(id, removalIds);
    }
    if (attachmentFiles.length) {
      await ProfileAttachment.createMany(
        id,
        attachmentFiles.map(file => ({
          file_path: path.posix.join('uploads/profile-attachments', file.filename),
          original_name: file.originalname
        }))
      );
    }
    return this.withAttachments(await Profile.findById(id));
  }

  async setArchiveStatus(id, archived, user) {
    const existing = await Profile.findById(id);
    if (!existing) throw new Error('Profil non trouvé');
    const isAdmin = user.admin === 1 || user.admin === '1' || user.admin === true;
    if (!isAdmin && existing.user_id !== user.id) {
      throw new Error('Accès refusé');
    }
    const updateData = {
      archived_at: archived ? new Date() : null
    };
    await Profile.update(id, updateData);
    return this.withAttachments(await Profile.findById(id));
  }

  async delete(id, user) {
    const existing = await Profile.findById(id);
    if (!existing) throw new Error('Profil non trouvé');
    if (existing.user_id !== user.id) {
      throw new Error('Accès refusé');
    }
    if (existing.photo_path) {
      this.removeStoredFile(existing.photo_path);
    }
    const attachments = await ProfileAttachment.findByProfileId(id);
    attachments.forEach(att => this.removeStoredFile(att.file_path));
    return Profile.delete(id);
  }

  async get(id, user) {
    const profile = await Profile.findById(id);
    if (!profile) return null;
    const isAdmin = user.admin === 1 || user.admin === '1' || user.admin === true;
    const userDivision =
      user.division_id !== undefined && user.division_id !== null
        ? Number(user.division_id)
        : null;
    const ownerDivision =
      profile.owner_division_id !== undefined && profile.owner_division_id !== null
        ? Number(profile.owner_division_id)
        : null;
    const sameDivision =
      userDivision !== null && ownerDivision !== null && userDivision === ownerDivision;
    if (!isAdmin && profile.user_id !== user.id && !sameDivision) return null;
    return this.withAttachments(profile);
  }

  async list(user, search, page = 1, limit = 10, includeArchived = false) {
    const offset = (page - 1) * limit;
    const isAdmin = user.admin === 1 || user.admin === '1' || user.admin === true;
    const divisionId =
      user.division_id !== undefined && user.division_id !== null
        ? Number(user.division_id)
        : null;
    const result = await Profile.findAccessible({
      userId: user.id,
      divisionId,
      isAdmin,
      includeArchived,
      search,
      limit,
      offset
    });
    const rows = result.rows.map(row => ({
      ...row,
      photo_path: this.normalizeStoredPath(row.photo_path)
    }));
    if (rows.length === 0) {
      return { rows, total: result.total };
    }
    const attachmentsMap = await ProfileAttachment.findByProfileIds(rows.map(row => row.id));
    const enriched = rows.map(row => ({
      ...row,
      attachments: (attachmentsMap[row.id] || []).map(att => ({
        ...att,
        file_path: this.normalizeStoredPath(att.file_path)
      }))
    }));
    return { rows: enriched, total: result.total };
  }

  async generatePDF(profile) {
    try {
      const { default: PDFDocument } = await import('pdfkit');
      const doc = new PDFDocument({ margin: 50 });
      const stream = new PassThrough();
      const chunks = [];
      doc.pipe(stream);

      return await new Promise(async (resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header block
        const pageWidth = doc.page.width;
        const headerHeight = 80;
        const margin = doc.page.margins.left;
        const innerWidth = pageWidth - margin * 2;

        const addSignature = () => {
          const { x, y } = doc;
          const size = doc._fontSize;
          const color = doc._fillColor;

          const signatureWidth = 100;
          const signatureX = pageWidth - margin - signatureWidth;
          const signatureY = doc.page.height - doc.page.margins.bottom - 40;

          doc
            .moveTo(signatureX, signatureY)
            .lineTo(pageWidth - margin, signatureY)
            .stroke('#E5E7EB');

          doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .fillColor('#4F46E5')
            .text('SORA', signatureX, signatureY + 6, {
              width: signatureWidth,
              align: 'right'
            });

          doc.fontSize(size).fillColor(color);
          doc.x = x;
          doc.y = y;
        };
        addSignature();
        doc.on('pageAdded', addSignature);

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
        let y = headerHeight + 30;
        const photoSize = 140;

        // Add photo centered below the header
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
              const imgPath = path.resolve(__dirname, '../../', normalizedPath);
              if (fs.existsSync(imgPath)) {
                imageBuffer = fs.readFileSync(imgPath);
              }
            }
            if (imageBuffer) {
              const photoX = (pageWidth - photoSize) / 2;
              doc.image(imageBuffer, photoX, y, {
                fit: [photoSize, photoSize],
                align: 'center',
                valign: 'center'
              });
              doc.rect(photoX, y, photoSize, photoSize).stroke('#4F46E5');
              y += photoSize + 30;
            }
          } catch (_) {
            // ignore image errors
          }
        }

        // Separator line for a cleaner layout
        doc
          .moveTo(margin, y)
          .lineTo(pageWidth - margin, y)
          .stroke('#E5E7EB');
        y += 20;

        let textX = margin;
        let textWidth = innerWidth;

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
                doc
                  .moveDown(0.5)
                  .fillColor('#4F46E5')
                  .font('Helvetica-Bold')
                  .fontSize(14)
                  .text(cat.title, textX, y);
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
