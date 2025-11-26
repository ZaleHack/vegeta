const IMEICHECK_ENDPOINT = 'https://alpha.imeicheck.com/api/modelBrandName';
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

export const checkImei = async (imei) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${IMEICHECK_ENDPOINT}?imei=${encodeURIComponent(imei)}&format=json`;
    const response = await fetch(url, { method: 'GET', signal: controller.signal });

    if (!response.ok) {
      throw createApiUnavailableError();
    }

    const data = await response.json();

    if (!data || data.status !== 'succes') {
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

    throw createApiUnavailableError();
  } finally {
    clearTimeout(timeoutId);
  }
};

export default {
  checkImei
};
