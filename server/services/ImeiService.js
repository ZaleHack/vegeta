const IMEICHECK_ENDPOINT = process.env.IMEICHECK_ENDPOINT || 'https://alpha.imeicheck.com/api/modelBrandName';
const IMEICHECK_API_KEY = process.env.IMEICHECK_API_KEY || '';
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
  return ['succes', 'success', 'ok'].includes(normalized);
};

export const checkImei = async (imei) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${IMEICHECK_ENDPOINT}?imei=${encodeURIComponent(imei)}&format=json`;
    const headers = { Accept: 'application/json' };

    if (IMEICHECK_API_KEY) {
      headers.Authorization = `Bearer ${IMEICHECK_API_KEY}`;
    }

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

    if (!data || !isSuccessfulStatus(data.status)) {
      throw new ImeiFunctionalError('IMEI not found or invalid');
    }

    const { object = {}, status, result } = data;

    return {
      imei,
      brand: object.brand ?? '',
      model: object.model ?? '',
      name: object.name ?? '',
      rawStatus: status,
      rawResult: result
    };
  } catch (error) {
    if (error instanceof ImeiFunctionalError) {
      throw error;
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
