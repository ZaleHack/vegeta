const extractCgiParts = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const numericParts = text.match(/\d+/g);
  if (!numericParts || numericParts.length < 4) {
    return null;
  }

  const [rawMcc, rawMnc, rawLac, rawCi] = numericParts;

  const mcc = rawMcc.slice(-3).padStart(3, '0');

  const mncNumber = Number.parseInt(rawMnc, 10);
  if (Number.isNaN(mncNumber)) {
    return null;
  }
  const mncWidth = Math.max(2, Math.min(rawMnc.length, 3));
  const mnc = String(mncNumber).padStart(mncWidth, '0');

  const lacNumber = Number.parseInt(rawLac, 10);
  const ciNumber = Number.parseInt(rawCi, 10);
  if (Number.isNaN(lacNumber) || Number.isNaN(ciNumber)) {
    return null;
  }

  return {
    mcc,
    mnc,
    lac: String(lacNumber),
    ci: String(ciNumber)
  };
};

const normalizeCgi = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  const parts = extractCgiParts(text);
  if (!parts) {
    return text.toUpperCase();
  }

  const normalized = `${parts.mcc}-${parts.mnc}-${parts.lac}-${parts.ci}`;
  return normalized.toUpperCase();
};

export { extractCgiParts, normalizeCgi };
