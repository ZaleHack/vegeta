import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  CircleMarker,
  Circle,
  Popup,
  useMap,
  useMapEvents
} from 'react-leaflet';
import { BellRing, Download, Layers, MapPin, Pause, Play, Plus, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import PageHeader from '../../components/PageHeader';

const DEFAULT_CENTER: [number, number] = [14.6928, -17.4467];
const DEFAULT_ZOOM = 11;
const COLOR_PALETTE = ['#2563eb', '#16a34a', '#f97316', '#9333ea', '#0ea5e9', '#dc2626', '#0f766e'];

interface MonitoredNumber {
  number: string;
  lastSeen?: string | null;
}

interface MonitoringEvent {
  id: number;
  number: string;
  cgi?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  coverageRadiusMeters?: number | null;
  insertedAt?: string | null;
  dateStart?: string | null;
  timeStart?: string | null;
  dateEnd?: string | null;
  timeEnd?: string | null;
  callType?: string | null;
}

interface AlertEntry {
  id: string;
  number: string;
  timestamp: string;
  type: 'entry';
  latitude: number;
  longitude: number;
  cgi?: string | null;
}

type ZoneShape = 'polygon' | 'rectangle' | 'circle';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const pointInPolygon = (point: [number, number], polygon: [number, number][]) => {
  if (polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const distanceMeters = (pointA: [number, number], pointB: [number, number]) => {
  const [lat1, lon1] = pointA;
  const [lat2, lon2] = pointB;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
};

const playAlertSound = () => {
  const context = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.12;
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.4);
};

const MapClickHandler: React.FC<{
  active: boolean;
  onMapClick: (point: [number, number]) => void;
  onMapHover: (point: [number, number] | null) => void;
}> = ({ active, onMapClick, onMapHover }) => {
  useMapEvents({
    click: (event) => {
      if (!active) return;
      onMapClick([event.latlng.lat, event.latlng.lng]);
    },
    mousemove: (event) => {
      if (!active) return;
      onMapHover([event.latlng.lat, event.latlng.lng]);
    },
    mouseout: () => {
      if (!active) return;
      onMapHover(null);
    }
  });
  return null;
};

const MapMetricsOverlay: React.FC = () => {
  const map = useMap();
  const [metrics, setMetrics] = useState({ widthKm: 0, heightKm: 0 });

  const updateMetrics = useCallback(() => {
    const bounds = map.getBounds();
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    const widthMeters = map.distance([northEast.lat, northEast.lng], [northEast.lat, southWest.lng]);
    const heightMeters = map.distance([northEast.lat, northEast.lng], [southWest.lat, northEast.lng]);
    setMetrics({ widthKm: widthMeters / 1000, heightKm: heightMeters / 1000 });
  }, [map]);

  useEffect(() => {
    updateMetrics();
    map.on('moveend zoomend', updateMetrics);
    return () => {
      map.off('moveend zoomend', updateMetrics);
    };
  }, [map, updateMetrics]);

  return (
    <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[0.7rem] font-semibold text-slate-700 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-200">
      Taille de carte: {metrics.widthKm.toFixed(1)} × {metrics.heightKm.toFixed(1)} km
    </div>
  );
};

const ZoneMonitoringPage: React.FC = () => {
  const [numbers, setNumbers] = useState<MonitoredNumber[]>([]);
  const [numberInput, setNumberInput] = useState('');
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [rectanglePoints, setRectanglePoints] = useState<[number, number][]>([]);
  const [circleCenter, setCircleCenter] = useState<[number, number] | null>(null);
  const [circleRadiusMeters, setCircleRadiusMeters] = useState<number | null>(null);
  const [shapeType, setShapeType] = useState<ZoneShape>('polygon');
  const [drawMode, setDrawMode] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [pollInterval, setPollInterval] = useState(7);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [eventsByNumber, setEventsByNumber] = useState<Record<string, MonitoringEvent[]>>({});
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [lastUpdateLabel, setLastUpdateLabel] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);

  const statusRef = useRef<Record<string, boolean>>({});
  const pollingRef = useRef<number | null>(null);

  const rectanglePolygon = useMemo(() => {
    if (rectanglePoints.length < 2) return [];
    const [start, end] = rectanglePoints;
    const minLat = Math.min(start[0], end[0]);
    const maxLat = Math.max(start[0], end[0]);
    const minLng = Math.min(start[1], end[1]);
    const maxLng = Math.max(start[1], end[1]);
    return [
      [minLat, minLng],
      [minLat, maxLng],
      [maxLat, maxLng],
      [maxLat, minLng]
    ] as [number, number][];
  }, [rectanglePoints]);

  const previewRectanglePolygon = useMemo(() => {
    if (shapeType !== 'rectangle' || !drawMode || rectanglePoints.length !== 1 || !hoverPoint) return rectanglePolygon;
    const [start] = rectanglePoints;
    const minLat = Math.min(start[0], hoverPoint[0]);
    const maxLat = Math.max(start[0], hoverPoint[0]);
    const minLng = Math.min(start[1], hoverPoint[1]);
    const maxLng = Math.max(start[1], hoverPoint[1]);
    return [
      [minLat, minLng],
      [minLat, maxLng],
      [maxLat, maxLng],
      [maxLat, minLng]
    ] as [number, number][];
  }, [drawMode, hoverPoint, rectanglePoints, rectanglePolygon, shapeType]);

  const zonePolygon = shapeType === 'rectangle' ? rectanglePolygon : polygonPoints;

  const previewPolygon = useMemo(() => {
    if (shapeType !== 'polygon') return polygonPoints;
    if (!drawMode || !hoverPoint || polygonPoints.length === 0) return polygonPoints;
    return [...polygonPoints, hoverPoint];
  }, [drawMode, hoverPoint, polygonPoints, shapeType]);

  const hasDefinedZone = useMemo(() => {
    if (shapeType === 'circle') {
      return Boolean(circleCenter) && circleRadiusMeters != null;
    }
    if (shapeType === 'rectangle') {
      return rectanglePolygon.length >= 4;
    }
    return polygonPoints.length >= 3;
  }, [circleCenter, circleRadiusMeters, polygonPoints.length, rectanglePolygon.length, shapeType]);

  const numberColors = useMemo(() => {
    const map: Record<string, string> = {};
    selectedNumbers.forEach((value, index) => {
      map[value] = COLOR_PALETTE[index % COLOR_PALETTE.length];
    });
    return map;
  }, [selectedNumbers]);

  const latestPositions = useMemo(() => {
    const entries: MonitoringEvent[] = [];
    Object.values(eventsByNumber).forEach((events) => {
      const latest = events[events.length - 1];
      if (latest) entries.push(latest);
    });
    return entries;
  }, [eventsByNumber]);

  const isPointInsideZone = useCallback(
    (point: [number, number]) => {
      if (!hasDefinedZone) return false;
      if (shapeType === 'circle') {
        if (!circleCenter || circleRadiusMeters == null) return false;
        return distanceMeters(circleCenter, point) <= circleRadiusMeters;
      }
      if (zonePolygon.length < 3) return false;
      return pointInPolygon(point, zonePolygon);
    },
    [circleCenter, circleRadiusMeters, hasDefinedZone, shapeType, zonePolygon]
  );

  const statusByNumber = useMemo(() => {
    const status: Record<string, boolean | null> = {};
    selectedNumbers.forEach((number) => {
      if (!hasDefinedZone) {
        status[number] = null;
        return;
      }
      const events = eventsByNumber[number];
      if (!events || events.length === 0) {
        status[number] = null;
        return;
      }
      const latest = events[events.length - 1];
      if (latest.latitude == null || latest.longitude == null) {
        status[number] = null;
      } else {
        status[number] = isPointInsideZone([latest.latitude, latest.longitude]);
      }
    });
    return status;
  }, [eventsByNumber, hasDefinedZone, isPointInsideZone, selectedNumbers]);

  const fetchNumbers = useCallback(async (search = '') => {
    setLoadingNumbers(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      const response = await fetch(`/api/cdr/realtime/numbers?${params.toString()}`, {
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) {
        throw new Error('Impossible de charger les numéros.');
      }
      const payload = await response.json();
      const list = Array.isArray(payload?.numbers) ? payload.numbers : [];
      setNumbers(list);
    } catch (error) {
      console.error('Erreur chargement numéros temps réel:', error);
    } finally {
      setLoadingNumbers(false);
    }
  }, []);

  useEffect(() => {
    fetchNumbers();
  }, [fetchNumbers]);

  const handleMapClick = useCallback(
    (point: [number, number]) => {
      if (shapeType === 'polygon') {
        setPolygonPoints((prev) => [...prev, point]);
        return;
      }
      if (shapeType === 'rectangle') {
        setRectanglePoints((prev) => {
          if (prev.length >= 2) return [point];
          return [...prev, point];
        });
        return;
      }
      if (!circleCenter || circleRadiusMeters != null) {
        setCircleCenter(point);
        setCircleRadiusMeters(null);
      } else {
        setCircleRadiusMeters(distanceMeters(circleCenter, point));
      }
    },
    [circleCenter, circleRadiusMeters, shapeType]
  );

  const clearZoneShape = () => {
    setPolygonPoints([]);
    setRectanglePoints([]);
    setCircleCenter(null);
    setCircleRadiusMeters(null);
    setDrawMode(false);
    setHoverPoint(null);
  };

  const handleShapeTypeChange = (nextShape: ZoneShape) => {
    setShapeType(nextShape);
    clearZoneShape();
  };

  const handleUndoPoint = () => {
    if (shapeType === 'polygon') {
      setPolygonPoints((prev) => prev.slice(0, -1));
      return;
    }
    if (shapeType === 'rectangle') {
      setRectanglePoints((prev) => prev.slice(0, -1));
      return;
    }
    setCircleCenter(null);
    setCircleRadiusMeters(null);
  };

  useEffect(() => {
    if (!drawMode) {
      setHoverPoint(null);
    }
  }, [drawMode]);

  const exportAlerts = (format: 'csv' | 'json') => {
    if (alerts.length === 0) return;
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(alerts, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'alertes-zone.json';
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const header = ['timestamp', 'numero', 'type', 'latitude', 'longitude', 'cgi'];
    const rows = alerts.map((alert) =>
      [
        alert.timestamp,
        alert.number,
        alert.type,
        alert.latitude.toFixed(6),
        alert.longitude.toFixed(6),
        alert.cgi ?? ''
      ].join(',')
    );
    const blob = new Blob([`${header.join(',')}\n${rows.join('\n')}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alertes-zone.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleNumber = (value: string) => {
    setSelectedNumbers((prev) =>
      prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]
    );
  };

  const handleAddNumber = () => {
    const trimmed = numberInput.trim();
    if (!trimmed) return;
    setNumbers((prev) => {
      if (prev.some((item) => item.number === trimmed)) {
        return prev;
      }
      return [{ number: trimmed, lastSeen: null }, ...prev];
    });
    setSelectedNumbers((prev) => (prev.includes(trimmed) ? prev : [trimmed, ...prev]));
    setNumberInput('');
    setMonitoringError(null);
  };

  const pollEvents = useCallback(async () => {
    if (selectedNumbers.length === 0) {
      setMonitoringError('Sélectionnez au moins un numéro avant de lancer la surveillance.');
      return;
    }
    if (!hasDefinedZone) {
      setMonitoringError('Définissez une zone avant de lancer la surveillance.');
      return;
    }
    setMonitoringError(null);
    try {
      const params = new URLSearchParams();
      params.set('numbers', selectedNumbers.join(','));
      if (lastCheck) params.set('since', lastCheck);
      const response = await fetch(`/api/cdr/realtime/monitor?${params.toString()}`, {
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) {
        throw new Error('Impossible de synchroniser les CDR temps réel.');
      }
      const payload = await response.json();
      const events: MonitoringEvent[] = Array.isArray(payload?.events) ? payload.events : [];
      if (events.length === 0) {
        setLastUpdateLabel(new Date().toLocaleTimeString());
        return;
      }

      const lastEvent = events[events.length - 1];
      if (lastEvent?.insertedAt) {
        setLastCheck(lastEvent.insertedAt);
      }
      setLastUpdateLabel(new Date().toLocaleTimeString());

      setEventsByNumber((prev) => {
        const updated = { ...prev };
        events.forEach((event) => {
          const list = updated[event.number] ? [...updated[event.number]] : [];
          list.push(event);
          updated[event.number] = list.slice(-50);
        });
        return updated;
      });

      const newAlerts: AlertEntry[] = [];
      events.forEach((event) => {
        if (event.latitude == null || event.longitude == null) return;
        const isInside = isPointInsideZone([event.latitude, event.longitude]);
        const previousState = statusRef.current[event.number] ?? false;
        if (!previousState && isInside) {
          newAlerts.push({
            id: `${event.number}-${event.insertedAt || Date.now()}`,
            number: event.number,
            timestamp: event.insertedAt || new Date().toISOString(),
            type: 'entry',
            latitude: event.latitude,
            longitude: event.longitude,
            cgi: event.cgi ?? null
          });
        }
        statusRef.current[event.number] = isInside;
      });

      if (newAlerts.length > 0) {
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 200));
        if (soundEnabled) {
          playAlertSound();
        }
      }
    } catch (error) {
      console.error('Erreur synchronisation temps réel:', error);
      setMonitoringError("Impossible d'atteindre le flux temps réel.");
    }
  }, [hasDefinedZone, isPointInsideZone, lastCheck, selectedNumbers, soundEnabled]);

  useEffect(() => {
    if (!monitoringActive) {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollEvents();
    pollingRef.current = window.setInterval(pollEvents, pollInterval * 1000);
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [monitoringActive, pollEvents, pollInterval]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<MapPin className="h-6 w-6" />}
        title="Surveillance de zone (CDR temps réel)"
        subtitle="Définissez une zone, sélectionnez les numéros à suivre et recevez des alertes en temps réel."
      />

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Numéros surveillés</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Saisissez un numéro, définissez la zone puis réglez le polling avant de démarrer.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddNumber}
                className="inline-flex items-center justify-center rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="ml-1">Ajouter</span>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={numberInput}
                onChange={(event) => setNumberInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddNumber();
                  }
                }}
                placeholder="Entrer un numéro à surveiller..."
                className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-sm text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              {loadingNumbers ? (
                <p className="text-xs text-slate-500">Chargement...</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {numbers.length === 0 ? (
                    <p className="text-xs text-slate-500">Aucun numéro disponible.</p>
                  ) : (
                    numbers.map((item) => (
                      <label
                        key={item.number}
                        className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm transition hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedNumbers.includes(item.number)}
                          onChange={() => handleToggleNumber(item.number)}
                        />
                        <span className="flex-1">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{item.number}</span>
                          <span className="block text-[0.65rem] text-slate-400">
                            Dernier signal: {item.lastSeen ? new Date(item.lastSeen).toLocaleString() : 'N/A'}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Zone surveillée</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Mode dessin: choisissez une forme puis cliquez sur la carte.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['polygon', 'rectangle', 'circle'] as ZoneShape[]).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => handleShapeTypeChange(shape)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    shapeType === shape
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200/70 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  {shape === 'polygon' ? 'Polygone' : shape === 'rectangle' ? 'Rectangle' : 'Circulaire'}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDrawMode((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
              >
                {drawMode ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {drawMode ? 'Arrêter le dessin' : 'Dessiner la zone'}
              </button>
              <button
                type="button"
                onClick={handleUndoPoint}
                disabled={
                  shapeType === 'polygon'
                    ? polygonPoints.length === 0
                    : shapeType === 'rectangle'
                      ? rectanglePoints.length === 0
                      : !circleCenter
                }
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Annuler un point
              </button>
              <button
                type="button"
                onClick={clearZoneShape}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-red-300 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
                Effacer
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/80 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              {shapeType === 'circle' ? (
                circleCenter && circleRadiusMeters
                  ? `Centre défini · rayon ${(circleRadiusMeters / 1000).toFixed(2)} km`
                  : circleCenter && drawMode && hoverPoint
                    ? `Rayon estimé ${(distanceMeters(circleCenter, hoverPoint) / 1000).toFixed(2)} km`
                  : 'Cliquez pour définir le centre puis un point pour le rayon.'
              ) : shapeType === 'rectangle' ? (
                rectanglePoints.length < 2
                  ? 'Cliquez sur un coin puis déplacez la souris pour ajuster le rectangle.'
                  : 'Rectangle défini pour la détection.'
              ) : polygonPoints.length < 3 ? (
                'Ajoutez au moins 3 points pour activer la détection. Les segments apparaissent au survol.'
              ) : (
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Coordonnées sauvegardées</p>
                  <p className="mt-1">{polygonPoints.length} sommets</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Contrôle temps réel</h3>
              <button
                type="button"
                onClick={() => setMonitoringActive((prev) => !prev)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white shadow transition ${
                  monitoringActive ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                {monitoringActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {monitoringActive ? 'Suspendre' : 'Démarrer'}
              </button>
            </div>
            <div className="mt-4 space-y-4 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between">
                <span>Intervalle de polling</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={pollInterval}
                    onChange={(event) => setPollInterval(Number(event.target.value))}
                    className="w-16 rounded-xl border border-slate-200 bg-white px-2 py-1 text-center text-xs text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <span>s</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Notifications sonores</span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  {soundEnabled ? 'Actives' : 'Silencieuses'}
                </button>
              </div>
              {monitoringError && (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                  {monitoringError}
                </div>
              )}
              {lastUpdateLabel && (
                <p className="text-[0.7rem] text-slate-400">Dernière synchronisation: {lastUpdateLabel}</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Alertes</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportAlerts('csv')}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white px-2 py-1 text-[0.7rem] font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportAlerts('json')}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white px-2 py-1 text-[0.7rem] font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <Download className="h-3 w-3" />
                  JSON
                </button>
              </div>
            </div>
            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/80 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  Aucune alerte enregistrée.
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 rounded-2xl border border-blue-200/70 bg-blue-50/80 px-3 py-2 text-xs text-blue-700 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                  >
                    <BellRing className="mt-0.5 h-3.5 w-3.5" />
                    <div>
                      <p className="font-semibold">Entrée détectée</p>
                      <p>{alert.number}</p>
                      <p className="text-[0.65rem] text-blue-500">
                        {new Date(alert.timestamp).toLocaleString()} · {alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="relative h-[520px] overflow-hidden rounded-2xl">
              <div className="pointer-events-none absolute left-4 top-4 z-[1000] flex">
                <button
                  type="button"
                  onClick={() => setIsSatellite((prev) => !prev)}
                  aria-pressed={isSatellite}
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[0.7rem] font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:text-blue-600 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:text-blue-200"
                >
                  <Layers className="h-3.5 w-3.5" />
                  {isSatellite ? 'Vue plan' : 'Vue satellite'}
                </button>
              </div>
              <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full">
                {isSatellite ? (
                  <TileLayer
                    attribution='&copy; Esri &mdash; Sources: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                    url={
                      import.meta.env.VITE_SATELLITE_TILE_URL ||
                      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    }
                  />
                ) : (
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                )}
                <MapClickHandler active={drawMode} onMapClick={handleMapClick} onMapHover={setHoverPoint} />
                <MapMetricsOverlay />
                {shapeType === 'polygon' && previewPolygon.length >= 2 && (
                  <Polyline positions={previewPolygon} pathOptions={{ color: '#2563eb', weight: 2, dashArray: '4 6' }} />
                )}
                {shapeType === 'polygon' && zonePolygon.length >= 3 && (
                  <Polygon positions={zonePolygon} pathOptions={{ color: '#2563eb', fillOpacity: 0.2 }} />
                )}
                {shapeType === 'rectangle' && previewRectanglePolygon.length >= 3 && (
                  <Polygon positions={previewRectanglePolygon} pathOptions={{ color: '#2563eb', fillOpacity: 0.2 }} />
                )}
                {shapeType === 'circle' && circleCenter && circleRadiusMeters != null && (
                  <Circle center={circleCenter} radius={circleRadiusMeters} pathOptions={{ color: '#2563eb', fillOpacity: 0.2 }} />
                )}
                {shapeType === 'circle' && circleCenter && circleRadiusMeters == null && hoverPoint && (
                  <Circle
                    center={circleCenter}
                    radius={distanceMeters(circleCenter, hoverPoint)}
                    pathOptions={{ color: '#2563eb', fillOpacity: 0.08, dashArray: '4 6' }}
                  />
                )}
                {shapeType === 'polygon' &&
                  polygonPoints.map((point, index) => (
                    <CircleMarker
                      key={`polygon-point-${index}`}
                      center={point}
                      radius={4}
                      pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.9 }}
                    />
                  ))}
                {shapeType === 'rectangle' &&
                  rectanglePoints.map((point, index) => (
                    <CircleMarker
                      key={`rectangle-point-${index}`}
                      center={point}
                      radius={4}
                      pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.9 }}
                    />
                  ))}
                {shapeType === 'circle' && circleCenter && (
                  <CircleMarker
                    center={circleCenter}
                    radius={5}
                    pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.9 }}
                  />
                )}
                {Object.entries(eventsByNumber).map(([number, events]) => {
                  const color = numberColors[number] || '#2563eb';
                  const path = events
                    .filter((event) => event.latitude != null && event.longitude != null)
                    .map((event) => [event.latitude as number, event.longitude as number]);
                  return path.length > 1 ? (
                    <Polyline key={`path-${number}`} positions={path} pathOptions={{ color, weight: 3 }} />
                  ) : null;
                })}
                {latestPositions.map((event) => {
                  if (event.latitude == null || event.longitude == null) return null;
                  const color = numberColors[event.number] || '#2563eb';
                  const inside = hasDefinedZone ? isPointInsideZone([event.latitude, event.longitude]) : null;
                  return (
                    <React.Fragment key={`${event.number}-${event.insertedAt}`}>
                      <CircleMarker
                        center={[event.latitude, event.longitude]}
                        radius={8}
                        pathOptions={{ color, fillColor: inside ? '#10b981' : color, fillOpacity: 0.9 }}
                      >
                        <Popup>
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold">{event.number}</p>
                            <p>CGI: {event.cgi || 'N/A'}</p>
                            <p>{event.insertedAt ? new Date(event.insertedAt).toLocaleString() : ''}</p>
                            <p className={inside ? 'text-emerald-600' : 'text-slate-500'}>
                              {!hasDefinedZone ? 'Zone non définie' : inside ? 'Dans la zone' : 'Hors zone'}
                            </p>
                          </div>
                        </Popup>
                      </CircleMarker>
                      {event.coverageRadiusMeters ? (
                        <Circle
                          center={[event.latitude, event.longitude]}
                          radius={event.coverageRadiusMeters}
                          pathOptions={{ color, fillOpacity: 0.05, dashArray: '4 6' }}
                        />
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </MapContainer>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Statut actuel</h3>
              <div className="mt-4 space-y-3">
                {selectedNumbers.length === 0 ? (
                  <p className="text-xs text-slate-500">Sélectionnez des numéros pour afficher le statut.</p>
                ) : (
                  selectedNumbers.map((number) => {
                    const status = statusByNumber[number];
                    const color = numberColors[number] || '#2563eb';
                    return (
                      <div
                        key={number}
                        className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{number}</span>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold ${
                            !hasDefinedZone || status === null
                              ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                              : status
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                                : 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-200'
                          }`}
                        >
                          {!hasDefinedZone ? 'Zone non définie' : status === null ? 'Inconnu' : status ? 'Dans la zone' : 'Hors zone'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Historique des positions</h3>
              <div className="mt-4 space-y-3">
                {latestPositions.length === 0 ? (
                  <p className="text-xs text-slate-500">Aucune position enregistrée.</p>
                ) : (
                  latestPositions.map((event) => (
                    <div
                      key={`history-${event.number}`}
                      className="flex items-start justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
                    >
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{event.number}</p>
                        <p className="text-[0.7rem] text-slate-400">CGI: {event.cgi || 'N/A'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[0.7rem]">
                          {event.latitude != null && event.longitude != null
                            ? `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`
                            : 'Position inconnue'}
                        </p>
                        <p className="text-[0.65rem] text-slate-400">
                          {event.insertedAt ? new Date(event.insertedAt).toLocaleString() : ''}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ZoneMonitoringPage;
