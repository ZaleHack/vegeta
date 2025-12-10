const normalizeFlag = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(trimmed)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(trimmed)) {
    return false;
  }

  return null;
};

export const isRequestLoggingEnabled = () => {
  const normalized = normalizeFlag(process.env.REQUEST_LOGGING_ENABLED);
  if (normalized !== null) {
    return normalized;
  }

  return true;
};

export default {
  isRequestLoggingEnabled
};
