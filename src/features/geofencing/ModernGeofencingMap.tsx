import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LatLngBoundsLiteral, LatLngLiteral } from 'leaflet';
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Crosshair,
  Layers,
  LocateFixed,
  MapPin,
  MousePointer2,
  Plus,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { useNotifications } from '../../components/NotificationProvider';

type CdrPoint = {
  latitude: string;
  longitude: string;
  nom: string;
  type: string;
  callDate: string;
  startTime: string;
  endTime: string;
};

type DrawingMode = 'polygon' | 'rectangle' | 'circle';

type GeofenceGeometry =
  | { type: 'polygon'; points: LatLngLiteral[] }
  | { type: 'rectangle'; bounds: LatLngBoundsLiteral }
  | { type: 'circle'; center: LatLngLiteral; radius: number };

type GeofenceZone = {
  id: number;
  name: string;
  color: string;
  active: boolean;
  geometry: GeofenceGeometry;
  createdAt: string;
};

type ModernGeofencingMapProps = {
  points: CdrPoint[];
  zoneMode: boolean;
  onZoneModeChange: (value: boolean) => void;
  onZoneCreated: () => void;
};

const BASE_MAPS = [
  {
    id: 'voyager',
    label: 'Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  },
  {
    id: 'dark',
    label: 'Nocturne',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; Stadia Maps'
  },
  {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  }
];

const ZONE_COLORS = ['#2563eb', '#7c3aed', '#14b8a6', '#f97316', '#e11d48'];

const formatArea = (area: number) => {
  if (!Number.isFinite(area)) return '--';
  if (area > 1_000_000) {
    return `${(area / 1_000_000).toFixed(2)} km²`;
  }
  return `${Math.round(area)} m²`;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineDistance = (a: LatLngLiteral, b: LatLngLiteral) => {
  const radius = 6_378_137;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radius * Math.asin(Math.sqrt(haversine));
};

const polygonArea = (points: LatLngLiteral[]) => {
  if (points.length < 3) return 0;
  const radius = 6_378_137;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += toRadians(p2.lng - p1.lng) * (2 + Math.sin(toRadians(p1.lat)) + Math.sin(toRadians(p2.lat)));
  }
  return Math.abs((area * radius * radius) / 2);
};

const getBoundsLiteral = (bounds: { north: number; south: number; east: number; west: number }) =>
  [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east]
  ] as LatLngBoundsLiteral;

const serializeBounds = (bounds: LatLngBoundsLiteral) => {
  const [[latA, lngA], [latB, lngB]] = bounds;
  return {
    north: Math.max(latA, latB),
    south: Math.min(latA, latB),
    east: Math.max(lngA, lngB),
    west: Math.min(lngA, lngB)
  };
};

const createMarkerIcon = (color: string) =>
  L.divIcon({
    className: 'rounded-full',
    html: renderToStaticMarkup(
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-lg">
        <MapPin className="h-5 w-5" style={{ color }} />
      </div>
    ),
    iconSize: [40, 40],
    iconAnchor: [20, 32]
  });

const GeofenceDrawingEvents = ({
  drawingMode,
  zoneMode,
  polygonDraft,
  rectangleDraft,
  circleDraft,
  setPolygonDraft,
  setRectangleDraft,
  setCircleDraft,
  onComplete
}: {
  drawingMode: DrawingMode;
  zoneMode: boolean;
  polygonDraft: LatLngLiteral[];
  rectangleDraft: { start: LatLngLiteral | null; end: LatLngLiteral | null };
  circleDraft: { center: LatLngLiteral | null; radius: number };
  setPolygonDraft: (value: LatLngLiteral[]) => void;
  setRectangleDraft: (value: { start: LatLngLiteral | null; end: LatLngLiteral | null }) => void;
  setCircleDraft: (value: { center: LatLngLiteral | null; radius: number }) => void;
  onComplete: (geometry: GeofenceGeometry) => void;
}) => {
  useMapEvents({
    click(event) {
      if (!zoneMode) return;
      if (drawingMode === 'polygon') {
        setPolygonDraft([...polygonDraft, event.latlng]);
      }
      if (drawingMode === 'rectangle') {
        if (!rectangleDraft.start) {
          setRectangleDraft({ start: event.latlng, end: null });
        } else if (!rectangleDraft.end) {
          const bounds: LatLngBoundsLiteral = [
            [rectangleDraft.start.lat, rectangleDraft.start.lng],
            [event.latlng.lat, event.latlng.lng]
          ];
          onComplete({ type: 'rectangle', bounds });
          setRectangleDraft({ start: null, end: null });
        }
      }
      if (drawingMode === 'circle') {
        if (!circleDraft.center) {
          setCircleDraft({ center: event.latlng, radius: 0 });
        } else if (circleDraft.radius > 0) {
          onComplete({ type: 'circle', center: circleDraft.center, radius: circleDraft.radius });
          setCircleDraft({ center: null, radius: 0 });
        }
      }
    },
    mousemove(event) {
      if (!zoneMode) return;
      if (drawingMode === 'rectangle' && rectangleDraft.start) {
        setRectangleDraft({ start: rectangleDraft.start, end: event.latlng });
      }
      if (drawingMode === 'circle' && circleDraft.center) {
        setCircleDraft({
          center: circleDraft.center,
          radius: haversineDistance(circleDraft.center, event.latlng)
        });
      }
    },
    dblclick() {
      if (!zoneMode) return;
      if (drawingMode === 'polygon' && polygonDraft.length >= 3) {
        onComplete({ type: 'polygon', points: polygonDraft });
        setPolygonDraft([]);
      }
    }
  });
  return null;
};

