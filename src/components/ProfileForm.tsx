import React, { useEffect, useState } from 'react';

interface ExtraField {
  key: string;
  value: string;
}

interface FieldCategory {
  title: string;
  fields: ExtraField[];
}

interface InitialValues {
  comment?: string;
  extra_fields?: FieldCategory[];
  photo_path?: string | null;
}

interface ProfileFormProps {
  initialValues?: InitialValues;
  profileId?: number | null;
  onSaved?: () => void;
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const ProfileForm: React.FC<ProfileFormProps> = ({ initialValues = {}, profileId, onSaved }) => {
  const buildInitialFields = (): FieldCategory[] => {
    if (initialValues.extra_fields && initialValues.extra_fields.length) {
      return initialValues.extra_fields;
    }
    return [
      {
        title: 'Informations',
        fields: [{ key: '', value: '' }]
      }
    ];
  };

  const [categories, setCategories] = useState<FieldCategory[]>(buildInitialFields);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [comment, setComment] = useState(initialValues.comment || '');
  const [dragging, setDragging] = useState<{ catIdx: number; fieldIdx: number } | null>(null);

  useEffect(() => {
    setCategories(buildInitialFields());
    setComment(initialValues.comment || '');
    if (initialValues.photo_path) {
      setPreview(`/${initialValues.photo_path}`);
    } else {
      setPreview(null);
    }
    setPhoto(null);
  }, [initialValues, profileId]);

  const addCategory = () =>
    setCategories([...categories, { title: '', fields: [{ key: '', value: '' }] }]);
  const removeCategory = (idx: number) =>
    setCategories(categories.filter((_, i) => i !== idx));
  const updateCategoryTitle = (idx: number, title: string) => {
    const updated = [...categories];
    updated[idx].title = title;
    setCategories(updated);
  };

  const addField = (catIdx: number) => {
    const updated = [...categories];
    updated[catIdx].fields.push({ key: '', value: '' });
    setCategories(updated);
  };
  const removeField = (catIdx: number, fieldIdx: number) => {
    const updated = [...categories];
    updated[catIdx].fields = updated[catIdx].fields.filter((_, i) => i !== fieldIdx);
    setCategories(updated);
  };
  const updateField = (catIdx: number, fieldIdx: number, key: keyof ExtraField, value: string) => {
    const updated = [...categories];
    if (key === 'key') value = capitalize(value);
    updated[catIdx].fields[fieldIdx] = {
      ...updated[catIdx].fields[fieldIdx],
      [key]: value
    };
    setCategories(updated);
  };

  const handleDragStart = (catIdx: number, fieldIdx: number) => {
    setDragging({ catIdx, fieldIdx });
  };
  const handleDrop = (catIdx: number, fieldIdx: number) => {
    if (!dragging) return;
    const updated = categories.map(cat => ({ ...cat, fields: [...cat.fields] }));
    const item = updated[dragging.catIdx].fields.splice(dragging.fieldIdx, 1)[0];
    if (!item) return;
    updated[catIdx].fields.splice(fieldIdx, 0, item);
    setCategories(updated);
    setDragging(null);
  };
  const handleDropOnCategory = (catIdx: number) => {
    if (!dragging) return;
    const updated = categories.map(cat => ({ ...cat, fields: [...cat.fields] }));
    const item = updated[dragging.catIdx].fields.splice(dragging.fieldIdx, 1)[0];
    if (!item) return;
    updated[catIdx].fields.push(item);
    setCategories(updated);
    setDragging(null);
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData();
    let email = '';
    const formatted = categories.map(cat => ({
      title: cat.title,
      fields: cat.fields.map(f => ({ key: f.key, value: f.value }))
    }));
    formatted.forEach(cat => {
      cat.fields.forEach(f => {
        const lower = f.key.trim().toLowerCase();
        if (lower === 'email') email = f.value;
      });
    });
    form.append('email', email);
    form.append('comment', comment);
    form.append('extra_fields', JSON.stringify(formatted));
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
      className="max-w-2xl mx-auto bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl space-y-6"
      onSubmit={submit}
    >
      {message && <div className="text-center text-sm text-green-600">{message}</div>}
      <div className="space-y-6">
        {categories.map((cat, cIdx) => (
          <div
            key={cIdx}
            className="space-y-4 bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm"
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDropOnCategory(cIdx)}
          >
            <div className="flex items-center space-x-3">
              <input
                className="flex-1 rounded-lg border-2 border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Titre de la catégorie"
                value={cat.title}
                onChange={e => updateCategoryTitle(cIdx, e.target.value)}
              />
              <button
                type="button"
                className="text-red-500 hover:text-red-700"
                onClick={() => removeCategory(cIdx)}
              >
                Supprimer
              </button>
            </div>
            {cat.fields.map((field, fIdx) => (
              <div
                key={fIdx}
                className="flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0"
                draggable
                onDragStart={() => handleDragStart(cIdx, fIdx)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(cIdx, fIdx)}
              >
                <input
                  className="flex-1 rounded-lg border-2 border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Nom du champ"
                  value={field.key}
                  onChange={e => updateField(cIdx, fIdx, 'key', e.target.value)}
                />
                <input
                  className="flex-1 rounded-lg border-2 border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Valeur"
                  value={field.value}
                  onChange={e => updateField(cIdx, fIdx, 'value', e.target.value)}
                />
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700 mt-1 sm:mt-0"
                  onClick={() => removeField(cIdx, fIdx)}
                >
                  Supprimer
                </button>
              </div>
            ))}
            <button
              type="button"
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
              onClick={() => addField(cIdx)}
            >
              Ajouter un champ
            </button>
          </div>
        ))}
        <button
          type="button"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          onClick={addCategory}
        >
          Ajouter une catégorie
        </button>
      </div>
      <div>
        <label className="block mb-2 font-medium text-gray-700">Commentaire</label>
        <textarea
          className="w-full rounded-lg border-2 border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
      </div>
      <div>
        <input
          type="file"
          onChange={handlePhoto}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
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
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Enregistrer
      </button>
    </form>
  );
};

export default ProfileForm;
