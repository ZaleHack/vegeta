import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  CircleMarker,
  Polyline,
  Popup
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import {
  Activity,
  ArrowRight,
  Asterisk,
  Clock,
  Crosshair,
  Eye,
  EyeOff,
  Filter,
  Flame,
  History,
  Layers,
  Car,
  MapPin,
  MessageSquare,
  Minus,
  PersonStanding,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  Users,
  X
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import MapLegend, { NumberLegendItem } from './MapLegend';
import {
  INCOMING_CALL_COLOR,
  OUTGOING_CALL_COLOR,
  LOCATION_COLOR,
  APPROX_LOCATION_COLOR,
  NUMBER_COLOR_PALETTE,
  MAP_POINT_COLOR
} from './mapColors';
import { normalizeImeiWithCheckDigit } from '../utils/imei';

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
  imsiCaller?: string;
  imeiCaller?: string;
  imeiCalled?: string;
  source?: string;
  tracked?: string;
  cgi?: string;
  azimut?: string;
  seqNumber?: string;
  callStatus?: string;
  releaseCause?: string;
  billing?: string;
  networkRoute?: string;
  deviceId?: string;
  sourceFile?: string;
  insertedAt?: string;
}

interface ContactCallDetail {
  id: string;
  timestamp?: number | null;
  date?: string;
  time?: string;
  duration?: string | null;
  direction?: string;
  type?: string;
  location?: string;
  source?: string;
  cell?: string;
}

interface Contact {
  id: string;
  tracked?: string;
  contact?: string;
  contactNormalized?: string;
  callCount: number;
  smsCount: number;
  ussdCount: number;
  callDuration: string;
  total: number;
  events: ContactCallDetail[];
}

interface ContactSummary {
  number: string;
  callCount: number;
  smsCount: number;
  total: number;
  callDurationSeconds?: number;
  callDuration?: string;
  events?: ContactCallDetail[];
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

type ParsedCgi = {
  mcc: string;
  mnc: string;
  lac: string;
  ci: string;
  normalized: string;
};

interface TriangulationCell {
  position: [number, number];
  cgi?: string;
  rawCgi?: string;
  parts?: ParsedCgi;
  name?: string;
}

const NO_SOURCE_KEY = '__no_source__';

type ContactAccumulator = {
  tracked?: string;
  contact?: string;
  contactNormalized?: string;
  callCount: number;
  smsCount: number;
  ussdCount: number;
  callDurationSeconds: number;
  events: ContactCallDetail[];
};

type LatestLocationHighlight = {
  key: string;
  label: string;
  value: string;
  sub?: string | null;
  icon: React.ComponentType<{ className?: string }>;
};

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

const distanceBetweenPoints = (a: L.LatLng, b: L.LatLng): number => {
  const R = 6371e3;
  const phi1 = (a.lat * Math.PI) / 180;
  const phi2 = (b.lat * Math.PI) / 180;
  const deltaPhi = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLambda = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDeltaPhi = Math.sin(deltaPhi / 2);
  const sinDeltaLambda = Math.sin(deltaLambda / 2);
  const aVal =
    sinDeltaPhi * sinDeltaPhi + Math.cos(phi1) * Math.cos(phi2) * (sinDeltaLambda * sinDeltaLambda);
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return R * c;
};

interface Props {
  points: Point[];
  contactSummaries?: ContactSummary[];
  showRoute?: boolean;
  showMeetingPoints?: boolean;
  onToggleMeetingPoints?: () => void;
}

const parseDurationToSeconds = (duration: string): number => {
  const normalized = duration.trim().toLowerCase();
  if (!normalized) return 0;

  // Handle textual formats such as "1h 20m 5s" or "2m30s".
  const unitPattern = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|heure|heures|m|min|mins|minute|minutes|s|sec|secs|seconde|secondes)/g;
  let total = 0;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = unitPattern.exec(normalized)) !== null) {
    matched = true;
    const value = parseFloat(match[1]);
    const unit = match[2];
    if (Number.isNaN(value)) continue;

    if (unit.startsWith('h')) {
      total += value * 3600;
    } else if (unit.startsWith('m')) {
      total += value * 60;
    } else {
      total += value;
    }
  }

  if (matched) {
    return Math.round(total);
  }

  const parts = normalized.split(':').map(Number);
  if (!parts.some(isNaN)) {
    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h * 3600 + m * 60 + s;
    }
  if (parts.length === 2) {
    const [first, second] = parts;
    // Support both HH:MM and MM:SS formats. Prefer interpreting the
    // two-part format as minutes:seconds (common for call durations), and
    // only fall back to hours:minutes when the values make it explicit.
    const asMinutesSeconds = first * 60 + second;
    const asHoursMinutes = first * 3600 + second * 60;

    // When the first part is clearly an hour count (e.g., 24 or more) or the
    // second part exceeds 59, treat the string as HH:MM. Otherwise, default to
    // MM:SS to avoid over-counting short calls.
    if (first >= 24 || second >= 60) {
      return asHoursMinutes;
    }

    return asMinutesSeconds;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  }
  const asNumber = Number(normalized);
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

