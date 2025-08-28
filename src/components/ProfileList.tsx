import React, { useEffect, useState } from 'react';

interface Profile {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

const ProfileList: React.FC = () => {
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
    <div className="space-y-4">
      <div className="flex space-x-2">
        <input
          className="border p-2 rounded flex-1"
          placeholder="Recherche"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={load}>Rechercher</button>
      </div>
      <ul className="divide-y">
        {profiles.map(p => (
          <li key={p.id} className="py-2 flex items-center justify-between">
            <span>{p.first_name} {p.last_name} - {p.phone}</span>
            <div className="space-x-2">
              <a
                className="text-blue-600"
                href={`/api/profiles/${p.id}/pdf`}
                target="_blank"
                rel="noopener"
              >PDF</a>
              <button className="text-red-600" onClick={() => remove(p.id)}>Supprimer</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProfileList;
