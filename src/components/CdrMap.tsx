import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polygon,
  CircleMarker,
  Polyline,
  useMapEvents
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import {
  PhoneIncoming,
  PhoneOutgoing,
  MessageSquare,
  MapPin,
  ArrowRight,
  Car,
  Layers,
  Users,
  Clock,
  Flame,
  Eye,
  EyeOff,
  Activity,
  Crosshair,
  History,
  Plus,
  Minus
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

interface Point {
  latitude: string;
  longitude: string;
  nom: string;
  type: string;
  direction?: string;
  number?: string;
  caller?: string;
  callee?: string;
  callDate: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  duration?: string;
  imeiCaller?: string;
  imeiCalled?: string;
  source?: string;
  tracked?: string;
}

interface Contact {
  number: string;
  callCount: number;
  smsCount: number;
  callDuration: string;
  total: number;
}

interface LocationStat {
  latitude: string;
  longitude: string;
  nom: string;
  count: number;
  lastDate?: string;
  lastTime?: string;
}

interface LocationMarker extends LocationStat {
  source?: string;
}

interface MeetingPoint {
  lat: number;
  lng: number;
  nom: string;
  numbers: string[];
  events: Point[];
  perNumber: {
    number: string;
    events: { date: string; start: string; end: string; duration: string }[];
    total: string;
  }[];
  date: string;
  start: string;
  end: string;
  total: string;
}

interface GroupedPoint {
  lat: number;
  lng: number;
  events: Point[];
  perSource: { source?: string; events: Point[] }[];
}

const NO_SOURCE_KEY = '__no_source__';

const computeOffsetPosition = (
  lat: number,
  lng: number,
  index: number,
  total: number,
  distanceMeters = 25
): [number, number] => {
  if (total <= 1) {
    return [lat, lng];
  }

  const angle = (2 * Math.PI * index) / total;
  const latOffset = (distanceMeters * Math.cos(angle)) / 111_320;
  const latRad = (lat * Math.PI) / 180;
  const denominator = Math.cos(latRad) || 1;
  const lngOffset = (distanceMeters * Math.sin(angle)) / (111_320 * denominator);

  return [lat + latOffset, lng + lngOffset];
};

type EventVisuals = {
  label: string;
  gradient: string;
  icon: LucideIcon;
  accentText: string;
  badgeClass: string;
  participantContainer: string;
  participantIconClass: string;
  pill?: string;
};

interface Props {
  points: Point[];
  showRoute?: boolean;
  showMeetingPoints?: boolean;
  onToggleMeetingPoints?: () => void;
  zoneMode?: boolean;
  onZoneCreated?: () => void;
}

const parseDurationToSeconds = (duration: string): number => {
  const parts = duration.split(':').map(Number);
  if (!parts.some(isNaN)) {
    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h * 3600 + m * 60 + s;
    }
    if (parts.length === 2) {
      const [first, second] = parts;
      // Support both HH:MM and MM:SS formats. Values with an hour field
      // (either <= 23 or >= 60) are treated as hours:minutes; otherwise
      // assume minutes:seconds.
      if (first >= 60 || first <= 23) {
        return first * 3600 + second * 60;
      }
      return first * 60 + second;
    }
    if (parts.length === 1) {
      return parts[0];
    }
  }
  const asNumber = Number(duration);
  return isNaN(asNumber) ? 0 : asNumber;
};

const parseTimeToSeconds = (time: string | undefined): number | null => {
  if (!time) return null;
  const parts = time.split(':').map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return null;
  if (parts.length === 2) {
    const [hours, minutes] = parts;
    return hours * 3600 + minutes * 60;
  }
  const [hours, minutes, seconds] = parts as [number, number, number];
  return hours * 3600 + minutes * 60 + seconds;
};

const getPointDurationInSeconds = (point: Point): number => {
  if (point.duration) {
    const parsed = parseDurationToSeconds(point.duration);
    if (parsed > 0) return parsed;
  }

  const startSeconds = parseTimeToSeconds(point.startTime);
  const endSeconds = parseTimeToSeconds(point.endTime);

  if (startSeconds === null || endSeconds === null) return 0;

  let diff = endSeconds - startSeconds;
  if (diff < 0) {
    diff += 24 * 3600;
  }

  return diff > 0 ? diff : 0;
};

const formatPointDuration = (point: Point): string | null => {
  if (point.type === 'sms') return null;

  const raw = point.duration?.trim();
  if (!raw) {
    const seconds = getPointDurationInSeconds(point);
    return seconds > 0 ? formatDuration(seconds) : null;
  }

  if (raw.toLowerCase() === 'n/a') {
    return 'N/A';
  }

  const seconds = parseDurationToSeconds(raw);
  if (seconds > 0) {
    return formatDuration(seconds);
  }

  const fallback = getPointDurationInSeconds(point);
  if (fallback > 0) {
    return formatDuration(fallback);
  }

  return raw || null;
};

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && hours === 0) parts.push(`${secs}s`);

  if (parts.length === 0) {
    return `${Math.round(seconds)}s`;
  }

  return parts.join(' ');
};

const getPointColor = (type: string, direction?: string) => {
  if (type === 'web') return '#dc2626';
  if (type === 'sms') return '#16a34a';
  if (direction === 'outgoing') return '#2563eb';
  return '#16a34a';
};

const getIcon = (
  type: string,
  direction: string | undefined,
  colorOverride?: string
) => {
  const size = 32;
  let inner: React.ReactElement;

  if (type === 'web') {
    inner = <MapPin size={16} className="text-white" />;
  } else if (type === 'sms') {
    inner = <MessageSquare size={16} className="text-white" />;
  } else {
    inner =
      direction === 'outgoing' ? (
        <PhoneOutgoing size={16} className="text-white" />
      ) : (
        <PhoneIncoming size={16} className="text-white" />
      );
  }

  const icon = (
    <div
      style={{
        backgroundColor: colorOverride || getPointColor(type, direction),
        borderRadius: '9999px',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {inner}
    </div>
  );

  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const normalizePhoneDigits = (value?: string): string => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('221')) {
    return digits.slice(3);
  }
  return digits;
};

const formatPhoneForDisplay = (value?: string): string => {
  const normalized = normalizePhoneDigits(value);
  if (normalized) return normalized;
  return value?.trim() || 'N/A';
};

const getArrowIcon = (angle: number) => {
  const size = 16;
  const icon = (
    <div style={{ transform: `rotate(${angle}deg)` }}>
      <ArrowRight size={size} className="text-indigo-500" />
    </div>
  );
  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const createLabelIcon = (text: string, bgColor: string) => {
  const icon = (
    <div className="relative">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shadow-md"
        style={{ backgroundColor: bgColor }}
      >
        <MapPin size={16} className="text-white" />
      </div>
      <span className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-xs font-bold rounded-full px-1">
        {text}
      </span>
    </div>
  );

  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
};

const getGroupIcon = (
  count: number,
  type: string,
  direction: string | undefined,
  colorOverride?: string
) => {
  const size = 32;
  const color = colorOverride || getPointColor(type, direction);
  const icon = (
    <div className="relative">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white"
        style={{ backgroundColor: color }}
      >
        <Layers size={16} />
      </div>
      <span className="absolute -top-1 -right-1 bg-gray-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
        {count}
      </span>
    </div>
  );
  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size]
  });
};

const numberColors = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f43f5e'
];

const formatDate = (d: string) => {
  const [year, month, day] = d.split('-');
  return `${day}/${month}/${year}`;
};

