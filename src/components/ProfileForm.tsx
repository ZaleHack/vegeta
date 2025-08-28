import React, { useEffect, useState } from 'react';

interface ExtraField {
  key: string;
  value: string;
}

interface InitialValues {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  extra_fields?: Record<string, string>;
}

interface ProfileFormProps {
  initialValues?: InitialValues;
  profileId?: number | null;
  onSaved?: () => void;
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const ProfileForm: React.FC<ProfileFormProps> = ({ initialValues = {}, profileId, onSaved }) => {
  const [fields, setFields] = useState<ExtraField[]>(() => {
    const arr: ExtraField[] = [];
    if (initialValues.first_name) arr.push({ key: 'First Name', value: initialValues.first_name });
    if (initialValues.last_name) arr.push({ key: 'Last Name', value: initialValues.last_name });
    if (initialValues.phone) arr.push({ key: 'Phone', value: initialValues.phone });
    if (initialValues.email) arr.push({ key: 'Email', value: initialValues.email });
    const extras = initialValues.extra_fields || {};
    Object.entries(extras).forEach(([k, v]) => arr.push({ key: capitalize(k), value: v }));
    return arr;
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const arr: ExtraField[] = [];
    if (initialValues.first_name) arr.push({ key: 'First Name', value: initialValues.first_name });
    if (initialValues.last_name) arr.push({ key: 'Last Name', value: initialValues.last_name });
    if (initialValues.phone) arr.push({ key: 'Phone', value: initialValues.phone });
    if (initialValues.email) arr.push({ key: 'Email', value: initialValues.email });
    const extras = initialValues.extra_fields || {};
    Object.entries(extras).forEach(([k, v]) => arr.push({ key: capitalize(k), value: v }));
    setFields(arr);
  }, [initialValues, profileId]);

  const addField = () => setFields([...fields, { key: '', value: '' }]);
  const removeField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx));
  };
  const updateField = (idx: number, key: keyof ExtraField, value: string) => {
    const updated = [...fields];
    if (key === 'key') value = capitalize(value);
    updated[idx] = { ...updated[idx], [key]: value };
    setFields(updated);
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData();
    let firstName = '';
    let lastName = '';
    let phone = '';
    let email = '';
    const extras: Record<string, string> = {};
    fields.forEach(f => {
      const key = f.key.trim();
      const lower = key.toLowerCase();
      if (lower === 'first name') firstName = f.value;
      else if (lower === 'last name') lastName = f.value;
      else if (lower === 'phone') phone = f.value;
      else if (lower === 'email') email = f.value;
      else if (key) extras[key] = f.value;
    });
    form.append('first_name', firstName);
    form.append('last_name', lastName);
    form.append('phone', phone);
    form.append('email', email);
    form.append('extra_fields', JSON.stringify(extras));
    if (photo) form.append('photo', photo);
    const token = localStorage.getItem('token');
    const url = profileId ? `/api/profiles/${profileId}` : '/api/profiles';
    const method = profileId ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: token ? `Bearer ${token}` : ''
      },
      body: form
    });
    const data = await res.json();
    if (res.ok) {
      setMessage('Profil enregistré avec succès');
      if (onSaved) onSaved();
    } else {
      setMessage(data.error || 'Erreur lors de la sauvegarde');
    }
  };

  return (
    <form
      className="max-w-lg mx-auto bg-white p-6 rounded-xl shadow-md space-y-4"
      onSubmit={submit}
    >
      {message && <div className="text-sm text-green-600">{message}</div>}
      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div key={idx} className="flex space-x-2">
            <input
              className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nom du champ"
              value={field.key}
              onChange={e => updateField(idx, 'key', e.target.value)}
            />
            <input
              className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Valeur"
              value={field.value}
              onChange={e => updateField(idx, 'value', e.target.value)}
            />
            <button
              type="button"
              className="text-red-600"
              onClick={() => removeField(idx)}
            >
              Supprimer
            </button>
          </div>
        ))}
        <button
          type="button"
          className="px-3 py-1 bg-gray-200 rounded"
          onClick={addField}
        >
          Ajouter un champ
        </button>
      </div>
      <div>
        <input type="file" onChange={handlePhoto} />
        {preview && (
          <img
            src={preview}
            alt="preview"
            className="mt-2 w-32 h-32 object-cover rounded-full"
          />
        )}
      </div>
      <button
        type="submit"
        className="px-4 py-2 bg-indigo-600 text-white rounded"
      >
        Enregistrer
      </button>
    </form>
  );
};

export default ProfileForm;