const GeofenceList = ({
  zones,
  onToggle,
  onRemove,
  onZoom
}: {
  zones: GeofenceZone[];
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
  onZoom: (geometry: GeofenceGeometry) => void;
}) => (
  <div className="space-y-3">
    {zones.map((zone) => (
      <div
        key={zone.id}
        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-xs text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200"
      >
        <button
          type="button"
          onClick={() => onZoom(zone.geometry)}
          className="flex flex-1 flex-col gap-1 text-left"
        >
          <span className="text-sm font-semibold" style={{ color: zone.color }}>
            {zone.name}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-300">
            {zone.geometry.type === 'circle'
              ? `Rayon ${Math.round(zone.geometry.radius)} m`
              : zone.geometry.type === 'rectangle'
                ? 'Rectangle'
                : `${zone.geometry.points.length} sommets`}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggle(zone.id)}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
              zone.active
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            {zone.active ? 'Actif' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => onRemove(zone.id)}
            className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600"
            aria-label="Supprimer la zone"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    ))}
  </div>
);

const ZoomController = ({ geometry }: { geometry: GeofenceGeometry | null }) => {
  const map = useMap();

  if (!geometry) return null;

  if (geometry.type === 'circle') {
    map.flyTo(geometry.center, 14, { duration: 0.8 });
  }
  if (geometry.type === 'polygon') {
    map.fitBounds(geometry.points.map((point) => [point.lat, point.lng]), { padding: [40, 40] });
  }
  if (geometry.type === 'rectangle') {
    map.fitBounds(geometry.bounds, { padding: [40, 40] });
  }
  return null;
};

