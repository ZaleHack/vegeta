import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';
let cachedKeyConfig = null;

function parseKey(hex, label) {
  if (!hex) {
    throw new Error(`${label} est requis pour le chiffrement des données`);
  }
  const normalizedHex = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalizedHex)) {
    throw new Error(`${label} doit être une chaîne hexadécimale`);
  }
  const keyBuffer = Buffer.from(normalizedHex, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error(`${label} doit représenter 32 octets (64 caractères hexadécimaux)`);
  }
  return keyBuffer;
}

function loadKeyConfig() {
  if (cachedKeyConfig) {
    return cachedKeyConfig;
  }
  const activeKeyHex = process.env.APP_DATA_KEY;
  const activeKey = parseKey(activeKeyHex, 'APP_DATA_KEY');
  const legacyKeys = [];
  const legacyEnv = process.env.APP_PREVIOUS_DATA_KEY;
  if (legacyEnv) {
    const candidates = legacyEnv
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    for (const candidate of candidates) {
      legacyKeys.push(parseKey(candidate, 'APP_PREVIOUS_DATA_KEY'));
    }
  }
  cachedKeyConfig = { activeKey, legacyKeys };
  return cachedKeyConfig;
}

function getKeyBuffer() {
  return loadKeyConfig().activeKey;
}

function getDecryptionKeyBuffers() {
  const { activeKey, legacyKeys } = loadKeyConfig();
  return [activeKey, ...legacyKeys];
}

function ensureString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return JSON.stringify(value);
}

export function encryptValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  const normalized = ensureString(value);
  if (normalized === null) {
    return normalized;
  }
  if (isEncryptedValue(normalized)) {
    return normalized;
  }
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  return `${ENCRYPTION_PREFIX}${payload}`;
}

export function decryptValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'string') {
    return value;
  }
  if (!isEncryptedValue(value)) {
    return value;
  }
  const payload = value.slice(ENCRYPTION_PREFIX.length);
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const keys = getDecryptionKeyBuffers();
  let lastError = null;
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      return plaintext;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Impossible de déchiffrer la valeur fournie');
}

export function isEncryptedValue(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return value.startsWith(ENCRYPTION_PREFIX);
}

export function rotateEncryption(value, options = {}) {
  if (value === null || value === undefined) {
    return value;
  }
  const { decryptFn = decryptValue, encryptFn = encryptValue } = options;
  if (!isEncryptedValue(value)) {
    return encryptFn(value);
  }
  const decrypted = decryptFn(value);
  return encryptFn(decrypted);
}

export function getEncryptionMetadata() {
  return {
    prefix: ENCRYPTION_PREFIX,
    keyLength: 32,
    algorithm: 'aes-256-gcm',
    legacyKeys: loadKeyConfig().legacyKeys.length
  };
}

