import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Edit, History, MapPin, Plus, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNotifications } from '../../components/NotificationProvider';

type GeofenceType = 'circle' | 'polygon';

interface MapPoint {
  x: number;
  y: number;
}

interface GeofenceZone {
  id: number;
  name: string;
  type: GeofenceType;
  active: boolean;
  center: MapPoint;
  radius?: number;
  points?: MapPoint[];
  color: string;
}

interface GeofenceAlert {
  id: number;
  type: 'enter' | 'exit';
  zoneName: string;
  timestamp: string;
}

const palette = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899'];

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const pointInCircle = (point: MapPoint, center: MapPoint, radius: number) => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
};

const pointInPolygon = (point: MapPoint, polygon: MapPoint[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const createPolygon = (center: MapPoint, seed = 0) => {
  const points: MapPoint[] = [];
  const sides = 5;
  for (let i = 0; i < sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides;
    const radius = 10 + ((seed + i * 13) % 8);
    points.push({
      x: clamp(center.x + Math.cos(angle) * radius),
      y: clamp(center.y + Math.sin(angle) * radius)
    });
  }
  return points;
};

const formatTimestamp = (date: Date) =>
  format(date, "dd MMM yyyy 'à' HH:mm:ss", { locale: fr });

const initialZones: GeofenceZone[] = [
  {
    id: 1,
    name: 'Zone Centre-Ville',
    type: 'circle',
    active: true,
    center: { x: 48, y: 52 },
    radius: 16,
    color: palette[0]
  },
  {
    id: 2,
    name: 'Quartier Logistique',
    type: 'polygon',
    active: true,
    center: { x: 72, y: 32 },
    points: createPolygon({ x: 72, y: 32 }, 2),
    color: palette[1]
  }
];

const GeofencingPage = () => {
  const { notifyInfo, notifyWarning } = useNotifications();
  const [zones, setZones] = useState<GeofenceZone[]>(initialZones);
  const [userPosition, setUserPosition] = useState<MapPoint>({ x: 52, y: 58 });
  const [drawingType, setDrawingType] = useState<GeofenceType>('circle');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState(14);
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftRadius, setDraftRadius] = useState(12);
  const [history, setHistory] = useState<GeofenceAlert[]>([]);
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);
  const [liveTracking, setLiveTracking] = useState(true);
  const prevStatusRef = useRef<Record<number, boolean>>({});
  const liveTimerRef = useRef<number | null>(null);

  const activeStatuses = useMemo(() => {
    return zones.map((zone) => {
      const isInside = zone.type === 'circle'
        ? pointInCircle(userPosition, zone.center, zone.radius ?? 0)
        : pointInPolygon(userPosition, zone.points ?? []);
      return { zone, isInside };
    });
  }, [zones, userPosition]);

  const anyInside = activeStatuses.some((status) => status.zone.active && status.isInside);

  const addHistoryEntry = useCallback((entry: GeofenceAlert) => {
    setHistory((prev) => [entry, ...prev].slice(0, 12));
    setAlerts((prev) => [entry, ...prev].slice(0, 3));
  }, []);

  useEffect(() => {
    activeStatuses.forEach(({ zone, isInside }) => {
      const previous = prevStatusRef.current[zone.id];
      if (previous === undefined) {
        prevStatusRef.current[zone.id] = isInside;
        return;
      }
      if (previous !== isInside && zone.active) {
        const entry: GeofenceAlert = {
          id: Date.now() + zone.id,
          type: isInside ? 'enter' : 'exit',
          zoneName: zone.name,
          timestamp: formatTimestamp(new Date())
        };
        prevStatusRef.current[zone.id] = isInside;
        addHistoryEntry(entry);
        if (isInside) {
          notifyInfo(`Entrée détectée dans "${zone.name}".`);
        } else {
          notifyWarning(`Sortie détectée de "${zone.name}".`);
        }
      }
    });
  }, [activeStatuses, addHistoryEntry, notifyInfo, notifyWarning]);

  useEffect(() => {
    if (!liveTracking) {
      if (liveTimerRef.current) {
        window.clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      return;
    }
    liveTimerRef.current = window.setInterval(() => {
      setUserPosition((prev) => ({
        x: clamp(prev.x + (Math.random() * 6 - 3)),
        y: clamp(prev.y + (Math.random() * 6 - 3))
      }));
    }, 2400);
    return () => {
      if (liveTimerRef.current) {
        window.clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, [liveTracking]);

  const handleCreateZone = () => {
    const name = newZoneName.trim() || `Zone ${zones.length + 1}`;
    const center = {
      x: clamp(userPosition.x + (Math.random() * 18 - 9)),
      y: clamp(userPosition.y + (Math.random() * 18 - 9))
    };
    const nextZone: GeofenceZone = {
      id: Date.now(),
      name,
      type: drawingType,
      active: true,
      center,
      radius: drawingType === 'circle' ? newZoneRadius : undefined,
      points: drawingType === 'polygon' ? createPolygon(center, zones.length + 1) : undefined,
      color: palette[zones.length % palette.length]
    };
    setZones((prev) => [nextZone, ...prev]);
    setNewZoneName('');
    notifyInfo(`Nouvelle zone "${name}" créée.`);
  };

  const handleDeleteZone = (zoneId: number) => {
    setZones((prev) => prev.filter((zone) => zone.id !== zoneId));
    if (editingZoneId === zoneId) {
      setEditingZoneId(null);
    }
  };

  const startEditing = (zone: GeofenceZone) => {
    setEditingZoneId(zone.id);
    setDraftName(zone.name);
    setDraftRadius(zone.radius ?? 12);
  };

  const saveEditing = () => {
    if (editingZoneId === null) return;
    setZones((prev) =>
      prev.map((zone) => {
        if (zone.id !== editingZoneId) return zone;
        return {
          ...zone,
          name: draftName.trim() || zone.name,
          radius: zone.type === 'circle' ? draftRadius : zone.radius
        };
      })
    );
    setEditingZoneId(null);
  };

  const refreshPolygon = (zoneId: number) => {
    setZones((prev) =>
      prev.map((zone, index) => {
        if (zone.id !== zoneId || zone.type !== 'polygon') return zone;
        return {
          ...zone,
          points: createPolygon(zone.center, index + 3)
        };
      })
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-blue-500/10 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Geofencing</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              Surveillance de zones en temps réel
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
              Créez des périmètres intelligents, recevez des alertes immédiates et pilotez les accès depuis une seule
              interface.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200/60 bg-blue-50/70 px-4 py-3 text-sm text-blue-700 shadow-sm dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-100">
            <MapPin className="h-4 w-4" />
            <span>Position actuelle: {userPosition.x.toFixed(0)}%, {userPosition.y.toFixed(0)}%</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            anyInside
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
              : 'bg-slate-200 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'
          }`}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {anyInside ? 'Utilisateur dans une zone active' : 'Hors zone'}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            Alertes visuelles activées
          </span>
          <button
            type="button"
            onClick={() => setLiveTracking((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition ${
              liveTracking
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                : 'bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <BellRing className="h-3.5 w-3.5" />
            {liveTracking ? 'Suivi temps réel actif' : 'Suivi temps réel en pause'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-indigo-500/10 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Carte interactive</h3>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  Visualisez la position de l’utilisateur et ajustez les zones depuis les outils ci-dessous.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setUserPosition({ x: 50, y: 50 })}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Recentrer
                </button>
                <button
                  type="button"
                  onClick={() => setUserPosition({ x: clamp(userPosition.x + 8), y: clamp(userPosition.y - 6) })}
                  className="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/30 transition hover:bg-blue-700"
                >
                  Simuler déplacement
                </button>
              </div>
            </div>

            {alerts.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                      alert.type === 'enter'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200'
                        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BellRing className="h-4 w-4" />
                      <span>
                        {alert.type === 'enter' ? 'Entrée' : 'Sortie'} détectée - {alert.zoneName}
                      </span>
                    </div>
                    <span className="text-xs opacity-70">{alert.timestamp}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="relative mt-6 h-[420px] overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 shadow-inner dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#bfdbfe_0%,transparent_55%)] opacity-60 dark:opacity-30" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(148,163,184,0.08)_50%,transparent_100%)]" />
              <svg className="absolute inset-0 h-full w-full">
                {zones.map((zone) => {
                  const opacity = zone.active ? 0.25 : 0.08;
                  if (zone.type === 'circle' && zone.radius) {
                    return (
                      <g key={zone.id}>
                        <circle
                          cx={`${zone.center.x}%`}
                          cy={`${zone.center.y}%`}
                          r={`${zone.radius}%`}
                          fill={zone.color}
                          fillOpacity={opacity}
                          stroke={zone.color}
                          strokeWidth="2"
                          strokeOpacity={zone.active ? 0.6 : 0.2}
                        />
                        <text
                          x={`${zone.center.x}%`}
                          y={`${zone.center.y}%`}
                          textAnchor="middle"
                          className="fill-slate-700 text-[10px] font-semibold dark:fill-slate-200"
                        >
                          {zone.name}
                        </text>
                      </g>
                    );
                  }
                  if (zone.type === 'polygon' && zone.points) {
                    const points = zone.points.map((point) => `${point.x}%,${point.y}%`).join(' ');
                    return (
                      <g key={zone.id}>
                        <polygon
                          points={points}
                          fill={zone.color}
                          fillOpacity={opacity}
                          stroke={zone.color}
                          strokeWidth="2"
                          strokeOpacity={zone.active ? 0.6 : 0.2}
                        />
                        <text
                          x={`${zone.center.x}%`}
                          y={`${zone.center.y}%`}
                          textAnchor="middle"
                          className="fill-slate-700 text-[10px] font-semibold dark:fill-slate-200"
                        >
                          {zone.name}
                        </text>
                      </g>
                    );
                  }
                  return null;
                })}
              </svg>
              <div
                className="absolute flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-600 shadow-lg shadow-blue-500/40"
                style={{
                  left: `${userPosition.x}%`,
                  top: `${userPosition.y}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <span className="absolute h-10 w-10 rounded-full border border-blue-400/40 bg-blue-400/10 animate-pulse" />
              </div>
              <div className="absolute bottom-4 left-4 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-xs text-slate-600 shadow-lg dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-slate-200">
                <p className="font-semibold text-slate-800 dark:text-white">Statut en direct</p>
                <p>Position utilisateur mise à jour toutes les 2,4 secondes.</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">X</p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={userPosition.x}
                  onChange={(event) => setUserPosition((prev) => ({ ...prev, x: Number(event.target.value) }))}
                  className="mt-2 w-full"
                />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Y</p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={userPosition.y}
                  onChange={(event) => setUserPosition((prev) => ({ ...prev, y: Number(event.target.value) }))}
                  className="mt-2 w-full"
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-indigo-500/10 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Créer une zone</h3>
                <p className="text-sm text-slate-500 dark:text-slate-300">Dessinez rapidement un périmètre sécurisé.</p>
              </div>
              <Plus className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-4 flex gap-2">
              {(['circle', 'polygon'] as GeofenceType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDrawingType(type)}
                  className={`flex-1 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                    drawingType === type
                      ? 'border-blue-500 bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  {type === 'circle' ? 'Zone circulaire' : 'Zone polygonale'}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nom</label>
                <input
                  value={newZoneName}
                  onChange={(event) => setNewZoneName(event.target.value)}
                  placeholder="Nom de la zone"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              {drawingType === 'circle' && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rayon ({newZoneRadius}%)</label>
                  <input
                    type="range"
                    min={6}
                    max={24}
                    value={newZoneRadius}
                    onChange={(event) => setNewZoneRadius(Number(event.target.value))}
                    className="mt-2 w-full"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleCreateZone}
                className="w-full rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/30 transition hover:bg-blue-700"
              >
                Créer la zone
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-indigo-500/10 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Zones actives</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {zones.length} zone{zones.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {zones.map((zone) => {
                const status = activeStatuses.find((item) => item.zone.id === zone.id);
                const isEditing = editingZoneId === zone.id;
                return (
                  <div
                    key={zone.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{zone.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {zone.type === 'circle' ? 'Zone circulaire' : 'Zone polygonale'} · {zone.active ? 'Active' : 'Inactive'}
                        </p>
                        <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          status?.isInside && zone.active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {status?.isInside && zone.active ? 'Dans la zone' : 'Hors zone'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setZones((prev) => prev.map((item) =>
                            item.id === zone.id ? { ...item, active: !item.active } : item
                          ))}
                          className={`rounded-full border px-2 py-1 text-xs font-semibold transition ${
                            zone.active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200'
                              : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {zone.active ? 'Actif' : 'Inactif'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(zone)}
                          className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-blue-600 dark:border-slate-700 dark:text-slate-300"
                          title="Modifier"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteZone(zone.id)}
                          className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-rose-600 dark:border-slate-700 dark:text-slate-300"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-4 space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-200">Modifier la zone</p>
                          <button
                            type="button"
                            onClick={() => setEditingZoneId(null)}
                            className="text-blue-600 transition hover:text-blue-800 dark:text-blue-200"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nom</label>
                          <input
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          />
                        </div>
                        {zone.type === 'circle' ? (
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Rayon ({draftRadius}%)
                            </label>
                            <input
                              type="range"
                              min={6}
                              max={30}
                              value={draftRadius}
                              onChange={(event) => setDraftRadius(Number(event.target.value))}
                              className="mt-2 w-full"
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => refreshPolygon(zone.id)}
                            className="w-full rounded-2xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-600 transition hover:border-blue-300 dark:border-blue-500/40 dark:bg-slate-900 dark:text-blue-200"
                          >
                            Régénérer les sommets
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={saveEditing}
                          className="w-full rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/30 transition hover:bg-blue-700"
                        >
                          Enregistrer
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-indigo-500/10 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Historique</h3>
              </div>
              <span className="text-xs text-slate-400">{history.length} événement(s)</span>
            </div>
            <div className="mt-4 space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-300">Aucune entrée enregistrée pour le moment.</p>
              ) : (
                history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-100">
                        {entry.type === 'enter' ? 'Entrée' : 'Sortie'} - {entry.zoneName}
                      </p>
                      <p className="text-xs text-slate-400">{entry.timestamp}</p>
                    </div>
                    <span className={`mt-1 rounded-full px-2 py-1 text-xs font-semibold ${
                      entry.type === 'enter'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200'
                    }`}>
                      {entry.type === 'enter' ? 'IN' : 'OUT'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default GeofencingPage;
