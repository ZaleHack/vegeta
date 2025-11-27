import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.resolve(__dirname, '../data/tac_db.json');
const CACHE_REFRESH_DEBOUNCE_MS = 500;

let cache = new Map();
let brandIndex = new Map();
let lastMtimeMs = null;
let debounceHandle = null;
let searchable = [];
let watchInitialized = false;

const normalizeTac = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const digits = String(value).replace(/\D/g, '').trim();
  return digits.length === 8 ? digits : '';
};

const loadDatabase = () => {
  try {
    const stat = fs.statSync(DATA_PATH);
    if (lastMtimeMs && stat.mtimeMs === lastMtimeMs) {
      return;
    }

    const content = fs.readFileSync(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(content || '{}');

    cache = new Map(
      Object.entries(parsed).map(([tac, value]) => [normalizeTac(tac), { ...(value || {}) }])
    );

    brandIndex = new Map();
    searchable = [];

    for (const [tac, value] of cache.entries()) {
      const brandKey = (value.brand || '').toLowerCase();
      if (!brandIndex.has(brandKey)) {
        brandIndex.set(brandKey, []);
      }
      brandIndex.get(brandKey).push({ tac, ...value });

      searchable.push({
        tac,
        brand: value.brand || '',
        model: value.model || '',
        releaseYear: value.releaseYear || null,
        brandLower: (value.brand || '').toLowerCase(),
        modelLower: (value.model || '').toLowerCase()
      });
    }

    lastMtimeMs = stat.mtimeMs;
    console.log(`🔄 TAC DB chargé (${cache.size} entrées)`);
  } catch (error) {
    console.warn('⚠️ Impossible de charger la base TAC locale:', error.message || error);
    cache = new Map();
    brandIndex = new Map();
    searchable = [];
  }
};

const scheduleReloadOnChange = () => {
  if (watchInitialized) return;
  watchInitialized = true;
  try {
    fs.watch(path.dirname(DATA_PATH), (eventType, filename) => {
      if (!filename || !filename.includes('tac_db.json')) return;
      if (debounceHandle) {
        clearTimeout(debounceHandle);
      }
      debounceHandle = setTimeout(() => {
        debounceHandle = null;
        loadDatabase();
      }, CACHE_REFRESH_DEBOUNCE_MS);
    });
  } catch (error) {
    console.warn('⚠️ Impossible de surveiller les changements de tac_db.json:', error.message || error);
  }
};

const ensureLoaded = () => {
  if (!cache.size) {
    loadDatabase();
    scheduleReloadOnChange();
  }
};

const normalizedIncludes = (haystack, needle) => haystack.includes(needle);

const levenshteinDistance = (a, b) => {
  const matrix = Array.from({ length: b.length + 1 }, () => new Array(a.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + substitutionCost
      );
    }
  }

  return matrix[b.length][a.length];
};

const computeSimilarityScore = (query, candidate) => {
  if (!query || !candidate) return 0;
  if (normalizedIncludes(candidate, query)) return 1;
  const distance = levenshteinDistance(query, candidate);
  const maxLen = Math.max(query.length, candidate.length) || 1;
  return 1 - distance / maxLen;
};

export const getTacInfo = (tac) => {
  const normalized = normalizeTac(tac);
  ensureLoaded();
  return normalized ? cache.get(normalized) || null : null;
};

export const searchByBrand = (brand) => {
  ensureLoaded();
  if (!brand) return [];
  const key = String(brand).toLowerCase();
  return brandIndex.get(key) || [];
};

export const searchByModel = (model) => {
  ensureLoaded();
  if (!model) return [];
  const query = String(model).toLowerCase().trim();
  const scored = searchable
    .map((item) => ({
      item,
      score: Math.max(
        computeSimilarityScore(query, item.modelLower),
        computeSimilarityScore(query, item.brandLower)
      )
    }))
    .filter(({ score }) => score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);

  return scored.map(({ item }) => item);
};

export default {
  getTacInfo,
  searchByBrand,
  searchByModel
};
