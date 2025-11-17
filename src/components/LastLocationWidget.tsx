import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import L from 'leaflet';
import { Loader2, MapPin, RefreshCw, Satellite, Target } from 'lucide-react';

interface LastLocationPoint {
  number: string;
  latitude: number;
  longitude: number;
  label?: string | null;
  date?: string | null;
  time?: string | null;
  timestamp?: string | null;
  source?: string | null;
  cgi?: string | null;
}

interface LastLocationWidgetProps {
  defaultNumber?: string;
}

const markerIcon = L.divIcon({
  html: `
    <div class="last-location-marker">
      <span class="last-location-marker__pulse"></span>
      <span class="last-location-marker__dot"></span>
    </div>
  `,
  iconSize: [46, 46],
  iconAnchor: [23, 40],
  popupAnchor: [0, -34],
  className: 'last-location-marker-wrapper'
});

const MapAutoCenter = ({ position }: { position: LatLngTuple }) => {
  const map = useMap();

  useEffect(() => {
    map.flyTo(position, 15, { animate: true, duration: 0.8 });
  }, [map, position]);

  return null;
};

const LastLocationMap = ({ point }: { point: LastLocationPoint }) => {
  const position = useMemo<LatLngTuple>(
    () => [point.latitude, point.longitude],
    [point.latitude, point.longitude]
  );

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-100/80 shadow-lg shadow-slate-200/50 dark:border-slate-700/60 dark:shadow-black/40">
      <MapContainer
        center={position}
        zoom={14}
        scrollWheelZoom
        zoomControl={false}
        className="last-location-map h-72 w-full"
        key={`${point.latitude}-${point.longitude}-${point.timestamp ?? ''}`}
      >
        <MapAutoCenter position={position} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <Marker position={position} icon={markerIcon}>
          <Popup className="last-location-popup">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Numéro suivi
              </p>
              <p className="text-base font-bold text-slate-900">{point.number}</p>
              <p className="text-xs text-slate-500">
                {point.date || 'Date inconnue'}
                {point.time && point.time !== 'N/A' ? ` · ${point.time}` : ''}
              </p>
            </div>
          </Popup>
        </Marker>
        <ZoomControl position="bottomright" />
      </MapContainer>
      <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/30" />
    </div>
  );
};

const LastLocationWidget = ({ defaultNumber = '' }: LastLocationWidgetProps) => {
  const [numberInput, setNumberInput] = useState(defaultNumber);
  const [isDirty, setIsDirty] = useState(Boolean(defaultNumber));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<LastLocationPoint | null>(null);

  useEffect(() => {
    if (!numberInput.trim()) {
      setIsDirty(false);
    }
  }, [numberInput]);

  useEffect(() => {
    if (!defaultNumber) {
      return;
    }
    if (!isDirty) {
      setNumberInput(defaultNumber);
    }
  }, [defaultNumber, isDirty]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIsDirty(true);
    setNumberInput(event.target.value);
  };

  const fetchLastLocation = useCallback(async () => {
    const trimmed = numberInput.trim();
    if (!trimmed) {
      setError('Saisissez un numéro à localiser.');
      setResult(null);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ number: trimmed });
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/cdr/realtime/last-location?${params.toString()}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      const data = await response.json();

      if (!response.ok) {
        setResult(null);
        setError(data?.error || "Aucune localisation n'a été trouvée pour ce numéro.");
        return;
      }

      const latitude = Number(data.latitude ?? data.lat);
      const longitude = Number(data.longitude ?? data.lng);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setResult(null);
        setError('La réponse ne contient pas de coordonnées exploitables.');
        return;
      }

      setResult({
        number: data.number || trimmed,
        latitude,
        longitude,
        label: data.label || data.nom || data.locationName || null,
        date: data.date || data.callDate || null,
        time: data.time || data.callTime || null,
        timestamp: data.timestamp || null,
        source: data.source || data.source_file || null,
        cgi: data.cgi || null
      });
    } catch (apiError) {
      console.error('Erreur lors de la récupération de la dernière localisation:', apiError);
      setResult(null);
      setError('Impossible de récupérer la localisation. Réessayez dans un instant.');
    } finally {
      setLoading(false);
    }
  }, [numberInput]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    fetchLastLocation();
  };

  const resetResult = () => {
    setResult(null);
    setError('');
  };

  const lastSeen = useMemo(() => {
    if (!result) return '';
    const datePart = result.date && result.date !== 'N/A' ? result.date : '';
    const timePart = result.time && result.time !== 'N/A' ? result.time : '';
    if (datePart && timePart) {
      return `${datePart} à ${timePart}`;
    }
    return datePart || timePart;
  }, [result]);

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/80 p-6 shadow-xl shadow-slate-200/50 backdrop-blur dark:border-slate-700/70 dark:from-slate-900/70 dark:to-slate-900/40 dark:shadow-black/40">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Dernière localisation
            </p>
            <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Point unique en temps réel
            </h4>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm dark:bg-blue-500/20 dark:text-blue-200">
            <Satellite className="h-3.5 w-3.5" />
            Live
          </span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Visualisez instantanément la dernière trace géolocalisée d’un numéro sans charger tout l’historique.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Numéro à localiser
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center overflow-hidden rounded-full border border-slate-200/80 bg-white/90 pl-4 pr-2 shadow-inner focus-within:border-blue-400/70 focus-within:ring-2 focus-within:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/60">
            <Target className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={numberInput}
              onChange={handleInputChange}
              placeholder={defaultNumber ? `Ex: ${defaultNumber}` : 'Ex: 221771234567'}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
            />
            {numberInput && (
              <button
                type="button"
                onClick={() => {
                  setNumberInput('');
                  resetResult();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 transition hover:text-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-white"
                aria-label="Effacer le numéro"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              Localiser
            </button>
            <button
              type="button"
              onClick={resetResult}
              className="inline-flex items-center justify-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-300"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>

      {error && (
        <p className="mt-3 rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-2 text-sm font-medium text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-4">
        {result ? (
          <>
            <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Zone identifiée
                  </p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {result.label || 'Coordonnée confirmée'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    {lastSeen ? `Vue le ${lastSeen}` : 'Horodatage indisponible'}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-slate-700 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Numéro</dt>
                  <dd className="mt-1 text-base font-semibold">{result.number}</dd>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-slate-700 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">CGI</dt>
                  <dd className="mt-1 text-base font-semibold">{result.cgi || 'N/A'}</dd>
                </div>
              </dl>
            </div>
            <LastLocationMap point={result} />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Source : {result.source || 'CDR temps réel'} · Mise à jour en fonction de la dernière trace géolocalisée disponible.
            </p>
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300/70 bg-white/70 px-5 py-6 text-sm text-slate-500 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300">
            Lancez une localisation pour afficher automatiquement le dernier point et zoomer sur la zone correspondante.
          </div>
        )}
      </div>
    </section>
  );
};

export default LastLocationWidget;
