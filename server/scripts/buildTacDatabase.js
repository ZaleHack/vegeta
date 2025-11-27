import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const HISTORY_DIR = path.join(DATA_DIR, 'tac_history');
const OUTPUT_PATH = path.join(DATA_DIR, 'tac_db.json');
const MINIFIED_OUTPUT_PATH = path.join(DATA_DIR, 'tac_db_min.json');

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hydrate a minimal local fallback to guarantee a usable dataset
 * when remote sources are unavailable (offline execution, rate limits, etc.).
 */
const seedLocalFallbacks = () => [
  {
    tac: '35693803',
    brand: 'Apple',
    model: 'iPhone 14',
    deviceType: 'smartphone',
    generation: '14',
    os: 'iOS',
    releaseYear: 2022,
    radio: '4G/5G',
    manufacturer: 'Apple',
    notes: 'Fallback entry (Apple public TAC references)'
  },
  {
    tac: '35391510',
    brand: 'Samsung',
    model: 'Galaxy S23',
    deviceType: 'smartphone',
    generation: 'S23',
    os: 'Android',
    releaseYear: 2023,
    radio: '4G/5G',
    manufacturer: 'Samsung',
    notes: 'Fallback entry (Samsung public TAC references)'
  },
  {
    tac: '86064906',
    brand: 'Xiaomi',
    model: 'Redmi Note 12',
    deviceType: 'smartphone',
    generation: 'Note 12',
    os: 'Android',
    releaseYear: 2023,
    radio: '4G/5G',
    manufacturer: 'Xiaomi',
    notes: 'Fallback entry (Xiaomi public TAC references)'
  }
];

const ensureDirectories = async () => {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.mkdir(HISTORY_DIR, { recursive: true });
};

const normalizeTac = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const digits = String(value).replace(/\D/g, '').trim();
  return digits.length === 8 ? digits : '';
};

const normalizeEntry = (raw = {}, source = 'unknown') => {
  const tac = normalizeTac(raw.tac || raw.TAC || raw.id || raw.code || raw.prefix);

  if (!tac) return null;

  const brand = raw.brand || raw.vendor || raw.oem || raw.make || '';
  const model = raw.model || raw.device || raw.name || raw.marketingName || '';
  const deviceType = raw.deviceType || raw.type || raw.category || '';
  const os = raw.os || raw.platform || raw.software || '';
  const releaseYear = raw.releaseYear || raw.year || raw.launchYear || undefined;
  const radio = raw.radio || raw.rat || raw.network || raw.technology || '';
  const generation = raw.generation || raw.series || raw.family || '';
  const manufacturer = raw.manufacturer || raw.oem || brand || '';
  const notes = raw.notes || raw.description || `Source: ${source}`;

  return {
    tac,
    brand: String(brand).trim(),
    model: String(model).trim(),
    deviceType: String(deviceType).trim(),
    generation: String(generation).trim(),
    os: String(os).trim(),
    releaseYear: typeof releaseYear === 'string' || typeof releaseYear === 'number'
      ? Number(String(releaseYear).slice(0, 4))
      : undefined,
    radio: String(radio).trim(),
    manufacturer: String(manufacturer).trim(),
    notes: String(notes || '').trim()
  };
};

const fetchJson = async (url, options = {}, label = url) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(`⚠️ Impossible de récupérer ${label}:`, error.message || error);
    return null;
  }
};

const fetchTacDbNet = async () => {
  const url = 'https://tacdb.net/api/v1/tac';
  const data = await fetchJson(url, {}, 'tacdb.net');
  if (!data || !Array.isArray(data)) return [];
  return data.map((entry) => normalizeEntry(entry, 'tacdb.net')).filter(Boolean);
};

const fetchGsmaOpen = async () => {
  const url = 'https://imeidb.gsmaopen.com/api/tac';
  const data = await fetchJson(url, {}, 'imeidb.gsmaopen.com');
  if (!data || !Array.isArray(data)) return [];
  return data.map((entry) => normalizeEntry(entry, 'gsmaopen')).filter(Boolean);
};

const fetchGithubDumps = async () => {
  const datasets = [
    // Raw JSON dumps published by the community (GitHub/Internet)
    'https://raw.githubusercontent.com/marco-moretti/open-tac-database/master/tac.json',
    'https://raw.githubusercontent.com/curioswitch/gsma-imei-database/master/data/tac-db.json'
  ];

  const results = await Promise.all(
    datasets.map(async (url) => {
      const data = await fetchJson(url, {}, url);
      if (!data) return [];
      if (Array.isArray(data)) {
        return data.map((entry) => normalizeEntry(entry, url)).filter(Boolean);
      }
      if (typeof data === 'object') {
        return Object.entries(data)
          .map(([tac, value]) => normalizeEntry({ tac, ...(value || {}) }, url))
          .filter(Boolean);
      }
      return [];
    })
  );

  return results.flat();
};

