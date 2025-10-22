import React, { useEffect, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import ConfirmDialog, { ConfirmDialogOptions } from './ConfirmDialog';

interface ExtraField {
  key: string;
  value: string;
}

interface FieldCategory {
  title: string;
  fields: ExtraField[];
}

interface Attachment {
  id: number;
  original_name: string | null;
  file_path: string;
}

interface NewAttachment {
  file: File;
  name: string;
}

interface InitialValues {
  comment?: string;
  extra_fields?: FieldCategory[];
  photo_path?: string | null;
  attachments?: Attachment[];
}

interface ProfileFormProps {
  initialValues?: InitialValues;
  profileId?: number | null;
  onSaved?: (profileId?: number) => void;
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const ProfileForm: React.FC<ProfileFormProps> = ({ initialValues = {}, profileId, onSaved }) => {
  const buildProtectedUrl = (relativePath?: string | null) => {
    if (!relativePath) return null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    if (!token) return normalized;
    const separator = normalized.includes('?') ? '&' : '?';
    return `${normalized}${separator}token=${encodeURIComponent(token)}`;
  };

  const buildInitialFields = (): FieldCategory[] => {
    if (initialValues.extra_fields && initialValues.extra_fields.length) {
      return initialValues.extra_fields.map(category => ({
        title: category.title,
        fields:
          Array.isArray(category.fields) && category.fields.length
            ? category.fields.map(field => ({ key: field.key, value: field.value }))
            : [{ key: '', value: '' }]
      }));
    }
    return [
      {
        title: 'Informations',
        fields: [{ key: '', value: '' }]
      }
    ];
  };

  const [categories, setCategories] = useState<FieldCategory[]>(() => buildInitialFields());
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [comment, setComment] = useState(initialValues.comment || '');
  const [dragging, setDragging] = useState<{ catIdx: number; fieldIdx: number } | null>(null);
  const [dragOver, setDragOver] = useState<
    { catIdx: number; fieldIdx: number | 'end' } | null
  >(null);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>(
    () => initialValues.attachments || []
  );
  const [newAttachments, setNewAttachments] = useState<NewAttachment[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<number[]>([]);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);

  useEffect(() => {
    setCategories(buildInitialFields());
    setComment(initialValues.comment || '');
    if (initialValues.photo_path) {
      setPreview(buildProtectedUrl(initialValues.photo_path));
    } else {
      setPreview(null);
    }
    setPhoto(null);
    setRemovePhoto(false);
    setExistingAttachments(initialValues.attachments || []);
    setNewAttachments([]);
    setRemovedAttachmentIds([]);
  }, [initialValues, profileId]);

  const addCategory = () =>
    setCategories(prev => [...prev, { title: '', fields: [{ key: '', value: '' }] }]);
  const removeCategory = (idx: number) => {
    setConfirmDialog({
      title: 'Supprimer la catégorie',
      description: 'Supprimer cette catégorie et tous les champs associés ?',
      confirmLabel: 'Supprimer',
      tone: 'danger',
      icon: <Trash2 className="h-5 w-5" />,
      onConfirm: () => {
        setCategories(prev => prev.filter((_, i) => i !== idx));
      }
    });
  };
  const updateCategoryTitle = (idx: number, title: string) => {
    setCategories(prev => {
      const updated = [...prev];
      updated[idx].title = title;
      return updated;
    });
  };

  const addField = (catIdx: number) => {
    setCategories(prev => {
      const updated = [...prev];
      updated[catIdx].fields.push({ key: '', value: '' });
      return updated;
    });
  };
  const removeField = (catIdx: number, fieldIdx: number) => {
    setConfirmDialog({
      title: 'Supprimer le champ',
      description: 'Supprimer ce champ de la fiche ? Cette action est immédiate.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
      icon: <Trash2 className="h-5 w-5" />,
      onConfirm: () => {
        setCategories(prev => {
          const updated = [...prev];
          updated[catIdx].fields = updated[catIdx].fields.filter((_, i) => i !== fieldIdx);
          return updated;
        });
      }
    });
  };
  const updateField = (catIdx: number, fieldIdx: number, key: keyof ExtraField, value: string) => {
    setCategories(prev => {
      const updated = [...prev];
      if (key === 'key') value = capitalize(value);
      updated[catIdx].fields[fieldIdx] = {
        ...updated[catIdx].fields[fieldIdx],
        [key]: value
      };
      return updated;
    });
  };

  const handleDragStart = (catIdx: number, fieldIdx: number) => {
    setDragging({ catIdx, fieldIdx });
    setDragOver(null);
  };
  const handleDragEnter = (catIdx: number, fieldIdx: number | 'end') => {
    if (!dragging) return;
    if (dragging.catIdx === catIdx && dragging.fieldIdx === fieldIdx) return;
    setDragOver({ catIdx, fieldIdx });
  };
  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(null);
  };
  const moveField = (
    source: { catIdx: number; fieldIdx: number },
    target: { catIdx: number; fieldIdx: number | 'end' }
  ) => {
    setCategories(prev => {
      const updated = prev.map(cat => ({ ...cat, fields: [...cat.fields] }));
      const sourceCat = updated[source.catIdx];
      const targetCat = updated[target.catIdx];
      if (!sourceCat || !targetCat) {
        return prev;
      }
      const [item] = sourceCat.fields.splice(source.fieldIdx, 1);
      if (!item) {
        return prev;
      }
      if (target.fieldIdx === 'end') {
        targetCat.fields.push(item);
      } else {
        let insertionIndex = target.fieldIdx;
        if (source.catIdx === target.catIdx && source.fieldIdx < target.fieldIdx) {
          insertionIndex = Math.max(0, insertionIndex - 1);
        }
        targetCat.fields.splice(insertionIndex, 0, item);
      }
      return updated;
    });
  };
  const handleDrop = (catIdx: number, fieldIdx: number | 'end') => {
    if (!dragging) return;
    moveField(dragging, { catIdx, fieldIdx });
    setDragging(null);
    setDragOver(null);
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
    setRemovePhoto(false);
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    setPreview(null);
    setRemovePhoto(true);
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setNewAttachments(prev => [
        ...prev,
        ...files.map(file => ({
          file,
          name: file.name
        }))
      ]);
    }
    e.target.value = '';
  };

  const removeExistingAttachment = (id: number) => {
    setExistingAttachments(prev => prev.filter(att => att.id !== id));
    setRemovedAttachmentIds(prev => (prev.includes(id) ? prev : [...prev, id]));
  };

  const removeNewAttachment = (index: number) => {
    setNewAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const renameNewAttachment = (index: number, name: string) => {
    setNewAttachments(prev => prev.map((att, i) => (i === index ? { ...att, name } : att)));
  };

  const resolveAttachmentName = (attachment: NewAttachment) => {
    const trimmed = attachment.name.trim();
    if (!trimmed) {
      return attachment.file.name;
    }
    if (!trimmed.includes('.') && attachment.file.name.includes('.')) {
      const extIndex = attachment.file.name.lastIndexOf('.');
      const extension = attachment.file.name.slice(extIndex);
      return `${trimmed}${extension}`;
    }
    return trimmed;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = new FormData();
    let email = '';
    let phone = '';
    let first_name = '';
    let last_name = '';
    const formatted = categories.map(cat => ({
      title: cat.title,
      fields: cat.fields.map(f => ({ key: f.key, value: f.value }))
    }));
    formatted.forEach(cat => {
      cat.fields.forEach(f => {
        const lower = f.key.trim().toLowerCase();
        if (lower === 'email') email = f.value;
        if (['téléphone', 'telephone', 'phone'].includes(lower)) phone = f.value;
        if (['prénom', 'prenom', 'first name'].includes(lower)) first_name = f.value;
        if (['nom', 'last name'].includes(lower)) last_name = f.value;
      });
    });
    form.append('email', email);
    if (phone) form.append('phone', phone);
    if (first_name) form.append('first_name', first_name);
    if (last_name) form.append('last_name', last_name);
    form.append('comment', comment);
    form.append('extra_fields', JSON.stringify(formatted));
    if (photo) form.append('photo', photo);
    if (removePhoto && !photo) form.append('remove_photo', 'true');
    if (newAttachments.length) {
      newAttachments.forEach(att => {
        const resolvedName = resolveAttachmentName(att);
        const needsRename = resolvedName !== att.file.name;
        const fileToAppend = needsRename
          ? new File([att.file], resolvedName, {
              type: att.file.type,
              lastModified: att.file.lastModified
            })
          : att.file;
        form.append('attachments', fileToAppend);
      });
    }
    if (removedAttachmentIds.length) {
      form.append('remove_attachment_ids', JSON.stringify(removedAttachmentIds));
    }
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
      setPhoto(null);
      setNewAttachments([]);
      setRemovedAttachmentIds([]);
      if (data.profile) {
        setExistingAttachments(Array.isArray(data.profile.attachments) ? data.profile.attachments : []);
        setPreview(data.profile.photo_path ? buildProtectedUrl(data.profile.photo_path) : null);
        setRemovePhoto(false);
      }
      if (onSaved) onSaved(data.profile?.id);
    } else {
      setMessage(data.error || 'Erreur lors de la sauvegarde');
    }
  };

  return (
    <>
      <form
        className="max-w-2xl mx-auto bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl space-y-6"
        onSubmit={submit}
      >
      {message && <div className="text-center text-sm text-green-600">{message}</div>}
      <div className="space-y-8">
        {categories.map((cat, cIdx) => {
          const isCategoryTarget = dragOver?.catIdx === cIdx && dragOver?.fieldIdx === 'end';
          return (
            <div
              key={cIdx}
              className={`relative space-y-5 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-lg shadow-slate-200/60 transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-700/60 dark:bg-slate-900/70 ${
                isCategoryTarget ? 'ring-2 ring-blue-300/70' : ''
              }`}
              onDragOver={e => e.preventDefault()}
              onDragEnter={() => handleDragEnter(cIdx, 'end')}
              onDrop={e => {
                e.preventDefault();
                const targetField =
                  dragOver?.catIdx === cIdx && dragOver?.fieldIdx !== undefined
                    ? dragOver.fieldIdx
                    : 'end';
                handleDrop(cIdx, targetField);
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                    Catégorie
                  </span>
                  <input
                    className="w-full rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-inner transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400/60 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                    placeholder="Titre de la catégorie"
                    value={cat.title}
                    onChange={e => updateCategoryTitle(cIdx, e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200/70 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:border-rose-400/70 hover:bg-rose-100 hover:text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                  onClick={() => removeCategory(cIdx)}
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer la catégorie
                </button>
              </div>

              <div className="space-y-4">
                {cat.fields.map((field, fIdx) => {
                  const isDragging = dragging?.catIdx === cIdx && dragging.fieldIdx === fIdx;
                  const isTarget = dragOver?.catIdx === cIdx && dragOver?.fieldIdx === fIdx;
                  return (
                    <div
                      key={fIdx}
                      className={`group relative flex flex-col gap-4 rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm transition-all focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-200/80 sm:flex-row sm:items-start sm:gap-5 dark:border-slate-700/60 dark:bg-slate-900/60 ${
                        isDragging
                          ? 'cursor-grabbing opacity-70 ring-2 ring-blue-300/80'
                          : 'cursor-grab hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg'
                      } ${
                        isTarget
                          ? 'border-blue-400 bg-gradient-to-br from-blue-50/90 via-indigo-50/90 to-purple-50/90 ring-2 ring-blue-300/70 dark:from-slate-900/80 dark:via-slate-900/70 dark:to-slate-900/80'
                          : ''
                      }`}
                      draggable
                      onDragStart={() => handleDragStart(cIdx, fIdx)}
                      onDragEnter={() => handleDragEnter(cIdx, fIdx)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDrop(cIdx, fIdx);
                      }}
                      onDragEnd={handleDragEnd}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/70 bg-slate-50 text-slate-400 transition group-hover:border-slate-300 group-hover:text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-500">
                        <GripVertical className="h-5 w-5" />
                      </span>
                      <div className="flex-1 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Nom du champ
                            </label>
                            <input
                              className="w-full rounded-xl border border-slate-200/80 bg-white/95 px-4 py-2.5 text-sm text-slate-700 shadow-inner transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400/60 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                              placeholder="Nom du champ"
                              value={field.key}
                              onChange={e => updateField(cIdx, fIdx, 'key', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Valeur
                            </label>
                            <input
                              className="w-full rounded-xl border border-slate-200/80 bg-white/95 px-4 py-2.5 text-sm text-slate-700 shadow-inner transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400/60 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                              placeholder="Valeur"
                              value={field.value}
                              onChange={e => updateField(cIdx, fIdx, 'value', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Glissez pour réorganiser</span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-rose-500 transition hover:-translate-y-0.5 hover:border-rose-400/70 hover:bg-rose-100 hover:text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                            onClick={() => removeField(cIdx, fIdx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Supprimer le champ
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {dragging && (
                  <div
                    className={`rounded-2xl border-2 border-dashed px-4 py-4 text-center text-sm transition ${
                      isCategoryTarget
                        ? 'border-blue-400 bg-blue-50/70 text-blue-600 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-200'
                        : 'border-slate-200 text-slate-400 dark:border-slate-700/60 dark:text-slate-500'
                    }`}
                    onDragEnter={() => handleDragEnter(cIdx, 'end')}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDrop(cIdx, 'end');
                    }}
                  >
                    Déposez ici pour ajouter à la fin de cette catégorie
                  </div>
                )}
              </div>

              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
                onClick={() => addField(cIdx)}
              >
                <Plus className="h-4 w-4" />
                Ajouter un champ
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/40 transition hover:-translate-y-0.5 hover:shadow-xl"
          onClick={addCategory}
        >
          <Plus className="h-4 w-4" />
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
      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
          <label className="block mb-2 font-medium text-gray-700">Photo de profil</label>
          <input
            type="file"
            accept="image/*"
            onChange={handlePhoto}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {preview ? (
            <div className="mt-4 space-y-3">
              <img src={preview} alt="preview" className="w-32 h-32 object-cover rounded-full mx-auto" />
              <button
                type="button"
                className="px-3 py-1 text-sm text-red-600 hover:text-red-700"
                onClick={handleRemovePhoto}
              >
                Retirer la photo
              </button>
            </div>
          ) : removePhoto ? (
            <p className="mt-3 text-sm text-gray-500">La photo actuelle sera supprimée lors de la sauvegarde.</p>
          ) : (
            <p className="mt-3 text-sm text-gray-500">Aucune photo sélectionnée.</p>
          )}
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm space-y-3">
          <label className="block font-medium text-gray-700">Pièces jointes</label>
          <input
            type="file"
            multiple
            onChange={handleAttachmentChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {existingAttachments.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-600">Pièces jointes enregistrées</div>
              <ul className="space-y-2 max-h-40 overflow-y-auto pr-1 preview-scroll">
                {existingAttachments.map(att => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <a
                      href={buildProtectedUrl(att.file_path) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex-1 min-w-0"
                    >
                      <span className="truncate">{att.original_name || att.file_path.split('/').pop()}</span>
                    </a>
                    <button
                      type="button"
                      className="ml-2 text-red-500 hover:text-red-700"
                      onClick={() => removeExistingAttachment(att.id)}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {newAttachments.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-600">Nouvelles pièces jointes</div>
              <ul className="space-y-3 max-h-48 overflow-y-auto pr-1 preview-scroll">
                {newAttachments.map((att, idx) => {
                  const resolvedName = resolveAttachmentName(att);
                  return (
                    <li
                      key={`${att.file.name}-${att.file.lastModified}-${idx}`}
                      className="bg-white border border-dashed border-gray-300 rounded-lg px-3 py-3 text-sm space-y-2"
                    >
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Nom de la pièce jointe</label>
                        <input
                          className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={att.name}
                          placeholder={att.file.name}
                          onChange={e => renameNewAttachment(idx, e.target.value)}
                        />
                        {resolvedName !== att.file.name && (
                          <div className="text-xs text-gray-500">
                            Nom final : <span className="font-medium">{resolvedName}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-xs text-gray-500 truncate">Taille : {(att.file.size / 1024).toFixed(1)} Ko</span>
                        <button
                          type="button"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => removeNewAttachment(idx)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {existingAttachments.length === 0 && newAttachments.length === 0 && (
            <p className="text-sm text-gray-500">Aucune pièce jointe n'est associée à ce profil.</p>
          )}
        </div>
      </div>
      <button
        type="submit"
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Enregistrer
      </button>
      </form>
      {confirmDialog && (
        <ConfirmDialog
          open
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          tone={confirmDialog.tone}
          icon={confirmDialog.icon}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
};

export default ProfileForm;