const formatDateTime = (timestamp: number) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} à ${hours}h${minutes}`;
};

const getLocationRadius = (nom: string) => {
  const name = nom.toLowerCase();
  if (name.includes('urbain')) return 200;
  if (name.includes('peri')) return 600;
  if (name.includes('rural')) return 2000;
  return 1000;
};

type Coord = [number, number]; // [lng, lat]

const convexHull = (points: Coord[]): Coord[] => {
  if (points.length <= 1) return points;
  const pts = points.slice().sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const cross = (o: Coord, a: Coord, b: Coord) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Coord[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Coord[] = [];
  for (const p of pts.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
};

const bufferPolygon = (coords: Coord[], center: Coord, buffer: number): Coord[] => {
  const latFactor = buffer / 111320;
  const lonFactor = buffer / (111320 * Math.cos((center[1] * Math.PI) / 180));
  return coords.map(([lng, lat]) => {
    const latDiff = lat - center[1];
    const lngDiff = lng - center[0];
    const len =
      Math.sqrt((latDiff / latFactor) ** 2 + (lngDiff / lonFactor) ** 2) || 1;
    const scale = (len + 1) / len;
    return [center[0] + lngDiff * scale, center[1] + latDiff * scale];
  });
};

const createCircle = (center: [number, number], radius: number, steps = 32): [number, number][] => {
  const [lat, lng] = center;
  const coords: [number, number][] = [];
  const radLat = (lat * Math.PI) / 180;
  const radLng = (lng * Math.PI) / 180;
  const d = radius / 6378137; // Earth radius
  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 360) / steps;
    const br = (bearing * Math.PI) / 180;
    const lat2 = Math.asin(
      Math.sin(radLat) * Math.cos(d) + Math.cos(radLat) * Math.sin(d) * Math.cos(br)
    );
    const lng2 =
      radLng +
      Math.atan2(
        Math.sin(br) * Math.sin(d) * Math.cos(radLat),
        Math.cos(d) - Math.sin(radLat) * Math.sin(lat2)
      );
    coords.push([(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI]);
  }
  return coords;
};

interface TriangulationZone {
  barycenter: [number, number]; // [lat, lng]
  polygon: [number, number][]; // [lat, lng]
  cells: [number, number][]; // [lat, lng]
  timestamp: number;
  source: string;
}

const computeTriangulation = (pts: Point[]): TriangulationZone[] => {
  const bySource: Record<string, Point[]> = {};
  pts.forEach((p) => {
    if (!p.source) return;
    if (!bySource[p.source]) bySource[p.source] = [];
    bySource[p.source].push(p);
  });
  const zones: TriangulationZone[] = [];
  Object.entries(bySource).forEach(([source, list]) => {
    const locGroups: Record<string, Point[]> = {};
    list.forEach((p) => {
      const key = `${p.latitude},${p.longitude}`;
      if (!locGroups[key]) locGroups[key] = [];
      locGroups[key].push(p);
    });
    const best = Object.values(locGroups).reduce((a, b) => (b.length > a.length ? b : a), [] as Point[]);
    if (best.length === 0) return;
    const lat = parseFloat(best[0].latitude);
    const lng = parseFloat(best[0].longitude);
    const radius = getLocationRadius(best[0].nom || '');
    zones.push({
      barycenter: [lat, lng],
      polygon: createCircle([lat, lng], radius),
      cells: [[lat, lng]],
      timestamp: new Date(`${best[0].callDate}T${best[0].startTime}`).getTime(),
      source
    });
  });
  return zones;
};

const MeetingPointMarker: React.FC<{
  mp: MeetingPoint;
}> = React.memo(({ mp }) => {
  return (
    <Marker
      position={[mp.lat, mp.lng]}
      icon={L.divIcon({
        html: renderToStaticMarkup(
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-8 w-8 rounded-full bg-red-400 opacity-75 animate-ping"></span>
            <span className="relative inline-flex h-4 w-4 rounded-full bg-red-600"></span>
          </div>
        ),
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })}
    >
      <Popup className="cdr-popup">
        <div className="relative w-[280px] max-w-[80vw] overflow-hidden rounded-3xl border border-white/60 bg-white/80 text-sm text-rose-600 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-2xl dark:border-rose-500/40 dark:bg-slate-900/90 dark:text-rose-100 dark:shadow-[0_30px_60px_-28px_rgba(0,0,0,0.75)]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rose-500/35 via-pink-500/10 to-orange-500/25 dark:from-rose-500/25 dark:via-rose-500/10 dark:to-orange-500/20" aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-white/75 dark:bg-slate-950/60" aria-hidden />
          <div className="relative space-y-3 px-4 py-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500/80 dark:text-rose-300/90">Point de rencontre</p>
              <p className="text-base font-semibold text-rose-700 dark:text-rose-100">{mp.nom || 'Point de rencontre'}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-rose-500/80 dark:text-rose-200/80">
                {mp.date && <span>{mp.date}</span>}
                {mp.start && mp.end && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {mp.start} – {mp.end}
                  </span>
                )}
                {mp.total && (
                  <span className="inline-flex items-center rounded-full border border-white/60 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm backdrop-blur-sm dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-100">
                    Total {mp.total}
                  </span>
                )}
              </div>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {mp.perNumber.map((d, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-white/60 bg-white/75 px-4 py-3 text-[13px] text-rose-600 shadow-sm backdrop-blur-sm dark:border-rose-500/25 dark:bg-slate-900/70 dark:text-rose-100 dark:shadow-black/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-rose-400 dark:text-rose-300">Numéro</p>
                      <p className="text-sm font-semibold leading-snug text-rose-600 dark:text-rose-100">
                        {formatPhoneForDisplay(d.number)}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-white/60 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-rose-500 shadow-sm backdrop-blur-sm dark:border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-100">
                      {d.total}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5 text-[11px] text-rose-500">
                    {d.events.map((ev, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-white/60 bg-white/70 px-3 py-1.5 shadow-sm backdrop-blur-sm dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100"
                      >
                        <span className="font-semibold text-rose-600 dark:text-rose-100">{ev.date}</span>
                        <span>{ev.start} – {ev.end}</span>
                        <span className="text-[10px] font-semibold text-rose-400 dark:text-rose-200">{ev.duration}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
});

const CdrMap: React.FC<Props> = ({ points, showRoute, showMeetingPoints, onToggleMeetingPoints, zoneMode, onZoneCreated }) => {
  if (!points || points.length === 0) return null;

  const callerPoints = useMemo(
    () =>
      points.filter(
        (p) =>
          p.type === 'web' ||
          (typeof p.direction === 'string' && p.direction.toLowerCase() === 'outgoing')
      ),
    [points]
  );

  const referencePoints = callerPoints.length > 0 ? callerPoints : points;
  const first = referencePoints[0];
  const center: [number, number] = [parseFloat(first.latitude), parseFloat(first.longitude)];
  const mapRef = useRef<L.Map | null>(null);

  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.setZoom(mapRef.current.getZoom() + 1);
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.setZoom(mapRef.current.getZoom() - 1);
    }
  };

  const [activeInfo, setActiveInfo] = useState<'contacts' | 'recent' | 'popular' | 'history' | null>(null);
  const [showOthers, setShowOthers] = useState(true);
  const pageSize = 20;
  const [contactPage, setContactPage] = useState(1);
  const [showZoneInfo, setShowZoneInfo] = useState(false);
  const [hiddenLocations, setHiddenLocations] = useState<Set<string>>(new Set());
  const [showSimilar, setShowSimilar] = useState(false);
  const [triangulationZones, setTriangulationZones] = useState<TriangulationZone[]>([]);
  const [activeMeetingNumber, setActiveMeetingNumber] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const handleIdentifyNumber = useCallback((value: string) => {
    if (typeof window === 'undefined') return;
    const normalized = normalizePhoneDigits(value);
    if (!normalized) return;
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const url = new URL(baseUrl);
    url.searchParams.set('page', 'search');
    url.searchParams.set('query', normalized);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }, []);

  const renderIdentifyButton = useCallback(
    (value?: string) => {
      const normalized = normalizePhoneDigits(value);
      if (!normalized) return null;
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleIdentifyNumber(normalized);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-900 dark:focus:ring-slate-600"
        >
          Identifier
        </button>
      );
    },
    [handleIdentifyNumber]
  );

  const getEventVisuals = useCallback(
    (point: Point): EventVisuals => {
      if (point.type === 'web') {
        return {
          label: 'Position',
          gradient:
            'from-rose-500/35 via-orange-500/10 to-amber-500/30 dark:from-rose-500/25 dark:via-orange-500/10 dark:to-amber-500/25',
          icon: MapPin,
          accentText: 'text-rose-600 dark:text-rose-300',
          badgeClass:
            'bg-white/40 text-rose-600 ring-1 ring-inset ring-rose-400/30 backdrop-blur-sm dark:bg-slate-900/70 dark:text-rose-200 dark:ring-rose-400/40',
          participantContainer:
            'border border-white/60 bg-white/70 ring-1 ring-inset ring-rose-400/15 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 dark:ring-rose-400/30 dark:shadow-black/30',
          participantIconClass:
            'bg-rose-500/15 text-rose-600 ring-1 ring-rose-500/20 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/30'
        };
      }
      if (point.type === 'sms') {
        return {
          label: 'SMS',
          gradient:
            'from-emerald-500/30 via-green-500/10 to-lime-500/30 dark:from-emerald-500/20 dark:via-green-500/10 dark:to-lime-500/20',
          icon: MessageSquare,
          accentText: 'text-emerald-600 dark:text-emerald-300',
          badgeClass:
            'bg-white/40 text-emerald-600 ring-1 ring-inset ring-emerald-400/30 backdrop-blur-sm dark:bg-slate-900/70 dark:text-emerald-200 dark:ring-emerald-400/40',
          participantContainer:
            'border border-white/60 bg-white/70 ring-1 ring-inset ring-emerald-400/20 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 dark:ring-emerald-400/30 dark:shadow-black/30',
          participantIconClass:
            'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/30'
        };
      }
      if (point.direction === 'outgoing') {
        return {
          label: 'Appel',
          pill: 'Sortant',
          gradient:
            'from-sky-500/35 via-indigo-500/10 to-blue-600/30 dark:from-sky-500/25 dark:via-indigo-500/10 dark:to-blue-500/25',
          icon: PhoneOutgoing,
          accentText: 'text-blue-600 dark:text-blue-300',
          badgeClass:
            'bg-white/40 text-blue-600 ring-1 ring-inset ring-blue-400/30 backdrop-blur-sm dark:bg-slate-900/70 dark:text-blue-200 dark:ring-blue-500/40',
          participantContainer:
            'border border-white/60 bg-white/70 ring-1 ring-inset ring-blue-400/20 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 dark:ring-blue-500/40 dark:shadow-black/30',
          participantIconClass:
            'bg-blue-500/15 text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-500/20 dark:text-blue-200 dark:ring-blue-500/40'
        };
      }
      return {
        label: 'Appel',
        pill: 'Entrant',
        gradient:
          'from-indigo-500/30 via-purple-500/10 to-violet-600/30 dark:from-indigo-500/25 dark:via-purple-500/10 dark:to-violet-500/25',
        icon: PhoneIncoming,
        accentText: 'text-indigo-600 dark:text-indigo-300',
        badgeClass:
          'bg-white/40 text-indigo-600 ring-1 ring-inset ring-indigo-400/30 backdrop-blur-sm dark:bg-slate-900/70 dark:text-indigo-200 dark:ring-indigo-500/40',
        participantContainer:
          'border border-white/60 bg-white/70 ring-1 ring-inset ring-indigo-400/20 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 dark:ring-indigo-500/40 dark:shadow-black/30',
        participantIconClass:
          'bg-indigo-500/15 text-indigo-600 ring-1 ring-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-200 dark:ring-indigo-500/40'
      };
    },
    []
  );

  const renderEventPopupContent = useCallback(
    (point: Point, options: { compact?: boolean; showLocation?: boolean } = {}) => {
      const { compact = false, showLocation = true } = options;
      const visuals = getEventVisuals(point);
      const Icon = visuals.icon;

      const participants: JSX.Element[] = [];
      const addParticipant = (label: string, value: string | undefined, IconComponent: LucideIcon) => {
        if (!value) return;
        const button = renderIdentifyButton(value);
        participants.push(
          <div
            key={`${label}-${value}`}
            className={`flex items-center justify-between rounded-2xl ${visuals.participantContainer} ${
              compact ? 'gap-2 px-3 py-2' : 'gap-2.5 px-3.5 py-2.5'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex ${compact ? 'h-8 w-8' : 'h-9 w-9'} items-center justify-center rounded-xl shadow-inner ${visuals.participantIconClass}`}
              >
                <IconComponent className={`h-4 w-4 ${visuals.accentText}`} />
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-400">{label}</p>
                <p
                  className={`font-semibold text-slate-700 dark:text-slate-100 ${
                    compact ? 'text-xs' : 'text-[13px]'
                  }`}
                >
                  {formatPhoneForDisplay(value)}
                </p>
              </div>
            </div>
            {button && <span className="shrink-0">{button}</span>}
          </div>
        );
      };

      if (point.type === 'sms') {
        addParticipant('Expéditeur', point.caller, MessageSquare);
        addParticipant('Destinataire', point.callee, MessageSquare);
      } else if (point.type !== 'web') {
        addParticipant('Appelant', point.caller, PhoneOutgoing);
        addParticipant('Appelé', point.callee, PhoneIncoming);
      }

      const details: { label: string; value?: React.ReactNode }[] = [];
      const formattedDuration = formatPointDuration(point) ?? point.duration ?? undefined;

      if (point.type === 'web') {
        if (point.callDate) {
          details.push({ label: 'Date', value: formatDate(point.callDate) });
        }
        if (point.endDate && point.endDate !== point.callDate) {
          details.push({ label: 'Date fin', value: formatDate(point.endDate) });
        }
        if (point.startTime) {
          details.push({ label: 'Début', value: point.startTime });
        }
        if (point.endTime) {
          details.push({ label: 'Fin', value: point.endTime });
        }
        if (formattedDuration) {
          details.push({ label: 'Durée', value: formattedDuration });
        }
      } else if (point.type === 'sms') {
        if (point.callDate) {
          details.push({ label: 'Date', value: formatDate(point.callDate) });
        }
        if (point.startTime) {
          details.push({ label: 'Heure', value: point.startTime });
        }
      } else {
        if (point.callDate) {
          details.push({ label: 'Date', value: formatDate(point.callDate) });
        }
        if (point.startTime) {
          details.push({ label: 'Début', value: point.startTime });
        }
        if (point.endTime) {
          details.push({ label: 'Fin', value: point.endTime });
        }
        if (formattedDuration) {
          details.push({ label: 'Durée', value: formattedDuration });
        }
      }

      if (point.tracked) {
        details.push({ label: 'Numéro suivi', value: formatPhoneForDisplay(point.tracked) });
      }
      if (point.source) {
        const trackedNormalized = normalizePhoneDigits(point.tracked);
        const sourceNormalized = normalizePhoneDigits(point.source);
        const label = point.type === 'web' ? 'Numéro localisé' : 'Numéro appelant localisé';
        const shouldShowLocationOwner =
          !point.tracked || trackedNormalized !== sourceNormalized || point.type === 'web';
        if (shouldShowLocationOwner) {
          details.push({ label, value: formatPhoneForDisplay(point.source) });
        }
      }

      const filteredDetails = details.filter(
        (item) => item.value !== undefined && item.value !== null && item.value !== ''
      );

      const detailGrid =
        filteredDetails.length > 0 ? (
          <div
            className={`grid ${filteredDetails.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} ${
              compact ? 'gap-2' : 'gap-2.5'
            }`}
          >
            {filteredDetails.map((item, index) => {
              const spanTwoColumns =
                filteredDetails.length % 2 === 1 &&
                index === filteredDetails.length - 1 &&
                filteredDetails.length !== 1;
              return (
                <div
                  key={`${item.label}-${index}`}
                  className={`rounded-2xl border border-white/60 bg-white/75 px-3 py-2 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 dark:shadow-black/20 ${
                    spanTwoColumns ? 'col-span-2' : ''
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-400">{item.label}</p>
                  <p
                    className={`mt-0.5 font-semibold text-slate-700 dark:text-slate-100 ${
                      compact ? 'text-xs' : 'text-[13px]'
                    }`}
                  >
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null;

      if (compact) {
        return (
          <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/75 px-3 py-3 text-sm text-slate-600 shadow-lg backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-black/40">
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${visuals.gradient}`} aria-hidden />
            <div className="pointer-events-none absolute inset-0 bg-white/70 dark:bg-slate-950/30" aria-hidden />
            <div className="relative flex items-center gap-3">
              <span
                className={`flex ${compact ? 'h-9 w-9' : 'h-10 w-10'} items-center justify-center rounded-2xl shadow-inner ${visuals.participantIconClass}`}
              >
                <Icon className={`h-4 w-4 ${visuals.accentText}`} />
              </span>
              <div className="flex flex-col">
                <span className={`text-xs font-semibold ${visuals.accentText}`}>{visuals.label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {point.callDate ? formatDate(point.callDate) : ''}
                  {point.startTime ? ` • ${point.startTime}` : ''}
                </span>
              </div>
              {visuals.pill && (
                <span
                  className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${visuals.badgeClass}`}
                >
                  {visuals.pill}
                </span>
              )}
            </div>
            {participants.length > 0 && <div className="relative mt-3 space-y-2">{participants}</div>}
            {detailGrid && <div className="relative mt-3">{detailGrid}</div>}
          </div>
        );
      }

      return (
        <div className="relative w-[280px] max-w-[80vw] overflow-hidden rounded-3xl border border-white/60 bg-white/80 text-[13px] text-slate-600 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-[0_30px_60px_-28px_rgba(2,6,23,0.75)]">
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${visuals.gradient}`} aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-white/75 dark:bg-slate-950/30" aria-hidden />
          <div className="relative flex items-start gap-3 px-4 pt-4">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-inner ${visuals.participantIconClass}`}
            >
              <Icon className={`h-5 w-5 ${visuals.accentText}`} />
            </span>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{visuals.label}</p>
                {visuals.pill && (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${visuals.badgeClass}`}
                  >
                    {visuals.pill}
                  </span>
                )}
              </div>
              {showLocation && (
                <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                  {point.nom || 'Localisation'}
                </p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {point.callDate ? formatDate(point.callDate) : ''}
                {point.startTime ? ` • ${point.startTime}` : ''}
              </p>
            </div>
          </div>
          <div className="relative space-y-2 px-4 pb-4 pt-3">
            {participants.length > 0 && <div className="space-y-2">{participants}</div>}
            {detailGrid}
          </div>
        </div>
      );
    },
    [getEventVisuals, renderIdentifyButton]
  );

  const closeInfoPanels = useCallback(() => {
    setShowZoneInfo(false);
    setActiveInfo(null);
  }, []);

  const sourceNumbers = useMemo(
    () =>
      Array.from(
        new Set(
          callerPoints.map((p) => p.source).filter((n): n is string => Boolean(n))
        )
      ),
    [callerPoints]
  );
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    sourceNumbers.forEach((n, i) => map.set(n, numberColors[i % numberColors.length]));
    return map;
  }, [sourceNumbers]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [visibleSources, setVisibleSources] = useState<Set<string>>(new Set());

  useEffect(() => {
    setVisibleSources(new Set(sourceNumbers));
  }, [sourceNumbers]);

  useEffect(() => {
    if (sourceNumbers.length < 1) setShowSimilar(false);
  }, [sourceNumbers]);

  useEffect(() => {
    if (sourceNumbers.length < 2 && showMeetingPoints && onToggleMeetingPoints) {
      onToggleMeetingPoints();
      setActiveMeetingNumber(null);
    }
  }, [sourceNumbers, showMeetingPoints, onToggleMeetingPoints]);

  useEffect(() => {
    if (!showMeetingPoints) {
      setActiveMeetingNumber(null);
    }
  }, [showMeetingPoints]);

  useEffect(() => {
    if (selectedSource && !sourceNumbers.includes(selectedSource)) {
      setSelectedSource(null);
    }
  }, [sourceNumbers, selectedSource]);

  const toggleSourceVisibility = (src: string) => {
    setVisibleSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };
  const toggleInfo = (key: 'contacts' | 'recent' | 'popular' | 'history') => {
    if (showMeetingPoints) onToggleMeetingPoints?.();
    setShowZoneInfo(false);
    setActiveInfo((prev) => (prev === key ? null : key));
    if (key === 'contacts') setContactPage(1);
    if (key !== 'recent' && key !== 'popular') setShowOthers(true);
  };

  const handleMeetingPointsClick = () => {
    setShowZoneInfo(false);
    setActiveInfo(null);
    onToggleMeetingPoints?.();
  };

  const [zoneShape, setZoneShape] = useState<L.LatLng[] | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<L.LatLng[]>([]);

  useEffect(() => {
    setContactPage(1);
  }, [selectedSource]);

  useEffect(() => {
    if (zoneMode) {
      setZoneShape(null);
      setCurrentPoints([]);
      setShowZoneInfo(false);
    }
  }, [zoneMode]);

  const pointInPolygon = (point: L.LatLng, polygon: L.LatLng[]) => {
    const x = point.lng;
    const y = point.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;
      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const displayedPoints = useMemo(() => {
    let filtered = callerPoints;
    if (selectedSource) {
      filtered = filtered.filter((p) => p.source === selectedSource);
    } else {
      filtered = filtered.filter((p) => !p.source || visibleSources.has(p.source));
    }
    if (!zoneShape || zoneShape.length < 3) return filtered;
    return filtered.filter((p) => {
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      if (isNaN(lat) || isNaN(lng)) return false;
      return pointInPolygon(L.latLng(lat, lng), zoneShape);
    });
  }, [callerPoints, zoneShape, selectedSource, visibleSources]);

  const activeSourceCount = useMemo(() => {
    const set = new Set<string>();
    displayedPoints.forEach((p) => {
      if (p.source) {
        set.add(p.source);
      }
    });
    return set.size;
  }, [displayedPoints]);

  const usePerNumberColors = activeSourceCount >= 2;

  const resolveSourceColor = useCallback(
    (src?: string) => {
      if (!usePerNumberColors || !src) return undefined;
      return colorMap.get(src);
    },
    [usePerNumberColors, colorMap]
  );

  const renderLocationStatPopup = useCallback(
    (loc: LocationMarker) => {
      const showSource = selectedSource === null && sourceNumbers.length > 1 && loc.source;
      const accent = showSource && loc.source ? colorMap.get(loc.source) || '#f97316' : '#f97316';
      const modeLabel =
        activeInfo === 'popular'
          ? 'Fréquentation'
          : activeInfo === 'recent'
          ? 'Activité récente'
          : 'Synthèse';

      return (
        <div className="relative w-[260px] max-w-[80vw] overflow-hidden rounded-3xl border border-white/60 bg-white/80 text-sm text-slate-700 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-2xl dark:border-slate-700/70 dark:bg-slate-950/80 dark:text-slate-100 dark:shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/30 via-orange-400/10 to-yellow-500/25 dark:from-amber-500/20 dark:via-orange-400/5 dark:to-yellow-500/10" aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-white/75 dark:bg-slate-950/70" aria-hidden />
          <div className="relative space-y-3 px-4 py-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700/80 dark:text-amber-300/90">Point d'intérêt</p>
              <p className="text-base font-semibold text-slate-900 dark:text-white">{loc.nom || `${loc.latitude},${loc.longitude}`}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {loc.latitude}, {loc.longitude}
              </p>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-black/40">
              <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-400">Occurrences</span>
              <span className="text-3xl font-semibold text-slate-900 dark:text-white">{loc.count}</span>
            </div>
            {loc.lastDate && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-50/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-amber-400/40 dark:bg-amber-500/10 dark:shadow-black/40">
                <p className="text-[10px] uppercase tracking-wide text-amber-500 dark:text-amber-300">Dernière visite</p>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-200">
                  {formatDate(loc.lastDate)}
                  {loc.lastTime ? ` • ${loc.lastTime}` : ''}
                </p>
              </div>
            )}
            {showSource && (
              <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 dark:shadow-black/40">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-400">Numéro</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                    {formatPhoneForDisplay(loc.source!)}
                  </p>
                </div>
                <span
                  className="inline-flex h-3 w-3 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              </div>
            )}
            <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-xs text-slate-500 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 dark:shadow-black/40">
              Vue actuelle : <span className="font-semibold text-slate-600 dark:text-slate-200">{modeLabel}</span>
            </div>
          </div>
        </div>
      );
    },
    [selectedSource, sourceNumbers, colorMap, activeInfo]
  );

  const renderTriangulationPopup = useCallback((zone: TriangulationZone) => {
    const observed = formatDateTime(zone.timestamp);
    return (
      <div className="relative w-[240px] max-w-[75vw] overflow-hidden rounded-3xl border border-white/60 bg-white/80 text-sm text-slate-700 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/30 via-purple-500/10 to-fuchsia-500/30" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-white/75" aria-hidden />
        <div className="relative space-y-3 px-4 py-4">
          <div className="rounded-2xl border border-white/60 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-wide text-purple-500">Numéro localisé</p>
            <p className="text-sm font-semibold text-purple-600">
              {formatPhoneForDisplay(zone.source)}
            </p>
          </div>
          {observed && (
            <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-xs text-slate-500 shadow-sm backdrop-blur-sm">
              <span>Dernière activité</span>
              <span className="font-semibold text-slate-700">{observed}</span>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-xs text-slate-500 shadow-sm backdrop-blur-sm">
            <span className="inline-flex h-2 w-2 rounded-full bg-purple-400" />
            Basé sur {zone.cells.length} cellule{zone.cells.length > 1 ? 's' : ''} active{zone.cells.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>
    );
  }, []);

  const handleTriangulation = () => {
    if (triangulationZones.length > 0) {
      setTriangulationZones([]);
    } else {
      setTriangulationZones(computeTriangulation(displayedPoints));
    }
  };

  const { topContacts, topLocations, recentLocations, total } = useMemo(() => {
    const contactMap = new Map<string, { callCount: number; smsCount: number; callDuration: number }>();
    const locationMap = new Map<string, LocationStat>();

    displayedPoints.forEach((p) => {
      if (p.number) {
        const entry = contactMap.get(p.number) || { callCount: 0, smsCount: 0, callDuration: 0 };
        if (p.type === 'sms') {
          entry.smsCount += 1;
        } else {
          entry.callCount += 1;
          entry.callDuration += getPointDurationInSeconds(p);
        }
        contactMap.set(p.number, entry);
      }

      const key = `${p.latitude},${p.longitude},${p.nom || ''}`;
      const loc =
        locationMap.get(key) ||
        {
          latitude: p.latitude,
          longitude: p.longitude,
          nom: p.nom,
          count: 0,
          lastDate: p.callDate,
          lastTime: p.startTime
        };
      loc.count += 1;
      const current = new Date(`${p.callDate}T${p.startTime}`);
      const prev = loc.lastDate && loc.lastTime ? new Date(`${loc.lastDate}T${loc.lastTime}`) : null;
      if (!prev || current > prev) {
        loc.lastDate = p.callDate;
        loc.lastTime = p.startTime;
      }
      locationMap.set(key, loc);
    });

    const contacts: Contact[] = Array.from(contactMap.entries())
      .map(([number, c]) => ({
        number,
        callCount: c.callCount,
        smsCount: c.smsCount,
        callDuration: formatDuration(c.callDuration),
        total: c.callCount + c.smsCount
      }))
      .sort((a, b) => b.total - a.total);

    const allLocations = Array.from(locationMap.values()).filter(
      (loc) =>
        !isNaN(parseFloat(loc.latitude)) && !isNaN(parseFloat(loc.longitude))
    );

    const locations: LocationStat[] = allLocations
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recent: LocationStat[] = allLocations
      .slice()
      .sort((a, b) => {
        const dateA = new Date(`${a.lastDate || ''}T${a.lastTime || '00:00:00'}`).getTime();
        const dateB = new Date(`${b.lastDate || ''}T${b.lastTime || '00:00:00'}`).getTime();
        return dateB - dateA;
      })
      .slice(0, 10);

    return { topContacts: contacts, topLocations: locations, recentLocations: recent, total: displayedPoints.length };
  }, [displayedPoints]);

  const toggleLocationVisibility = (loc: LocationStat) => {
    const key = `${loc.latitude},${loc.longitude},${loc.nom || ''}`;
    setHiddenLocations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAllLocations = (list: LocationStat[]) => {
    setHiddenLocations((prev) => {
      const next = new Set(prev);
      const keys = list.map((l) => `${l.latitude},${l.longitude},${l.nom || ''}`);
      const allHidden = keys.every((k) => next.has(k));
      if (allHidden) keys.forEach((k) => next.delete(k)); else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const locationMarkers = useMemo<LocationMarker[]>(() => {
    if (activeInfo !== 'popular' && activeInfo !== 'recent') return [];
    if (selectedSource === null && sourceNumbers.length > 1) {
      const perSource = new Map<string, Map<string, LocationStat>>();
      displayedPoints.forEach((p) => {
        const src = p.source || 'unknown';
        let map = perSource.get(src);
        if (!map) {
          map = new Map();
          perSource.set(src, map);
        }
        const key = `${p.latitude},${p.longitude},${p.nom || ''}`;
        const loc =
          map.get(key) ||
          {
            latitude: p.latitude,
            longitude: p.longitude,
            nom: p.nom,
            count: 0,
            lastDate: p.callDate,
            lastTime: p.startTime
          };
        loc.count += 1;
        const current = new Date(`${p.callDate}T${p.startTime}`);
        const prev =
          loc.lastDate && loc.lastTime
            ? new Date(`${loc.lastDate}T${loc.lastTime}`)
            : null;
        if (!prev || current > prev) {
          loc.lastDate = p.callDate;
          loc.lastTime = p.startTime;
        }
        map.set(key, loc);
      });
      const markers: LocationMarker[] = [];
      perSource.forEach((map, src) => {
        const all = Array.from(map.values()).filter(
          (loc) =>
            !isNaN(parseFloat(loc.latitude)) && !isNaN(parseFloat(loc.longitude))
        );
        const sorted =
          activeInfo === 'popular'
            ? all.sort((a, b) => b.count - a.count)
            : all.sort((a, b) => {
                const dateA = new Date(
                  `${a.lastDate || ''}T${a.lastTime || '00:00:00'}`
                ).getTime();
                const dateB = new Date(
                  `${b.lastDate || ''}T${b.lastTime || '00:00:00'}`
                ).getTime();
                return dateB - dateA;
              });
        sorted.slice(0, 10).forEach((loc) => {
          const key = `${loc.latitude},${loc.longitude},${loc.nom || ''}`;
          if (!hiddenLocations.has(key)) markers.push({ ...loc, source: src });
        });
      });
      const grouped = new Map<string, LocationMarker[]>();
      markers.forEach((m) => {
        const key = `${m.latitude},${m.longitude}`;
        let arr = grouped.get(key);
        if (!arr) {
          arr = [];
          grouped.set(key, arr);
        }
        arr.push(m);
      });
      const adjusted: LocationMarker[] = [];
      grouped.forEach((group) => {
        if (group.length === 1) {
          adjusted.push(group[0]);
          return;
        }
        const angleStep = (2 * Math.PI) / group.length;
        const radius = 0.0003;
        group.forEach((m, idx) => {
          const angle = idx * angleStep;
          const lat =
            parseFloat(m.latitude) + radius * Math.cos(angle);
          const lng =
            parseFloat(m.longitude) + radius * Math.sin(angle);
          adjusted.push({ ...m, latitude: lat.toString(), longitude: lng.toString() });
        });
      });
      return adjusted;
    }
    const base = (activeInfo === 'popular' ? topLocations : recentLocations)
      .filter((l) => !hiddenLocations.has(`${l.latitude},${l.longitude},${l.nom || ''}`))
      .map((l) => ({ ...l }));
    const grouped = new Map<string, LocationMarker[]>();
    base.forEach((m) => {
      const key = `${m.latitude},${m.longitude}`;
      let arr = grouped.get(key);
      if (!arr) {
        arr = [];
        grouped.set(key, arr);
      }
      arr.push(m);
    });
    const adjusted: LocationMarker[] = [];
    grouped.forEach((group) => {
      if (group.length === 1) {
        adjusted.push(group[0]);
        return;
      }
      const angleStep = (2 * Math.PI) / group.length;
      const radius = 0.0003;
      group.forEach((m, idx) => {
        const angle = idx * angleStep;
        const lat = parseFloat(m.latitude) + radius * Math.cos(angle);
        const lng = parseFloat(m.longitude) + radius * Math.sin(angle);
        adjusted.push({ ...m, latitude: lat.toString(), longitude: lng.toString() });
      });
    });
    return adjusted;
  }, [
    activeInfo,
    selectedSource,
    sourceNumbers,
    displayedPoints,
    topLocations,
    recentLocations,
    hiddenLocations
  ]);

  const showBaseMarkers = useMemo(() => showOthers, [showOthers]);

  const routePositions = useMemo(() => {
    if (!showRoute) return [];
    const sorted = [...displayedPoints].sort((a, b) => {
      const dateA = new Date(`${a.callDate}T${a.startTime}`);
      const dateB = new Date(`${b.callDate}T${b.startTime}`);
      return dateA.getTime() - dateB.getTime();
    });
    return sorted.map((p) => [parseFloat(p.latitude), parseFloat(p.longitude)] as [number, number]);
  }, [displayedPoints, showRoute]);

  const interpolatedRoute = useMemo(() => {
    if (!showRoute || routePositions.length < 2) return [] as [number, number][];
    const result: [number, number][] = [];
    for (let i = 1; i < routePositions.length; i++) {
      const [lat1, lng1] = routePositions[i - 1];
      const [lat2, lng2] = routePositions[i];
      const steps = 20;
      if (i === 1) result.push([lat1, lng1]);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        result.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
      }
    }
    return result;
  }, [routePositions, showRoute]);

  const arrowMarkers = useMemo(() => {
    if (!showRoute || routePositions.length < 2) return [];
    const markers: { position: [number, number]; angle: number }[] = [];
    for (let i = 1; i < routePositions.length; i++) {
      const [lat1, lng1] = routePositions[i - 1];
      const [lat2, lng2] = routePositions[i];
      const angle = (Math.atan2(lat1 - lat2, lng2 - lng1) * 180) / Math.PI;
      markers.push({
        position: [(lat1 + lat2) / 2, (lng1 + lng2) / 2] as [number, number],
        angle
      });
    }
    return markers;
  }, [routePositions, showRoute]);

  const similarSegments = useMemo(() => {
    const segmentMap = new Map<
      string,
      { positions: [number, number][]; counts: Map<string, number> }
    >();
    sourceNumbers.forEach((src) => {
      const pts = callerPoints
        .filter((p) => p.source === src)
        .sort((a, b) => {
          const dateA = new Date(`${a.callDate}T${a.startTime}`);
          const dateB = new Date(`${b.callDate}T${b.startTime}`);
          return dateA.getTime() - dateB.getTime();
        });
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const lat1 = parseFloat(a.latitude);
        const lng1 = parseFloat(a.longitude);
        const lat2 = parseFloat(b.latitude);
        const lng2 = parseFloat(b.longitude);
        if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) continue;
        const key = `${lat1},${lng1}|${lat2},${lng2}`;
        const seg =
          segmentMap.get(key) || {
            positions: [
              [lat1, lng1] as [number, number],
              [lat2, lng2] as [number, number]
            ],
            counts: new Map<string, number>()
          };
        seg.counts.set(src, (seg.counts.get(src) || 0) + 1);
        segmentMap.set(key, seg);
      }
    });
    return Array.from(segmentMap.values())
      .filter((s) => {
        if (sourceNumbers.length > 1) {
          return s.counts.size > 1;
        }
        const firstCount = Array.from(s.counts.values())[0] || 0;
        return firstCount > 1;
      })
      .map((s) => ({ positions: s.positions, sources: Array.from(s.counts.keys()) }));
  }, [callerPoints, sourceNumbers]);

  const similarNumbers = useMemo(() => {
    const set = new Set<string>();
    similarSegments.forEach((s) => s.sources.forEach((src) => set.add(src)));
    return Array.from(set);
  }, [similarSegments]);

  const [visibleSimilar, setVisibleSimilar] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (showSimilar) {
      setVisibleSimilar(new Set(similarNumbers));
    }
  }, [showSimilar, similarNumbers]);

  const toggleSimilarVisibility = (src: string) => {
    setVisibleSimilar((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const similarPoints = useMemo(
    () =>
      callerPoints.filter(
        (p) => p.source && visibleSimilar.has(p.source)
      ),
    [callerPoints, visibleSimilar]
  );

  const connectorPoints = useMemo(() => {
    const coords = new Set(
      similarSegments.flatMap((seg) =>
        seg.positions.map((pos) => pos.join(','))
      )
    );
    return similarPoints.filter((p) =>
      coords.has(`${parseFloat(p.latitude)},${parseFloat(p.longitude)}`)
    );
  }, [similarSegments, similarPoints]);

  const [carIndex, setCarIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  const paginatedContacts = useMemo(() => {
    const start = (contactPage - 1) * pageSize;
    return topContacts.slice(start, start + pageSize);
  }, [topContacts, contactPage, pageSize]);

  const historyEvents = useMemo(() => {
    return displayedPoints
      .map((p) => ({
        location: p.nom || `${p.latitude},${p.longitude}`,
        date: p.callDate,
        time: p.startTime
      }))
      .sort((a, b) => {
        const da = new Date(`${a.date}T${a.time}`).getTime();
        const db = new Date(`${b.date}T${b.time}`).getTime();
        return db - da;
      });
  }, [displayedPoints]);

  const availableHistoryDates = useMemo(() => {
    return Array.from(new Set(historyEvents.map((h) => h.date))).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
  }, [historyEvents]);

  const filteredHistoryEvents = useMemo(() => {
    if (!historyDateFilter) return historyEvents;
    return historyEvents.filter((h) => h.date === historyDateFilter);
  }, [historyEvents, historyDateFilter]);


  useEffect(() => {
    if (!showRoute || interpolatedRoute.length < 2) return;
    setCarIndex(0);
    let current = 0;
    const id = setInterval(() => {
      current += 1;
      if (current >= interpolatedRoute.length) {
        clearInterval(id);
      } else {
        setCarIndex(current);
      }
    }, 100 / speed);
    return () => clearInterval(id);
  }, [showRoute, interpolatedRoute, speed]);

  const carAngle = useMemo(() => {
    if (carIndex >= interpolatedRoute.length - 1) return 0;
    const [lat1, lng1] = interpolatedRoute[carIndex];
    const [lat2, lng2] = interpolatedRoute[carIndex + 1];
    return (Math.atan2(lat2 - lat1, lng2 - lng1) * 180) / Math.PI;
  }, [carIndex, interpolatedRoute]);

  const carPosition = interpolatedRoute[carIndex] || interpolatedRoute[0];

  const ZoneSelector: React.FC = () => {
    const map = useMapEvents({
      mousedown(e) {
        if (!zoneMode) return;
        setDrawing(true);
        setCurrentPoints([e.latlng]);
        map.dragging.disable();
      },
      mousemove(e) {
        if (!zoneMode || !drawing) return;
        setCurrentPoints((pts) => [...pts, e.latlng]);
      },
      mouseup() {
        if (!zoneMode || !drawing) return;
        map.dragging.enable();
        setDrawing(false);
        if (currentPoints.length > 2) {
          const final = currentPoints.slice();
          setZoneShape(final);
          setShowZoneInfo(true);
          onZoneCreated && onZoneCreated();
        }
        setCurrentPoints([]);
      }
    });
    return null;
  };

  const carIcon = useMemo(() => {
    const size = 36;
    const icon = (
      <div
        style={{
          transform: `rotate(${carAngle}deg)`,
          backgroundColor: '#2563eb',
          borderRadius: '14px',
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 12px 24px rgba(79, 70, 229, 0.3)'
        }}
      >
        <Car size={18} className="text-white" />
      </div>
    );
    return L.divIcon({
      html: renderToStaticMarkup(icon),
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }, [carAngle]);

  const meetingPoints = useMemo<MeetingPoint[]>(() => {
    // Group events by location regardless of start time
    const locationMap = new Map<
      string,
      { lat: number; lng: number; nom: string; events: Point[] }
    >();
    displayedPoints.forEach((p) => {
      if (!p.source) return;
      const key = `${p.latitude},${p.longitude}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          lat: parseFloat(p.latitude),
          lng: parseFloat(p.longitude),
          nom: p.nom,
          events: []
        });
      }
      locationMap.get(key)!.events.push(p);
    });

    const result: MeetingPoint[] = [];

    locationMap.forEach((loc) => {
      const evs = loc.events;
      if (evs.length < 2) return;

      // Build timeline of all events to detect distinct overlapping windows
      const timeline: { time: Date; type: 'start' | 'end'; index: number }[] = [];
      evs.forEach((e, idx) => {
        timeline.push({
          time: new Date(`${e.callDate}T${e.startTime}`),
          type: 'start',
          index: idx
        });
        timeline.push({
          time: new Date(`${e.endDate || e.callDate}T${e.endTime}`),
          type: 'end',
          index: idx
        });
      });

      timeline.sort((a, b) => {
        const diff = a.time.getTime() - b.time.getTime();
        if (diff !== 0) return diff;
        if (a.type === b.type) return 0;
        return a.type === 'end' ? -1 : 1;
      });

      const active = new Set<number>();
      const windows: { start: Date; end: Date }[] = [];
      let windowStart: Date | null = null;

      const getActiveSources = () =>
        new Set(
          Array.from(active).map((i) => evs[i].source).filter(Boolean) as string[]
        );

      timeline.forEach(({ time, type, index }) => {
        if (type === 'start') {
          active.add(index);
          const sources = getActiveSources();
          if (windowStart === null && sources.size >= 2) {
            windowStart = time;
          }
        } else {
          const wasMeeting = windowStart !== null;
          active.delete(index);
          const sources = getActiveSources();
          if (wasMeeting && sources.size < 2) {
            windows.push({ start: windowStart!, end: time });
            windowStart = null;
          }
        }
      });

      windows.forEach(({ start, end }) => {
        const groupEvents = evs.filter((e) => {
          const s = new Date(`${e.callDate}T${e.startTime}`);
          const en = new Date(`${e.endDate || e.callDate}T${e.endTime}`);
          return s < end && start < en;
        });

        const numbers = Array.from(
          new Set(groupEvents.map((e) => e.source!).filter(Boolean))
        );
        if (numbers.length < 2) return;

        const perNumber = numbers.map((num) => {
          const evts = groupEvents
            .filter((e) => e.source === num)
            .map((e) => {
              const s = new Date(`${e.callDate}T${e.startTime}`);
              const en = new Date(`${e.endDate || e.callDate}T${e.endTime}`);
              const overlapStart = s < start ? start : s;
              const overlapEnd = en > end ? end : en;
              const durationSec = Math.max(
                0,
                (overlapEnd.getTime() - overlapStart.getTime()) / 1000
              );
              return {
                date: formatDate(overlapStart.toISOString().split('T')[0]),
                start: overlapStart.toTimeString().substr(0, 8),
                end: overlapEnd.toTimeString().substr(0, 8),
                duration: new Date(durationSec * 1000)
                  .toISOString()
                  .substr(11, 8),
                durationSec
              };
            });
          const totalSec = evts.reduce((a, b) => a + b.durationSec, 0);
          const total = new Date(totalSec * 1000).toISOString().substr(11, 8);
          return {
            number: num,
            events: evts.map(({ date, start, end, duration }) => ({
              date,
              start,
              end,
              duration
            })),
            total,
            totalSec
          };
        });

        const overallSec = perNumber.reduce((sum, n) => sum + n.totalSec, 0);
        const dateStr = formatDate(start.toISOString().split('T')[0]);
        const startStr = `${dateStr} ${start.toTimeString().substr(0, 8)}`;
        const endStr = `${formatDate(
          end.toISOString().split('T')[0]
        )} ${end.toTimeString().substr(0, 8)}`;
        const total = new Date(overallSec * 1000).toISOString().substr(11, 8);

        result.push({
          lat: loc.lat,
          lng: loc.lng,
          nom: loc.nom,
          numbers,
          perNumber: perNumber.map(({ totalSec, ...rest }) => rest),
          events: groupEvents,
          date: dateStr,
          start: startStr,
          end: endStr,
          total
        });
      });
    });

    return result;
  }, [displayedPoints]);

  const handleToggleMeetingPoint = (number: string) => {
    const mp = meetingPoints.find((m) => m.numbers.includes(number));
    if (!mp) return;
    const isActive = showMeetingPoints && activeMeetingNumber === number;
    if (isActive) {
      setActiveMeetingNumber(null);
      onToggleMeetingPoints?.();
    } else {
      setActiveMeetingNumber(number);
      if (!showMeetingPoints) {
        onToggleMeetingPoints?.();
      }
      setActiveInfo(null);
      setShowZoneInfo(false);
      mapRef.current?.flyTo([mp.lat, mp.lng], 16);
    }
  };

  const startIcon = useMemo(() => createLabelIcon('Départ', '#16a34a'), []);
  const endIcon = useMemo(() => createLabelIcon('Arrivée', '#dc2626'), []);
  const groupedPoints = useMemo<GroupedPoint[]>(() => {
    const groups = new Map<
      string,
      {
        lat: number;
        lng: number;
        perSource: Map<string, { source?: string; events: Point[] }>;
      }
    >();

    displayedPoints.forEach((p) => {
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      if (isNaN(lat) || isNaN(lng)) return;
      const key = `${lat},${lng}`;
      let group = groups.get(key);
      if (!group) {
        group = { lat, lng, perSource: new Map() };
        groups.set(key, group);
      }

      const sourceKey = p.source ?? NO_SOURCE_KEY;
      const entry = group.perSource.get(sourceKey);
      if (entry) {
        entry.events.push(p);
      } else {
        group.perSource.set(sourceKey, { source: p.source, events: [p] });
      }
    });

    return Array.from(groups.values()).map(({ lat, lng, perSource }) => {
      const perSourceEntries = Array.from(perSource.values());
      const events = perSourceEntries.flatMap((entry) => entry.events);
      return { lat, lng, events, perSource: perSourceEntries };
    });
  }, [displayedPoints]);

  const createMarkerForEvents = useCallback(
    (events: Point[], position: [number, number], key: string) => {
      if (events.length === 0) return null;
      if (events.length === 1) {
        const loc = events[0];
        return (
          <Marker
            key={key}
            position={position}
            icon={getIcon(loc.type, loc.direction, resolveSourceColor(loc.source))}
          >
            <Popup className="cdr-popup">{renderEventPopupContent(loc)}</Popup>
          </Marker>
        );
      }

      const first = events[0];
      const uniqueSources = Array.from(
        new Set(
          events
            .map((ev) => ev.source)
            .filter((src): src is string => Boolean(src))
        )
      );

      return (
        <Marker
          key={key}
          position={position}
          icon={getGroupIcon(
            events.length,
            first.type,
            first.direction,
            resolveSourceColor(first.source)
          )}
        >
          <Popup className="cdr-popup">
            <div className="w-[260px] space-y-2.5">
              <div className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                    <MapPin className="h-4 w-4 text-slate-500" />
                  </span>
                  <div className="flex-1">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Localisation</p>
                    <p className="text-sm font-semibold leading-snug text-slate-800">
                      {first.nom || 'Localisation'}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {events.length} évènement{events.length > 1 ? 's' : ''}
                  </span>
                  {uniqueSources.map((src) => (
                    <span
                      key={src}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600"
                    >
                      <span
                        className="inline-flex h-2 w-2 rounded-full"
                        style={{ backgroundColor: resolveSourceColor(src) || '#6366f1' }}
                      />
                      {formatPhoneForDisplay(src)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {events.map((loc, i) => (
                  <div key={i}>
                    {renderEventPopupContent(loc, { compact: true, showLocation: false })}
                  </div>
                ))}
              </div>
            </div>
          </Popup>
        </Marker>
      );
    },
    [renderEventPopupContent, resolveSourceColor]
  );
  return (
    <>
        <div className="relative w-full h-screen">
          <MapContainer
            center={center}
            zoom={13}
            zoomControl={false}
            className="w-full h-full"
            style={{
              position: 'relative',
              cursor: zoneMode ? 'url("/pen.svg") 0 24, crosshair' : undefined
            }}
            whenCreated={(map) => (mapRef.current = map)}
            ref={mapRef}
          >
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
          <ZoneSelector />
        {drawing && currentPoints.length > 0 && (
          <Polyline
            positions={currentPoints}
            pathOptions={{
              color: '#6366f1',
              weight: 2,
              opacity: 0.75,
              dashArray: '6 3',
              lineCap: 'round'
            }}
          />
        )}
        {zoneShape && (
          <Polygon positions={zoneShape} pathOptions={{ color: 'blue' }} />
        )}
        {showBaseMarkers && (
          <MarkerClusterGroup maxClusterRadius={0}>
            {groupedPoints.flatMap((group, idx) => {
              const perSourceEntries = group.perSource;
              if (perSourceEntries.length <= 1) {
                const marker = createMarkerForEvents(
                  group.events,
                  [group.lat, group.lng],
                  `group-${idx}`
                );
                return marker ? [marker] : [];
              }

              return perSourceEntries.flatMap((entry, entryIdx) => {
                const position = computeOffsetPosition(
                  group.lat,
                  group.lng,
                  entryIdx,
                  perSourceEntries.length
                );
                const marker = createMarkerForEvents(
                  entry.events,
                  position,
                  `group-${idx}-${entry.source ?? 'unknown'}-${entryIdx}`
                );
                return marker ? [marker] : [];
              });
            })}
          </MarkerClusterGroup>
        )}
        {showMeetingPoints &&
          meetingPoints
            .filter(
              (mp) => !activeMeetingNumber || mp.numbers.includes(activeMeetingNumber)
            )
            .map((mp, idx) => (
              <MeetingPointMarker key={`meeting-${idx}`} mp={mp} />
            ))}
        {showBaseMarkers && showRoute && routePositions.length > 1 && (
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: '#4f46e5',
              weight: 2.5,
              opacity: 0.85,
              dashArray: '10 6',
              lineJoin: 'round',
              lineCap: 'round'
            }}
          />
        )}
        {showBaseMarkers && showRoute && routePositions.length > 0 && (
          <Marker position={routePositions[0]} icon={startIcon} />
        )}
        {showBaseMarkers && showRoute && routePositions.length > 1 && (
          <Marker
            position={routePositions[routePositions.length - 1]}
            icon={endIcon}
          />
        )}
        {showBaseMarkers && showRoute && interpolatedRoute.length > 0 && (
          <Marker position={carPosition} icon={carIcon} />
        )}
        {showBaseMarkers && showRoute &&
          arrowMarkers.map((a, idx) => (
            <Marker
              key={`arrow-${idx}`}
              position={a.position}
              icon={getArrowIcon(a.angle)}
              interactive={false}
            />
          ))}
        {showSimilar &&
          similarSegments.flatMap((seg, idx) =>
            seg.sources.map((src) =>
              visibleSimilar.has(src) ? (
                <Polyline
                  key={`similar-${idx}-${src}`}
                  positions={seg.positions}
                  pathOptions={{
                    color: colorMap.get(src) || '#8b5cf6',
                    weight: 2.5,
                    opacity: 0.7,
                    dashArray: '4 8',
                    lineCap: 'round'
                  }}
                />
              ) : null
            )
          )}
        {showSimilar &&
          (showOthers ? similarPoints : connectorPoints).map((loc, idx) => (
            <Marker
              key={`similar-point-${idx}`}
              position={[
                parseFloat(loc.latitude),
                parseFloat(loc.longitude)
              ]}
              icon={getIcon(loc.type, loc.direction, resolveSourceColor(loc.source))}
            >
              <Popup className="cdr-popup">
                {renderEventPopupContent(loc)}
              </Popup>
            </Marker>
            ))}
        {locationMarkers.map((loc, idx) => (
          <Marker
            key={`stat-${idx}`}
            position={[parseFloat(loc.latitude), parseFloat(loc.longitude)]}
            icon={createLabelIcon(
              String(loc.count),
              selectedSource === null &&
              sourceNumbers.length > 1 &&
              (activeInfo === 'recent' || activeInfo === 'popular')
                ? colorMap.get(loc.source || '') || '#f97316'
                : activeInfo === 'popular'
                ? '#9333ea'
                : '#f97316'
            )}
            zIndexOffset={1000}
          >
            <Popup className="cdr-popup">
              {renderLocationStatPopup(loc)}
            </Popup>
          </Marker>
        ))}
        {triangulationZones.map((zone, idx) => (
          <React.Fragment key={`tri-${idx}`}>
            <Polygon positions={zone.polygon} pathOptions={{ color: '#7e22ce', weight: 2, fillOpacity: 0.2 }} />
            {zone.cells.map((c, i) => (
              <CircleMarker
                key={`tri-cell-${idx}-${i}`}
                center={c as [number, number]}
                radius={4}
                pathOptions={{ color: '#7e22ce' }}
              />
            ))}
            <Marker position={zone.barycenter} icon={createLabelIcon(String(idx + 1), '#7e22ce')}>
              <Popup className="cdr-popup">
                {renderTriangulationPopup(zone)}
              </Popup>
            </Marker>
          </React.Fragment>
        ))}
        </MapContainer>

        <div className="pointer-events-none absolute top-4 left-2 z-[1000] flex flex-col gap-2">
          <button
            onClick={handleTriangulation}
            className={`pointer-events-auto p-2 rounded-full shadow transition-colors border border-gray-300 ${
              triangulationZones.length > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-white/90 text-gray-700 hover:bg-gray-100'
            }`}
            title="Localisation approximative de la personne"
          >
            <Crosshair className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsSatellite((s) => !s)}
            className={`pointer-events-auto p-2 rounded-full shadow transition-colors border border-gray-300 ${
              isSatellite
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-white/90 text-gray-700 hover:bg-gray-100'
            }`}
            title="Changer l'affichage"
          >
            <Layers className="w-5 h-5" />
          </button>
          {sourceNumbers.length > 0 && (
            <button
              onClick={() => setShowSimilar((s) => !s)}
              className={`pointer-events-auto p-2 rounded-full shadow transition-colors border border-gray-300 ${
                showSimilar
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white/90 text-gray-700 hover:bg-gray-100'
              }`}
              title="Trajectoires similaires"
            >
              <Activity className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleZoomIn}
            className="pointer-events-auto p-2 rounded-full shadow bg-white/90 hover:bg-gray-100 transition-colors border border-gray-300"
            title="Zoomer"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="pointer-events-auto p-2 rounded-full shadow bg-white/90 hover:bg-gray-100 transition-colors border border-gray-300"
            title="Dézoomer"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>

        <div className="pointer-events-none absolute top-0 left-2 right-2 z-[1000] flex justify-center">
          <div className="pointer-events-auto flex bg-white/90 backdrop-blur rounded-full shadow overflow-hidden divide-x divide-gray-200">
            <button
              onClick={() => toggleInfo('contacts')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeInfo === 'contacts'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Personnes en contact</span>
            </button>
            <button
              onClick={() => toggleInfo('recent')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeInfo === 'recent'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Localisations récentes</span>
            </button>
            <button
              onClick={() => toggleInfo('popular')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeInfo === 'popular'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Flame className="w-4 h-4" />
              <span>Lieux les plus visités</span>
            </button>
            <button
              onClick={() => toggleInfo('history')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeInfo === 'history'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Historique des déplacements</span>
            </button>
            {sourceNumbers.length >= 2 && (
              <button
                onClick={handleMeetingPointsClick}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  showMeetingPoints
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>Points de rencontre</span>
              </button>
            )}
            <button
              onClick={() => setShowOthers((s) => !s)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                showOthers
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'bg-gray-600 text-white'
              }`}
              title={showOthers ? 'Masquer autres éléments' : 'Afficher tous les éléments'}
            >
              {showOthers ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showBaseMarkers && showRoute && (
          <div className="pointer-events-none absolute bottom-12 left-0 right-0 z-[1000] flex justify-center">
            <div className="pointer-events-auto flex items-center gap-2 bg-white/90 backdrop-blur rounded-full shadow px-4 py-2">
              <Car className="w-4 h-4 text-indigo-500" />
              <label htmlFor="speed" className="font-semibold text-sm">
                {speed}x
              </label>
              <input
                id="speed"
                type="range"
                min={1}
                max={10}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-24"
              />
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-24 right-4 z-[1000] max-h-[50vh]">
          <div className="pointer-events-auto max-h-full overflow-y-auto bg-white/90 backdrop-blur-md rounded-xl border border-gray-200 shadow-lg p-4 text-sm text-gray-700">
            <p className="font-bold text-base mb-3 border-b border-gray-200 pb-2">Légende</p>
            <ul className="space-y-2">
              <li className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#16a34a' }}>
                  <PhoneIncoming className="w-4 h-4 text-white" />
                </span>
                <span>Appel entrant</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#2563eb' }}>
                  <PhoneOutgoing className="w-4 h-4 text-white" />
                </span>
                <span>Appel sortant</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#16a34a' }}>
                  <MessageSquare className="w-4 h-4 text-white" />
                </span>
                <span>SMS</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#dc2626' }}>
                  <MapPin className="w-4 h-4 text-white" />
                </span>
                <span>Position</span>
              </li>
              <li className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#7e22ce' }}>
                  <MapPin className="w-4 h-4 text-white" />
                </span>
                <span>Localisation approximative</span>
              </li>
              {showSimilar ? (
                similarNumbers.map((n) => (
                  <li key={n} className="flex items-center space-x-2">
                    <span
                      className="w-6 h-6 rounded-full"
                      style={{
                        backgroundColor: colorMap.get(n),
                        opacity: visibleSimilar.has(n) ? 1 : 0.3
                      }}
                    ></span>
                    <span className={visibleSimilar.has(n) ? '' : 'line-through'}>
                      {n}
                    </span>
                    <button
                      className="ml-1"
                      onClick={() => toggleSimilarVisibility(n)}
                    >
                      {visibleSimilar.has(n) ? (
                        <Eye className="w-4 h-4 text-gray-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </li>
                ))
              ) : selectedSource === null &&
                sourceNumbers.length > 1 ? (
                sourceNumbers.map((n) => (
                  <li key={n} className="flex items-center space-x-2">
                    <span
                      className="w-6 h-6 rounded-full"
                      style={{
                        backgroundColor: colorMap.get(n),
                        opacity: visibleSources.has(n) ? 1 : 0.3
                      }}
                    ></span>
                    <span className={visibleSources.has(n) ? '' : 'line-through'}>
                      {n}
                    </span>
                    <button
                      className="ml-1"
                      onClick={() => toggleSourceVisibility(n)}
                    >
                      {visibleSources.has(n) ? (
                        <Eye className="w-4 h-4 text-gray-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </li>
                ))
              ) : (
                <>
                  <li className="flex items-center space-x-2">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#f97316' }}
                    >
                      <Clock className="w-4 h-4 text-white" />
                    </span>
                    <span>Localisations récentes</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#9333ea' }}
                    >
                      <Flame className="w-4 h-4 text-white" />
                    </span>
                    <span>Lieux les plus visités</span>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>


        {showMeetingPoints && meetingPoints.length > 0 && (
          <div className="absolute top-20 right-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-md p-4 text-sm z-[1000] max-h-72 overflow-y-auto">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-semibold">Points de rencontre</p>
              <button
                type="button"
                onClick={() => {
                  setActiveMeetingNumber(null);
                  onToggleMeetingPoints?.();
                }}
                className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Fermer tableau
              </button>
            </div>
            <table className="text-xs">
              <thead>
                <tr className="text-left">
                  <th className="pr-2">Point</th>
                  <th className="pr-2">Numéros</th>
                  <th className="pr-2">Événements</th>
                </tr>
              </thead>
              <tbody>
                {meetingPoints
                  .filter(
                    (m) => !activeMeetingNumber || m.numbers.includes(activeMeetingNumber)
                  )
                  .map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="pr-2">{m.nom || `${m.lat},${m.lng}`}</td>
                      <td className="pr-2">{m.numbers.map((num) => formatPhoneForDisplay(num)).join(', ')}</td>
                      <td className="pr-2">{m.events.length}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {(showZoneInfo || activeInfo) && (
          <div className="absolute top-20 right-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-md p-4 text-sm space-y-4 text-gray-800 dark:text-white z-[1000] max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold">
                  {showZoneInfo && !activeInfo
                    ? 'Résumé de la zone'
                    : activeInfo === 'contacts'
                      ? 'Personnes en contact'
                      : activeInfo === 'recent'
                        ? 'Localisations récentes'
                        : activeInfo === 'popular'
                          ? 'Lieux les plus visités'
                          : activeInfo === 'history'
                            ? 'Historique des déplacements'
                            : 'Informations'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">Total : {total}</p>
              </div>
              <button
                type="button"
                onClick={closeInfoPanels}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Fermer tableau
              </button>
            </div>
            {sourceNumbers.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedSource(null)}
                  className={`px-2 py-1 rounded ${
                    selectedSource === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  Tous
                </button>
                {sourceNumbers.map((n) => (
                  <button
                    key={n}
                    onClick={() => setSelectedSource(n)}
                    className={`px-2 py-1 rounded ${
                      selectedSource === n
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {(showZoneInfo || activeInfo === 'contacts') && topContacts.length > 0 && (
              <div>
                <p className="font-semibold mb-2">Personnes en contact</p>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="text-left">
                      <th className="pr-4">Numéro</th>
                      <th className="pr-4">Appels</th>
                      <th className="pr-4">Durée</th>
                      <th className="pr-4">SMS</th>
                      <th className="pr-4">Rencontres</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedContacts.map((c, i) => {
                      const idx = (contactPage - 1) * pageSize + i;
                      const meetingCount = meetingPoints.filter((m) => m.numbers.includes(c.number)).length;
                      return (
                        <tr
                          key={c.number}
                          className={`${idx === 0 ? 'font-bold text-blue-600' : ''} border-t`}
                        >
                          <td className="pr-4">{c.number}</td>
                          <td className="pr-4">{c.callCount}</td>
                          <td className="pr-4">{c.callDuration}</td>
                          <td className="pr-4">{c.smsCount}</td>
                          <td className="pr-4">
                            {meetingCount}
                            {meetingCount > 0 && (
                              <button
                                className="ml-1 text-blue-600"
                                onClick={() => handleToggleMeetingPoint(c.number)}
                              >
                                {showMeetingPoints && activeMeetingNumber === c.number ? (
                                  <EyeOff size={16} />
                                ) : (
                                  <Eye size={16} />
                                )}
                              </button>
                            )}
                          </td>
                          <td>{c.total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex justify-center items-center space-x-2 mt-2">
                  <button
                    className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                    onClick={() => setContactPage((p) => Math.max(1, p - 1))}
                    disabled={contactPage === 1}
                  >
                    Précédent
                  </button>
                  <span>
                    Page {contactPage} / {Math.max(1, Math.ceil(topContacts.length / pageSize))}
                  </span>
                  <button
                    className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                    onClick={() => setContactPage((p) => p + 1)}
                    disabled={contactPage >= Math.ceil(topContacts.length / pageSize)}
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
            {(showZoneInfo || activeInfo === 'recent') && recentLocations.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold">Localisations récentes</p>
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => toggleAllLocations(recentLocations)}
                  >
                    {recentLocations.every((l) =>
                      hiddenLocations.has(`${l.latitude},${l.longitude},${l.nom || ''}`)
                    )
                      ? 'Tout afficher'
                      : 'Tout cacher'}
                  </button>
                </div>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="text-left">
                      <th className="pr-4"></th>
                      <th className="pr-4">Lieu</th>
                      <th className="pr-4">Occurrences</th>
                      <th className="pr-4">Dernière visite</th>
                      <th>Heure dernière visite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLocations.map((l, i) => {
                      const key = `${l.latitude},${l.longitude},${l.nom || ''}`;
                      const hidden = hiddenLocations.has(key);
                      return (
                        <tr key={i} className="border-t">
                          <td className="pr-4">
                            <button onClick={() => toggleLocationVisibility(l)}>
                              {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="pr-4">{l.nom || `${l.latitude},${l.longitude}`}</td>
                          <td className="pr-4 text-gray-800 dark:text-white">{l.count}</td>
                          <td className="pr-4">{l.lastDate && formatDate(l.lastDate)}</td>
                          <td>{l.lastTime}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {(showZoneInfo || activeInfo === 'popular') && topLocations.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold">Lieux les plus visités</p>
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => toggleAllLocations(topLocations)}
                  >
                    {topLocations.every((l) =>
                      hiddenLocations.has(`${l.latitude},${l.longitude},${l.nom || ''}`)
                    )
                      ? 'Tout afficher'
                      : 'Tout cacher'}
                  </button>
                </div>
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="text-left">
                      <th className="pr-4"></th>
                      <th className="pr-4">Lieu</th>
                      <th>Occurrences</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLocations.map((l, i) => {
                      const key = `${l.latitude},${l.longitude},${l.nom || ''}`;
                      const hidden = hiddenLocations.has(key);
                      return (
                        <tr key={i} className="border-t">
                          <td className="pr-4">
                            <button onClick={() => toggleLocationVisibility(l)}>
                              {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="pr-4">{l.nom || `${l.latitude},${l.longitude}`}</td>
                          <td className="text-gray-800 dark:text-white">{l.count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {activeInfo === 'history' && historyEvents.length > 0 && (
              <div>
                <p className="font-semibold mb-2">Historique des déplacements</p>
                <div className="mb-2">
                  <label className="mr-2">Filtrer par date:</label>
                  <select
                    value={historyDateFilter}
                    onChange={(e) => {
                      setHistoryDateFilter(e.target.value);
                    }}
                    className="border rounded px-2 py-1"
                  >
                    <option value="">Toutes les dates</option>
                    {availableHistoryDates.map((d) => (
                      <option key={d} value={d}>
                        {formatDate(d)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="text-left">
                        <th className="pr-4">Lieu</th>
                        <th className="pr-4">Date</th>
                        <th>Heure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistoryEvents.map((h, i) => (
                        <tr key={i} className="border-t">
                          <td className="pr-4">{h.location}</td>
                          <td className="pr-4">{formatDate(h.date)}</td>
                          <td>{h.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>


    </>
  );
};

export default CdrMap;

