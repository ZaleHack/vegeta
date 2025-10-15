import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG_PATH = path.join(__dirname, '../config/upload-databases.json');

const cloneRecord = (record) => ({
  ...record,
  tags: Array.isArray(record.tags) ? [...record.tags] : [],
  privacy: {
    level: record.privacy?.level ?? '',
    rules: record.privacy?.rules ?? ''
  }
});

export default class DatabaseCatalogService {
  constructor(configPath = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
    this.catalog = [];
    this.loaded = false;
    this.loadingPromise = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (!this.loaded) {
      if (!this.loadingPromise) {
        this.loadingPromise = this.reload();
      }
      await this.loadingPromise;
    }
    return this.catalog;
  }

  async reload() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        throw new Error('Database catalog file must contain an array');
      }
      this.catalog = parsed.map((record) => this.normalizeRecord(record));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.catalog = [];
        await this.persist();
      } else {
        console.error('Failed to load upload database catalog:', error);
        throw error;
      }
    }
    this.loaded = true;
    return this.catalog;
  }

  normalizeRecord(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('Invalid catalog entry');
    }
    if (!record.id || typeof record.id !== 'string') {
      throw new Error('Catalog entry missing id');
    }
    return {
      id: record.id,
      name: typeof record.name === 'string' ? record.name : record.id,
      description: typeof record.description === 'string' ? record.description : '',
      owner: record.owner ?? null,
      tags: Array.isArray(record.tags)
        ? record.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
        : [],
      enabled: record.enabled !== false,
      privacy: {
        level: typeof record.privacy?.level === 'string' ? record.privacy.level : '',
        rules: typeof record.privacy?.rules === 'string' ? record.privacy.rules : ''
      },
      updatedAt: record.updatedAt ?? null,
      updatedBy: record.updatedBy ?? null
    };
  }

  sanitizeForResponse(record) {
    const normalized = this.normalizeRecord(record);
    return cloneRecord(normalized);
  }

  async getAll() {
    await this.init();
    return this.catalog.map((record) => cloneRecord(record));
  }

  async getEnabled() {
    await this.init();
    return this.catalog
      .filter((record) => record.enabled !== false)
      .map((record) => cloneRecord(record));
  }

  async updateSource(id, updates = {}) {
    await this.init();
    const index = this.catalog.findIndex((record) => record.id === id);
    if (index === -1) {
      throw new Error('Source introuvable');
    }
    const current = this.catalog[index];
    const next = {
      ...current,
      description:
        typeof updates.description === 'string'
          ? updates.description
          : current.description,
      owner:
        updates.owner === null
          ? null
          : typeof updates.owner === 'string'
          ? updates.owner
          : current.owner ?? null,
      enabled:
        typeof updates.enabled === 'boolean'
          ? updates.enabled
          : current.enabled !== false,
      tags: Array.isArray(updates.tags)
        ? updates.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
        : current.tags,
      privacy: {
        level:
          typeof updates.privacy?.level === 'string'
            ? updates.privacy.level
            : current.privacy.level,
        rules:
          typeof updates.privacy?.rules === 'string'
            ? updates.privacy.rules
            : current.privacy.rules
      },
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
      updatedBy:
        updates.updatedBy === null
          ? null
          : updates.updatedBy !== undefined
          ? String(updates.updatedBy)
          : current.updatedBy ?? null
    };

    this.catalog[index] = next;
    await this.persist();
    return cloneRecord(next);
  }

  async persist() {
    const data = JSON.stringify(this.catalog, null, 2);
    this.writeQueue = this.writeQueue.then(() => fs.writeFile(this.configPath, `${data}\n`, 'utf-8'));
    await this.writeQueue;
  }
}
