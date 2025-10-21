import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP = BASE32_ALPHABET.split('').reduce((acc, char, index) => {
  acc[char] = index;
  return acc;
}, {});

const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5);
    if (chunk.length < 5) {
      output += BASE32_ALPHABET[parseInt(chunk.padEnd(5, '0'), 2)];
    } else {
      output += BASE32_ALPHABET[parseInt(chunk, 2)];
    }
  }

  const paddingLength = (8 - (output.length % 8)) % 8;
  return output + '='.repeat(paddingLength);
}

function base32Decode(secret) {
  const cleanSecret = secret.toUpperCase().replace(/=+$/u, '');
  let bits = '';

  for (const char of cleanSecret) {
    if (!(char in BASE32_LOOKUP)) {
      throw new Error('Invalid base32 character encountered');
    }
    bits += BASE32_LOOKUP[char].toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

function generateHotp(secretBuffer, counter, digits = DEFAULT_DIGITS) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = (code % 10 ** digits).toString().padStart(digits, '0');
  return otp;
}

export function generateSecret(login, issuer = 'Devine Intelligence') {
  const random = crypto.randomBytes(20);
  const base32 = base32Encode(random).replace(/=/gu, '').slice(0, 32);

  const label = encodeURIComponent(`${issuer} (${login})`);
  const encodedIssuer = encodeURIComponent(issuer);
  const otpauthUrl = `otpauth://totp/${label}?secret=${base32}&issuer=${encodedIssuer}`;

  return {
    ascii: random.toString('latin1'),
    hex: random.toString('hex'),
    base32,
    otpauth_url: otpauthUrl
  };
}

export function verifyTotp(token, secret, window = 1, period = DEFAULT_PERIOD, digits = DEFAULT_DIGITS) {
  if (!token || typeof token !== 'string') return false;

  const normalized = token.replace(/\s+/gu, '');

  if (!/^\d+$/.test(normalized)) {
    return false;
  }

  const paddedToken = normalized.padStart(digits, '0');

  let secretBuffer;
  try {
    secretBuffer = base32Decode(secret);
  } catch {
    return false;
  }

  const time = Math.floor(Date.now() / 1000);
  const counter = Math.floor(time / period);

  const tokenBuffer = Buffer.from(paddedToken);

  for (let errorWindow = -window; errorWindow <= window; errorWindow += 1) {
    const hotp = generateHotp(secretBuffer, counter + errorWindow, digits);
    const hotpBuffer = Buffer.from(hotp);

    if (hotpBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(hotpBuffer, tokenBuffer)) {
      return true;
    }
  }

  return false;
}

export function buildQrCodeUrl(otpauthUrl, size = 200) {
  const encoded = encodeURIComponent(otpauthUrl);
  return `https://chart.googleapis.com/chart?chs=${size}x${size}&chld=M|0&cht=qr&chl=${encoded}`;
}
