import express from 'express';
import crypto from 'crypto';
import { getPayloadEncryptionKey } from '../config/environment.js';

const jsonParser = express.json({ limit: '50mb' });
const MAX_ENCRYPTED_PAYLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

const base64ToBuffer = (value) => {
  try {
    return Buffer.from(value, 'base64');
  } catch (error) {
    throw new Error('Invalid base64 value in encrypted payload envelope.');
  }
};

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_ENCRYPTED_PAYLOAD_SIZE) {
        req.destroy();
        const error = new Error('Encrypted payload exceeds maximum allowed size (50 MB).');
        error.code = 'PAYLOAD_TOO_LARGE';
        reject(error);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', (error) => {
      reject(error);
    });
  });

const decryptPayload = ({ iv, data }) => {
  if (typeof iv !== 'string' || typeof data !== 'string') {
    throw new Error('Encrypted payload must include base64 encoded iv and data strings.');
  }

  const ivBuffer = base64ToBuffer(iv);
  const ciphertextWithTag = base64ToBuffer(data);

  if (ivBuffer.length !== 12) {
    throw new Error('Invalid IV length: AES-GCM requires a 12-byte IV.');
  }

  if (ciphertextWithTag.length <= 16) {
    throw new Error('Encrypted payload is too short to contain authentication tag.');
  }

  const tag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);
  const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);

  const key = getPayloadEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
};

export const payloadEncryptionMiddleware = async (req, res, next) => {
  const encryptionHeader = req.headers['x-encrypted'];
  if (!encryptionHeader) {
    return jsonParser(req, res, next);
  }

  if (typeof encryptionHeader === 'string' && encryptionHeader.toLowerCase() !== 'aes-gcm') {
    return res.status(400).json({ error: 'Unsupported encrypted payload format.' });
  }

  try {
    const rawBody = await readRawBody(req);
    if (!rawBody || rawBody.length === 0) {
      throw new Error('Encrypted payload body is empty.');
    }

    let envelope;
    try {
      envelope = JSON.parse(rawBody.toString('utf-8'));
    } catch (error) {
      throw new Error('Encrypted payload envelope must be valid JSON.');
    }

    const decryptedJson = decryptPayload(envelope);

    try {
      req.body = JSON.parse(decryptedJson);
    } catch (error) {
      throw new Error('Decrypted payload is not valid JSON.');
    }

    req.headers['content-type'] = 'application/json';
    req._body = true;
    req.rawBody = rawBody;
    return next();
  } catch (error) {
    if (error?.code === 'PAYLOAD_TOO_LARGE') {
      console.warn('Encrypted payload rejected: payload too large.');
      return res.status(413).json({ error: 'Encrypted payload too large.' });
    }

    console.error('Failed to decrypt encrypted payload:', error);
    return res.status(400).json({ error: 'Invalid encrypted payload.' });
  }
};
