const IDENTIFIER_KEYWORDS = new Set([
  'cni',
  'telephone',
  'telephone1',
  'telephone2',
  'tel',
  'phone',
  'passeport',
  'passport',
  'matricule',
  'numero',
  'numéro',
  'identifiant',
  'id'
]);

const HIGH_PRIORITY_PATTERNS = [
  { regex: /(first|last)?_?name|prenom|prénom|nom/i, boost: 3.5 },
  { regex: /(email|mail)/i, boost: 4.5 },
  { regex: /(status|statut)/i, boost: 2.5 },
  { regex: /(division|service|direction)/i, boost: 1.5 },
  { regex: /(adresse|address)/i, boost: 1.2 }
];

export const canonicalizeFieldKey = (field) =>
  typeof field === 'string'
    ? field
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    : '';

export const isIdentifierField = (field) => {
  const canonical = canonicalizeFieldKey(field);
  if (!canonical) {
    return false;
  }

  if (IDENTIFIER_KEYWORDS.has(canonical)) {
    return true;
  }

  if (canonical.startsWith('telephone') || canonical.startsWith('phone')) {
    return true;
  }

  if (canonical.startsWith('tel') && canonical.length <= 7) {
    return true;
  }

  if (canonical.includes('passeport') || canonical.includes('passport')) {
    return true;
  }

  if (canonical.includes('cni')) {
    return true;
  }

  if (canonical.includes('matricule')) {
    return true;
  }

  return false;
};

const scoreForListMembership = (list = [], field) =>
  Array.isArray(list) && list.includes(field) ? 1 : 0;

export const computeFieldWeight = (field, tableConfig = {}) => {
  if (!field) {
    return 1;
  }

  const base = 1 + scoreForListMembership(tableConfig.searchable, field) * 1.5;
  const previewBonus = scoreForListMembership(tableConfig.preview, field) * 0.75;
  const linkedBonus = scoreForListMembership(tableConfig.linkedFields, field) * 1.25;

  const canonical = canonicalizeFieldKey(field);
  let heuristicBoost = 0;

  if (isIdentifierField(field)) {
    heuristicBoost = Math.max(heuristicBoost, 3);
  }

  for (const { regex, boost } of HIGH_PRIORITY_PATTERNS) {
    if (regex.test(field)) {
      heuristicBoost = Math.max(heuristicBoost, boost);
      break;
    }
    if (regex.test(canonical)) {
      heuristicBoost = Math.max(heuristicBoost, boost);
      break;
    }
  }

  if (canonical === 'id') {
    heuristicBoost = Math.max(heuristicBoost, 2.5);
  }

  const weight = base + previewBonus + linkedBonus + heuristicBoost;
  return Math.max(1, Math.round(weight * 100) / 100);
};

export const buildSuggestionsFromValues = (values = []) => {
  const suggestions = new Set();
  values.forEach((value) => {
    if (value === undefined || value === null) {
      return;
    }

    const text = String(value).trim();
    if (!text) {
      return;
    }

    suggestions.add(text);
    suggestions.add(text.toLowerCase());
  });

  return Array.from(suggestions);
};

export default {
  canonicalizeFieldKey,
  isIdentifierField,
  computeFieldWeight,
  buildSuggestionsFromValues
};
