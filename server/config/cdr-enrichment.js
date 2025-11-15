const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

export const isCdrBtsEnrichmentEnabled = () => {
  const flag = process.env.ENRICH_CDR_WITH_BTS;
  if (typeof flag === 'string') {
    return flag.trim().toLowerCase() === 'true';
  }
  return true;
};

export const isCdrBtsDebugEnabled = () => {
  const flag = process.env.CDR_BTS_ENRICHMENT_DEBUG;
  if (typeof flag === 'string') {
    return flag.trim().toLowerCase() === 'true';
  }
  return false;
};

export const getCdrBtsCacheSize = () => {
  const configured = parsePositiveInteger(process.env.CDR_BTS_CACHE_SIZE, 5000);
  return clamp(configured, 100, 50000);
};

export const getCdrBtsCacheTtlMs = () => {
  const minutesEnv = process.env.CDR_BTS_CACHE_TTL_MINUTES;
  const millisEnv = process.env.CDR_BTS_CACHE_TTL_MS;

  if (millisEnv) {
    const parsedMs = parsePositiveInteger(millisEnv, 20 * 60 * 1000);
    return clamp(parsedMs, 10 * 60 * 1000, 30 * 60 * 1000);
  }

  const minutes = parsePositiveInteger(minutesEnv, 20);
  const clampedMinutes = clamp(minutes, 10, 30);
  return clampedMinutes * 60 * 1000;
};

export const getCdrBtsCacheConfiguration = () => ({
  maxSize: getCdrBtsCacheSize(),
  ttlMs: getCdrBtsCacheTtlMs()
});
