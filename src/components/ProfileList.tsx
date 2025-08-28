import React, { useEffect, useState } from 'react';

interface Profile {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  photo_path: string | null;
}

interface ProfileListProps {
  onCreate?: () => void;
  onEdit?: (id: number) => void;
}

const ProfileList: React.FC<ProfileListProps> = ({ onCreate, onEdit }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const token = localStorage.getItem('token');

  const load = async () => {
    const res = await fetch(`/api/profiles?q=${encodeURIComponent(query)}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : ''
      }
    });
    const data = await res.json();
    setProfiles(data.profiles || []);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: number) => {
    await fetch(`/api/profiles/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: token ? `Bearer ${token}` : ''
      }
    });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="border p-2 rounded flex-1"
          placeholder="Recherche"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={load}>Rechercher</button>
        {onCreate && (
          <button
            className="px-4 py-2 bg-green-600 text-white rounded"
            onClick={onCreate}
          >
            Créer profil
          </button>
        )}
      </div>
      {profiles.length === 0 ? (
        <div className="text-center text-gray-500">Aucun profil trouvé</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map(p => (
            <div key={p.id} className="bg-white shadow rounded-xl p-4 flex flex-col">
              <div className="flex items-center space-x-4">
                {p.photo_path && (
                  <img
                    src={`/${p.photo_path}`}
                    alt="profil"
                    className="w-16 h-16 rounded-full object-cover"
                  />
                )}
                <div>
                  <h3 className="text-lg font-semibold">{p.first_name} {p.last_name}</h3>
                  <p className="text-sm text-gray-500">{p.phone}</p>
                  <p className="text-sm text-gray-500">{p.email}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-end space-x-4 text-sm">
                {onEdit && (
                  <button className="text-indigo-600 hover:underline" onClick={() => onEdit(p.id)}>Modifier</button>
                )}
                <a
                  className="text-blue-600 hover:underline"
                  href={`/api/profiles/${p.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                >PDF</a>
                <button className="text-red-600 hover:underline" onClick={() => remove(p.id)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfileList;
