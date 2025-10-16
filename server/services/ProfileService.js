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
import statsCache from './stats-cache.js';

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
    statsCache.clear('overview:');
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
    statsCache.clear('overview:');
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
    const stream = new PassThrough();
    const chunks = [];
    doc.pipe(stream);

    return await new Promise(async (resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const palette = {
        heading: '#0F172A',
        text: '#1F2937',
        muted: '#6B7280',
        accent: '#1D4ED8',
        divider: '#E5E7EB',
        photoBackground: '#EFF6FF',
        headerBackground: '#1D4ED8',
        headerText: '#FFFFFF',
        headerMuted: '#DBEAFE'
      };

      const formatDateTime = value => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        try {
          return new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'long',
            timeStyle: 'short'
        }).format(date);
        } catch (_) {
          return date.toLocaleString('fr-FR');
        }
      };

      const formatDate = value => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        try {
          return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date);
        } catch (_) {
          return date.toLocaleDateString('fr-FR');
        }
      };

      const formatFieldValue = value => {
        if (value === null || value === undefined) {
          return '';
        }
        if (value instanceof Date) {
          return formatDateTime(value) || '';
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        if (typeof value === 'string') {
          const normalized = value.replace(/\\r\\n/g, '\\n');
          const lines = normalized.split('\\n').map(line => line.trimEnd());
          return lines.join('\\n').trim();
        }
        if (Array.isArray(value)) {
          return value
            .map(item => formatFieldValue(item))
            .filter(Boolean)
            .join('\\n');
        }
        if (typeof value === 'object') {
          const entries = Object.entries(value)
            .map(([key, val]) => {
              const formatted = formatFieldValue(val);
              if (!formatted) return null;
              return key ? `${key}: ${formatted}` : formatted;
            })
            .filter(Boolean);
          if (entries.length) {
            return entries.join('\\n');
          }
          try {
            return JSON.stringify(value);
          } catch (_) {
            return '';
          }
        }
        return String(value);
      };

      const loadPhotoBuffer = async () => {
        if (!profile.photo_path) return null;
        try {
          if (/^https?:\/\//.test(profile.photo_path)) {
            const res = await fetch(profile.photo_path);
            const arr = await res.arrayBuffer();
            return Buffer.from(arr);
          }

          const normalizedPath = profile.photo_path
            .split(/[\\/]+/)
            .join(path.sep)
            .replace(/^[/\\]+/, '');
          const imgPath = path.resolve(__dirname, '../../', normalizedPath);
          if (fs.existsSync(imgPath)) {
            return fs.readFileSync(imgPath);
          }
        } catch (_) {
          // ignore image errors
        }
        return null;
      };

      const photoBuffer = await loadPhotoBuffer();
      const exportDate = formatDate(new Date());

      const defaultMargins = (() => {
        const { margins, margin: marginOption } = doc.options;
        if (margins && typeof margins === 'object') {
          return {
            top: margins.top ?? 0,
            right: margins.right ?? 0,
            bottom: margins.bottom ?? 0,
            left: margins.left ?? 0
          };
        }
        if (typeof marginOption === 'number') {
          return { top: marginOption, right: marginOption, bottom: marginOption, left: marginOption };
        }
        return { top: 0, right: 0, bottom: 0, left: 0 };
      })();

      const currentPage = () => doc.page ?? { margins: defaultMargins, width: 0, height: 0 };
      const marginLeft = () => currentPage().margins?.left ?? defaultMargins.left ?? 0;
      const marginTop = () => currentPage().margins?.top ?? defaultMargins.top ?? 0;
      const pageWidth = () => (currentPage().width && currentPage().width > 0 ? currentPage().width : doc.page?.width ?? 0);
      const pageHeight = () => (currentPage().height && currentPage().height > 0 ? currentPage().height : doc.page?.height ?? 0);
      const marginRight = () => currentPage().margins?.right ?? defaultMargins.right ?? 0;
      const marginBottom = () => currentPage().margins?.bottom ?? defaultMargins.bottom ?? 0;
      const contentWidth = () => {
        const width = pageWidth();
        if (!width) {
          return 0;
        }
        return width - marginLeft() - marginRight();
      };

      const signatureAreaHeight = 70;

      const ensureSignatureMargins = () => {
        if (!doc.page) {
          return;
        }

        const desiredBottom = Math.max(
          signatureAreaHeight,
          defaultMargins.bottom ?? signatureAreaHeight
        );

        const margins = doc.page.margins ?? {};
        if (!margins.bottom || margins.bottom < desiredBottom) {
          doc.page.margins = {
            ...margins,
            bottom: desiredBottom
          };

          if (doc.page.height) {
            doc.page.maxY = doc.page.height - desiredBottom;
          }
        }
      };

      const addSignature = () => {
        if (!doc.page) {
          return;
        }

        ensureSignatureMargins();

        const previousX = doc.x;
        const previousY = doc.y;

        doc.save();

        const signatureText = 'Sora';
        const fontSize = 12;

        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(palette.accent);

        const textWidth = doc.widthOfString(signatureText);
        const signatureX = pageWidth() - marginRight() - textWidth;
        const marginBottomValue = marginBottom();
        const signatureBaseY = pageHeight() - marginBottomValue;
        const offsetInsideMargin = Math.max(12, Math.min(24, marginBottomValue / 2));
        const signatureY = Math.min(
          pageHeight() - fontSize - 8,
          signatureBaseY + offsetInsideMargin
        );

        doc.text(signatureText, signatureX, signatureY);

        doc.restore();

        doc.x = previousX;
        doc.y = previousY;
      };

      const renderMainHeader = () => {
        const width = contentWidth();
        const startX = marginLeft();
        const startY = marginTop();
        const headerHeight = 96;

        doc.save();
        doc
          .rect(startX, startY, width, headerHeight)
          .fill(palette.headerBackground);
        doc.restore();

        const titleY = startY + 26;

        doc
          .font('Helvetica-Bold')
          .fontSize(26)
          .fillColor(palette.headerText)
          .text('FICHE DE PROFIL', startX, titleY, {
            width,
            align: 'center'
          });

        if (exportDate) {
          const dateY = titleY + 36;
          doc
            .font('Helvetica')
            .fontSize(12)
            .fillColor(palette.headerMuted)
            .text(`Exporté le ${exportDate}`, startX, dateY, {
              width,
              align: 'center'
            });
        }

        doc.y = startY + headerHeight + 24;
      };

      const renderContinuationHeader = () => {
        const width = contentWidth();
        doc
          .font('Helvetica-Bold')
          .fontSize(16)
          .fillColor(palette.heading)
          .text('Fiche de profil', marginLeft(), marginTop(), {
            width,
            align: 'left'
          });
        doc.moveDown(0.6);
      };

      const renderPhoto = () => {
        if (!photoBuffer) {
          return;
        }

        const width = pageWidth();
        const size = 150;
        const x = (width - size) / 2;
        const y = doc.y;

        doc.save();
        doc.image(photoBuffer, x, y, {
          fit: [size, size],
          align: 'center',
          valign: 'center'
        });
        doc.restore();

        doc.y = y + size + 24;
      };

      let pageNumber = 0;
      doc.on('pageAdded', () => {
        pageNumber += 1;

        ensureSignatureMargins();

        if (pageNumber === 1) {
          renderMainHeader();
          renderPhoto();
        } else {
          renderContinuationHeader();
        }

        addSignature();
      });

      doc.addPage();

      const parseExtraSections = () => {
        if (!profile.extra_fields) {
          return [];
        }

        try {
          const extras = Array.isArray(profile.extra_fields)
            ? profile.extra_fields
            : JSON.parse(profile.extra_fields);

          return extras
            .map(category => {
              const rawFields = Array.isArray(category?.fields) ? category.fields : [];
              const filteredFields = rawFields
                .map(field => ({
                  label: field?.label || field?.key,
                  value: field?.value
                }))
                .filter(entry => formatFieldValue(entry.value));

              if (!filteredFields.length) {
                return null;
              }

              const title =
                category && typeof category.title === 'string' && category.title.trim()
                  ? category.title.trim()
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

      const attachments = Array.isArray(profile.attachments) ? profile.attachments : [];
      const attachmentSection = attachments.length
        ? [{
            label: 'Pièces jointes',
            value: attachments
              .map((file, index) => {
                const displayName = String(
                  file?.original_name ||
                    (file?.file_path ? path.basename(file.file_path) : `Pièce jointe ${index + 1}`)
                ).trim();
                const addedAt = formatDateTime(file?.created_at);
                return addedAt ? `• ${displayName} (ajouté le ${addedAt})` : `• ${displayName}`;
              })
              .join('\n')
          }]
        : [];

      const sections = [];
      const extraSections = parseExtraSections();
      sections.push(...extraSections);
      if (attachmentSection.length) {
        sections.push({ title: 'Documents', fields: attachmentSection });
      }

      const renderSection = section => {
        if (!section || !Array.isArray(section.fields)) {
          return;
        }

        const visibleFields = section.fields
          .map(field => ({
            label: field?.label || 'Information',
            value: formatFieldValue(field?.value)
          }))
          .filter(field => field.value);

        if (!visibleFields.length) {
          return;
        }

        const width = contentWidth();

        doc.moveDown(visibleFields.length ? 0.8 : 0.4);
        doc
          .font('Helvetica-Bold')
          .fontSize(14)
          .fillColor(palette.accent)
          .text(section.title, marginLeft(), doc.y, { width });

        doc.moveDown(0.2);
        doc
          .lineWidth(1)
          .strokeColor(palette.divider)
          .moveTo(marginLeft(), doc.y)
          .lineTo(marginLeft() + width, doc.y)
          .stroke();
        doc.moveDown(0.6);

        visibleFields.forEach((field, index) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(palette.heading)
            .text(`${field.label} : `, marginLeft(), doc.y, {
              width,
              continued: true
            });
          doc
            .font('Helvetica')
            .fontSize(11)
            .fillColor(palette.text)
            .text(field.value, {
              width,
              align: 'left'
            });

          if (index < visibleFields.length - 1) {
            doc.moveDown(0.3);
          }
        });
      };

      sections.forEach(section => {
        renderSection(section);
      });

      doc.moveDown(1.2);

      doc.end();
    });
  } catch (error) {
    console.error('Erreur génération PDF profil:', error);
    throw new Error('Impossible de générer le PDF du profil');
  }
}


}

export default ProfileService;
