import database from '../config/database.js';

class ProfileAttachment {
  static async createMany(profileId, attachments) {
    if (!attachments || attachments.length === 0) {
      return [];
    }
    const values = attachments.map(att => [profileId, att.file_path, att.original_name || null]);
    const placeholders = values.map(() => '(?, ?, ?)').join(', ');
    await database.query(
      `INSERT INTO autres.profile_attachments (profile_id, file_path, original_name) VALUES ${placeholders}`,
      values.flat()
    );
    return this.findByProfileId(profileId);
  }

  static async findByProfileId(profileId) {
    const rows = await database.query(
      'SELECT * FROM autres.profile_attachments WHERE profile_id = ? ORDER BY created_at DESC',
      [profileId]
    );
    return rows.map(row => ({ ...row, file_path: row.file_path ? row.file_path.replace(/\\/g, '/') : row.file_path }));
  }

  static async findByProfileIds(profileIds) {
    if (!profileIds || profileIds.length === 0) {
      return {};
    }
    const placeholders = profileIds.map(() => '?').join(', ');
    const rows = await database.query(
      `SELECT * FROM autres.profile_attachments WHERE profile_id IN (${placeholders}) ORDER BY created_at DESC`,
      profileIds
    );
    return rows.reduce((acc, row) => {
      const normalized = { ...row, file_path: row.file_path ? row.file_path.replace(/\\/g, '/') : row.file_path };
      if (!acc[normalized.profile_id]) {
        acc[normalized.profile_id] = [];
      }
      acc[normalized.profile_id].push(normalized);
      return acc;
    }, {});
  }

  static async deleteByIds(profileId, ids) {
    if (!ids || ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => '?').join(', ');
    await database.query(
      `DELETE FROM autres.profile_attachments WHERE profile_id = ? AND id IN (${placeholders})`,
      [profileId, ...ids]
    );
  }
}

export default ProfileAttachment;
