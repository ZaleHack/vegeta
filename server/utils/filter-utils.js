export const isFilterValueActive = (value) => {
  if (Array.isArray(value)) {
    return value.some((item) => isFilterValueActive(item));
  }

  if (value instanceof Date) {
    return true;
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some((nested) => isFilterValueActive(nested));
  }

  if (typeof value === 'boolean') {
    return value === true;
  }

  if (typeof value === 'number') {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value !== undefined && value !== null;
};

export const hasActiveFilters = (filters = {}) => {
  if (!filters || typeof filters !== 'object') {
    return false;
  }

  return Object.values(filters).some((value) => isFilterValueActive(value));
};

export default hasActiveFilters;
