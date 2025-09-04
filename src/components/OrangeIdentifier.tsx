import React, { useState } from 'react';
import PageHeader from './PageHeader';
import { Key } from 'lucide-react';

const OrangeIdentifier: React.FC = () => {
  const [msisdn, setMsisdn] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch('/api/orange/identify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ msisdn })
      });
      if (!resp.ok) {
        throw new Error('Erreur de recherche');
      }
      const data = await resp.json();
      setResult(data.html);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader icon={<Key className="h-6 w-6" />} title="Identificateur Orange" />
      <div className="bg-white shadow-xl rounded-2xl p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="text"
            placeholder="Numéro à rechercher"
            value={msisdn}
            onChange={(e) => setMsisdn(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? 'Recherche...' : 'Rechercher'}
          </button>
        </form>
        {error && <p className="text-red-600 mt-4">{error}</p>}
        {result && (
          <div className="mt-4">
            <pre className="whitespace-pre-wrap break-all">{result}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrangeIdentifier;