const ModernGeofencingMap = ({ points, zoneMode, onZoneModeChange, onZoneCreated }: ModernGeofencingMapProps) => {
  const { notifyInfo, notifySuccess } = useNotifications();
  const [selectedMapId, setSelectedMapId] = useState(BASE_MAPS[0].id);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('polygon');
  const [polygonDraft, setPolygonDraft] = useState<LatLngLiteral[]>([]);
  const [rectangleDraft, setRectangleDraft] = useState<{ start: LatLngLiteral | null; end: LatLngLiteral | null }>({
    start: null,
    end: null
  });
  const [circleDraft, setCircleDraft] = useState<{ center: LatLngLiteral | null; radius: number }>({
    center: null,
    radius: 0
  });
  const [zoneName, setZoneName] = useState('');
  const [zones, setZones] = useState<GeofenceZone[]>([]);
  const [zoomTarget, setZoomTarget] = useState<GeofenceGeometry | null>(null);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesSaving, setZonesSaving] = useState(false);

  const mapConfig = BASE_MAPS.find((map) => map.id === selectedMapId) ?? BASE_MAPS[0];
  const activeZonesCount = useMemo(() => zones.filter((zone) => zone.active).length, [zones]);

  const getAuthHeaders = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const normalizeZone = useCallback((zone: any): GeofenceZone | null => {
    try {
      const geometry = typeof zone.geometry === 'string' ? JSON.parse(zone.geometry) : zone.geometry;
      const metadata = typeof zone.metadata === 'string' ? JSON.parse(zone.metadata) : zone.metadata || {};

      if (zone.type === 'polygon') {
        if (!Array.isArray(geometry?.points)) return null;
        return {
          id: Number(zone.id),
          name: zone.name || 'Zone',
          color: metadata.color || ZONE_COLORS[0],
          active: metadata.active ?? true,
          geometry: { type: 'polygon', points: geometry.points },
          createdAt: zone.created_at || zone.createdAt || new Date().toISOString()
        };
      }

      if (zone.type === 'rectangle') {
        const bounds = geometry?.bounds || geometry;
        if (![bounds?.north, bounds?.south, bounds?.east, bounds?.west].every(Number.isFinite)) {
          return null;
        }
        return {
          id: Number(zone.id),
          name: zone.name || 'Zone',
          color: metadata.color || ZONE_COLORS[0],
          active: metadata.active ?? true,
          geometry: { type: 'rectangle', bounds: getBoundsLiteral(bounds) },
          createdAt: zone.created_at || zone.createdAt || new Date().toISOString()
        };
      }

      if (zone.type === 'circle') {
        if (!geometry?.center || !Number.isFinite(geometry.radius)) return null;
        return {
          id: Number(zone.id),
          name: zone.name || 'Zone',
          color: metadata.color || ZONE_COLORS[0],
          active: metadata.active ?? true,
          geometry: { type: 'circle', center: geometry.center, radius: geometry.radius },
          createdAt: zone.created_at || zone.createdAt || new Date().toISOString()
        };
      }
    } catch (error) {
      return null;
    }
    return null;
  }, []);

  const loadZones = useCallback(async () => {
    setZonesLoading(true);
    try {
      const response = await fetch('/api/geofencing/zones', { headers: getAuthHeaders() });
      if (!response.ok) {
        throw new Error('Requête zones impossible');
      }
      const data = await response.json();
      const parsed = Array.isArray(data) ? data.map(normalizeZone).filter(Boolean) : [];
      setZones(parsed as GeofenceZone[]);
    } catch (error) {
      console.error('Chargement zones geofencing impossible', error);
      notifyInfo('Impossible de récupérer les zones de geofencing.');
    } finally {
      setZonesLoading(false);
    }
  }, [getAuthHeaders, normalizeZone, notifyInfo]);

  const routePositions = useMemo(
    () =>
      points
        .map((point) => ({
          lat: Number(point.latitude),
          lng: Number(point.longitude)
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [points]
  );

  const latestPoint = routePositions[routePositions.length - 1];
  const center = latestPoint ?? { lat: 14.7167, lng: -17.4677 };

  const draftGeometry = useMemo(() => {
    if (drawingMode === 'polygon' && polygonDraft.length >= 3) {
      return { type: 'polygon', points: polygonDraft } as GeofenceGeometry;
    }
    if (drawingMode === 'rectangle' && rectangleDraft.start && rectangleDraft.end) {
      return {
        type: 'rectangle',
        bounds: [
          [rectangleDraft.start.lat, rectangleDraft.start.lng],
          [rectangleDraft.end.lat, rectangleDraft.end.lng]
        ]
      } as GeofenceGeometry;
    }
    if (drawingMode === 'circle' && circleDraft.center && circleDraft.radius > 0) {
      return { type: 'circle', center: circleDraft.center, radius: circleDraft.radius } as GeofenceGeometry;
    }
    return null;
  }, [circleDraft, drawingMode, polygonDraft, rectangleDraft]);

  const draftArea = useMemo(() => {
    if (!draftGeometry) return '--';
    if (draftGeometry.type === 'polygon') return formatArea(polygonArea(draftGeometry.points));
    if (draftGeometry.type === 'rectangle') {
      const [north, south] = draftGeometry.bounds;
      const height = haversineDistance(
        { lat: north[0], lng: north[1] },
        { lat: south[0], lng: north[1] }
      );
      const width = haversineDistance(
        { lat: north[0], lng: north[1] },
        { lat: north[0], lng: south[1] }
      );
      return formatArea(height * width);
    }
    if (draftGeometry.type === 'circle') return formatArea(Math.PI * draftGeometry.radius ** 2);
    return '--';
  }, [draftGeometry]);

  const persistZone = useCallback(
    async (geometry: GeofenceGeometry, name: string) => {
      const color = ZONE_COLORS[zones.length % ZONE_COLORS.length];
      const payload = {
        name,
        type: geometry.type,
        geometry:
          geometry.type === 'rectangle'
            ? { bounds: serializeBounds(geometry.bounds) }
            : geometry.type === 'polygon'
              ? { points: geometry.points }
              : { center: geometry.center, radius: geometry.radius },
        metadata: {
          color,
          active: true
        }
      };

      setZonesSaving(true);
      try {
        const response = await fetch('/api/geofencing/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const details = (await response.text())?.trim();
          throw new Error(details || 'Sauvegarde impossible');
        }
        await loadZones();
        notifySuccess('Zone enregistrée avec succès.');
        onZoneCreated();
        return true;
      } catch (error) {
        console.error('Enregistrement zone geofencing impossible', error);
        const message = error instanceof Error ? error.message : "Impossible d'enregistrer la zone.";
        notifyInfo(message);
        return false;
      } finally {
        setZonesSaving(false);
      }
    },
    [getAuthHeaders, loadZones, notifyInfo, notifySuccess, onZoneCreated, zones.length]
  );

  const resetDraft = useCallback(() => {
    setZoneName('');
    setPolygonDraft([]);
    setRectangleDraft({ start: null, end: null });
    setCircleDraft({ center: null, radius: 0 });
  }, []);

  const handleSaveZone = useCallback(async () => {
    if (!draftGeometry) return;
    const name = zoneName.trim() || `Zone ${zones.length + 1}`;
    const saved = await persistZone(draftGeometry, name);
    if (saved) {
      resetDraft();
      onZoneModeChange(false);
    }
  }, [draftGeometry, onZoneModeChange, persistZone, resetDraft, zoneName, zones.length]);

  const handleQuickComplete = useCallback(
    async (geometry: GeofenceGeometry) => {
      const name = zoneName.trim() || `Zone ${zones.length + 1}`;
      const saved = await persistZone(geometry, name);
      if (saved) {
        resetDraft();
        onZoneModeChange(false);
      }
    },
    [onZoneModeChange, persistZone, resetDraft, zoneName, zones.length]
  );

  const handleToggleZone = useCallback(
    async (id: number) => {
      const current = zones.find((zone) => zone.id === id);
      if (!current) return;
      try {
        const response = await fetch(`/api/geofencing/zones/${id}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ active: !current.active })
        });
        if (!response.ok) {
          throw new Error('Mise à jour impossible');
        }
        const updated = normalizeZone(await response.json());
        if (updated) {
          setZones((prev) => prev.map((zone) => (zone.id === id ? updated : zone)));
        }
      } catch (error) {
        console.error('Activation zone impossible', error);
        notifyInfo('Impossible de modifier le statut de la zone.');
      }
    },
    [getAuthHeaders, normalizeZone, notifyInfo, zones]
  );

  const handleRemoveZone = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`/api/geofencing/zones/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (!response.ok) {
          throw new Error('Suppression impossible');
        }
        setZones((prev) => prev.filter((zone) => zone.id !== id));
        notifySuccess('Zone supprimée.');
      } catch (error) {
        console.error('Suppression zone impossible', error);
        notifyInfo('Impossible de supprimer la zone.');
      }
    },
    [getAuthHeaders, notifyInfo, notifySuccess]
  );

  const handleZoomToZone = useCallback((geometry: GeofenceGeometry) => {
    setZoomTarget(geometry);
    window.setTimeout(() => setZoomTarget(null), 0);
  }, []);

  const drawInstructions = useMemo(() => {
    if (!zoneMode) return 'Activez le mode dessin pour créer une zone.';
    if (drawingMode === 'polygon') return 'Cliquez pour ajouter des sommets, double-cliquez pour terminer.';
    if (drawingMode === 'rectangle') return 'Cliquez pour définir un coin, puis cliquez à nouveau pour valider.';
    return 'Cliquez pour placer le centre, puis cliquez à nouveau pour finaliser le rayon.';
  }, [drawingMode, zoneMode]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  return (
    <div className="relative h-full min-h-[520px]">
      <MapContainer
        center={center}
        zoom={13}
        zoomControl={false}
        doubleClickZoom={false}
        className="h-full w-full"
      >
        <TileLayer attribution={mapConfig.attribution} url={mapConfig.url} />
        <ZoomController geometry={zoomTarget} />
        <GeofenceDrawingEvents
          drawingMode={drawingMode}
          zoneMode={zoneMode}
          polygonDraft={polygonDraft}
          rectangleDraft={rectangleDraft}
          circleDraft={circleDraft}
          setPolygonDraft={setPolygonDraft}
          setRectangleDraft={setRectangleDraft}
          setCircleDraft={setCircleDraft}
          onComplete={handleQuickComplete}
        />
        {routePositions.length > 1 && (
          <Polyline positions={routePositions} pathOptions={{ color: '#38bdf8', weight: 3 }} />
        )}
        {latestPoint && <Marker position={latestPoint} icon={createMarkerIcon('#2563eb')} />}

        {draftGeometry?.type === 'polygon' && (
          <Polygon positions={draftGeometry.points} pathOptions={{ color: '#6366f1', fillOpacity: 0.2 }} />
        )}
        {draftGeometry?.type === 'rectangle' && (
          <Rectangle bounds={draftGeometry.bounds} pathOptions={{ color: '#6366f1', fillOpacity: 0.2 }} />
        )}
        {draftGeometry?.type === 'circle' && (
          <Circle center={draftGeometry.center} radius={draftGeometry.radius} pathOptions={{ color: '#6366f1' }} />
        )}

        {zones.map((zone) => {
          const isActive = zone.active;
          const pathOptions = { color: zone.color, fillOpacity: isActive ? 0.2 : 0.08, weight: 2 };
          if (zone.geometry.type === 'polygon') {
            return <Polygon key={zone.id} positions={zone.geometry.points} pathOptions={pathOptions} />;
          }
          if (zone.geometry.type === 'rectangle') {
            return <Rectangle key={zone.id} bounds={zone.geometry.bounds} pathOptions={pathOptions} />;
          }
          return (
            <Circle
              key={zone.id}
              center={zone.geometry.center}
              radius={zone.geometry.radius}
              pathOptions={pathOptions}
            />
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-6 top-6 flex flex-wrap items-start justify-between gap-4">
        <div className="pointer-events-auto rounded-2xl border border-white/60 bg-white/90 px-4 py-3 text-xs text-slate-700 shadow-lg backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            Console geofencing avancée
          </div>
          <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-slate-500 dark:text-slate-300">
            {drawInstructions}
          </p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/60 bg-white/90 px-3 py-2 text-xs text-slate-700 shadow-lg backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200">
          <Layers className="h-4 w-4 text-slate-400" />
          {BASE_MAPS.map((map) => (
            <button
              key={map.id}
              type="button"
              onClick={() => setSelectedMapId(map.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                map.id === selectedMapId
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-slate-600'
              }`}
            >
              {map.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-6 bottom-6 flex flex-col gap-4 lg:flex-row">
        <div className="pointer-events-auto w-full rounded-3xl border border-white/60 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <MousePointer2 className="h-4 w-4 text-blue-500" />
              Mode dessin intelligent
            </div>
            <button
              type="button"
              onClick={() => onZoneModeChange(!zoneMode)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
                zoneMode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {zoneMode ? <Crosshair className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
              {zoneMode ? 'Mode actif' : 'Activer'}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(['polygon', 'rectangle', 'circle'] as DrawingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDrawingMode(mode)}
                className={`rounded-full border px-4 py-1 text-xs font-semibold transition ${
                  drawingMode === mode
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {mode === 'polygon' ? 'Polygone' : mode === 'rectangle' ? 'Rectangle' : 'Cercle'}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              value={zoneName}
              onChange={(event) => setZoneName(event.target.value)}
              placeholder="Nom de la zone"
              className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-sm text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={handleSaveZone}
              disabled={!zoneMode || !draftGeometry || zonesSaving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {zonesSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">Surface: {draftArea}</span>
            {zoneMode && draftGeometry && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Prévisualisation active</span>
            )}
          </div>
        </div>
        <div className="pointer-events-auto w-full rounded-3xl border border-white/60 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Zones surveillées</p>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
              {activeZonesCount} active{activeZonesCount > 1 ? 's' : ''}
            </span>
          </div>
          <div className="mt-3 max-h-[240px] overflow-y-auto pr-2">
            {zonesLoading ? (
              <p className="text-xs text-slate-500">Chargement des zones...</p>
            ) : zones.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aucune zone configurée. Activez le mode dessin pour créer votre première zone.
              </p>
            ) : (
              <GeofenceList
                zones={zones}
                onToggle={handleToggleZone}
                onRemove={handleRemoveZone}
                onZoom={handleZoomToZone}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernGeofencingMap;
