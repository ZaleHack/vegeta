const AES_GCM_IV_LENGTH = 12; // 96 bits

let cachedKeyPromise: Promise<CryptoKey> | null = null;

const textEncoder = new TextEncoder();

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

const importEncryptionKey = async (): Promise<CryptoKey> => {
  if (cachedKeyPromise) {
    return cachedKeyPromise;
  }

  const importPromise = (async () => {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.subtle) {
      throw new Error('Web Crypto API is not available in this environment.');
    }

    const base64Key = import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY?.trim();
    if (!base64Key) {
      throw new Error('VITE_PAYLOAD_ENCRYPTION_KEY est requis pour chiffrer les payloads JSON.');
    }

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

  const base64Key = import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY?.trim();
  if (!base64Key) {
    console.warn(
      'VITE_PAYLOAD_ENCRYPTION_KEY est introuvable. Le chiffrement des requêtes JSON est désactivé.'
    );
    return;
  }

  const INSTALL_FLAG = '__payload_encryption_fetch_wrapper__';
  if ((window as unknown as Record<string, unknown>)[INSTALL_FLAG]) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const method = request.method?.toUpperCase();
    const headers = new Headers(request.headers);
    const contentType = headers.get('content-type')?.toLowerCase() ?? '';

    const callOriginalFetch = () =>
      init === undefined ? originalFetch(input) : originalFetch(input, init);

    if (
      !method ||
      method === 'GET' ||
      method === 'HEAD' ||
      method === 'OPTIONS' ||
      headers.has('X-Encrypted') ||
      !contentType.startsWith('application/json')
    ) {
      return callOriginalFetch();
    }

    try {
      const bodyText = await request.clone().text();
      if (!bodyText) {
        return callOriginalFetch();
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

      return originalFetch(encryptedRequest);
    } catch (error) {
      console.error('Échec du chiffrement du payload JSON :', error);
      throw error;
    }
  };

  (window as unknown as Record<string, unknown>)[INSTALL_FLAG] = true;
};
