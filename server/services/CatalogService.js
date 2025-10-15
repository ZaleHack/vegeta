import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CATALOG = {
  sources: []
};

export class CatalogService {
  constructor() {
    this.catalogPath = process.env.UPLOAD_CATALOG_PATH || path.join(__dirname, '../config/upload-catalog.json');
    this.cache = null;
    this.lastLoadedAt = 0;
  }

  async #readCatalogFromDisk() {
    try {
      const content = await fs.readFile(this.catalogPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sources)) {
        throw new Error('Catalogue invalide: format inattendu');
      }
      this.cache = parsed;
      this.lastLoadedAt = Date.now();
      return this.cache;
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.#persistCatalog(DEFAULT_CATALOG);
        this.cache = { ...DEFAULT_CATALOG };
        this.lastLoadedAt = Date.now();
        return this.cache;
      }
      throw error;
    }
  }

  async #persistCatalog(catalog) {
    const directory = path.dirname(this.catalogPath);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(this.catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
    this.cache = catalog;
    this.lastLoadedAt = Date.now();
    return catalog;
  }

  async getCatalog({ forceRefresh = false } = {}) {
    if (!forceRefresh && this.cache) {
      return this.cache;
    }
    return this.#readCatalogFromDisk();
  }

  async listSources({ includeInactive = false } = {}) {
    const catalog = await this.getCatalog();
    const sources = catalog.sources || [];
    if (includeInactive) {
      return sources.map((source) => ({ ...source }));
    }
    return sources.filter((source) => source.active !== false).map((source) => ({ ...source }));
  }

  async getSource(id) {
    if (!id) {
      throw new Error('Identifiant requis');
    }
    const catalog = await this.getCatalog();
    const source = catalog.sources?.find((entry) => entry.id === id) || null;
    return source ? { ...source } : null;
  }

  async upsertSource(entry) {
    if (!entry || !entry.id) {
      throw new Error('Impossible de créer la source : identifiant requis');
    }
    const catalog = await this.getCatalog();
    const existingIndex = catalog.sources.findIndex((source) => source.id === entry.id);
    const timestamp = new Date().toISOString();
    const normalizedEntry = {
      id: entry.id,
      name: entry.name ?? entry.id,
      description: entry.description ?? '',
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      confidentiality: entry.confidentiality ?? 'interne',
      owner: entry.owner ?? null,
      active: entry.active !== false,
      createdAt: entry.createdAt || timestamp,
      updatedAt: timestamp
    };

    if (existingIndex >= 0) {
      catalog.sources[existingIndex] = {
        ...catalog.sources[existingIndex],
        ...normalizedEntry,
        createdAt: catalog.sources[existingIndex].createdAt || normalizedEntry.createdAt,
        updatedAt: timestamp
      };
    } else {
      catalog.sources.push(normalizedEntry);
    }

    await this.#persistCatalog(catalog);
    return this.getSource(entry.id);
  }

  async setSourceActive(id, active) {
    const catalog = await this.getCatalog();
    const index = catalog.sources.findIndex((source) => source.id === id);
    if (index === -1) {
      throw new Error(`Source ${id} introuvable dans le catalogue`);
    }
    catalog.sources[index] = {
      ...catalog.sources[index],
      active,
      updatedAt: new Date().toISOString()
    };
    await this.#persistCatalog(catalog);
    return this.getSource(id);
  }

  async removeSource(id) {
    const catalog = await this.getCatalog();
    const nextSources = catalog.sources.filter((source) => source.id !== id);
    if (nextSources.length === catalog.sources.length) {
      throw new Error(`Source ${id} introuvable dans le catalogue`);
    }
    catalog.sources = nextSources;
    await this.#persistCatalog(catalog);
    return true;
  }
}

const catalogService = new CatalogService();
export default catalogService;
