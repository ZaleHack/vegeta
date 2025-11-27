import crypto from 'crypto';
import tacDbService from './tacDbService.js';

const DEFAULT_API_KEY = '';
const IMEICHECK_ENDPOINT =
  process.env.IMEICHECK_ENDPOINT || 'https://alpha.imeicheck.com/api/modelBrandName';
const IMEICHECK_API_KEY = process.env.IMEICHECK_API_KEY || DEFAULT_API_KEY;
const IMEICHECK_SIGNATURE_SECRET = process.env.IMEICHECK_SIGNATURE_SECRET || '';
const HAS_SIGNING_CONFIG = Boolean(IMEICHECK_API_KEY || IMEICHECK_SIGNATURE_SECRET);
const DEFAULT_FORMAT = process.env.IMEICHECK_RESPONSE_FORMAT || 'json';
const REQUEST_TIMEOUT_MS = 10000;

export class ImeiFunctionalError extends Error {
  constructor(message = 'IMEI not found or invalid') {
    super(message);
    this.name = 'ImeiFunctionalError';
  }
}

const createApiUnavailableError = () => {
  const error = new Error('IMEI check API unavailable');
  error.name = 'ImeiApiError';
  return error;
};

const createApiAuthError = () => {
  const error = new Error('IMEI check API authentication failed');
  error.name = 'ImeiAuthError';
  return error;
};

const isSuccessfulStatus = (status) => {
  const normalized = (status || '').toLowerCase();
  return ['succes', 'success', 'ok', '200', 'true'].includes(normalized);
};

const createRequestSignature = (imei, timestamp) => {
  if (!HAS_SIGNING_CONFIG) {
    return undefined;
  }

  const base = `${IMEICHECK_API_KEY}${IMEICHECK_SIGNATURE_SECRET}${timestamp}${imei}`;
  return crypto.createHash('md5').update(base).digest('hex');
};

const extractTac = (imei) => {
  if (!imei) return '';
  const normalized = String(imei).replace(/\D/g, '');
  return normalized.length >= 8 ? normalized.slice(0, 8) : '';
};

const createTacFallbackResponse = (imei) => {
  const tac = extractTac(imei);

  if (!tac) {
    return null;
  }

  const tacInfo = tacDbService.getTacInfo(tac);

  if (!tacInfo) {
    return null;
  }

  const brand = tacInfo.brand || '';
  const model = tacInfo.model || '';
  const name = tacInfo.name || tacInfo.deviceName || [brand, model].filter(Boolean).join(' ').trim();

  return {
    imei,
    tac,
    brand,
    model,
    name,
    tacInfo,
    status: 'tac_db',
    result: tacInfo.notes || 'Informations issues de la base TAC',
    object: { ...tacInfo, brand, model, name, tac },
    rawStatus: 'tac_db',
    rawResult: tacInfo.notes || 'tac_db',
    count_free_checks_today: undefined
  };
};

export const checkImei = async (imei) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    if (!HAS_SIGNING_CONFIG) {
      const tacFallback = createTacFallbackResponse(imei);
      if (tacFallback) {
        return tacFallback;
      }

      throw createApiUnavailableError();
    }

    const timestamp = Date.now().toString();
    const query = new URLSearchParams({
      identifier: imei,
      format: DEFAULT_FORMAT
    });

    query.set('time', timestamp);

    if (IMEICHECK_API_KEY) {
      query.set('key', IMEICHECK_API_KEY);
    }

    const signature = createRequestSignature(imei, timestamp);

    if (signature) {
      query.set('signature', signature);
    }

    const url = `${IMEICHECK_ENDPOINT}?${query.toString()}`;
    const headers = { Accept: 'application/json' };

    const response = await fetch(url, { method: 'GET', signal: controller.signal, headers });

    if (!response.ok) {
      if ([400, 404, 422].includes(response.status)) {
        throw new ImeiFunctionalError('IMEI not found or invalid');
      }

      if ([401, 403].includes(response.status)) {
        throw createApiAuthError();
      }

      throw createApiUnavailableError();
    }

    const data = await response.json();

    if (!data) {
      throw createApiUnavailableError();
    }

    const normalizedObject =
      (typeof data.object === 'object' && data.object !== null && data.object) ||
      (typeof data.data === 'object' && data.data !== null && data.data) ||
      (typeof data.result === 'object' && data.result !== null && data.result) ||
      (typeof data === 'object' && data !== null ? data : {});

    const status = data.status ?? data.msg ?? data.message;
    const resultText =
      typeof data.result === 'string'
        ? data.result
        : typeof data.msg === 'string'
          ? data.msg
          : typeof data.message === 'string'
            ? data.message
            : undefined;

    const brand =
      normalizedObject.brand ??
      normalizedObject.brandName ??
      normalizedObject.make ??
      normalizedObject.oem ??
      '';
    const model = normalizedObject.model ?? normalizedObject.modelName ?? normalizedObject.deviceName ?? '';
    const name =
      normalizedObject.name ??
      normalizedObject.modelBrandName ??
      normalizedObject.title ??
      [brand, model].filter(Boolean).join(' ').trim();

    if (status?.toLowerCase() === 'error') {
      throw createApiUnavailableError();
    }

    if (status?.toLowerCase() === 'failed') {
      throw new ImeiFunctionalError('IMEI not found or invalid');
    }

    const tac = extractTac(imei);
    const tacInfo = tac ? tacDbService.getTacInfo(tac) : null;

    const hasPayload = Boolean(brand || model || name || tacInfo);
    const isSuccess = isSuccessfulStatus(status) || hasPayload;

    if (!isSuccess) {
      throw new ImeiFunctionalError('IMEI not found or invalid');
    }

    return {
      imei,
      tac,
      brand,
      model,
      name,
      status,
      result: resultText ?? name ?? '',
      object: { ...normalizedObject, brand, model, name, tac, tacInfo },
      tacInfo,
      rawStatus: status,
      rawResult: resultText,
      count_free_checks_today:
        typeof data.count_free_checks_today === 'number' ? data.count_free_checks_today : undefined
    };
  } catch (error) {
    if (error instanceof ImeiFunctionalError) {
      throw error;
    }

    const tacFallback = createTacFallbackResponse(imei);
    if (tacFallback) {
      return tacFallback;
    }

    if (error?.name === 'AbortError') {
      throw createApiUnavailableError();
    }

    if (error?.name === 'ImeiAuthError') {
      throw error;
    }

    throw createApiUnavailableError();
  } finally {
    clearTimeout(timeoutId);
  }
};

export default {
  checkImei
};
