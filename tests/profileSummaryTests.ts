import { buildProfileSections, ProfileSummaryData } from '../src/utils/profileSummary.js';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const baseData: ProfileSummaryData = {
  fullName: 'Sora Ndiaye',
  identifier: 140,
  alias: null,
  owner: 'Cellule Investigation',
  referent: null,
  createdAt: '2025-10-16T09:19:00Z',
  updatedAt: '2025-10-17T12:10:00Z',
  attachmentsCount: 3,
  email: null,
  phone: null,
  address: null,
  informations: {
    Segment: 'Gold',
    Score: 82
  }
};

const runTests = () => {
  // Cas 1 : coordonnées vides → coordonnées masquées
  const sectionsWithoutContacts = buildProfileSections(baseData);
  assert(
    !sectionsWithoutContacts.some((section) => section.title === 'Coordonnées'),
    'La section Coordonnées devrait être masquée lorsque toutes les coordonnées sont vides.'
  );

  // Cas 2 : pieces_jointes = 0 → “Aucun document”
  const zeroAttachmentsData: ProfileSummaryData = { ...baseData, attachmentsCount: 0 };
  const sectionsZeroAttachments = buildProfileSections(zeroAttachmentsData);
  const attachmentsSection = sectionsZeroAttachments.find((section) => section.title === 'Pièces jointes');
  assert(attachmentsSection, 'La section Pièces jointes doit être présente lorsque le compteur est défini.');
  assert(
    attachmentsSection?.fields[0]?.value === 'Aucun document',
    'La valeur affichée pour 0 pièce jointe doit être “Aucun document”.'
  );

  // Cas 3 : email présent → la ligne apparaît
  const withEmailData: ProfileSummaryData = { ...baseData, email: 'contact@sora.sn' };
  const sectionsWithEmail = buildProfileSections(withEmailData);
  const contactSection = sectionsWithEmail.find((section) => section.title === 'Coordonnées');
  assert(contactSection, 'La section Coordonnées doit apparaître lorsque au moins une coordonnée est renseignée.');
  assert(
    contactSection?.fields.some((field) => field.label === 'Email'),
    'Le champ Email doit être affiché lorsque l’email est renseigné.'
  );

  // Cas 4 : informations non vides → affichage des paires
  const infoSection = sectionsWithoutContacts.find((section) => section.title === 'Informations');
  assert(infoSection, 'La section Informations doit être présente lorsque des informations sont renseignées.');
  assert(
    infoSection.fields.some((field) => field.label === 'Segment' && field.value === 'Gold'),
    'La paire Segment=Gold doit apparaître dans les informations.'
  );
  assert(
    infoSection.fields.some((field) => field.label === 'Score' && field.value === '82'),
    'La paire Score=82 doit apparaître dans les informations.'
  );

  console.log('Tous les tests ProfileSummary sont passés avec succès.');
};

runTests();