const getPointTimestamp = (point: Point): number | null => {
  const fallbackFromInsertedAt = () => {
    if (!point.insertedAt) return null;
    const parsed = Date.parse(point.insertedAt);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const datePart = point.callDate || point.endDate || point.insertedAt?.split('T')[0];
  if (!datePart) {
    return fallbackFromInsertedAt();
  }

  const timePart =
    point.startTime || point.endTime || point.insertedAt?.split('T')[1]?.slice(0, 8) || '00:00:00';
  const parsed = Date.parse(`${datePart}T${timePart}`);
  if (Number.isNaN(parsed)) {
    return fallbackFromInsertedAt();
  }
  return parsed;
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

const isLocationEventType = (type?: string): boolean => {
  if (!type) return false;
  const normalized = type.trim().toLowerCase();
  return normalized === 'web' || normalized === 'position';
};

const isUssdEventType = (type?: string): boolean => {
  if (!type) return false;
  return type.trim().toLowerCase() === 'ussd';
};

const getPointColor = (_type: string, _direction?: string) => {
  return MAP_POINT_COLOR;
};

const getIcon = (
  type: string,
  direction: string | undefined,
  colorOverride?: string
) => {
  const size = 32;
  let inner: React.ReactElement;

  const normalizedType = type.trim().toLowerCase();

  if (isLocationEventType(type)) {
    inner = <MapPin size={16} className="text-white" />;
  } else if (normalizedType === 'sms') {
    inner = <MessageSquare size={16} className="text-white" />;
  } else if (isUssdEventType(type)) {
    inner = <Asterisk size={16} className="text-white" />;
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
        backgroundColor: colorOverride ?? getPointColor(type, direction),
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
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.replace(/^00+/, '');
  }
  if (digits.startsWith('221')) {
    digits = digits.slice(3);
  }
  return digits;
};

const getPointTrackedValue = (point: Point): string | undefined => {
  const tracked = point.tracked?.trim();
  if (tracked) return tracked;

  const direction = (point.direction || '').toString().toLowerCase();
  const candidate =
    direction === 'incoming'
      ? point.callee || point.caller
      : point.caller || point.callee;

  const fallback = candidate || point.source;
  const trimmed = fallback?.toString().trim();
  return trimmed || undefined;
};

const getPointSourceValue = (point: Point): string | undefined => {
  const tracked = getPointTrackedValue(point);
  if (tracked) return tracked;

  const raw = point.source;
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
};

const normalizeSourceKey = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = normalizePhoneDigits(trimmed);
  return normalized || trimmed;
};

const formatPhoneForDisplay = (value?: string): string => {
  const normalized = normalizePhoneDigits(value);
  if (normalized) return normalized;
  return value?.trim() || 'N/A';
};

const getArrowIcon = (angle: number) => {
  const size = 22;
  const icon = (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        transform: `rotate(${angle}deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '999px',
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          boxShadow: '0 6px 14px rgba(79,70,229,0.35)',
          border: '1px solid rgba(255,255,255,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <ArrowRight size={12} color="#ffffff" strokeWidth={2.5} />
      </div>
    </div>
  );
  return L.divIcon({
    html: renderToStaticMarkup(icon),
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const getSegmentDistanceKm = (start: [number, number], end: [number, number]) => {
  const [lat1, lng1] = start;
  const [lat2, lng2] = end;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
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
  const color = colorOverride ?? getPointColor(type, direction);
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

const numberColors = NUMBER_COLOR_PALETTE;

const EARTH_RADIUS = 6_378_137;

const toRadians = (value: number) => (value * Math.PI) / 180;
const toDegrees = (value: number) => (value * 180) / Math.PI;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const TRIANGULATION_ARC_ANGLE_DEGREES = 120;
const TRIANGULATION_HALF_ARC_DEGREES = TRIANGULATION_ARC_ANGLE_DEGREES / 2;
const TRIANGULATION_BEARING_TOLERANCE = 1; // degrees

const normalizeBearing = (angle: number) => ((angle % 360) + 360) % 360;

const bearingDifference = (a: number, b: number) => {
  const diff = normalizeBearing(b) - normalizeBearing(a);
  return ((diff + 540) % 360) - 180;
};

const bearingBetweenPoints = (
  from: [number, number],
  to: [number, number]
) => {
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lng2 - lng1);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return normalizeBearing(toDegrees(theta));
};

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

const formatRelativeDuration = (timestamp: number | null) => {
  if (!timestamp) return 'Temps inconnu';
  const now = Date.now();
  const diff = Math.max(now - timestamp, 0);

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
  if (hours > 0) return `il y a ${hours}h`;
  if (minutes > 0) return `il y a ${minutes} min`;
  return 'À l’instant';
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
  const d = radius / EARTH_RADIUS; // Earth radius
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

const createSector = (
  center: [number, number],
  radius: number,
  startBearing: number,
  endBearing: number,
  steps = 16
): [number, number][] => {
  const [lat, lng] = center;
  const radLat = (lat * Math.PI) / 180;
  const radLng = (lng * Math.PI) / 180;
  const d = radius / EARTH_RADIUS;
  const coords: [number, number][] = [[lat, lng]];

  const start = normalizeBearing(startBearing);
  const end = normalizeBearing(endBearing);
  const sweep = ((end - start + 360) % 360) || 360;

  const segments = Math.max(1, steps);
  for (let i = 0; i <= segments; i++) {
    const bearing = normalizeBearing(start + (sweep * i) / segments);
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

const haversineDistance = (a: [number, number], b: [number, number]) => {
  const lat1 = toRadians(a[0]);
  const lon1 = toRadians(a[1]);
  const lat2 = toRadians(b[0]);
  const lon2 = toRadians(b[1]);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS * c;
};

const computeZoneRadius = (
  polygon: [number, number][],
  center: [number, number]
): number => {
  if (!polygon || polygon.length === 0) {
    return 0;
  }

  return polygon.reduce((max, vertex) => {
    const distance = haversineDistance(vertex, center);
    return Math.max(max, distance);
  }, 0);
};

const formatDistanceMeters = (meters?: number | null) => {
  if (!meters || !Number.isFinite(meters) || meters <= 0) {
    return null;
  }

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }

  if (meters >= 100) {
    return `${Math.round(meters)} m`;
  }

  return `${meters.toFixed(0)} m`;
};

const normalizeAzimut = (value?: string): number | null => {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9+\-.]/g, '').replace(',', '.');
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  const normalized = ((parsed % 360) + 360) % 360;
  return normalized;
};

const parseTimestamp = (date: string, time: string) => {
  if (!date) return NaN;
  const normalizedTime = time && time.trim() ? time.trim() : '00:00:00';
  const isoTime = normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime;
  const timestamp = new Date(`${date}T${isoTime}`).getTime();
  return Number.isFinite(timestamp) ? timestamp : NaN;
};

const parseCgi = (value?: string): ParsedCgi | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numericParts = trimmed.split(/[^0-9]+/).filter(Boolean);
  if (numericParts.length < 4) {
    return null;
  }

  const [rawMcc, rawMnc, rawLac, rawCi] = numericParts.slice(0, 4);
  if (!rawMcc) {
    return null;
  }

  const mcc = rawMcc.slice(-3).padStart(3, '0');

  const mncNumber = Number.parseInt(rawMnc, 10);
  if (Number.isNaN(mncNumber)) {
    return null;
  }
  const mnc = String(mncNumber).padStart(Math.max(2, Math.min(rawMnc.length, 3)), '0');

  const lacNumber = Number.parseInt(rawLac, 10);
  const ciNumber = Number.parseInt(rawCi, 10);
  if (Number.isNaN(lacNumber) || Number.isNaN(ciNumber)) {
    return null;
  }

  const lac = String(lacNumber);
  const ci = String(ciNumber);
  const normalized = `${mcc}-${mnc}-${lac}-${ci}`;

  return { mcc, mnc, lac, ci, normalized };
};

const formatCgiDetails = (parts: ParsedCgi) =>
  `MCC ${parts.mcc} • MNC ${parts.mnc} • LAC ${parts.lac} • CI ${parts.ci}`;

interface TriangulationZone {
  barycenter: [number, number]; // [lat, lng]
  polygon: [number, number][]; // [lat, lng]
  cells: TriangulationCell[];
  timestamp: number;
  source: string;
  diameterMeters?: number;
}

const computeTriangulation = (pts: Point[]): TriangulationZone[] => {
  type TriangulationEvent = {
    lat: number;
    lng: number;
    azimut: number;
    hasAzimut: boolean;
    timestamp: number;
    cellKey: string;
    cgi?: string | null;
    rawCgi?: string | null;
    cgiParts?: ParsedCgi;
    name?: string;
  };

  const eventsBySource = new Map<string, TriangulationEvent[]>();
  const coordinatesByCgi = new Map<string, { lat: number; lng: number }>();

  pts.forEach((point) => {
    const parsedCgi = parseCgi(point.cgi);
    if (!parsedCgi) return;

    const lat = Number.parseFloat(point.latitude);
    const lng = Number.parseFloat(point.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (!coordinatesByCgi.has(parsedCgi.normalized)) {
      coordinatesByCgi.set(parsedCgi.normalized, { lat, lng });
    }
  });

  pts.forEach((point) => {
    const parsedCgi = parseCgi(point.cgi);
    const azimutValue = normalizeAzimut(point.azimut);
    const hasAzimut = azimutValue !== null;
    const timestamp = parseTimestamp(point.callDate, point.startTime);

    if (Number.isNaN(timestamp)) return;

    let lat = Number.parseFloat(point.latitude);
    let lng = Number.parseFloat(point.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (parsedCgi) {
        const cached = coordinatesByCgi.get(parsedCgi.normalized);
        if (cached) {
          lat = cached.lat;
          lng = cached.lng;
        }
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const cellKey = parsedCgi?.normalized ?? `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (!cellKey) return;

    const groupingKey = getPointSourceValue(point);
    if (!groupingKey) return;

    const event: TriangulationEvent = {
      lat,
      lng,
      azimut: hasAzimut ? azimutValue : 0,
      hasAzimut,
      timestamp,
      cellKey,
      cgi: parsedCgi?.normalized ?? null,
      rawCgi: point.cgi ? point.cgi.trim() : null,
      cgiParts: parsedCgi ?? undefined,
      name: point.nom?.trim() || undefined
    };

    const list = eventsBySource.get(groupingKey) || [];
    list.push(event);
    eventsBySource.set(groupingKey, list);
  });

  const bucketWindowMs = 3 * 60 * 1000; // 3 minutes
  const zones: TriangulationZone[] = [];

  const computeIntersections = (events: TriangulationEvent[]) => {
    if (events.length < 2) {
      return null;
    }

    const reference = events[0];
    const baseLatRad = toRadians(reference.lat);
    const baseLngRad = toRadians(reference.lng);

    const project = (lat: number, lng: number) => {
      const latRad = toRadians(lat);
      const lngRad = toRadians(lng);
      const x = EARTH_RADIUS * (lngRad - baseLngRad) * Math.cos(baseLatRad);
      const y = EARTH_RADIUS * (latRad - baseLatRad);
      return { x, y };
    };

    const unproject = (x: number, y: number) => {
      const latRad = y / EARTH_RADIUS + baseLatRad;
      const lngRad = x / (EARTH_RADIUS * Math.cos(baseLatRad)) + baseLngRad;
      return { lat: toDegrees(latRad), lng: toDegrees(lngRad) };
    };

    const intersections: { lat: number; lng: number }[] = [];
    const directionAngles = events.map((event) => [
      normalizeBearing(event.azimut),
      normalizeBearing(event.azimut - TRIANGULATION_HALF_ARC_DEGREES),
      normalizeBearing(event.azimut + TRIANGULATION_HALF_ARC_DEGREES)
    ]);

    const isCandidateValid = (candidate: { lat: number; lng: number }) =>
      events.every((event) => {
        const bearing = bearingBetweenPoints(
          [event.lat, event.lng],
          [candidate.lat, candidate.lng]
        );
        const diff = Math.abs(bearingDifference(event.azimut, bearing));
        return diff <= TRIANGULATION_HALF_ARC_DEGREES + TRIANGULATION_BEARING_TOLERANCE;
      });

    const addIntersection = (candidate: { lat: number; lng: number }) => {
      if (!isCandidateValid(candidate)) {
        return;
      }

      const isDuplicate = intersections.some((existing) => {
        const distance = haversineDistance(
          [existing.lat, existing.lng],
          [candidate.lat, candidate.lng]
        );
        return distance < 10;
      });

      if (!isDuplicate) {
        intersections.push(candidate);
      }
    };

    for (let i = 0; i < events.length; i++) {
      const a = events[i];
      const projA = project(a.lat, a.lng);
      const directionsA = directionAngles[i];

      for (let j = i + 1; j < events.length; j++) {
        const b = events[j];
        const projB = project(b.lat, b.lng);
        const directionsB = directionAngles[j];

        directionsA.forEach((angleA) => {
          const thetaA = toRadians(angleA);
          const dirA = { x: Math.sin(thetaA), y: Math.cos(thetaA) };

          directionsB.forEach((angleB) => {
            const thetaB = toRadians(angleB);
            const dirB = { x: Math.sin(thetaB), y: Math.cos(thetaB) };

            const denom = dirA.x * dirB.y - dirA.y * dirB.x;
            if (Math.abs(denom) < 1e-6) {
              return;
            }

            const dx = projB.x - projA.x;
            const dy = projB.y - projA.y;
            const tA = (dx * dirB.y - dy * dirB.x) / denom;
            const tB = (dx * dirA.y - dy * dirA.x) / denom;

            if (tA < 0 || tB < 0) {
              return;
            }

            const ix = projA.x + tA * dirA.x;
            const iy = projA.y + tA * dirA.y;
            addIntersection(unproject(ix, iy));
          });
        });
      }
    }

    if (intersections.length === 0) {
      return null;
    }

    const baryLat = intersections.reduce((acc, cur) => acc + cur.lat, 0) / intersections.length;
    const baryLng = intersections.reduce((acc, cur) => acc + cur.lng, 0) / intersections.length;

    const coords: Coord[] = intersections.map((pt) => [pt.lng, pt.lat]);

    let polygon: [number, number][];
    if (coords.length >= 3) {
      const hull = convexHull(coords);
      const averageDistance =
        events.reduce((acc, event) => acc + haversineDistance([baryLat, baryLng], [event.lat, event.lng]), 0) /
        Math.max(events.length, 1);
      const bufferDistance = Math.max(150, Math.min(averageDistance / 2, 1500));
      const buffered = bufferPolygon(hull, [baryLng, baryLat], bufferDistance);
      polygon = buffered.map(([lng, lat]) => [lat, lng]);
    } else {
      polygon = createCircle([baryLat, baryLng], 250);
    }

    return {
      barycenter: [baryLat, baryLng] as [number, number],
      polygon
    };
  };

  const buildFallbackZone = (events: TriangulationEvent[]) => {
    if (events.length === 0) {
      return null;
    }

    const validEvents = events.filter(
      (event) => Number.isFinite(event.lat) && Number.isFinite(event.lng)
    );
    if (validEvents.length === 0) {
      return null;
    }

    const eventsWithAzimut = validEvents.filter((event) => event.hasAzimut);

    const baryLat =
      validEvents.reduce((acc, cur) => acc + cur.lat, 0) / validEvents.length;
    const baryLng =
      validEvents.reduce((acc, cur) => acc + cur.lng, 0) / validEvents.length;

    const coords: Coord[] = validEvents.map((event) => [event.lng, event.lat]);

    if (coords.length >= 3) {
      const hull = convexHull(coords);
      const averageDistance =
        validEvents.reduce(
          (acc, event) => acc + haversineDistance([baryLat, baryLng], [event.lat, event.lng]),
          0
        ) / Math.max(validEvents.length, 1);
      const bufferDistance = Math.max(150, Math.min(averageDistance / 2, 1500));
      const buffered = bufferPolygon(hull, [baryLng, baryLat], bufferDistance);
      return {
        barycenter: [baryLat, baryLng] as [number, number],
        polygon: buffered.map(([lng, lat]) => [lat, lng] as [number, number])
      };
    }

    if (eventsWithAzimut.length === 1) {
      const event = eventsWithAzimut[0];
      const distances = validEvents
        .filter((candidate) => candidate !== event)
        .map((candidate) =>
          haversineDistance([event.lat, event.lng], [candidate.lat, candidate.lng])
        );
      const averageDistance =
        distances.length > 0
          ? distances.reduce((acc, cur) => acc + cur, 0) / distances.length
          : 0;
      const radius = clamp(averageDistance + 300, 300, 2000);

      return {
        barycenter: [event.lat, event.lng] as [number, number],
        polygon: createSector(
          [event.lat, event.lng],
          radius,
          event.azimut - TRIANGULATION_HALF_ARC_DEGREES,
          event.azimut + TRIANGULATION_HALF_ARC_DEGREES
        )
      };
    }

    if (coords.length === 2) {
      const distance = haversineDistance(
        [validEvents[0].lat, validEvents[0].lng],
        [validEvents[1].lat, validEvents[1].lng]
      );
      const radius = Math.max(150, Math.min(distance / 2 + 100, 1500));
      return {
        barycenter: [baryLat, baryLng] as [number, number],
        polygon: createCircle([baryLat, baryLng], radius)
      };
    }

    return {
      barycenter: [baryLat, baryLng] as [number, number],
      polygon: createCircle([baryLat, baryLng], 250)
    };
  };

  eventsBySource.forEach((events, source) => {
    if (events.length < 2) {
      return;
    }

    events.sort((a, b) => a.timestamp - b.timestamp);

    const buckets = new Map<number, TriangulationEvent[]>();

    events.forEach((event) => {
      const bucketKey = Math.floor(event.timestamp / bucketWindowMs);
      const bucket = buckets.get(bucketKey) || [];
      bucket.push(event);
      buckets.set(bucketKey, bucket);
    });

    buckets.forEach((bucketEvents) => {
      const byCgi = new Map<string, TriangulationEvent>();
      bucketEvents.forEach((event) => {
        const existing = byCgi.get(event.cellKey);
        if (!existing || event.timestamp < existing.timestamp) {
          byCgi.set(event.cellKey, event);
        }
      });

      const uniqueEvents = Array.from(byCgi.values());
      if (uniqueEvents.length === 0) {
        return;
      }

      const eventsWithAzimut = uniqueEvents.filter((event) => event.hasAzimut);
      const cells = uniqueEvents.map((event) => ({
        position: [event.lat, event.lng] as [number, number],
        cgi: event.cgi ?? undefined,
        rawCgi: event.rawCgi ?? undefined,
        parts: event.cgiParts,
        name: event.name
      }));
      const timestamp = uniqueEvents.reduce((acc, cur) => Math.max(acc, cur.timestamp), 0);

      const result =
        eventsWithAzimut.length >= 2 ? computeIntersections(eventsWithAzimut) : null;
      const fallback = result ?? buildFallbackZone(uniqueEvents);

      if (fallback) {
        const radius = computeZoneRadius(fallback.polygon, fallback.barycenter);
        zones.push({
          barycenter: fallback.barycenter,
          polygon: fallback.polygon,
          cells,
          timestamp,
          source,
          diameterMeters: radius > 0 ? radius * 2 : undefined
        });
      }
    });
  });

  return zones.sort((a, b) => b.timestamp - a.timestamp);
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

interface MapControlButtonProps {
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  isToggle?: boolean;
}

const MapControlButton: React.FC<MapControlButtonProps> = ({
  title,
  icon,
  onClick,
  active = false,
  disabled = false,
  isToggle = false
}) => {
  const baseClasses =
    'flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition-all duration-200 backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

  const stateClasses = disabled
    ? 'border border-gray-200 bg-white/70 text-gray-400 opacity-50 cursor-not-allowed'
    : active
      ? 'border border-blue-500 bg-blue-600 text-white shadow-md hover:bg-blue-600/90'
      : 'border border-gray-200 bg-white/80 text-gray-700 hover:bg-gray-100';

  const toggleProps = isToggle ? { 'aria-pressed': active } : {};

  return (
    <div className="pointer-events-auto group relative">
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className={`${baseClasses} ${stateClasses}`}
        {...toggleProps}
      >
        {icon}
      </button>
      <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-1 group-hover:opacity-100 group-focus-within:translate-x-1 group-focus-within:opacity-100">
        {title}
      </span>
    </div>
  );
};

const CdrMap: React.FC<Props> = ({
  points: rawPoints,
  contactSummaries = [],
  showRoute,
  showMeetingPoints,
  onToggleMeetingPoints
}) => {
  const points = useMemo<Point[]>(() => {
    if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
      console.warn('[CdrMap] Aucun point fourni pour l\'affichage de la carte.');
      return [];
    }

    const valid: Point[] = [];
    const foundDetails: {
      index: number;
      latitude: number;
      longitude: number;
      nom?: string;
      source?: string;
    }[] = [];
    const invalidDetails: {
      index: number;
      latitude: string;
      longitude: string;
      nom?: string;
      source?: string;
    }[] = [];

    rawPoints.forEach((point, index) => {
      const lat = Number.parseFloat(point.latitude);
      const lng = Number.parseFloat(point.longitude);
      const isLatValid = Number.isFinite(lat);
      const isLngValid = Number.isFinite(lng);

      if (isLatValid && isLngValid) {
        valid.push(point);
        foundDetails.push({
          index,
          latitude: lat,
          longitude: lng,
          nom: point.nom || undefined,
          source: getPointSourceValue(point)
        });
      } else {
        invalidDetails.push({
          index,
          latitude: point.latitude,
          longitude: point.longitude,
          nom: point.nom || undefined,
          source: getPointSourceValue(point)
        });
      }
    });

    const previewLimit = 10;

    if (foundDetails.length > 0) {
      console.info('[CdrMap] Localisations exploitables détectées', {
        total: foundDetails.length,
        apercu: foundDetails.slice(0, previewLimit),
        tronque: foundDetails.length > previewLimit
      });
    }

    if (invalidDetails.length > 0) {
      console.warn('[CdrMap] Points ignorés faute de coordonnées valides', {
        total: invalidDetails.length,
        apercu: invalidDetails.slice(0, previewLimit),
        tronque: invalidDetails.length > previewLimit
      });
    }

    if (foundDetails.length === 0) {
      console.error("[CdrMap] Impossible d'afficher la carte: aucune coordonnée valide", {
        totalPoints: rawPoints.length
      });
    }

    return valid;
  }, [rawPoints]);

  if (points.length === 0) return null;

  const callerPoints = useMemo(
    () =>
      points.filter((p) => {
        if (isLocationEventType(p.type)) {
          return true;
        }

        const direction = (p.direction || '').toString().toLowerCase();
        return direction === 'outgoing';
      }),
    [points]
  );

  const referencePoints = useMemo(
    () => (callerPoints.length > 0 ? callerPoints : points),
    [callerPoints, points]
  );

  const first = referencePoints[0];
  const center: [number, number] = [parseFloat(first.latitude), parseFloat(first.longitude)];
  const mapRef = useRef<L.Map | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

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
  const [showOnlyLatestLocation, setShowOnlyLatestLocation] = useState(false);
  const pageSize = 20;
  const [contactPage, setContactPage] = useState(1);
  const [hiddenLocations, setHiddenLocations] = useState<Set<string>>(new Set());
  const [showSimilar, setShowSimilar] = useState(false);
  const [triangulationZones, setTriangulationZones] = useState<TriangulationZone[]>([]);
  const [activeMeetingNumber, setActiveMeetingNumber] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [showLatestLocationDetailsPanel, setShowLatestLocationDetailsPanel] = useState(false);
  const [activeContactDetailsId, setActiveContactDetailsId] = useState<string | null>(null);
  const renderEventPopupContent = useCallback(
    (point: Point, options: { compact?: boolean; showLocation?: boolean } = {}) => {
      const { compact = false } = options;
      const callerNumber = point.caller || point.number;
      const calleeNumber = point.callee;

      const startParts: string[] = [];
      if (point.callDate) startParts.push(formatDate(point.callDate));
      if (point.startTime) startParts.push(point.startTime);
      const startLabel = startParts.join(' ');

      const endParts: string[] = [];
      if (point.endDate) {
        endParts.push(formatDate(point.endDate));
      } else if (point.callDate) {
        endParts.push(formatDate(point.callDate));
      }
      if (point.endTime) endParts.push(point.endTime);
      const endLabel = endParts.join(' ');

      const durationValue = formatPointDuration(point) ?? 'N/A';
      const imsiValue = point.imsiCaller?.trim() || 'N/A';
      const imeiRawValue = point.imeiCaller?.trim();
      const imeiValue = imeiRawValue ? normalizeImeiWithCheckDigit(imeiRawValue) : 'N/A';
      const coordsValue =
        point.latitude && point.longitude ? `${point.latitude}, ${point.longitude}` : 'N/A';

      const cellParts: string[] = [];
      if (point.cgi) cellParts.push(point.cgi);
      if (point.nom) cellParts.push(point.nom);
      const cellValue = cellParts.length > 0 ? cellParts.join(' • ') : 'N/A';

      const normalizedType = (point.type || '').toLowerCase();
      const isLocationEvent = isLocationEventType(point.type);
      const isUssdEvent = isUssdEventType(point.type);
      const eventTypeBase = isLocationEvent
        ? 'Position'
        : normalizedType === 'sms'
            ? 'SMS'
            : isUssdEvent
              ? 'USSD'
              : 'Appel';
      const directionLabel =
        point.direction && !isLocationEvent && !isUssdEvent
          ? point.direction === 'outgoing'
            ? 'Sortant'
            : 'Entrant'
          : '';
      const eventTypeValue = directionLabel
        ? `${eventTypeBase} (${directionLabel})`
        : eventTypeBase;

      const statusLabel = point.callStatus?.trim() || 'N/A';
      const networkRouteLabel = point.networkRoute?.trim() || 'N/A';
      const deviceLabel = point.deviceId?.trim() || 'N/A';

      const infoItems = [
        { label: "Type d'événement", value: eventTypeValue },
        { label: 'Début', value: startLabel || 'N/A' },
        { label: 'Fin', value: endLabel || 'N/A' },
        { label: 'Durée', value: durationValue },
        { label: 'Identifiant de la cellule', value: cellValue },
        { label: 'Coordonnées GPS', value: coordsValue },
        { label: 'Identifiant abonné (IMSI)', value: imsiValue },
        { label: "Identifiant d'équipement (IMEI)", value: imeiValue }
      ];

      const optionalDetails = [
        { label: "Statut d'appel", value: statusLabel },
        { label: 'Route réseau', value: networkRouteLabel },
        { label: "Identifiant appareil", value: deviceLabel }
      ].filter((item) => item.value && item.value !== 'N/A');

      const detailItems = [
        ...(calleeNumber
          ? [{ label: 'Numéro contacté', value: formatPhoneForDisplay(calleeNumber) }]
          : []),
        ...infoItems,
        ...optionalDetails
      ].filter((item) =>
        !isLocationEvent ||
        (item.label !== 'Numéro contacté' &&
          item.label !== 'Durée' &&
          item.label !== "Statut d'appel")
      );

      return (
        <div
          className={`cdr-popup-card ${compact ? 'cdr-popup-card--compact' : ''}`.trim()}
        >
          <div className="cdr-popup-card__header">
            <span className="cdr-popup-card__main-number-value">
              {formatPhoneForDisplay(callerNumber)}
            </span>
          </div>
          <div className="cdr-popup-card__details">
            {detailItems.map((item) => (
              <div key={item.label} className="cdr-popup-card__detail-item">
                <span className="cdr-popup-card__detail-label">{item.label}</span>
                <span className="cdr-popup-card__detail-value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    },
    []
  );

  const closeInfoPanels = useCallback(() => {
    setActiveInfo(null);
    setActiveContactDetailsId(null);
  }, []);

  const sourceNumbers = useMemo(() => {
    const numbers = new Set<string>();
    const provider = callerPoints.length > 0 ? callerPoints : points;
    provider.forEach((point) => {
      const value = getPointSourceValue(point);
      if (value) {
        numbers.add(value);
      }
    });
    return Array.from(numbers);
  }, [callerPoints, points]);
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    sourceNumbers.forEach((n, i) => map.set(n, numberColors[i % numberColors.length]));
    return map;
  }, [sourceNumbers]);
  const normalizedSourceSet = useMemo(() => {
    const set = new Set<string>();
    sourceNumbers.forEach((src) => {
      const normalized = normalizePhoneDigits(src);
      if (normalized) {
        set.add(normalized);
      }
    });
    return set;
  }, [sourceNumbers]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [visibleSources, setVisibleSources] = useState<Set<string>>(new Set());
  const normalizedVisibleSources = useMemo(() => {
    const normalized = new Set<string>();
    visibleSources.forEach((value) => {
      const normalizedValue = normalizePhoneDigits(value);
      if (normalizedValue) {
        normalized.add(normalizedValue);
      }
    });
    return normalized;
  }, [visibleSources]);

  useEffect(() => {
    setVisibleSources(new Set(sourceNumbers));
  }, [sourceNumbers]);

  useEffect(() => {
    if (sourceNumbers.length < 1) setShowSimilar(false);
  }, [sourceNumbers]);

  useEffect(() => {
    if (activeInfo !== 'contacts' && activeContactDetailsId) {
      setActiveContactDetailsId(null);
    }
  }, [activeInfo, activeContactDetailsId]);

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

  const toggleInfo = (key: 'contacts' | 'recent' | 'popular' | 'history') => {
    if (showMeetingPoints) onToggleMeetingPoints?.();
    setActiveInfo((prev) => {
      const next = prev === key ? null : key;
      if (key === 'contacts' && next === 'contacts') {
        setContactPage(1);
      }
      if (next !== 'contacts') {
        setActiveContactDetailsId(null);
      }
      return next;
    });
    if (key !== 'recent' && key !== 'popular') setShowOthers(true);
  };

  const handleContactDetailsToggle = (contactId: string) => {
    setActiveContactDetailsId((prev) => (prev === contactId ? null : contactId));
  };

  const handleMeetingPointsClick = () => {
    setActiveInfo(null);
    onToggleMeetingPoints?.();
  };

  useEffect(() => {
    setContactPage(1);
  }, [selectedSource]);



  const displayedPoints = useMemo(() => {
    let filtered = callerPoints;
    if (selectedSource) {
      const selectedKey = normalizeSourceKey(selectedSource);
      filtered = filtered.filter((p) => {
        const value = getPointSourceValue(p);
        if (!value) return false;
        if (value === selectedSource) return true;
        const pointKey = normalizeSourceKey(value);
        if (selectedKey && pointKey) {
          return pointKey === selectedKey;
        }
        return pointKey ? pointKey === selectedSource : false;
      });
    } else if (visibleSources.size > 0) {
      filtered = filtered.filter((p) => {
        const value = getPointSourceValue(p);
        if (!value) return false;
        if (visibleSources.has(value)) {
          return true;
        }
        const key = normalizeSourceKey(value);
        if (!key) {
          return false;
        }
        return visibleSources.has(key) || normalizedVisibleSources.has(key);
      });
    }
    return filtered;
  }, [callerPoints, selectedSource, visibleSources, normalizedVisibleSources]);

  const latestLocationPoint = useMemo(() => {
    const trackedDigits = normalizePhoneDigits(points[0]?.tracked);

    const candidatePoints = trackedDigits
      ? points.filter((point) => normalizePhoneDigits(point.caller) === trackedDigits)
      : points;

    let latest: { point: Point; timestamp: number } | null = null;
    let lastWithCoords: Point | null = null;

    candidatePoints.forEach((point) => {
      const lat = parseFloat(point.latitude);
      const lng = parseFloat(point.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      lastWithCoords = point;

      const ts = getPointTimestamp(point);
      if (ts === null) return;
      if (!latest || ts > latest.timestamp) {
        latest = { point, timestamp: ts };
      }
    });

    return latest?.point ?? lastWithCoords;
  }, [points]);

  const latestLocationDetails = useMemo(() => {
    if (!latestLocationPoint) return null;
    const parts: string[] = [];
    if (latestLocationPoint.callDate) {
      parts.push(formatDate(latestLocationPoint.callDate));
    }
    if (latestLocationPoint.startTime) {
      parts.push(latestLocationPoint.startTime);
    }
    return parts.length > 0 ? parts.join(' • ') : null;
  }, [latestLocationPoint]);

  const latestLocationHighlights = useMemo<LatestLocationHighlight[]>(() => {
    if (!latestLocationPoint) return [];
    const dateLabel = latestLocationPoint.callDate ? formatDate(latestLocationPoint.callDate) : null;
    const timeLabel = latestLocationPoint.startTime || latestLocationPoint.endTime || null;
    const lat = Number.parseFloat(latestLocationPoint.latitude);
    const lng = Number.parseFloat(latestLocationPoint.longitude);
    const coordsLabel =
      Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null;

    return [
      {
        key: 'time',
        label: 'Observé le',
        value: dateLabel || 'Date inconnue',
        sub: timeLabel ? `à ${timeLabel}` : null,
        icon: Clock
      },
      {
        key: 'coords',
        label: 'Coordonnées',
        value: coordsLabel || 'Indisponibles',
        sub: latestLocationPoint.cgi ? `Cellule ${latestLocationPoint.cgi}` : null,
        icon: Crosshair
      }
    ];
  }, [latestLocationPoint]);

  const latestLocationContactBadges = useMemo(() => {
    if (!latestLocationPoint) return [] as { label: string; value: string }[];
    const badges: { label: string; value: string }[] = [];
    if (latestLocationPoint.tracked) {
      badges.push({ label: 'Numéro suivi', value: formatPhoneForDisplay(latestLocationPoint.tracked) });
    }
    const source = getPointSourceValue(latestLocationPoint);
    if (source && source !== latestLocationPoint.tracked) {
      badges.push({ label: 'Source', value: formatPhoneForDisplay(source) });
    }
    return badges;
  }, [latestLocationPoint]);

  const latestLocationPosition = useMemo<[number, number] | null>(() => {
    if (!latestLocationPoint) return null;
    const lat = parseFloat(latestLocationPoint.latitude);
    const lng = parseFloat(latestLocationPoint.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return [lat, lng];
  }, [latestLocationPoint]);

  const latestLocationPopupDate = useMemo(() => {
    if (!latestLocationPoint?.callDate) return null;
    const dateLabel = formatDate(latestLocationPoint.callDate);
    const timeLabel = latestLocationPoint.startTime || latestLocationPoint.endTime;
    return timeLabel ? `${dateLabel} à ${timeLabel}` : dateLabel;
  }, [latestLocationPoint]);

  const latestLocationPopupCoords = useMemo(() => {
    if (!latestLocationPosition) return null;
    const [lat, lng] = latestLocationPosition;
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }, [latestLocationPosition]);

  const latestLocationTrackedNumber = useMemo(
    () => (latestLocationPoint?.tracked ? formatPhoneForDisplay(latestLocationPoint.tracked) : null),
    [latestLocationPoint]
  );

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    const paneId = 'latest-location-pane';
    const map = mapRef.current;
    let pane = map.getPane(paneId);
    if (!pane) {
      pane = map.createPane(paneId);
    }
    if (pane) {
      pane.style.zIndex = '1200';
      pane.style.pointerEvents = 'auto';
    }
  }, [isMapReady]);

  const latestLocationMarkerRef = useRef<L.Marker | null>(null);

  const latestLocationIcon = useMemo(
    () =>
      L.divIcon({
        className: 'latest-location-pulse-icon leaflet-div-icon',
        html: `
          <div class="latest-location-pulse">
            <span class="latest-location-pulse__ring"></span>
            <span class="latest-location-pulse__ring latest-location-pulse__ring--delayed"></span>
            <span class="latest-location-pulse__glow"></span>
            <span class="latest-location-pulse__dot"></span>
          </div>
        `.trim(),
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      }),
    []
  );

  const handleLatestLocationRingClick = useCallback(() => {
    if (!latestLocationPoint || !latestLocationPosition) {
      return;
    }
    setActiveInfo(null);
    setShowLatestLocationDetailsPanel(true);
    latestLocationMarkerRef.current?.openPopup();
  }, [latestLocationPoint, latestLocationPosition, setActiveInfo]);

  useEffect(() => {
    if (!isMapReady || !latestLocationPosition) return;
    latestLocationMarkerRef.current?.bringToFront();
    latestLocationMarkerRef.current?.setOpacity(1);
  }, [isMapReady, latestLocationPosition, showOnlyLatestLocation]);

  const handleToggleLatestLocationView = useCallback(() => {
    if (!latestLocationPoint || !latestLocationPosition) return;

    setShowOnlyLatestLocation((current) => {
      const next = !current;
      if (next) {
        const nextZoom = Math.max(mapRef.current?.getZoom() ?? 13, 16);
        mapRef.current?.flyTo(latestLocationPosition, nextZoom, {
          animate: true,
          duration: 1.5
        });
        setActiveInfo(null);
        setShowLatestLocationDetailsPanel(true);
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            latestLocationMarkerRef.current?.openPopup();
          }, 250);
        } else {
          latestLocationMarkerRef.current?.openPopup();
        }
      }
      return next;
    });
  }, [latestLocationPoint, latestLocationPosition, setActiveInfo]);

  const hasLatestLocation = Boolean(latestLocationPosition);
  const isLatestLocationOnlyView = hasLatestLocation && showOnlyLatestLocation;

  useEffect(() => {
    if (!latestLocationPoint) {
      setShowLatestLocationDetailsPanel(false);
      setShowOnlyLatestLocation(false);
    }
  }, [latestLocationPoint]);

  const isContactEventWithinScope = useCallback((_point: Point) => true, []);

  const contactPoints = useMemo(() => {
    const matchesVisible = (point: Point): boolean => {
      if (visibleSources.size === 0) {
        return true;
      }
      const value = getPointSourceValue(point);
      if (!value) {
        return false;
      }
      if (visibleSources.has(value)) {
        return true;
      }
      const key = normalizeSourceKey(value);
      if (!key) {
        return false;
      }
      return visibleSources.has(key) || normalizedVisibleSources.has(key);
    };

    const base = points.filter((point) => {
      if (!isContactEventWithinScope(point)) return false;

      if (!selectedSource && !matchesVisible(point)) {
        return false;
      }

      return !isLocationEventType(point.type);
    });

    if (!selectedSource) {
      return base;
    }

    const normalizedSelected = normalizePhoneDigits(selectedSource);
    if (!normalizedSelected) {
      return base;
    }

    const filtered = base.filter((point) => {
      const trackedNormalized = normalizePhoneDigits(point.tracked);
      const callerNormalized = normalizePhoneDigits(point.caller);
      const calleeNormalized = normalizePhoneDigits(point.callee);
      const numberNormalized = normalizePhoneDigits(point.number);
      const sourceNormalized = normalizePhoneDigits(getPointSourceValue(point));

      return (
        trackedNormalized === normalizedSelected ||
        callerNormalized === normalizedSelected ||
        calleeNormalized === normalizedSelected ||
        numberNormalized === normalizedSelected ||
        sourceNormalized === normalizedSelected
      );
    });

    return filtered.length > 0 ? filtered : base;
  }, [
    selectedSource,
    points,
    visibleSources,
    normalizedVisibleSources,
    isContactEventWithinScope
  ]);

  const activeSourceCount = useMemo(() => {
    const set = new Set<string>();
    displayedPoints.forEach((p) => {
      const src = getPointSourceValue(p);
      if (src) {
        set.add(src);
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

  const numberLegendItems = useMemo<NumberLegendItem[]>(() => {
    if (!usePerNumberColors) {
      return [];
    }
    return sourceNumbers.map((num) => ({
      label: formatPhoneForDisplay(num),
      color: colorMap.get(num) || '#94a3b8'
    }));
  }, [usePerNumberColors, sourceNumbers, colorMap]);

  const monitoredNumberInsights = useMemo(() => {
    const activityMap = new Map<string, { count: number; lastSeenLabel?: string; lastTimestamp: number }>();

    callerPoints.forEach((p) => {
      const normalized = normalizePhoneDigits(getPointSourceValue(p));
      if (!normalized) return;

      const existing = activityMap.get(normalized) ?? { count: 0, lastTimestamp: -Infinity };
      const timestamp = Date.parse(`${p.callDate}T${p.startTime || '00:00:00'}`);
      const hasValidTimestamp = !Number.isNaN(timestamp);

      if (hasValidTimestamp && timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = timestamp;
        existing.lastSeenLabel = new Intl.DateTimeFormat('fr-FR', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(timestamp));
      }

      existing.count += 1;
      activityMap.set(normalized, existing);
    });

    let maxActivityCount = 0;

    const rows = sourceNumbers.map((num, idx) => {
      const normalized = normalizePhoneDigits(num) || num.trim();
      const stats = activityMap.get(normalized);
      const activityCount = stats?.count ?? 0;
      maxActivityCount = Math.max(maxActivityCount, activityCount);
      const isOnMap = normalizedSourceSet.has(normalized);

      const status = stats?.count ? 'Actif' : isOnMap ? 'En veille' : 'Hors carte';
      const statusTone = stats?.count
        ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-400/40'
        : isOnMap
          ? 'bg-amber-500/10 text-amber-200 border border-amber-400/30'
          : 'bg-slate-500/10 text-slate-200 border border-slate-400/30';

      const accent = colorMap.get(num) || colorMap.get(normalized) || numberColors[idx % numberColors.length];

      return {
        id: `${normalized}-${idx}`,
        display: formatPhoneForDisplay(num),
        normalized,
        accent,
        activityCount,
        lastSeen: stats?.lastSeenLabel ?? 'Aucune activité récente',
        status,
        statusTone
      };
    });

    return { rows, maxActivityCount: Math.max(maxActivityCount, 1) };
  }, [callerPoints, colorMap, normalizedSourceSet, sourceNumbers]);

  const getLocationMarkerColor = useCallback(
    (loc: LocationMarker) => {
      if (usePerNumberColors && loc.source) {
        return colorMap.get(loc.source) || '#94a3b8';
      }
      return activeInfo === 'popular' ? '#9333ea' : '#f97316';
    },
    [usePerNumberColors, colorMap, activeInfo]
  );

  const renderLocationStatPopup = useCallback(
    (loc: LocationMarker) => {
      const showSource = selectedSource === null && sourceNumbers.length > 1 && loc.source;
      const accent = getLocationMarkerColor(loc);
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
    [selectedSource, sourceNumbers, activeInfo, getLocationMarkerColor]
  );

  const renderTriangulationPopup = useCallback((zone: TriangulationZone) => {
    const observed = formatDateTime(zone.timestamp);
    const diameter = formatDistanceMeters(zone.diameterMeters);
    return (
      <div className="relative w-[240px] max-w-[75vw] overflow-hidden rounded-3xl border border-white/60 bg-white/80 text-sm text-slate-700 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/30 via-rose-500/10 to-orange-500/30" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-white/75" aria-hidden />
        <div className="relative space-y-3 px-4 py-4">
          <div className="rounded-2xl border border-white/60 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-wide text-red-500">Numéro localisé</p>
            <p className="text-sm font-semibold text-red-600">
              {formatPhoneForDisplay(zone.source)}
            </p>
          </div>
          {observed && (
            <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-xs text-slate-500 shadow-sm backdrop-blur-sm">
              <span>Dernière activité</span>
              <span className="font-semibold text-slate-700">{observed}</span>
            </div>
          )}
          {diameter && (
            <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-xs text-slate-500 shadow-sm backdrop-blur-sm">
              <span>Diamètre estimé</span>
              <span className="font-semibold text-slate-700">{diameter}</span>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-xs text-slate-500 shadow-sm backdrop-blur-sm">
            <span className="inline-flex h-2 w-2 rounded-full bg-red-400" />
            Basé sur {zone.cells.length} BTS active{zone.cells.length > 1 ? 's' : ''}
          </div>
          {zone.cells.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-xs text-slate-500 shadow-sm backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-wide text-red-500 font-semibold">Nom du BTS</p>
              <div className="space-y-2">
                {zone.cells.map((cell, idx) => {
                  const label = cell.parts?.normalized ?? cell.cgi ?? cell.rawCgi ?? null;
                  const identifier = label ? `CGI ${label}` : null;
                  const displayLabel = cell.name || identifier || `Cellule ${idx + 1}`;
                  const rawDifferent =
                    cell.rawCgi && label && cell.rawCgi.trim() !== label ? cell.rawCgi.trim() : null;
                  return (
                    <div
                      key={`tri-popup-cell-${idx}`}
                      className="rounded-xl border border-white/50 bg-white/80 px-3 py-2 text-[11px] text-slate-600 shadow-sm backdrop-blur-sm"
                    >
                      <p className="font-semibold text-slate-700">{displayLabel}</p>
                      {cell.name && identifier && (
                        <p className="mt-0.5 text-[10px] text-slate-500">{identifier}</p>
                      )}
                      {cell.parts && (
                        <p className="mt-0.5 text-[10px] text-slate-500">{formatCgiDetails(cell.parts)}</p>
                      )}
                      {rawDifferent && (
                        <p className="mt-0.5 text-[10px] text-slate-400">Original : {rawDifferent}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
    const contactMap = new Map<string, ContactAccumulator>();
    const locationMap = new Map<string, LocationStat>();
    const displayedSet = new Set(displayedPoints);
    const normalizedSelected = normalizePhoneDigits(selectedSource ?? '');
    let contactEvents = contactPoints;
    if (selectedSource && normalizedSelected) {
      const filtered = points.filter((point) => {
        const trackedNormalized = normalizePhoneDigits(point.tracked);
        if (!trackedNormalized || trackedNormalized !== normalizedSelected) {
          return false;
        }
        return true;
      });

      if (filtered.length > 0) {
        const merged = new Set(contactEvents);
        filtered.forEach((p) => merged.add(p));
        contactEvents = Array.from(merged);
      }
    }

    const contactSet = new Set(contactEvents);
    contactEvents.forEach((p) => {
      if (!isLocationEventType(p.type)) {
        const trackedRaw = getPointTrackedValue(p) || '';
        const trackedNormalized = normalizePhoneDigits(trackedRaw);
        if (trackedNormalized) {
          const rawCaller = (p.caller || '').trim();
          const rawCallee = (p.callee || '').trim();
          const rawNumber = (p.number || '').trim();

          const callerNormalized = normalizePhoneDigits(rawCaller);
          const calleeNormalized = normalizePhoneDigits(rawCallee);
          type ContactCandidate = { normalized?: string; raw: string };
          const candidates: ContactCandidate[] = [
            { normalized: normalizePhoneDigits(rawNumber), raw: rawNumber },
            { normalized: callerNormalized, raw: rawCaller },
            { normalized: calleeNormalized, raw: rawCallee }
          ];

          let contactNormalized = '';
          let contactRaw = '';

          const pickContact = (allowTracked: boolean) => {
            for (const candidate of candidates) {
              if (!candidate.normalized) continue;
              if (!allowTracked && candidate.normalized === trackedNormalized) continue;
              contactNormalized = candidate.normalized;
              contactRaw = candidate.raw || candidate.normalized;
              return true;
            }
            return false;
          };

          if (!pickContact(false)) {
            pickContact(true);
          }

          if (contactNormalized) {
            const key = `${trackedNormalized}|${contactNormalized}`;
            const entry =
              contactMap.get(key) ||
              {
                tracked: trackedRaw || undefined,
                contact: contactRaw || undefined,
                contactNormalized,
                callCount: 0,
                smsCount: 0,
                ussdCount: 0,
                callDurationSeconds: 0,
                events: []
              };

            if (!entry.tracked && trackedRaw) {
              entry.tracked = trackedRaw;
            }
            if (!entry.contact && contactRaw) {
              entry.contact = contactRaw;
            }
            entry.contactNormalized = contactNormalized;

            const normalizedEventType = (p.type || '').trim().toLowerCase();
            const isSmsEvent = normalizedEventType === 'sms' || normalizedEventType.includes('sms');
            const isUssdEvent = isUssdEventType(p.type);
            const isAudioEvent = !isSmsEvent && !isUssdEvent;

            if (isSmsEvent) {
              entry.smsCount += 1;
            } else if (isUssdEvent) {
              entry.ussdCount += 1;
            } else if (isAudioEvent) {
              entry.callCount += 1;
              entry.callDurationSeconds += getPointDurationInSeconds(p);
              const timestamp = getPointTimestamp(p);
              entry.events.push({
                id: `${key}-${entry.events.length + 1}-${timestamp ?? 'ts'}`,
                timestamp,
                date: p.callDate,
                time: p.startTime || p.endTime,
                duration: formatPointDuration(p),
                direction: p.direction,
                type: p.type,
                location: p.nom,
                source: getPointSourceValue(p),
                cell: p.cgi
              });
            }

            contactMap.set(key, entry);
          }
        }
      }

      if (!displayedSet.has(p)) {
        return;
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

    displayedPoints.forEach((p) => {
      if (contactSet.has(p)) return;

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
      .map(([id, c]) => ({
        id,
        tracked: c.tracked,
        contact: c.contact,
        contactNormalized: c.contactNormalized,
        callCount: c.callCount,
        smsCount: c.smsCount,
        ussdCount: c.ussdCount,
        callDuration: formatDuration(c.callDurationSeconds),
        total: c.callCount + c.smsCount + c.ussdCount,
        events: c.events.slice().sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);

    const normalizedContacts = new Set(
      contacts.map((c) => normalizePhoneDigits(c.contact) || c.contactNormalized || '')
    );

    const supplementalContacts: Contact[] = [];
    const defaultTracked = selectedSource || sourceNumbers[0] || undefined;
    const trackedLabel = defaultTracked || 'summary';

    contactSummaries.forEach((summary, index) => {
      const normalizedNumber = normalizePhoneDigits(summary.number) || summary.number.trim();
      if (!normalizedNumber || normalizedContacts.has(normalizedNumber)) {
        return;
      }

      const summaryDurationSeconds =
        summary.callDurationSeconds ??
        parseDurationToSeconds(summary.callDuration || '') ??
        0;
      const summaryCallMinutes = summaryDurationSeconds > 0
        ? Math.ceil(summaryDurationSeconds / 60)
        : 0;

      supplementalContacts.push({
        id: `${trackedLabel}|${normalizedNumber}|summary-${index}`,
        tracked: defaultTracked,
        contact: summary.number,
        contactNormalized: normalizedNumber,
        callCount: summary.callCount ?? 0,
        smsCount: summary.smsCount ?? 0,
        ussdCount: 0,
        callDuration: formatDuration(summaryDurationSeconds),
        total: summaryCallMinutes + (summary.smsCount ?? 0),
        events: summary.events || []
      });
    });

    const mergedContacts = [...contacts, ...supplementalContacts].sort((a, b) => b.total - a.total);

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

    return {
      topContacts: mergedContacts,
      topLocations: locations,
      recentLocations: recent,
      total: displayedPoints.length
    };
  }, [
    contactSummaries,
    sourceNumbers,
    contactPoints,
    displayedPoints,
    points,
    selectedSource
  ]);

  useEffect(() => {
    if (activeContactDetailsId && !topContacts.some((c) => c.id === activeContactDetailsId)) {
      setActiveContactDetailsId(null);
    }
  }, [activeContactDetailsId, topContacts]);

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
        const src = getPointSourceValue(p) || 'unknown';
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
  const showLocationMarkers = useMemo(
    () => {
      return showOthers || activeInfo === 'recent' || activeInfo === 'popular';
    },
    [showOthers, activeInfo]
  );

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
      const distanceKm = getSegmentDistanceKm([lat1, lng1], [lat2, lng2]);
      const arrowCount = Math.min(3, Math.max(1, Math.round(distanceKm / 0.4)));
      for (let step = 1; step <= arrowCount; step++) {
        const t = step / (arrowCount + 1);
        markers.push({
          position: [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t],
          angle
        });
      }
    }
    return markers;
  }, [routePositions, showRoute]);

  const similarSegments = useMemo(() => {
    const segmentMap = new Map<
      string,
      { positions: [number, number][]; counts: Map<string, number> }
    >();
    sourceNumbers.forEach((src) => {
      const srcKey = normalizeSourceKey(src) || src;
      const pts = callerPoints
        .filter((p) => {
          const value = getPointSourceValue(p);
          if (!value) return false;
          if (value === src) return true;
          const pointKey = normalizeSourceKey(value);
          return pointKey ? pointKey === srcKey : false;
        })
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

  const similarPoints = useMemo(
    () =>
      callerPoints.filter((p) => {
        const value = getPointSourceValue(p);
        if (!value) return false;
        if (visibleSimilar.has(value)) {
          return true;
        }
        const key = normalizeSourceKey(value);
        if (!key) {
          return false;
        }
        return visibleSimilar.has(key);
      }),
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
  const [routeTrackerStyle, setRouteTrackerStyle] = useState<'person' | 'car'>('person');
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  const paginatedContacts = useMemo(() => {
    const start = (contactPage - 1) * pageSize;
    return topContacts.slice(start, start + pageSize);
  }, [topContacts, contactPage, pageSize]);

  const selectedContactDetails = useMemo(() => {
    if (!activeContactDetailsId) return null;
    return topContacts.find((c) => c.id === activeContactDetailsId) ?? null;
  }, [activeContactDetailsId, topContacts]);

  const contactDetailEvents = useMemo(() => {
    if (!selectedContactDetails) return [] as ContactCallDetail[];
    return selectedContactDetails.events.slice(0, 6);
  }, [selectedContactDetails]);

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

  const carIcon = useMemo(() => {
    const size = 36;
    const Icon = routeTrackerStyle === 'person' ? PersonStanding : Car;
    const backgroundColor = routeTrackerStyle === 'person' ? '#2563eb' : '#f59e0b';
    const boxShadow =
      routeTrackerStyle === 'person'
        ? '0 12px 24px rgba(79, 70, 229, 0.3)'
        : '0 12px 24px rgba(245, 158, 11, 0.35)';
    const icon = (
      <div
        style={{
          transform: `rotate(${carAngle}deg)`,
          backgroundColor,
          borderRadius: '14px',
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow
        }}
      >
        <Icon size={18} className="text-white" />
      </div>
    );
    return L.divIcon({
      html: renderToStaticMarkup(icon),
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }, [carAngle, routeTrackerStyle]);

  const meetingPoints = useMemo<MeetingPoint[]>(() => {
    // Group events by location regardless of start time
    const locationMap = new Map<
      string,
      { lat: number; lng: number; nom: string; events: Point[] }
    >();
    displayedPoints.forEach((p) => {
      const src = getPointSourceValue(p);
      if (!src) return;
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
          Array.from(active)
            .map((i) => getPointSourceValue(evs[i]))
            .filter(Boolean) as string[]
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
          new Set(
            groupEvents
              .map((e) => getPointSourceValue(e))
              .filter((value): value is string => Boolean(value))
          )
        );
        if (numbers.length < 2) return;

        const perNumber = numbers.map((num) => {
          const evts = groupEvents
            .filter((e) => getPointSourceValue(e) === num)
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
    const trimmed = number.trim();
    const normalized = normalizePhoneDigits(number);
    const target = normalized || trimmed;
    if (!target) return;

    const mp = meetingPoints.find((m) =>
      m.numbers.some((n) => {
        const normalizedMeeting = normalizePhoneDigits(n);
        const candidate = normalizedMeeting || n.trim();
        return candidate === target;
      })
    );

    if (!mp) return;

    const isActive = showMeetingPoints && activeMeetingNumber === target;
    if (isActive) {
      setActiveMeetingNumber(null);
      onToggleMeetingPoints?.();
    } else {
      setActiveMeetingNumber(target);
      if (!showMeetingPoints) {
        onToggleMeetingPoints?.();
      }
      setActiveInfo(null);
      mapRef.current?.flyTo([mp.lat, mp.lng], 16);
    }
  };

  const startIcon = useMemo(() => createLabelIcon('Départ', INCOMING_CALL_COLOR), []);
  const endIcon = useMemo(() => createLabelIcon('Arrivée', LOCATION_COLOR), []);
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

      const sourceValue = getPointSourceValue(p);
      const sourceKey = sourceValue ?? NO_SOURCE_KEY;
      const entry = group.perSource.get(sourceKey);
      if (entry) {
        entry.events.push(p);
      } else {
        group.perSource.set(sourceKey, { source: sourceValue, events: [p] });
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
        const sourceValue = getPointSourceValue(loc);
        const colorOverride = sourceValue ? resolveSourceColor(sourceValue) : undefined;
        return (
          <Marker
            key={key}
            position={position}
            icon={getIcon(loc.type, loc.direction, colorOverride)}
          >
            <Popup className="cdr-popup">{renderEventPopupContent(loc)}</Popup>
          </Marker>
        );
      }

      const first = events[0];
      const uniqueSources = Array.from(
        new Set(
          events
            .map((ev) => getPointSourceValue(ev))
            .filter((src): src is string => Boolean(src))
        )
      );
      const groupColor =
        uniqueSources.length === 1 ? resolveSourceColor(uniqueSources[0]) : undefined;

      return (
        <Marker
          key={key}
          position={position}
          icon={getGroupIcon(
            events.length,
            first.type,
            first.direction,
            groupColor
          )}
        >
          <Popup className="cdr-popup">
            <div className="space-y-2.5 w-[360px] max-w-[90vw]">
              <div className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                    <MapPin className="h-4 w-4 text-slate-500" />
                  </span>
                <div className="flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Localisation</p>
                  <p className="text-sm font-bold leading-snug text-slate-800">
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
              <div className="max-h-64 overflow-y-auto overflow-x-hidden pr-1">
                <div className="flex flex-col gap-2">
                  {events.map((loc, i) => (
                    <div key={i} className="w-full">
                      {renderEventPopupContent(loc, { compact: true, showLocation: false })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      );
    },
    [renderEventPopupContent, resolveSourceColor]
  );
  return (
    <div className="relative w-full h-screen">
        <MapContainer
          center={center}
          zoom={13}
          zoomControl={false}
          className="w-full h-full"
          style={{ position: 'relative' }}
          whenCreated={(map) => {
            mapRef.current = map;
            const paneId = 'latest-location-pane';
            const pane = map.getPane(paneId) ?? map.createPane(paneId);
            if (pane) {
              pane.style.zIndex = '1200';
            }
            setIsMapReady(true);
          }}
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
      {showBaseMarkers && showMeetingPoints &&
        meetingPoints
          .filter(
            (mp) =>
              !activeMeetingNumber ||
              mp.numbers.some((n) => {
                const normalized = normalizePhoneDigits(n);
                const candidate = normalized || n.trim();
                return candidate === activeMeetingNumber;
              })
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
      {showBaseMarkers && showSimilar &&
        similarSegments.flatMap((seg, idx) =>
          seg.sources.map((src) =>
            visibleSimilar.has(src) ? (
              <Polyline
                key={`similar-${idx}-${src}`}
                positions={seg.positions}
                pathOptions={{
                  color: colorMap.get(src) || OUTGOING_CALL_COLOR,
                  weight: 2.5,
                  opacity: 0.7,
                  dashArray: '4 8',
                  lineCap: 'round'
                }}
              />
            ) : null
          )
        )}
      {showBaseMarkers && showSimilar &&
        (showOthers ? similarPoints : connectorPoints).map((loc, idx) => (
          <Marker
            key={`similar-point-${idx}`}
            position={[
              parseFloat(loc.latitude),
              parseFloat(loc.longitude)
            ]}
            icon={getIcon(loc.type, loc.direction)}
          >
            <Popup className="cdr-popup">
              {renderEventPopupContent(loc)}
            </Popup>
          </Marker>
          ))}
      {showLocationMarkers &&
        locationMarkers.map((loc, idx) => (
          <Marker
            key={`stat-${idx}`}
            position={[parseFloat(loc.latitude), parseFloat(loc.longitude)]}
            icon={createLabelIcon(String(loc.count), getLocationMarkerColor(loc))}
            zIndexOffset={1000}
          >
            <Popup className="cdr-popup">
              {renderLocationStatPopup(loc)}
            </Popup>
        </Marker>
      ))}
      {isMapReady && latestLocationPoint && latestLocationPosition && (
        <>
          <CircleMarker
            center={latestLocationPosition}
            radius={18}
            pathOptions={{
              color: isLatestLocationOnlyView ? '#ef4444' : LOCATION_COLOR,
              weight: 2,
              fillColor: isLatestLocationOnlyView ? 'rgba(239,68,68,0.28)' : APPROX_LOCATION_COLOR,
              fillOpacity: 0.2,
              className: `latest-location-circle${
                isLatestLocationOnlyView ? ' latest-location-circle--focused' : ''
              }`
            }}
            pane="latest-location-pane"
            eventHandlers={{
              click: handleLatestLocationRingClick
            }}
          />
          <Marker
            position={latestLocationPosition}
            icon={latestLocationIcon}
            zIndexOffset={4000}
            pane="latest-location-pane"
            ref={latestLocationMarkerRef}
            eventHandlers={{
              click: handleLatestLocationRingClick
            }}
          >
            <Popup className="cdr-popup">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-600">Dernière localisation détectée</p>
                {latestLocationPopupDate && (
                  <p className="text-sm font-medium text-slate-700">{latestLocationPopupDate}</p>
                )}
                {latestLocationPopupCoords && (
                  <p className="text-sm text-slate-700">{latestLocationPopupCoords}</p>
                )}
              </div>
            </Popup>
          </Marker>
        </>
      )}
      {!isLatestLocationOnlyView && triangulationZones.map((zone, idx) => (
        <React.Fragment key={`tri-${idx}`}>
          <Polygon positions={zone.polygon} pathOptions={{ color: LOCATION_COLOR, weight: 2, fillOpacity: 0.2 }} />
          {zone.cells.map((cell, i) => (
            <CircleMarker
              key={`tri-cell-${idx}-${cell.cgi ?? cell.rawCgi ?? i}`}
              center={cell.position}
              radius={4}
              pathOptions={{ color: LOCATION_COLOR }}
            />
          ))}
          <Marker position={zone.barycenter} icon={createLabelIcon(String(idx + 1), LOCATION_COLOR)}>
            <Popup className="cdr-popup">{renderTriangulationPopup(zone)}</Popup>
          </Marker>
        </React.Fragment>
      ))}
      </MapContainer>
      <div className="pointer-events-none absolute top-4 left-2 z-[1000] flex flex-col gap-3">
        <MapControlButton
          title={
            hasLatestLocation
              ? 'Afficher la dernière localisation connue'
              : 'Aucune localisation exploitable'
          }
          icon={<MapPin className="h-5 w-5" />}
          onClick={handleToggleLatestLocationView}
          disabled={!hasLatestLocation}
          active={isLatestLocationOnlyView}
          isToggle
        />
        <MapControlButton
          title="Localisation approximative de la personne"
          icon={<Crosshair className="h-5 w-5" />}
          onClick={handleTriangulation}
          active={triangulationZones.length > 0}
          isToggle
        />
        <MapControlButton
          title="Changer l'affichage"
          icon={<Layers className="h-5 w-5" />}
          onClick={() => setIsSatellite((s) => !s)}
          active={isSatellite}
          isToggle
        />
        {sourceNumbers.length > 0 && (
          <MapControlButton
            title="Trajectoires similaires"
            icon={<Activity className="h-5 w-5" />}
            onClick={() => setShowSimilar((s) => !s)}
            active={showSimilar}
            isToggle
          />
        )}
        <MapControlButton
          title="Zoomer"
          icon={<Plus className="h-5 w-5" />}
          onClick={handleZoomIn}
        />
        <MapControlButton
          title="Dézoomer"
          icon={<Minus className="h-5 w-5" />}
          onClick={handleZoomOut}
        />
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
        <div
          className={`pointer-events-none absolute ${
            showLatestLocationDetailsPanel ? 'bottom-40' : 'bottom-12'
          } left-0 right-0 z-[1000] flex justify-center`}
        >
          <div className="pointer-events-auto flex items-center gap-2 bg-white/90 backdrop-blur rounded-full shadow px-4 py-2">
            {routeTrackerStyle === 'person' ? (
              <PersonStanding className="w-4 h-4 text-blue-600" />
            ) : (
              <Car className="w-4 h-4 text-amber-500" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Suivi
            </span>
            <div className="flex items-center rounded-full border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setRouteTrackerStyle('person')}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition ${
                  routeTrackerStyle === 'person'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                aria-pressed={routeTrackerStyle === 'person'}
                title="Suivi par personne"
              >
                <PersonStanding className="h-3.5 w-3.5" />
                Personne
              </button>
              <button
                type="button"
                onClick={() => setRouteTrackerStyle('car')}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition ${
                  routeTrackerStyle === 'car'
                    ? 'bg-amber-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                aria-pressed={routeTrackerStyle === 'car'}
                title="Suivi par voiture"
              >
                <Car className="h-3.5 w-3.5" />
                Voiture
              </button>
            </div>
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

      {showLatestLocationDetailsPanel && latestLocationPoint && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[1000] flex w-full max-w-2xl -translate-x-1/2 justify-center px-4">
          <div className="pointer-events-auto w-full rounded-3xl border border-white/50 bg-white/95 p-6 shadow-2xl ring-1 ring-black/5 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-blue-500">Dernière localisation</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                  {latestLocationPoint.nom?.trim() || 'Position inconnue'}
                </p>
                {latestLocationDetails && (
                  <p className="text-sm text-slate-500 dark:text-slate-300">{latestLocationDetails}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowLatestLocationDetailsPanel(false)}
                className="rounded-full border border-white/70 bg-white/50 p-1 text-slate-600 transition hover:bg-white dark:border-slate-600 dark:bg-slate-800/80 dark:text-white"
                aria-label="Fermer les détails de la localisation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {latestLocationHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <Icon className="h-4 w-4 text-blue-500" />
                      {item.label}
                    </div>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{item.value}</p>
                    {item.sub && (
                      <p className="text-sm text-slate-500 dark:text-slate-300">{item.sub}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {latestLocationContactBadges.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {latestLocationContactBadges.map((badge) => (
                  <span
                    key={`${badge.label}-${badge.value}`}
                    className="inline-flex flex-col rounded-2xl border border-slate-200/70 bg-white/80 px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
                  >
                    {badge.label}
                    <span className="text-base font-semibold normal-case text-slate-900 dark:text-white">
                      {badge.value}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-24 right-4 z-[1000] max-h-[50vh]">
        <MapLegend numberItems={numberLegendItems} />
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
                  (m) =>
                    !activeMeetingNumber ||
                    m.numbers.some((num) => {
                      const normalized = normalizePhoneDigits(num);
                      const candidate = normalized || num.trim();
                      return candidate === activeMeetingNumber;
                    })
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

      {activeInfo && (
        <div className="absolute top-20 right-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-md p-4 text-sm space-y-4 text-gray-800 dark:text-white z-[1000] max-h-[80vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold">
                {activeInfo === 'contacts'
                  ? 'Personnes en contact'
                  : activeInfo === 'recent'
                    ? 'Localisations récentes'
                    : activeInfo === 'popular'
                      ? 'Lieux les plus visités'
                      : 'Historique des déplacements'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">Total : {total}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={closeInfoPanels}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Fermer tableau
              </button>
            </div>
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
          {activeInfo === 'contacts' && topContacts.length > 0 && (
            <div>
              <p className="font-semibold mb-2">Personnes en contact</p>
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="pr-4">Numéro suivi</th>
                    <th className="pr-4">Contact</th>
                    <th className="pr-4">Appels</th>
                    <th className="pr-4">Durée</th>
                    <th className="pr-4">SMS</th>
                    <th className="pr-4">Rencontres</th>
                    <th className="pr-4">Détails</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedContacts.map((c, i) => {
                    const idx = (contactPage - 1) * pageSize + i;
                    const contactNumber = c.contact?.trim() || '';
                    const toggleKey = contactNumber
                      ? normalizePhoneDigits(contactNumber) || contactNumber
                      : c.contactNormalized || '';
                    const meetingCount = toggleKey
                      ? meetingPoints.filter((m) =>
                          m.numbers.some((num) => {
                            const normalized = normalizePhoneDigits(num);
                            const candidate = normalized || num.trim();
                            return candidate === toggleKey;
                          })
                        ).length
                      : 0;
                    const isActiveMeeting =
                      toggleKey && showMeetingPoints && activeMeetingNumber === toggleKey;
                    const toggleValue = contactNumber || toggleKey;
                    const isActiveDetails = activeContactDetailsId === c.id;
                    return (
                      <tr
                        key={c.id}
                        className={`${idx === 0 ? 'font-bold text-blue-600' : ''} border-t`}
                      >
                        <td className="pr-4">{formatPhoneForDisplay(c.tracked)}</td>
                        <td className="pr-4">{formatPhoneForDisplay(c.contact)}</td>
                        <td className="pr-4">{c.callCount}</td>
                        <td className="pr-4">{c.callDuration}</td>
                        <td className="pr-4">{c.smsCount}</td>
                        <td className="pr-4">
                          {meetingCount}
                          {meetingCount > 0 && toggleValue && (
                            <button
                              className="ml-1 text-blue-600"
                              onClick={() => handleToggleMeetingPoint(toggleValue)}
                            >
                              {isActiveMeeting ? (
                                <EyeOff size={16} />
                              ) : (
                                <Eye size={16} />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="pr-4">
                          <button
                            type="button"
                            onClick={() => handleContactDetailsToggle(c.id)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              isActiveDetails
                                ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-500/40'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600'
                            }`}
                          >
                            Voir
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </td>
                        <td>{c.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectedContactDetails && (
                <div className="mt-4 rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-2xl">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-white/70">Contact sélectionné</p>
                      <p className="mt-2 text-2xl font-semibold">
                        {formatPhoneForDisplay(selectedContactDetails.contact)}
                      </p>
                      <p className="text-sm text-white/80">
                        Suivi via {formatPhoneForDisplay(selectedContactDetails.tracked)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveContactDetailsId(null)}
                      className="rounded-full border border-white/40 p-1 text-white transition hover:bg-white/20"
                      aria-label="Fermer les détails du contact"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 px-4 pb-4 text-sm text-white/90 md:grid-cols-4">
                    {[{
                      label: 'Appels',
                      value: selectedContactDetails.callCount
                    },
                    {
                      label: 'Durée cumulée',
                      value: selectedContactDetails.callDuration
                    },
                    {
                      label: 'SMS',
                      value: selectedContactDetails.smsCount
                    },
                    {
                      label: 'Total interactions',
                      value: selectedContactDetails.total
                    }].map((stat) => (
                      <div key={stat.label} className="rounded-2xl bg-white/15 p-3 text-center">
                        <p className="text-[11px] uppercase tracking-wide text-white/70">{stat.label}</p>
                        <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mx-4 mb-4 rounded-2xl bg-white text-slate-900 shadow-xl dark:bg-slate-900 dark:text-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-slate-800">
                      <span>Derniers appels</span>
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                        {contactDetailEvents.length}/{selectedContactDetails.callCount} listés
                      </span>
                    </div>
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {contactDetailEvents.length > 0 ? (
                        contactDetailEvents.map((event) => {
                          const direction = (event.direction || '').toLowerCase();
                          const Icon = direction === 'outgoing' ? PhoneOutgoing : PhoneIncoming;
                          const toneClasses =
                            direction === 'outgoing'
                              ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200'
                              : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200';
                          const dateLabel = event.date ? formatDate(event.date) : 'Date inconnue';
                          return (
                            <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                              <div className={`rounded-2xl p-2 ${toneClasses}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 text-sm">
                                <div className="flex items-center justify-between text-sm font-semibold">
                                  <span>{direction === 'outgoing' ? 'Appel sortant' : 'Appel entrant'}</span>
                                  <span className="text-xs text-slate-500 dark:text-slate-300">
                                    {event.duration || 'Durée inconnue'}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {dateLabel}
                                  {event.time ? ` • ${event.time}` : ''}
                                </p>
                                {event.location && (
                                  <p className="text-sm text-slate-700 dark:text-slate-200">{event.location}</p>
                                )}
                                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                  {event.cell && (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800/80">
                                      Cellule {event.cell}
                                    </span>
                                  )}
                                  {event.source && (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800/80">
                                      {formatPhoneForDisplay(event.source)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-300">
                          Aucun appel détaillé pour ce contact.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
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
          {activeInfo === 'recent' && recentLocations.length > 0 && (
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
          {activeInfo === 'popular' && topLocations.length > 0 && (
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
  );
};

export default CdrMap;
