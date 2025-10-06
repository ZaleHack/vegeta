export function quoteIdentifier(identifier = '') {
  if (!identifier) {
    return '';
  }

  if (Array.isArray(identifier)) {
    return identifier.map((value) => quoteIdentifier(value)).join(', ');
  }

  return identifier
    .toString()
    .split('.')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) {
        return '';
      }
      const withoutBackticks = trimmed.replace(/^`+|`+$/g, '');
      const escaped = withoutBackticks.replace(/`/g, '``');
      return `\`${escaped}\``;
    })
    .filter(Boolean)
    .join('.');
}

export function quoteIdentifiers(identifiers = []) {
  return identifiers
    .map((identifier) => quoteIdentifier(identifier))
    .filter((part) => part.length > 0)
    .join(', ');
}
