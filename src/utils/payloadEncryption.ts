const AES_GCM_IV_LENGTH = 12; // 96 bits

let cachedKeyPromise: Promise<CryptoKey> | null = null;
let cachedBase64Key: string | null = null;
let base64KeyPromise: Promise<string> | null = null;
let originalFetch: typeof fetch | null = null;

let requestCounter = 0;

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const snapshotHeaders = (headers: Headers) => {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
};

const logRequestLifecycle = async <T extends Response>(
  request: Request,
  fetchPromise: Promise<T>
): Promise<T> => {
  const id = ++requestCounter;
  const method = request.method?.toUpperCase() ?? 'GET';
  const url = request.url;
  const start = now();
  const headers = snapshotHeaders(request.headers);

  console.info(`[API][${id}] ${method} ${url}`, {
    headers,
    encrypted: headers['x-encrypted'] === 'aes-gcm'
  });

  try {
    const response = await fetchPromise;
    const duration = Math.round(now() - start);
    console.info(
      `[API][${id}] ${method} ${url} -> ${response.status} ${response.statusText} (${duration}ms)`
    );
    return response;
  } catch (error) {
    const duration = Math.round(now() - start);
    console.error(`[API][${id}] ${method} ${url} -> FAILED (${duration}ms)`, error);
    throw error;
  }
};

const textEncoder = new TextEncoder();

const isWebCryptoAvailable = (): boolean =>
  typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined';

const getAtob = () => {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob;
  }
  throw new Error('atob is not available in the current environment.');
};

const getBtoa = () => {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa;
  }
  throw new Error('btoa is not available in the current environment.');
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const normalized = base64.replace(/\s+/g, '');
  const binaryString = getAtob()(normalized);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return getBtoa()(binary);
};

const resolveBase64EncryptionKey = async (): Promise<string> => {
  if (cachedBase64Key) {
    return cachedBase64Key;
  }

  const envKey = import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY?.trim();
  if (envKey) {
    cachedBase64Key = envKey;
    return cachedBase64Key;
  }

  if (base64KeyPromise) {
    return base64KeyPromise;
  }

  if (typeof fetch !== 'function') {
    throw new Error(
      'Fetch API is not available to retrieve the payload encryption key.'
    );
  }

  const fetchImplementation = originalFetch ?? fetch.bind(globalThis);

  const requestPromise = (async () => {
    const response = await fetchImplementation('/api/public/payload-encryption-key', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(
        `Échec de récupération de la clé de chiffrement (statut ${response.status}).`
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error('Réponse invalide du serveur lors de la récupération de la clé.');
    }

    const parsedPayload = payload as { key?: unknown };
    const fetchedKey =
      typeof parsedPayload.key === 'string' ? parsedPayload.key.trim() : '';

    if (!fetchedKey) {
      throw new Error('Réponse invalide du serveur : clé de chiffrement absente.');
    }

    cachedBase64Key = fetchedKey;
    return fetchedKey;
  })();

  base64KeyPromise = requestPromise.catch((error) => {
    base64KeyPromise = null;
    throw error;
  });

  return base64KeyPromise;
};

const importEncryptionKey = async (): Promise<CryptoKey> => {
  if (cachedKeyPromise) {
    return cachedKeyPromise;
  }

  const importPromise = (async () => {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.subtle) {
      throw new Error('Web Crypto API is not available in this environment.');
    }

    const base64Key = await resolveBase64EncryptionKey();

    const rawKey = base64ToUint8Array(base64Key);
    if (rawKey.byteLength !== 32) {
      throw new Error('La clé de chiffrement doit contenir 32 octets (clé AES-256) après décodage base64.');
    }

    return cryptoApi.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
  })();

  cachedKeyPromise = importPromise.catch((error) => {
    cachedKeyPromise = null;
    throw error;
  });

  return cachedKeyPromise;
};

export interface EncryptedJsonPayload {
  iv: string;
  data: string;
}

export const encryptJsonPayload = async (body: string): Promise<EncryptedJsonPayload> => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto API is not available in this environment.');
  }

  const key = await importEncryptionKey();
  const encodedBody = textEncoder.encode(body);
  const iv = cryptoApi.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));

  const encryptedBuffer = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedBody);

  return {
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(encryptedBuffer)
  };
};

export const setupEncryptedFetch = () => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  if (!isWebCryptoAvailable()) {
    console.warn(
      "Chiffrement des requêtes JSON désactivé : l'API Web Crypto est indisponible dans cet environnement."
    );
    return;
  }

  const INSTALL_FLAG = '__payload_encryption_fetch_wrapper__';
  if ((window as unknown as Record<string, unknown>)[INSTALL_FLAG]) {
    return;
  }

  const envKey = import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY?.trim();
  if (envKey) {
    cachedBase64Key = envKey;
  }

  const nativeFetch = window.fetch.bind(window);
  originalFetch = nativeFetch;

  if (!envKey) {
    resolveBase64EncryptionKey().catch((error) => {
      console.warn(
        "Impossible d'initialiser le chiffrement des requêtes JSON :",
        error
      );
    });
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const method = request.method?.toUpperCase();
    const headers = new Headers(request.headers);
    const contentType = headers.get('content-type')?.toLowerCase() ?? '';

    const callOriginalFetch = () =>
      init === undefined ? nativeFetch(input) : nativeFetch(input, init);

    if (
      !method ||
      method === 'GET' ||
      method === 'HEAD' ||
      method === 'OPTIONS' ||
      headers.has('X-Encrypted') ||
      !contentType.startsWith('application/json')
    ) {
      return logRequestLifecycle(request, callOriginalFetch());
    }

    try {
      const bodyText = await request.clone().text();
      if (!bodyText) {
        return logRequestLifecycle(request, callOriginalFetch());
      }

      const encryptedPayload = await encryptJsonPayload(bodyText);
      const encryptedBody = JSON.stringify(encryptedPayload);

      headers.set('Content-Type', 'application/json');
      headers.set('X-Encrypted', 'aes-gcm');

      const encryptedRequest = new Request(request, {
        body: encryptedBody,
        headers,
        method: request.method
      });

      const fetchImplementation = originalFetch ?? nativeFetch;
      return logRequestLifecycle(encryptedRequest, fetchImplementation(encryptedRequest));
    } catch (error) {
      console.error('Échec du chiffrement du payload JSON :', error);
      throw error;
    }
  };

  (window as unknown as Record<string, unknown>)[INSTALL_FLAG] = true;
};
