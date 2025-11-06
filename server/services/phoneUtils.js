const sanitizeNumber = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value).trim();
  if (!text) {
    return '';
  }
  text = text.replace(/\s+/g, '');
  if (text.startsWith('+')) {
    text = text.slice(1);
  }
  while (text.startsWith('00')) {
    text = text.slice(2);
  }
  text = text.replace(/[^0-9]/g, '');
  return text;
};

const normalizePhoneNumber = (value) => {
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return '';
  }
  if (sanitized.startsWith('221')) {
    return sanitized;
  }
  const trimmed = sanitized.replace(/^0+/, '');
  return trimmed ? `221${trimmed}` : '';
};

const buildIdentifierVariants = (value) => {
  const variants = new Set();

  if (value === null || value === undefined) {
    return variants;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return variants;
  }

  variants.add(trimmed);

  const sanitized = sanitizeNumber(trimmed);
  if (!sanitized) {
    return variants;
  }

  variants.add(sanitized);

  if (sanitized.startsWith('0')) {
    const withoutLeadingZeros = sanitized.replace(/^0+/, '');
    if (withoutLeadingZeros) {
      variants.add(withoutLeadingZeros);
    }
  }

  const normalized = normalizePhoneNumber(sanitized);
  if (normalized) {
    variants.add(normalized);

    if (normalized.startsWith('221')) {
      const local = normalized.slice(3);
      if (local) {
        variants.add(local);
        variants.add(`0${local}`);
      }
    }

    variants.add(`00${normalized}`);
  }

  return variants;
};

const matchesIdentifier = (identifierSet, value) => {
  if (!value) {
    return false;
  }
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return false;
  }
  if (identifierSet.has(sanitized)) {
    return true;
  }
  const normalized = normalizePhoneNumber(sanitized);
  if (normalized && identifierSet.has(normalized)) {
    return true;
  }
  if (normalized.startsWith('221')) {
    const local = normalized.slice(3);
    if (identifierSet.has(local) || identifierSet.has(`0${local}`)) {
      return true;
    }
  }
  const prefixed = `00${normalized}`;
  if (identifierSet.has(prefixed)) {
    return true;
  }
  return false;
};

const normalizeForOutput = (value) => {
  const sanitized = sanitizeNumber(value);
  if (!sanitized) {
    return '';
  }
  const normalized = normalizePhoneNumber(sanitized);
  return normalized || sanitized;
};

export {
  sanitizeNumber,
  normalizePhoneNumber,
  buildIdentifierVariants,
  matchesIdentifier,
  normalizeForOutput
};
