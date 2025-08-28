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

const ProfileForm: React.FC<ProfileFormProps> = ({ initialValues = {}, profileId, onSaved }) => {
  const params = new URLSearchParams(window.location.search);
  const [firstName, setFirstName] = useState(initialValues.first_name || params.get('first_name') || '');
  const [lastName, setLastName] = useState(initialValues.last_name || params.get('last_name') || '');
  const [phone, setPhone] = useState(initialValues.phone || params.get('phone') || '');
  const [email, setEmail] = useState(initialValues.email || params.get('email') || '');
  const [extraFields, setExtraFields] = useState<ExtraField[]>(() => {
    const extras = initialValues.extra_fields || {};
    return Object.entries(extras).map(([key, value]) => ({ key, value }));
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setFirstName(initialValues.first_name || '');
    setLastName(initialValues.last_name || '');
    setPhone(initialValues.phone || '');
    setEmail(initialValues.email || '');
    const extras = initialValues.extra_fields || {};
    setExtraFields(Object.entries(extras).map(([key, value]) => ({ key, value })));
  }, [initialValues, profileId]);

  const addField = () => setExtraFields([...extraFields, { key: '', value: '' }]);
  const removeField = (idx: number) => {
    setExtraFields(extraFields.filter((_, i) => i !== idx));
  };
  const updateField = (idx: number, key: keyof ExtraField, value: string) => {
    const updated = [...extraFields];
    updated[idx] = { ...updated[idx], [key]: value };
    setExtraFields(updated);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData();
    form.append('first_name', firstName);
    form.append('last_name', lastName);
    form.append('phone', phone);
    form.append('email', email);
    const extras: Record<string, string> = {};
    extraFields.forEach(f => {
      if (f.key) extras[f.key] = f.value;
    });
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
    <form className="space-y-4" onSubmit={submit}>
      {message && <div className="text-sm text-green-600">{message}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input
          className="border p-2 rounded"
          placeholder="Prénom"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
        />
        <input
          className="border p-2 rounded"
          placeholder="Nom"
          value={lastName}
          onChange={e => setLastName(e.target.value)}
        />
        <input
          className="border p-2 rounded"
          placeholder="Téléphone"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />
        <input
          className="border p-2 rounded"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        {extraFields.map((field, idx) => (
          <div key={idx} className="flex space-x-2">
            <input
              className="border p-2 rounded w-1/2"
              placeholder="Libellé"
              value={field.key}
              onChange={e => updateField(idx, 'key', e.target.value)}
            />
            <input
              className="border p-2 rounded w-1/2"
              placeholder="Valeur"
              value={field.value}
              onChange={e => updateField(idx, 'value', e.target.value)}
            />
            <button type="button" className="text-red-600" onClick={() => removeField(idx)}>Supprimer</button>
          </div>
        ))}
        <button type="button" className="px-3 py-1 bg-gray-200 rounded" onClick={addField}>Ajouter un champ</button>
      </div>
      <div>
        <input type="file" onChange={e => setPhoto(e.target.files?.[0] || null)} />
      </div>
      <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Enregistrer</button>
    </form>
  );
};

export default ProfileForm;
