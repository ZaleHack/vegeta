const pad = (value) => String(value).padStart(2, '0');
const padMs = (value) => String(value).padStart(3, '0');

export const formatLocalDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = padMs(date.getMilliseconds());

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
};

export const serializeDates = (value) => {
  if (value instanceof Date) {
    return formatLocalDateTime(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeDates(item));
  }

  if (value && typeof value === 'object') {
    if (Buffer.isBuffer(value)) {
      return value;
    }

    return Object.entries(value).reduce((acc, [key, val]) => {
      acc[key] = serializeDates(val);
      return acc;
    }, {});
  }

  return value;
};
