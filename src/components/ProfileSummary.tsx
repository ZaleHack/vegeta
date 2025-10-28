import React, { ReactNode, useCallback, useMemo } from 'react';
import styles from './ProfileSummary.module.css';
import {
  buildProfileSections,
  isEmpty,
  ProfileField,
  ProfileSection,
  ProfileSummaryData
} from '../utils/profileSummary';

interface SectionProps {
  title: string;
  fields: ProfileField[];
}

interface FieldProps {
  label: string;
  value: ReactNode;
}

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const Section: React.FC<SectionProps> = ({ title, fields }) => {
  if (!fields || fields.length === 0) {
    return null;
  }

  const headingId = slugify(title) || 'section';

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.sectionTitle}>
        {title}
      </h3>
      <dl className={styles.definitionList}>
        {fields.map((field) => (
          <Field key={field.label} label={field.label} value={field.value} />
        ))}
      </dl>
    </section>
  );
};

const Field: React.FC<FieldProps> = ({ label, value }) => {
  if (isEmpty(value)) {
    return null;
  }

  return (
    <div className={styles.field}>
      <dt className={styles.term}>{label}</dt>
      <dd className={styles.description}>{value}</dd>
    </div>
  );
};

const useProfileSections = (data: ProfileSummaryData): ProfileSection[] =>
  useMemo(() => buildProfileSections(data), [data]);

export interface ProfileSummaryProps {
  data: ProfileSummaryData;
}

const ProfileSummary: React.FC<ProfileSummaryProps> = ({ data }) => {
  const sections = useProfileSections(data);

  const handleExport = useCallback(() => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, []);

  return (
    <article className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <span className={styles.eyebrow}>Profil</span>
          <h1 className={styles.title}>Résumé</h1>
        </div>
        <button type="button" onClick={handleExport} className={styles.exportButton}>
          Exporter en PDF
        </button>
      </header>

      {sections.map((section) => (
        <Section key={section.title} title={section.title} fields={section.fields} />
      ))}
    </article>
  );
};

export default ProfileSummary;
