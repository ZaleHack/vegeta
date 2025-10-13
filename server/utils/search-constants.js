export const UNIQUE_SEARCH_FIELD_NAMES = [
  'CNI',
  'cni',
  'NIN',
  'nin',
  'Phone',
  'PHONE',
  'TELEPHONE',
  'Telephone',
  'Numero',
  'NUMERO',
  'Telephone1',
  'Telephone2',
  'TELEPHONE1',
  'TELEPHONE2',
  'Telephone_1',
  'Telephone_2',
  'TEL1',
  'TEL2',
  'PassePort',
  'PASSEPORT',
  'Passeport',
  'Passport',
  'passport',
  'Email',
  'EMAIL',
  'mail',
  'Mail',
  'MAIL'
];

export const UNIQUE_SEARCH_FIELDS = new Set(
  UNIQUE_SEARCH_FIELD_NAMES.map((field) => field.toLowerCase())
);
