export interface ProfileSummaryData {
  fullName?: string | null;
  identifier?: string | number | null;
  alias?: string | null;
  owner?: string | null;
  referent?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  attachmentsCount?: number | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  informations?: Record<string, string | number | null | undefined> | null;
}

export interface ProfileField {
  label: string;
  value: string;
}

export interface ProfileSection {
  title: string;
  fields: ProfileField[];
}

const DAKAR_TIME_ZONE = 'Africa/Dakar';

export function formatDateDakar(isoString: string | null | undefined): string {
  if (!isoString) {
    return '';
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: DAKAR_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: DAKAR_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return `${dateFormatter.format(date)} à ${timeFormatter.format(date)}`;
}

export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) || value === 0;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0 || value.trim() === '0';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime());
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }

  return false;
}

const formatIdentifier = (identifier?: string | number | null): string => {
  if (isEmpty(identifier)) {
    return '';
  }

  const raw = typeof identifier === 'number' ? identifier.toString() : `${identifier ?? ''}`;
  const trimmed = raw.trim().replace(/^#/, '');

  return `#${trimmed}`;
};

const formatOwnerReferent = (owner?: string | null, referent?: string | null): string => {
  const values = [owner, referent]
    .map((entry) => (entry ?? '').toString().trim())
    .filter((entry) => !isEmpty(entry));

  if (values.length === 0) {
    return '';
  }

  return values.join(' • ');
};

const formatAttachmentCount = (count: number): string => {
  if (count <= 0) {
    return 'Aucun document';
  }

  return `${count} document${count > 1 ? 's' : ''}`;
};

export function buildProfileSections(data: ProfileSummaryData): ProfileSection[] {
  const sections: ProfileSection[] = [];

  const identityFields: ProfileField[] = [];

  if (!isEmpty(data.fullName)) {
    identityFields.push({ label: 'Nom complet', value: (data.fullName ?? '').trim() });
  }

  const identifierValue = formatIdentifier(data.identifier ?? null);
  if (!isEmpty(identifierValue)) {
    identityFields.push({ label: 'Identifiant', value: identifierValue });
  }

  if (!isEmpty(data.alias)) {
    identityFields.push({ label: 'Alias', value: (data.alias ?? '').trim() });
  }

  if (identityFields.length > 0) {
    sections.push({ title: 'Identité', fields: identityFields });
  }

  const administrationFields: ProfileField[] = [];

  const ownerReferent = formatOwnerReferent(data.owner ?? null, data.referent ?? null);
  if (!isEmpty(ownerReferent)) {
    administrationFields.push({ label: 'Propriétaire / Référent', value: ownerReferent });
  }

  const createdAt = formatDateDakar(data.createdAt ?? null);
  if (!isEmpty(createdAt)) {
    administrationFields.push({ label: 'Créé le', value: createdAt });
  }

  const updatedAt = formatDateDakar(data.updatedAt ?? null);
  if (!isEmpty(updatedAt)) {
    administrationFields.push({ label: 'Mis à jour le', value: updatedAt });
  }

  if (administrationFields.length > 0) {
    sections.push({ title: 'Administration', fields: administrationFields });
  }

  if (typeof data.attachmentsCount === 'number') {
    sections.push({
      title: 'Pièces jointes',
      fields: [
        {
          label: 'Documents',
          value: formatAttachmentCount(data.attachmentsCount)
        }
      ]
    });
  }

  const contactFields: ProfileField[] = [];

  if (!isEmpty(data.email)) {
    contactFields.push({ label: 'Email', value: (data.email ?? '').trim() });
  }

  if (!isEmpty(data.phone)) {
    contactFields.push({ label: 'Téléphone', value: (data.phone ?? '').trim() });
  }

  if (!isEmpty(data.address)) {
    contactFields.push({ label: 'Adresse', value: (data.address ?? '').trim() });
  }

  if (contactFields.length > 0) {
    sections.push({ title: 'Coordonnées', fields: contactFields });
  }

  const informationEntries = Object.entries(data.informations ?? {}).filter(([, value]) => !isEmpty(value));

  if (informationEntries.length > 0) {
    sections.push({
      title: 'Informations',
      fields: informationEntries.map(([label, value]) => ({
        label,
        value:
          typeof value === 'string'
            ? value.trim()
            : String(value)
      }))
    });
  }

  return sections;
}
