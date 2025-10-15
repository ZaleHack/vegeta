import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PassThrough } from 'stream';
import Profile from '../models/Profile.js';
import ProfileAttachment from '../models/ProfileAttachment.js';
import ProfileShare from '../models/ProfileShare.js';
import Division from '../models/Division.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import ElasticSearchService from './ElasticSearchService.js';
import { isElasticsearchEnabled } from '../config/environment.js';

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
    this.useElastic = isElasticsearchEnabled();
    this.elasticService = this.useElastic ? new ElasticSearchService() : null;
  }

  async syncProfileToSearch(profile) {
    if (!this.elasticService || !profile) {
      return;
    }

    try {
      await this.elasticService.indexProfile(profile);
    } catch (error) {
      console.error('Erreur indexation profil Elasticsearch:', error);
    }
  }

  async removeProfileFromSearch(profileId) {
    if (!this.elasticService || !profileId) {
      return;
    }

    try {
      await this.elasticService.deleteProfile(profileId);
    } catch (error) {
      console.error('Erreur suppression index Elasticsearch pour le profil:', error);
    }
  }

  _isAdmin(user) {
    return user && (user.admin === 1 || user.admin === '1' || user.admin === true);
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
    await this.syncProfileToSearch(fresh);
    return this.withAttachments(fresh);
  }

  async update(id, data, user, files = {}) {
    const existing = await Profile.findById(id);
    if (!existing) throw new Error('Profil non trouvé');
    const isAdmin = this._isAdmin(user);
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
    const toArray = (candidate) => (Array.isArray(candidate) ? candidate : [candidate]);
    const normalizeExtraFields = (value) => {
      if (value === null || value === undefined || value === '') {
        return [];
      }
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return toArray(parsed);
        } catch (_) {
          return [value];
        }
      }
      return toArray(value);
    };

    const extraFields =
      data.extra_fields !== undefined
        ? normalizeExtraFields(data.extra_fields)
        : normalizeExtraFields(existing.extra_fields);

    const updateData = {
      first_name: data.first_name ?? existing.first_name,
      last_name: data.last_name ?? existing.last_name,
      phone: data.phone ?? existing.phone,
      email: data.email ?? existing.email,
      comment: data.comment ?? existing.comment ?? '',
      extra_fields: extraFields,
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
    const updated = await Profile.findById(id);
    await this.syncProfileToSearch(updated);
    return this.withAttachments(updated);
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
    await Profile.delete(id);
    await this.removeProfileFromSearch(id);
    return true;
  }

  async get(id, user) {
    const profile = await Profile.findById(id);
    if (!profile) return null;
    const isAdmin = this._isAdmin(user);
    if (!isAdmin && profile.user_id !== user.id) {
      const shared = await ProfileShare.isSharedWithUser(profile.id, user.id);
      if (!shared) {
        return null;
      }
    }
    return this.withAttachments(profile);
  }

  async list(user, search, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const isAdmin = this._isAdmin(user);
    const divisionId =
      user.division_id !== undefined && user.division_id !== null
        ? Number(user.division_id)
        : null;
    const result = await Profile.findAccessible({
      userId: user.id,
      divisionId,
      isAdmin,
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
    const shareMap = await ProfileShare.getSharesForProfiles(rows.map(row => row.id));
    const enriched = rows.map(row => {
      const attachments = (attachmentsMap[row.id] || []).map(att => ({
        ...att,
        file_path: this.normalizeStoredPath(att.file_path)
      }));
      const sharedUserIds = shareMap.get(row.id) || [];
      const isOwner = row.user_id === user.id;
      const sharedWithMe = !isOwner && sharedUserIds.includes(user.id);
      return {
        ...row,
        attachments,
        is_owner: isOwner,
        shared_with_me: sharedWithMe,
        shared_user_ids: isAdmin || isOwner ? sharedUserIds : undefined
      };
    });
    return { rows: enriched, total: result.total };
  }

  async getShareInfo(profileId, user) {
    const profile = await Profile.findById(profileId);
    if (!profile) {
      throw new Error('Profil non trouvé');
    }

    const isOwner = profile.user_id === user.id;
    const isAdmin = this._isAdmin(user);

    if (!isOwner && !isAdmin) {
      throw new Error('Accès refusé');
    }

    const owner = await User.findById(profile.user_id);
    const divisionId = owner?.division_id || null;
    const divisionUsers = divisionId
      ? await Division.findUsers(divisionId, { includeInactive: false })
      : [];
    const recipients = await ProfileShare.getUserIds(profileId);

    return {
      divisionId,
      owner: { id: owner?.id, login: owner?.login },
      recipients,
      users: divisionUsers
    };
  }

  async shareProfile(profileId, user, { userIds = [], shareAll = false } = {}) {
    const profile = await Profile.findById(profileId);
    if (!profile) {
      throw new Error('Profil non trouvé');
    }

    const isOwner = profile.user_id === user.id;
    const isAdmin = this._isAdmin(user);

    if (!isOwner && !isAdmin) {
      throw new Error('Accès refusé');
    }

    const owner = await User.findById(profile.user_id);
    const divisionId = owner?.division_id;

    if (!divisionId) {
      throw new Error('Division introuvable pour le propriétaire');
    }

    const divisionUsers = await Division.findUsers(divisionId, { includeInactive: false });
    const allowedIds = divisionUsers
      .filter(member => member.id !== owner?.id)
      .map(member => member.id);

    const targetIds = shareAll
      ? allowedIds
      : Array.isArray(userIds)
        ? userIds
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0 && allowedIds.includes(id))
        : [];

    const { added, removed } = await ProfileShare.replaceShares(profileId, targetIds);

    if (added.length > 0) {
      const ownerLogin = owner?.login || '';
      const profileName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      const displayName = profileName || profile.email || profile.phone || `Profil #${profileId}`;

      for (const addedId of added) {
        const data = {
          profileId,
          profileName: displayName,
          owner: ownerLogin,
          divisionId
        };
        try {
          await Notification.create({ user_id: addedId, type: 'profile_shared', data });
        } catch (error) {
          console.error('Erreur création notification partage profil:', error);
        }
      }
    }

    return {
      added,
      removed,
      recipients: targetIds
    };
  }

  async generatePDF(profile) {
    try {
      const { default: PDFDocument } = await import('pdfkit');
      // Compression triggers a stack overflow with pdfkit on Node 22, so we disable it.
      const doc = new PDFDocument({ margin: 50, compress: false, autoFirstPage: false });
      const exportDateLabel = new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date());
      const stream = new PassThrough();
      const chunks = [];
      doc.pipe(stream);

      return await new Promise(async (resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const accentColor = '#1D4ED8';
        const accentDark = '#1E3A8A';
        const accentSoft = '#DBEAFE';
        const borderColor = '#BFDBFE';
        const textPrimary = '#0F172A';
        const textSecondary = '#1F2937';

        const addSignature = () => {
          doc.save();

          const signatureWidth = 120;
          const signatureX = doc.page.width - doc.page.margins.right - signatureWidth;
          const signatureY = doc.page.height - doc.page.margins.bottom - 42;

          doc
            .moveTo(signatureX, signatureY)
            .lineTo(signatureX + signatureWidth, signatureY)
            .lineWidth(1)
            .stroke(borderColor);

          doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .fillColor(accentDark)
            .text('SORA', signatureX, signatureY + 6, {
              width: signatureWidth,
              align: 'right'
            });

          doc.restore();
        };

        doc.on('pageAdded', addSignature);
        doc.addPage();

        // Header block
        const pageWidth = doc.page.width;
        const headerHeight = 80;
        const margin = doc.page.margins.left;
        const innerWidth = pageWidth - margin * 2;

        doc.rect(0, 0, pageWidth, headerHeight).fill(accentColor);
        doc
          .fillColor('white')
          .fontSize(26)
          .font('Helvetica-Bold')
          .text('FICHE PROFIL', 0, headerHeight / 2 - 16, {
            width: pageWidth,
            align: 'center'
          });
        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor('#E0ECFF')
          .text(`Exporté le ${exportDateLabel}`, 0, headerHeight / 2 + 10, {
            width: pageWidth,
            align: 'center'
          });
        doc.fillColor(textPrimary);

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
              doc
                .lineWidth(1.5)
                .roundedRect(photoX - 4, y - 4, photoSize + 8, photoSize + 8, 12)
                .stroke(borderColor);
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
          .lineWidth(1)
          .stroke(borderColor);
        y += 24;

        const sectionPadding = 18;
        let textX = margin + sectionPadding;
        let textWidth = innerWidth - sectionPadding * 2;

        const drawSectionHeader = (title) => {
          const headerTitle = title ? String(title) : 'Informations';
          doc.save();
          doc.lineWidth(1);
          doc.fillColor(accentSoft);
          doc.strokeColor(borderColor);
          const headerHeightBox = 32;
          doc.roundedRect(margin, y, innerWidth, headerHeightBox, 12).fillAndStroke();
          doc
            .fillColor(accentDark)
            .font('Helvetica-Bold')
            .fontSize(12)
            .text(headerTitle.toUpperCase(), margin + 16, y + 10);
          doc.restore();
          y += headerHeightBox + 14;
        };

        const addField = (label, value) => {
          if (!value && value !== 0) return;
          const safeLabel = label ? String(label) : '';
          doc
            .fillColor(accentDark)
            .font('Helvetica-Bold')
            .fontSize(9)
            .text(safeLabel.toUpperCase(), textX, y);
          y = doc.y + 3;
          doc
            .fillColor(textSecondary)
            .font('Helvetica')
            .fontSize(12)
            .text(String(value), textX, y, { width: textWidth });
          y = doc.y + 12;
        };

        const displayName = [profile.first_name, profile.last_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        const fallbackName =
          displayName || profile.email || profile.phone || (profile.id ? `Profil #${profile.id}` : 'Profil');

        drawSectionHeader('Informations principales');
        addField('Nom complet', displayName || fallbackName);
        addField('Email', profile.email);
        addField('Téléphone', profile.phone);

        const parseExtraFields = () => {
          if (!profile.extra_fields) {
            return [];
          }
          try {
            const extras = Array.isArray(profile.extra_fields)
              ? profile.extra_fields
              : JSON.parse(profile.extra_fields);
            return extras
              .map(cat => {
                const rawFields = Array.isArray(cat?.fields) ? cat.fields : [];
                const filteredFields = rawFields.filter(field => {
                  const value = field?.value;
                  return value || value === 0;
                });

                if (filteredFields.length === 0) {
                  return null;
                }

                const title = cat && typeof cat.title === 'string' && cat.title.trim()
                  ? cat.title.trim()
                  : 'Informations supplémentaires';

                return {
                  title,
                  fields: filteredFields
                };
              })
              .filter(Boolean);
          } catch (_) {
            return [];
          }
        };

        const extraCategories = parseExtraFields();

        extraCategories.forEach(category => {
          drawSectionHeader(category.title);
          category.fields.forEach(field => addField(field.key, field.value));
        });

        if (profile.comment && String(profile.comment).trim()) {
          drawSectionHeader('Commentaire');
          doc
            .fillColor(textSecondary)
            .font('Helvetica')
            .fontSize(12)
            .text(String(profile.comment), textX, y, { width: textWidth });
          y = doc.y + 12;
        }

        doc.end();
      });
    } catch (error) {
      return Buffer.from('PDF generation not available');
    }
  }
}

export default ProfileService;
