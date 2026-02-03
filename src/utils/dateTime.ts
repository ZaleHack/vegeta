const DEFAULT_LOCALE = 'fr-FR';
const SERVER_TIME_ZONE = 'UTC';

const hasTimezoneOffset = (value: string) => /([zZ]|[+-]\d{2}:\d{2})$/.test(value);
const isIsoDateTime = (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value);
const isIsoDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeIsoString = (value: string) => {
  const trimmed = value.trim();

  if (hasTimezoneOffset(trimmed)) {
    return trimmed;
  }

  if (isIsoDateTime(trimmed)) {
    return `${trimmed}Z`;
  }

  if (isIsoDateOnly(trimmed)) {
    return `${trimmed}T00:00:00Z`;
  }

  return trimmed;
};

export const parseServerDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const normalized = normalizeIsoString(String(value));
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatWithOptions = (
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions
) => {
  const parsed = parseServerDate(value);
  if (!parsed) return '-';
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: SERVER_TIME_ZONE,
    ...options
  }).format(parsed);
};

export const formatServerDate = (value: string | Date | null | undefined) =>
  formatWithOptions(value, { dateStyle: 'short' });

export const formatServerDateLong = (value: string | Date | null | undefined) =>
  formatWithOptions(value, { dateStyle: 'long' });

export const formatServerDateTime = (value: string | Date | null | undefined) =>
  formatWithOptions(value, { dateStyle: 'short', timeStyle: 'medium' });