const fetchVendorLists = async () => {
  // Public vendor TAC lists occasionally shared on support portals or knowledge bases
  const datasets = [
    'https://raw.githubusercontent.com/PhoneDB-dev/phone-databases/master/tac/apple.json',
    'https://raw.githubusercontent.com/PhoneDB-dev/phone-databases/master/tac/samsung.json',
    'https://raw.githubusercontent.com/PhoneDB-dev/phone-databases/master/tac/xiaomi.json'
  ];

  const results = await Promise.all(
    datasets.map(async (url) => {
      const data = await fetchJson(url, {}, url);
      if (!data) return [];
      if (Array.isArray(data)) {
        return data.map((entry) => normalizeEntry(entry, url)).filter(Boolean);
      }
      if (typeof data === 'object') {
        return Object.entries(data)
          .map(([tac, value]) => normalizeEntry({ tac, ...(value || {}) }, url))
          .filter(Boolean);
      }
      return [];
    })
  );

  return results.flat();
};

const chooseRicherEntry = (existing, incoming) => {
  if (!existing) return incoming;
  const richnessScore = (entry) =>
    ['brand', 'model', 'deviceType', 'generation', 'os', 'releaseYear', 'radio', 'manufacturer']
      .reduce((score, key) => (entry?.[key] ? score + 1 : score), 0);

  return richnessScore(incoming) >= richnessScore(existing) ? incoming : existing;
};

const mergeSources = (entries) => {
  const map = new Map();

  entries.forEach((entry) => {
    if (!entry?.tac) return;
    const normalizedTac = normalizeTac(entry.tac);
    if (!normalizedTac) return;
    map.set(normalizedTac, chooseRicherEntry(map.get(normalizedTac), entry));
  });

  return map;
};

const computeDiff = (previousMap, nextMap) => {
  const previous = new Set(previousMap ? previousMap.keys() : []);
  const added = [];

  for (const [tac, value] of nextMap.entries()) {
    if (!previous.has(tac)) {
      added.push({ tac, ...value });
    }
  }

  return added.sort((a, b) => a.tac.localeCompare(b.tac));
};

const loadExistingDatabase = async () => {
  try {
    const content = await fs.promises.readFile(OUTPUT_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    const entries = Object.entries(parsed).map(([tac, value]) => ({ tac, ...(value || {}) }));
    return mergeSources(entries);
  } catch (error) {
    return null;
  }
};

const writeDatabaseFiles = async (map) => {
  const orderedEntries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const fullPayload = orderedEntries.reduce((acc, [tac, value]) => {
    acc[tac] = {
      brand: value.brand || '',
      model: value.model || '',
      deviceType: value.deviceType || '',
      generation: value.generation || '',
      os: value.os || '',
      releaseYear: value.releaseYear || null,
      radio: value.radio || '',
      manufacturer: value.manufacturer || '',
      notes: value.notes || ''
    };
    return acc;
  }, {});

  const minifiedPayload = orderedEntries.reduce((acc, [tac, value]) => {
    acc[tac] = {
      brand: value.brand || '',
      model: value.model || '',
      releaseYear: value.releaseYear || null
    };
    return acc;
  }, {});

  await fs.promises.writeFile(OUTPUT_PATH, JSON.stringify(fullPayload, null, 2));
  await fs.promises.writeFile(MINIFIED_OUTPUT_PATH, JSON.stringify(minifiedPayload));
};

const archivePreviousVersion = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const historyPath = path.join(HISTORY_DIR, `tac_db_${timestamp}.json`);
    await fs.promises.copyFile(OUTPUT_PATH, historyPath);
    return historyPath;
  } catch (error) {
    return null;
  }
};

const persistDiff = async (diff) => {
  if (!diff.length) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diffPath = path.join(HISTORY_DIR, `tac_diff_${timestamp}.json`);
  await fs.promises.writeFile(diffPath, JSON.stringify(diff, null, 2));
  return diffPath;
};

const build = async () => {
  await ensureDirectories();
  const existingMap = await loadExistingDatabase();

  const sources = await Promise.all([
    fetchTacDbNet(),
    fetchGsmaOpen(),
    fetchGithubDumps(),
    fetchVendorLists()
  ]);

  const entries = sources.flat().filter(Boolean);
  if (entries.length === 0) {
    console.warn('⚠️ Aucune source récupérée, utilisation des valeurs de secours locales.');
    entries.push(...seedLocalFallbacks());
  }

  const merged = mergeSources(entries);
  const diff = computeDiff(existingMap, merged);

  if (existingMap && diff.length === 0) {
    console.log('✅ Aucun nouveau TAC détecté.');
  }

  if (existingMap) {
    await archivePreviousVersion();
  }

  await writeDatabaseFiles(merged);
  await persistDiff(diff);

  console.log(`✅ Base TAC mise à jour: ${merged.size} entrées enregistrées.`);
  if (diff.length) {
    console.log(`➕ ${diff.length} nouveaux TAC ajoutés.`);
  }
};

const scheduleWeeklyRefresh = () => {
  setInterval(async () => {
    try {
      await build();
    } catch (error) {
      console.error('❌ Erreur lors de la reconstruction hebdomadaire TAC:', error);
    }
  }, WEEK_IN_MS);
};

const run = async () => {
  await build();

  if (process.argv.includes('--watch') || process.argv.includes('--schedule')) {
    console.log('⏲️ Rafraîchissement automatique activé (hebdomadaire).');
    scheduleWeeklyRefresh();
  }
};

run().catch((error) => {
  console.error('❌ Erreur lors de la construction de la base TAC:', error);
  process.exit(1);
});
