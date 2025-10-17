export function toSafeInteger(value, { defaultValue = 0, min = null, max = null } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return applyBounds(defaultValue, min, max);
  }

  const integer = Math.trunc(numeric);
  return applyBounds(integer, min, max);
}

export function sanitizeLimit(value, { defaultValue = 20, min = 1, max = 100 } = {}) {
  return toSafeInteger(value, { defaultValue, min, max });
}

export function sanitizeOffset(value, { defaultValue = 0, min = 0, max = null } = {}) {
  return toSafeInteger(value, { defaultValue, min, max });
}

export function sanitizeNonNegative(value, defaultValue = 0) {
  return toSafeInteger(value, { defaultValue, min: 0 });
}

function applyBounds(value, min, max) {
  let result = Number.isFinite(value) ? Math.trunc(value) : 0;
  if (min !== null && result < min) {
    result = min;
  }
  if (max !== null && result > max) {
    result = max;
  }
  return result;
}
