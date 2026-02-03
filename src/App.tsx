import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  ArrowUp,
  ArrowRight,
  Database,
  Users,
  Settings,
  LogOut,
  User,
  Plus,
  Edit,
  Trash2,
  Key,
  Download,
  Sun,
  Moon,
  Shield,
  UserCheck,
  Clock,
  Activity,
  Timer,
  TrendingUp,
  BarChart3,
  FileText,
  Upload,
  UploadCloud,
  Phone,
  Smartphone,
  PhoneIncoming,
  PhoneOutgoing,
  Building2,
  Globe,
  Car,
  Ban,
  UserCircle,
  List,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  Bell,
  BellRing,
  AlertTriangle,
  ChevronDown,
  Share2,
  GripVertical,
  X,
  Info,
  Scan,
  Eraser,
  MapPin,
  MapPinOff,
  CheckCircle2,
  History,
  Fingerprint,
  Radar,
  SatelliteDish,
  Calendar,
  Sparkles
} from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { format, parseISO, formatDistanceToNow, intervalToDuration, formatDuration } from 'date-fns';
import { fr } from 'date-fns/locale';
import ToggleSwitch from './components/ToggleSwitch';
import PaginationControls from './components/PaginationControls';
import PageHeader from './components/PageHeader';
import SearchResultProfiles from './components/SearchResultProfiles';
import LoadingSpinner from './components/LoadingSpinner';
import StructuredPreviewValue from './components/StructuredPreviewValue';
import ProfileList, { ProfileListItem } from './components/ProfileList';
import ProfileForm from './components/ProfileForm';
import BulkProfileImportModal, { BulkProfilePrefillData } from './components/BulkProfileImportModal';
import CdrMap from './components/CdrMap';
import LinkDiagram from './components/LinkDiagram';
import SoraLogo from './components/SoraLogo';
import ConfirmDialog, { ConfirmDialogOptions } from './components/ConfirmDialog';
import { useNotifications } from './components/NotificationProvider';
import { normalizePreview, NormalizedPreviewEntry, BaseSearchHit } from './utils/search';
import { normalizeImeiWithCheckDigit } from './utils/imei';
import BtsPage, { BtsProvider } from './features/bts/BtsPage';

const VisibleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const HiddenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

import { AppPage, pageToPath, usePageNavigation } from './features/navigation/usePageNavigation';
import { useSearchHistory } from './features/search/useSearchHistory';

const LINK_DIAGRAM_PREFIXES = ['22177', '22176', '22178', '22170', '22175', '22133'];
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const CASE_PAGE_SIZE_OPTIONS = [6, 12, 24];
const FRAUD_ROLE_LABELS: Record<string, string> = {
  caller: 'Appelant',
  callee: 'Appelé',
  target: 'Cible'
};
const FRAUD_MONITORING_STORAGE_KEY = 'fraudMonitoringByUser';
const getUploadModeLabel = (mode?: string | null) => {
  switch (mode) {
    case 'new_table':
      return 'Nouvelle table';
    case 'existing':
      return 'Table existante';
    case 'sql':
      return 'Import SQL';
    default:
      return mode || 'Mode inconnu';
  }
};

interface User {
  id: number;
  login: string;
  admin: number;
  created_at: string;
  active: number;
  division_id: number | null;
  division_name?: string | null;
  otp_enabled?: number;
  role?: 'ADMIN' | 'USER';
}

type RawSearchResult = BaseSearchHit;

type RawHitsPayload =
  | RawSearchResult[]
  | {
      hits?: RawSearchResult[] | null;
      data?: RawSearchResult[] | null;
      results?: RawSearchResult[] | null;
    }
  | null
  | undefined;

interface SearchResult extends RawSearchResult {
  previewEntries: NormalizedPreviewEntry[];
}

interface SearchResponse {
  total: number;
  page: number;
  limit: number;
  pages: number;
  elapsed_ms: number;
  hits: SearchResult[];
  tables_searched: string[];
}

type SearchResponseFromApi = Partial<Omit<SearchResponse, 'hits' | 'tables_searched'>> & {
  hits: RawHitsPayload;
  tables_searched?: string[] | null;
  error?: string;
};

interface PhoneIdentifierDevice {
  number: string;
  imsi: string | null;
  imei: string;
  occurrences: number;
  firstSeen: string | null;
  lastSeen: string | null;
  imeiInfo: {
    brand?: string;
    model?: string;
    name?: string;
    status?: string;
    result?: string;
    error?: string;
  } | null;
}

interface PhoneIdentifierResult {
  query: {
    input: string;
    normalized: string;
    variants: string[];
  };
  stats: {
    totalAssociations: number;
    uniqueImeis: number;
    uniqueImsis: number;
    lastSeen: string | null;
    firstSeen: string | null;
  };
  devices: PhoneIdentifierDevice[];
}

const extractHitsFromPayload = (hits: RawHitsPayload): RawSearchResult[] => {
  if (Array.isArray(hits)) {
    return hits;
  }

  if (hits && typeof hits === 'object') {
    if (Array.isArray(hits.hits)) {
      return hits.hits;
    }
    if (Array.isArray(hits.data)) {
      return hits.data;
    }
    if (Array.isArray(hits.results)) {
      return hits.results;
    }
  }

  return [];
};

const mapPreviewEntries = (hits: RawHitsPayload): SearchResult[] =>
  extractHitsFromPayload(hits).map((hit) => ({
    ...hit,
    previewEntries: normalizePreview(hit)
  }));

const EXCLUDED_SEARCH_KEYS = new Set(['id', 'ID']);

const getSearchableValues = (value: unknown, key?: string): string[] => {
  if (key && EXCLUDED_SEARCH_KEYS.has(key)) {
    return [];
  }

  if (value == null) {
    return [];
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => getSearchableValues(item));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([childKey, childValue]) =>
      getSearchableValues(childValue, childKey)
    );
  }

  return [];
};

const normalizeSearchResponse = (data: SearchResponseFromApi): SearchResponse => {
  const { hits, tables_searched, total, page, limit, pages, elapsed_ms } = data;

  return {
    total: typeof total === 'number' && Number.isFinite(total) ? total : 0,
    page: typeof page === 'number' && Number.isFinite(page) ? page : 1,
    limit: typeof limit === 'number' && Number.isFinite(limit) ? limit : 0,
    pages: typeof pages === 'number' && Number.isFinite(pages) ? pages : 0,
    elapsed_ms:
      typeof elapsed_ms === 'number' && Number.isFinite(elapsed_ms) ? elapsed_ms : 0,
    hits: mapPreviewEntries(hits),
    tables_searched: Array.isArray(tables_searched) ? tables_searched : []
  };
};

interface SearchTermStat {
  search_term: string;
  search_count: number;
}

interface SearchTypeStat {
  search_type: string;
  search_count: number;
}

interface DashboardStats {
  total_searches: number;
  avg_execution_time: number;
  today_searches: number;
  active_users: number;
  top_search_terms: SearchTermStat[];
  searches_by_type: SearchTypeStat[];
  data?: {
    total_records: number;
    sources: number;
    tables: number;
  };
  profiles?: {
    total: number;
    today: number;
    recent: number;
  };
  requests?: {
    total: number;
    pending: number;
    identified: number;
    today: number;
    recent: number;
  };
  operations?: {
    total: number;
    today: number;
    recent: number;
  };
}

type DashboardCard = {
  id: string;
  title: string;
  value: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  gradient: string;
  badge?: {
    label: string;
    tone: string;
  };
  description?: string;
};

type RequestMetric = {
  key: string;
  label: string;
  value: number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone: string;
  caption: string;
  progress?: number;
};


const DASHBOARD_CARD_STORAGE_KEY = 'sora.dashboard.cardOrder';
const DEFAULT_CARD_ORDER = ['total-searches', 'data', 'profiles', 'requests', 'operations'];

interface GendarmerieEntry {
  id: number;
  libelle: string;
  telephone: string;
  souscategorie?: string;
  secteur?: string;
  created_at?: string;
}

interface EntrepriseEntry {
  ninea_ninet: string;
  cuci: string;
  raison_social: string;
  ensemble_sigle: string;
  numrc: string;
  syscoa1: string;
  syscoa2: string;
  syscoa3: string;
  naemas: string;
  naemas_rev1: string;
  citi_rev4: string;
  adresse: string;
  telephone: string;
  telephone1: string;
  numero_telecopie: string;
  email: string;
  bp: string;
  region: string;
  departement: string;
  ville: string;
  commune: string;
  quartier: string;
  personne_contact: string;
  adresse_personne_contact: string;
  qualite_personne_contact: string;
  premiere_annee_exercice: string;
  forme_juridique: string;
  regime_fiscal: string;
  pays_du_siege_de_lentreprise: string;
  nombre_etablissement: string;
  controle: string;
  date_reception: string;
  libelle_activite_principale: string;
  observations: string;
  systeme: string;
}

interface ProfileData {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  comment?: string | null;
  extra_fields?: any;
  photo_path?: string | null;
}

interface IdentificationRequest {
  id: number;
  user_id?: number;
  phone: string;
  status: string;
  user_login?: string;
  profile?: ProfileData | null;
  created_at?: string;
  updated_at?: string;
}

type NotificationType = 'request' | 'case_shared' | 'profile_shared' | 'monitoring';

interface NotificationItem {
  id: string;
  requestId?: number;
  phone?: string;
  status: 'pending' | 'identified';
  message: string;
  description: string;
  type: NotificationType;
  caseId?: number;
  notificationId?: number;
  read?: boolean;
  folderId?: number;
  folderName?: string;
  targetType?: MonitoringType;
  targetValue?: string;
}

interface DivisionEntry {
  id: number;
  name: string;
  created_at?: string;
}

interface CaseShareUser {
  id: number;
  login: string;
  admin: number;
  active: number;
  created_at: string;
}

interface CaseShareInfo {
  divisionId: number | null;
  owner: { id: number | undefined; login: string | undefined };
  recipients: number[];
  users: CaseShareUser[];
}

type ProfileShareUser = CaseShareUser;

interface ProfileShareInfo {
  divisionId: number | null;
  owner: { id: number | undefined; login: string | undefined };
  recipients: number[];
  users: ProfileShareUser[];
}

interface ServerNotification {
  id: number;
  user_id: number;
  type: string;
  data: any;
  read_at: string | null;
  created_at: string;
}

interface SessionLog {
  id: number;
  user_id: number;
  username: string;
  login_at: string;
  logout_at: string | null;
  duration_seconds: number;
}

interface OngEntry {
  id: number;
  organization_name: string;
  type: string;
  name: string;
  title: string;
  email_address: string;
  telephone: string;
  select_area_of_Interest: string;
  select_sectors_of_interest: string;
  created_at: string;
}

interface VehiculeEntry {
  id: number;
  Numero_Immatriculation: string;
  Code_Type: string;
  Numero_Serie: string;
  Date_Immatriculation: string;
  Serie_Immatriculation: string;
  Categorie: string;
  Marque: string;
  Appelation_Com: string;
  Genre: string;
  Carrosserie: string;
  Etat_Initial: string;
  Immat_Etrangere: string;
  Date_Etrangere: string;
  Date_Mise_Circulation: string;
  Date_Premiere_Immat: string;
  Energie: string;
  Puissance_Adm: string;
  Cylindre: string;
  Places_Assises: string;
  PTR: string;
  PTAC_Code: string;
  Poids_Vide: string;
  CU: string;
  Prenoms: string;
  Nom: string;
  Date_Naissance: string;
  Exact: string;
  Lieu_Naissance: string;
  Adresse_Vehicule: string;
  Code_Localite: string;
  Tel_Fixe: string;
  Tel_Portable: string;
  PrecImmat: string;
  Date_PrecImmat: string;
}

interface CdrContactEvent {
  id: string;
  timestamp?: number | null;
  date?: string;
  time?: string;
  duration?: string | null;
  direction?: string;
  type?: string;
}

interface CdrContact {
  number: string;
  callCount: number;
  smsCount: number;
  total: number;
  callDurationSeconds?: number;
  callDuration?: string;
  events?: CdrContactEvent[];
}

interface CdrContactCandidate {
  tracked?: string;
  number?: string;
  caller?: string;
  callee?: string;
  type?: string;
  rawRecord?: Record<string, unknown>;
}

interface CdrLocation {
  latitude: string;
  longitude: string;
  nom: string;
  count: number;
}

interface CdrPoint {
  latitude: string;
  longitude: string;
  nom: string;
  type: string;
  direction: string;
  number?: string;
  caller?: string;
  callee?: string;
  callDate: string;
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

interface CdrSearchResult {
  total: number;
  contacts: CdrContact[];
  topContacts: CdrContact[];
  locations: CdrLocation[];
  topLocations: CdrLocation[];
  path: CdrPoint[];
}

const LATITUDE_FIELD_CANDIDATES = [
  'latitude',
  'Latitude',
  'LATITUDE',
  'lat',
  'Lat',
  'LAT',
  'lat_bts',
  'LAT_BTS',
  'latitude_bts',
  'Latitude_BTS',
  'nord_bts',
  'Nord_BTS',
  'NORD_BTS'
];

const LONGITUDE_FIELD_CANDIDATES = [
  'longitude',
  'Longitude',
  'LONGITUDE',
  'long',
  'Long',
  'LONG',
  'lon',
  'Lon',
  'LON',
  'lng',
  'Lng',
  'LNG',
  'long_bts',
  'LONG_BTS',
  'longitude_bts',
  'Longitude_BTS',
  'est_bts',
  'Est_BTS',
  'EST_BTS'
];

const NOM_FIELD_CANDIDATES = ['nom', 'Nom', 'NOM', 'nom_bts', 'Nom_BTS', 'NOM_BTS'];

const AZIMUT_FIELD_CANDIDATES = ['azimut', 'Azimut', 'AZIMUT', 'azimuth', 'Azimuth', 'AZIMUTH'];

const TYPE_FIELD_CANDIDATES = ['type', 'type_appel', "type_d'appel", 'type_d_appel'];

const CALLER_FIELD_CANDIDATES = [
  'caller',
  'numero_appelant',
  'numero appelant',
  'numeroAppelant'
];

const CALLEE_FIELD_CANDIDATES = [
  'callee',
  'numero_appele',
  'numero appele',
  'numeroAppelee'
];

const sanitizeFieldKey = (key: string): string => {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
};

const getFirstDefinedValue = (
  source: unknown,
  keys: string[],
  depth = 3,
  visited?: WeakSet<object>
): unknown => {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  const tracker = visited ?? new WeakSet<object>();
  if (tracker.has(source as object)) {
    return undefined;
  }
  tracker.add(source as object);

  const record = source as Record<string, unknown>;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
  }

  const normalizedKeys = new Map<string, string>();
  for (const existingKey of Object.keys(record)) {
    const sanitized = sanitizeFieldKey(existingKey);
    if (!normalizedKeys.has(sanitized)) {
      normalizedKeys.set(sanitized, existingKey);
    }
  }

  for (const candidate of keys) {
    const normalizedCandidate = sanitizeFieldKey(candidate);
    const actualKey = normalizedKeys.get(normalizedCandidate);
    if (!actualKey) continue;
    const value = record[actualKey];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }

  if (depth <= 0) {
    return undefined;
  }

  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    if (value instanceof Date) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = getFirstDefinedValue(item, keys, depth - 1, tracker);
        if (nested !== undefined) {
          return nested;
        }
      }
      continue;
    }

    const nested = getFirstDefinedValue(value, keys, depth - 1, tracker);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
};

type CoordinateAxis = 'latitude' | 'longitude';

const resolveOrientationSign = (value: string, axis: CoordinateAxis): number | null => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const orientationPatterns =
    axis === 'latitude'
      ? [
          { regex: /\bS(?:UD)?\b/, sign: -1 },
          { regex: /\bN(?:ORD)?\b/, sign: 1 }
        ]
      : [
          { regex: /\bO(?:UEST)?\b/, sign: -1 },
          { regex: /\bW(?:EST)?\b/, sign: -1 },
          { regex: /\bE(?:ST)?\b/, sign: 1 }
        ];

  for (const { regex, sign } of orientationPatterns) {
    if (regex.test(normalized)) {
      return sign;
    }
  }

  const letterMatch = normalized.match(/(?:^|[^A-Z0-9])([NSEWO])(?:[^A-Z]|$)/);
  if (!letterMatch) {
    return null;
  }

  const letter = letterMatch[1];
  if (axis === 'latitude') {
    if (letter === 'S') return -1;
    if (letter === 'N') return 1;
  } else {
    if (letter === 'W' || letter === 'O') return -1;
    if (letter === 'E') return 1;
  }

  return null;
};

const toDecimal = (value: string): number => Number.parseFloat(value.replace(/,/g, '.'));

const normalizeCoordinateField = (value: unknown, axis: CoordinateAxis): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    const limited = axis === 'latitude' ? Math.abs(value) <= 90 : Math.abs(value) <= 180;
    if (!limited) {
      return null;
    }
    return value.toString();
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const orientationSign = resolveOrientationSign(raw, axis);
  const matchAll = raw.match(/[-+]?\d+(?:[.,]\d+)?/g);
  if (!matchAll || matchAll.length === 0) {
    return null;
  }

  const hasDmsIndicators = /[°º'’′"”″]/.test(raw);
  const treatAsDms =
    hasDmsIndicators || (orientationSign !== null && matchAll.length >= 2) || matchAll.length >= 3;

  const limit = axis === 'latitude' ? 90 : 180;

  const resolveSign = (): number => {
    if (/^[\s+]*-/.test(raw)) {
      return -1;
    }
    if (/^[\s+]*\+/.test(raw)) {
      return 1;
    }
    const first = matchAll[0] || '';
    if (first.trim().startsWith('-')) {
      return -1;
    }
    if (first.trim().startsWith('+')) {
      return 1;
    }
    if (orientationSign !== null) {
      return orientationSign;
    }
    return 1;
  };

  let decimal: number | null = null;

  if (treatAsDms) {
    const degrees = toDecimal(matchAll[0]);
    if (!Number.isFinite(degrees)) {
      return null;
    }
    const minutes = matchAll[1] ? toDecimal(matchAll[1]) : 0;
    const seconds = matchAll[2] ? toDecimal(matchAll[2]) : 0;
    if ([minutes, seconds].some((component) => Number.isNaN(component))) {
      return null;
    }

    const absDegrees = Math.abs(degrees);
    const absMinutes = Math.abs(minutes);
    const absSeconds = Math.abs(seconds);

    const magnitude = absDegrees + absMinutes / 60 + absSeconds / 3600;
    const sign = resolveSign();
    decimal = magnitude * sign;
  } else {
    const parsed = toDecimal(matchAll[0]);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const sign = resolveSign();
    decimal = Math.abs(parsed) * sign;
  }

  if (decimal === null || !Number.isFinite(decimal)) {
    return null;
  }

  if (Math.abs(decimal) > limit) {
    return null;
  }

  let normalized = Number(decimal.toFixed(8));
  if (!Number.isFinite(normalized)) {
    return null;
  }

  if (Object.is(normalized, -0)) {
    normalized = 0;
  }

  return normalized.toString();
};

const normalizeOptionalTextField = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text || undefined;
};

const normalizeTextField = (value: unknown, fallback = ''): string => {
  return normalizeOptionalTextField(value) ?? fallback;
};

const parseDurationToSeconds = (duration: string): number => {
  const normalized = duration.trim().toLowerCase();
  if (!normalized) return 0;

  // Support formats such as "1h 20m 5s" or "2m30s"
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
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts as [number, number, number];
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const [first, second] = parts;
    // Prefer minutes:seconds when the first part is in minute range
    if (first >= 0 && first < 60 && second < 60) {
      return first * 60 + second;
    }
    // Fallback to hours:minutes otherwise
    return first * 3600 + second * 60;
  }

  if (parts.length === 1) {
    return Math.max(parts[0], 0);
  }

  return 0;
};

const normalizeDateParam = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCallDurationInSeconds = (record: Record<string, unknown>): number => {
  const durationValue = normalizeOptionalTextField(record.duration);
  if (durationValue) {
    const seconds = parseDurationToSeconds(durationValue);
    if (seconds > 0) {
      return seconds;
    }
  }

  const callDate = normalizeOptionalTextField(record.callDate) ?? '';
  const endDate = normalizeOptionalTextField(record.endDate) ?? callDate;
  const startTime = normalizeOptionalTextField(record.startTime);
  const endTime = normalizeOptionalTextField(record.endTime);

  if (callDate && startTime && endTime) {
    const start = new Date(`${callDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    const diffMs = end.getTime() - start.getTime();
    if (Number.isFinite(diffMs) && diffMs > 0) {
      return Math.round(diffMs / 1000);
    }
  }

  return 0;
};

const formatSecondsAsDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '-';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 && hrs === 0) parts.push(`${secs}s`);

  return parts.length > 0 ? parts.join(' ') : '-';
};

const normalizeCdrContactFields = (
  point: unknown,
  trackedId: string
): CdrContactCandidate | null => {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const tracked = normalizeOptionalTextField((point as Record<string, unknown>).tracked) ?? trackedId;
  const caller = normalizeOptionalTextField(getFirstDefinedValue(point, CALLER_FIELD_CANDIDATES));
  const callee = normalizeOptionalTextField(getFirstDefinedValue(point, CALLEE_FIELD_CANDIDATES));
  const number = normalizeOptionalTextField((point as Record<string, unknown>).number) ?? caller ?? tracked;
  const type = normalizeTextField(getFirstDefinedValue(point, TYPE_FIELD_CANDIDATES), '');

  return { tracked, caller, callee, number, type, rawRecord: point as Record<string, unknown> };
};

const normalizeCdrPointFields = (point: unknown, trackedId: string): CdrPoint | null => {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const latitude = normalizeCoordinateField(
    getFirstDefinedValue(point, LATITUDE_FIELD_CANDIDATES),
    'latitude'
  );
  const longitude = normalizeCoordinateField(
    getFirstDefinedValue(point, LONGITUDE_FIELD_CANDIDATES),
    'longitude'
  );

  if (!latitude || !longitude) {
    return null;
  }

  const record = point as Record<string, unknown>;
  const caller = normalizeOptionalTextField(
    getFirstDefinedValue(point, CALLER_FIELD_CANDIDATES)
  );
  const callee = normalizeOptionalTextField(
    getFirstDefinedValue(point, CALLEE_FIELD_CANDIDATES)
  );
  const eventType = normalizeTextField(
    getFirstDefinedValue(point, TYPE_FIELD_CANDIDATES),
    ''
  );

  const normalized: CdrPoint = {
    latitude,
    longitude,
    nom: normalizeTextField(getFirstDefinedValue(point, NOM_FIELD_CANDIDATES), ''),
    type: eventType,
    direction: normalizeTextField(record.direction, ''),
    number: normalizeOptionalTextField(record.number),
    caller,
    callee,
    callDate: normalizeTextField(record.callDate, ''),
    startTime: normalizeTextField(record.startTime, ''),
    endTime: normalizeTextField(record.endTime, ''),
    duration: normalizeOptionalTextField(record.duration),
    imsiCaller: normalizeOptionalTextField(record.imsiCaller),
    imeiCaller: normalizeOptionalTextField(record.imeiCaller),
    imeiCalled: normalizeOptionalTextField(record.imeiCalled),
    source: undefined,
    tracked: trackedId,
    cgi: normalizeOptionalTextField(record.cgi),
    azimut: normalizeOptionalTextField(getFirstDefinedValue(point, AZIMUT_FIELD_CANDIDATES))
  };

  const endDate = normalizeOptionalTextField(record.endDate);
  if (endDate) {
    normalized.endDate = endDate;
  }

  if (!normalized.caller && caller) {
    normalized.caller = caller;
  }

  if (!normalized.callee && callee) {
    normalized.callee = callee;
  }

  if (!normalized.number) {
    normalized.number = normalized.caller ?? normalized.tracked ?? undefined;
  }

  if (!normalized.callDate) {
    const fallbackDate = normalizeOptionalTextField(
      record.date_debut_appel ?? record.date
    );
    if (fallbackDate) {
      normalized.callDate = fallbackDate;
    }
  }

  if (!normalized.startTime) {
    const fallbackStart = normalizeOptionalTextField(
      record.start_time ?? record.heure_debut_appel
    );
    if (fallbackStart) {
      normalized.startTime = fallbackStart;
    }
  }

  if (!normalized.endTime) {
    const fallbackEnd = normalizeOptionalTextField(
      record.end_time ?? record.heure_fin_appel
    );
    if (fallbackEnd) {
      normalized.endTime = fallbackEnd;
    }
  }

  const explicitSource = normalizeOptionalTextField(record.source);
  if (explicitSource) {
    normalized.source = explicitSource;
  } else {
    normalized.source = caller || trackedId;
  }

  const explicitTracked = normalizeOptionalTextField(record.tracked);
  if (explicitTracked) {
    normalized.tracked = explicitTracked;
  }

  if (!normalized.direction) {
    const fallbackDirection = normalizeOptionalTextField(record.sens);
    if (fallbackDirection) {
      normalized.direction = fallbackDirection;
    }
  }

  const normalizedDirection = normalizeOptionalTextField(normalized.direction)?.toLowerCase();
  if (normalizedDirection === 'sortant') {
    normalized.direction = 'outgoing';
  } else if (normalizedDirection === 'entrant') {
    normalized.direction = 'incoming';
  }

  if (!normalized.type) {
    const fallbackType = normalizeOptionalTextField(record.event_type);
    if (fallbackType) {
      normalized.type = fallbackType;
    }
  }

  const normalizedType = normalizeOptionalTextField(normalized.type)?.toLowerCase();
  if (normalizedType) {
    normalized.type = normalizedType;
  }

  if (normalizedType === 'audio') {
    const trackedDigits = normalizePhoneDigits(normalized.tracked);
    const callerDigits = normalizePhoneDigits(normalized.caller);
    const calleeDigits = normalizePhoneDigits(normalized.callee);

    if (trackedDigits && callerDigits && trackedDigits === callerDigits) {
      normalized.direction = 'outgoing';
    } else if (trackedDigits && calleeDigits && trackedDigits === calleeDigits) {
      normalized.direction = 'incoming';
    } else if (!normalized.direction) {
      normalized.direction = 'outgoing';
    }
  }

  const seqNumber = normalizeOptionalTextField(record.seqNumber ?? record.seq_number);
  if (seqNumber !== undefined) {
    normalized.seqNumber = seqNumber;
  }

  const callStatus = normalizeOptionalTextField(record.callStatus ?? record.statut_appel);
  if (callStatus !== undefined) {
    normalized.callStatus = callStatus;
  }

  const releaseCause = normalizeOptionalTextField(
    record.releaseCause ?? record.cause_liberation
  );
  if (releaseCause !== undefined) {
    normalized.releaseCause = releaseCause;
  }

  const billing = normalizeOptionalTextField(record.billing ?? record.facturation);
  if (billing !== undefined) {
    normalized.billing = billing;
  }

  const networkRoute = normalizeOptionalTextField(
    record.networkRoute ?? record.route_reseau
  );
  if (networkRoute !== undefined) {
    normalized.networkRoute = networkRoute;
  }

  const deviceId = normalizeOptionalTextField(record.deviceId ?? record.device_id);
  if (deviceId !== undefined) {
    normalized.deviceId = deviceId;
  }

  const sourceFile = normalizeOptionalTextField(record.sourceFile ?? record.source_file);
  if (sourceFile !== undefined) {
    normalized.sourceFile = sourceFile;
  }

  const insertedAt = normalizeOptionalTextField(record.insertedAt ?? record.inserted_at);
  if (insertedAt !== undefined) {
    normalized.insertedAt = insertedAt;
  }

  return normalized;
};

interface CdrCase {
  id: number;
  name: string;
  created_at?: string;
  user_login?: string;
  division_id?: number;
  division_name?: string | null;
  is_owner?: number | boolean;
  shared_user_ids?: number[];
  shared_with_me?: boolean;
}


interface FraudFileInfo {
  id: number;
  filename: string;
  uploaded_at: string;
  line_count: number;
  cdr_number: string | null;
}

interface FraudNumberEntry {
  number: string;
  firstSeen: string | null;
  lastSeen: string | null;
  occurrences: number;
  roles: string[];
  files: FraudFileInfo[];
  status: 'nouveau' | 'attendu';
}

interface FraudImeiEntry {
  imei: string;
  numbers: FraudNumberEntry[];
}

interface FraudDetectionResult {
  imeis: FraudImeiEntry[];
  updatedAt: string;
}

interface GlobalFraudCaseInfo {
  id: number;
  name: string;
  owner?: string | null;
  division?: string | null;
}

interface GlobalFraudNumberEntry {
  number: string;
  firstSeen: string | null;
  lastSeen: string | null;
  occurrences: number;
  roles: string[];
  cases: GlobalFraudCaseInfo[];
}

interface GlobalFraudImeiEntry {
  imei: string;
  numbers: GlobalFraudNumberEntry[];
  roleSummary: {
    caller: number;
    callee: number;
  };
  cases: GlobalFraudCaseInfo[];
}

interface GlobalFraudNumberImeiEntry {
  imei: string;
  firstSeen: string | null;
  lastSeen: string | null;
  occurrences: number;
  roles: string[];
  cases: GlobalFraudCaseInfo[];
}

interface GlobalFraudNumberAlert {
  number: string;
  imeis: GlobalFraudNumberImeiEntry[];
  roleSummary: {
    caller: number;
    callee: number;
  };
  cases: GlobalFraudCaseInfo[];
}

interface GlobalFraudDetectionResult {
  imeis: GlobalFraudImeiEntry[];
  numbers: GlobalFraudNumberAlert[];
  updatedAt: string;
}

type MonitoringType = 'number' | 'imei';

interface FraudMonitoringTarget {
  id: string;
  type: MonitoringType;
  value: string;
  knownPeers: string[];
  createdAt: string;
  createdById?: number;
  createdByLogin?: string;
  lastAlertAt?: string;
}

interface FraudMonitoringAlert {
  id: string;
  targetId: string;
  targetType: MonitoringType;
  targetValue: string;
  createdAt: string;
  newPeers: string[];
}

interface FraudMonitoringStorageEntry {
  userId?: number;
  targets: FraudMonitoringTarget[];
  alerts: FraudMonitoringAlert[];
}

type FraudMonitoringStorage = Record<string, FraudMonitoringStorageEntry>;

interface GraphNode {
  id: string;
  type: string;
}

interface GraphLink {
  source: string;
  target: string;
  callCount: number;
  smsCount: number;
}

interface LinkDiagramData {
  nodes: GraphNode[];
  links: GraphLink[];
  root?: string | null;
}

interface BlacklistEntry {
  id: number;
  number: string;
  created_at: string;
}

interface ImeiCheckObject {
  brand?: string;
  name?: string;
  model?: string;
}

interface ImeiCheckResult {
  status?: string;
  result?: string;
  imei?: string;
  count_free_checks_today?: number;
  object?: ImeiCheckObject;
  error?: string;
}

const IMEICHECK_API_KEY = 'F06A-ED7C-BE0F-C912-1C69-28KX';

const isImeiCheckSuccess = (data?: ImeiCheckResult | null): boolean => {
  if (!data) {
    return false;
  }

  const status = data.status?.toLowerCase() ?? '';
  return status.startsWith('succes') || status.startsWith('success') || status === 'ok';
};

const mapImeiCheckToInfo = (
  data?: ImeiCheckResult | null
): PhoneIdentifierDevice['imeiInfo'] | null => {
  if (!data) {
    return null;
  }

  const payload = data.object ?? {};
  const brand = payload.brand?.trim() || '';
  const model = payload.model?.trim() || '';
  const name = payload.name?.trim() || '';
  const resultText = data.result?.trim() || '';
  const fallbackName = [brand, model].filter(Boolean).join(' ').trim();
  const displayName = name || resultText || fallbackName;
  const hasDetails = Boolean(brand || model || displayName);

  if (isImeiCheckSuccess(data) || hasDetails) {
    return {
      brand,
      model,
      name: displayName,
      status: data.status,
      result: data.result
    };
  }

  return {
    brand,
    model,
    name: displayName,
    status: data.status,
    result: data.result,
    error: data.error || data.result || "La vérification n'a pas abouti."
  };
};

const fetchImeiCheckDetails = async (imei: string): Promise<ImeiCheckResult> => {
  const imeiCheckParams = new URLSearchParams({
    key: IMEICHECK_API_KEY,
    imei,
    format: 'json'
  });

  const response = await fetch(
    `https://alpha.imeicheck.com/api/free_with_key/modelBrandName?${imeiCheckParams.toString()}`
  );

  const data: ImeiCheckResult = await response.json();

  if (!response.ok) {
    throw new Error(data.result || data.error || "Impossible de vérifier cet IMEI pour le moment.");
  }

  return { ...data, imei };
};

const App: React.FC = () => {
  const { notifySuccess, notifyError, notifyWarning, notifyInfo } = useNotifications();
  const { currentPage, navigateToPage } = usePageNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  // États principaux
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [logoutReason, setLogoutReason] = useState<'inactivity' | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fraudMenuOpen, setFraudMenuOpen] = useState(false);
  const [btsMenuOpen, setBtsMenuOpen] = useState(false);
  const [btsProvider, setBtsProvider] = useState<BtsProvider>('orange');
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const isFraudPage = currentPage === 'fraud-detection-form' || currentPage === 'fraud-monitoring';
  const isBtsPage = currentPage === 'bts';

  useEffect(() => {
    if (isFraudPage) {
      setFraudMenuOpen(true);
    }
  }, [isFraudPage]);

  useEffect(() => {
    if (isBtsPage) {
      setBtsMenuOpen(true);
    }
  }, [isBtsPage]);

  useEffect(() => {
    if (!isAuthenticated && currentPage !== 'login') {
      navigateToPage('login', { replace: true });
    }
  }, [isAuthenticated, currentPage, navigateToPage]);

  const formatImeiResultText = useCallback((value?: string) => {
    if (!value) return '';

    return value
      .replace(/<br>/gi, '\n')
      .replace(/Model Name/gi, 'Nom du modèle')
      .replace(/\bBrand\b/gi, 'Marque')
      .replace(/\bModel\b/gi, 'Modèle')
      .trim();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setShowScrollTop(false);
      return;
    }

    const element = mainContentRef.current;
    if (!element) return;

    const handleScroll = () => {
      setShowScrollTop(element.scrollTop > 320);
    };

    handleScroll();
    element.addEventListener('scroll', handleScroll);

    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [isAuthenticated, currentPage]);

  const handleScrollToTop = useCallback(() => {
    const element = mainContentRef.current;
    if (element) {
      element.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // États de recherche
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [displayedHits, setDisplayedHits] = useState<SearchResult[]>([]);
  const [isProgressiveLoading, setIsProgressiveLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef<{ query: string; page: number; limit: number } | null>(null);
  const historySearchRef = useRef<(query: string) => void>(() => {});
  const {
    searchHistory,
    isHistoryOpen,
    setIsHistoryOpen,
    containerRef: searchHistoryContainerRef,
    visibleHistoryEntries,
    hasMoreHistoryEntries,
    addToSearchHistory,
    clearSearchHistory,
    removeSearchHistoryEntry,
    handleHistorySelection,
    getHistoryRelativeLabel
  } = useSearchHistory({ onSelect: (query) => historySearchRef.current(query) });
  const [hasAppliedInitialRoute, setHasAppliedInitialRoute] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'profile'>('list');
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [blacklistNumber, setBlacklistNumber] = useState('');
  const [blacklistError, setBlacklistError] = useState('');
  const [blacklistFile, setBlacklistFile] = useState<File | null>(null);
  const [blacklistPage, setBlacklistPage] = useState(1);
  const [blacklistPerPage, setBlacklistPerPage] = useState(10);
  const [logsData, setLogsData] = useState<any[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const LOGS_LIMIT = 20;
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionLoading, setSessionLoading] = useState(false);

  const [imeiInput, setImeiInput] = useState('');
  const [imeiResult, setImeiResult] = useState<ImeiCheckResult | null>(null);
  const [imeiError, setImeiError] = useState('');
  const [imeiLoading, setImeiLoading] = useState(false);

  const [phoneIdentifierInput, setPhoneIdentifierInput] = useState('');
  const [phoneIdentifierResult, setPhoneIdentifierResult] = useState<PhoneIdentifierResult | null>(null);
  const [phoneIdentifierLoading, setPhoneIdentifierLoading] = useState(false);
  const [phoneIdentifierError, setPhoneIdentifierError] = useState('');

  const displayedResultsCount = displayedHits.length;
  const totalResultsCount = searchResults?.total ?? searchResults?.hits?.length ?? 0;
  const resultsCountLabel =
    totalResultsCount > displayedResultsCount
      ? `${displayedResultsCount} résultat(s) sur ${totalResultsCount}`
      : `${displayedResultsCount} résultat(s)`;

  const resetProgressiveDisplay = useCallback(() => {
    if (progressiveTimerRef.current) {
      clearTimeout(progressiveTimerRef.current);
      progressiveTimerRef.current = null;
    }
    setDisplayedHits([]);
    setIsProgressiveLoading(false);
  }, []);

  const progressivelyDisplayHits = useCallback(
    (hitsToAdd: SearchResult[], options?: { reset?: boolean }) => {
      if (progressiveTimerRef.current) {
        clearTimeout(progressiveTimerRef.current);
        progressiveTimerRef.current = null;
      }

      const shouldReset = options?.reset ?? false;

      setDisplayedHits((prev) => {
        if (shouldReset) {
          return [...hitsToAdd];
        }

        if (hitsToAdd.length === 0) {
          return prev;
        }

        return [...prev, ...hitsToAdd];
      });

      setIsProgressiveLoading(false);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (progressiveTimerRef.current) {
        clearTimeout(progressiveTimerRef.current);
      }
    };
  }, []);

  const createAuthHeaders = (
    headers: Record<string, string> = {},
    options: { includeToken?: boolean } = {}
  ): Record<string, string> => {
    const sanitized: Record<string, string> = { ...headers };

    if (options.includeToken === false) {
      delete sanitized.Authorization;
      return sanitized;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    if (token) {
      sanitized.Authorization = `Bearer ${token}`;
    } else {
      delete sanitized.Authorization;
    }

    return sanitized;
  };
  const criticalAlertCount = useMemo(() => {
    return logsData.reduce((count: number, log: any) => {
      if (!log) return count;

      let parsedDetails: Record<string, unknown> = {};
      if (typeof log.details === 'string') {
        try {
          parsedDetails = JSON.parse(log.details);
        } catch {
          parsedDetails = {};
        }
      } else if (log.details && typeof log.details === 'object') {
        parsedDetails = log.details as Record<string, unknown>;
      }

      const isAlert =
        log.action === 'blacklist_search_attempt' || parsedDetails.alert === true;

      return isAlert ? count + 1 : count;
    }, 0);
  }, [logsData]);

  const lastLogUpdateLabel = useMemo(() => {
    if (!logsData.length) return null;

    let latest: Date | null = null;

    logsData.forEach((log) => {
      if (!log?.created_at) return;
      try {
        const parsed = parseISO(log.created_at);
        if (Number.isNaN(parsed.getTime())) return;
        if (!latest || parsed > latest) {
          latest = parsed;
        }
      } catch {
        // Ignore parsing errors
      }
    });

    if (!latest) return null;

    try {
      return format(latest, 'Pp', { locale: fr });
    } catch {
      return latest.toLocaleString('fr-FR');
    }
  }, [logsData]);
  interface ExtraField {
    key: string;
    value: string;
  }
  interface FieldCategory {
    title: string;
    fields: ExtraField[];
  }
  const toFieldValue = (input: unknown): string => {
    if (input === null || input === undefined) {
      return '';
    }
    return typeof input === 'string' ? input : String(input);
  };

  const normalizeProfileExtraFields = (raw: unknown): FieldCategory[] => {
    const toFieldArray = (input: unknown): ExtraField[] => {
      if (Array.isArray(input)) {
        return input.map((field) => ({
          key: typeof field?.key === 'string' ? field.key : '',
          value: toFieldValue(field?.value)
        }));
      }
      if (input && typeof input === 'object') {
        return Object.entries(input as Record<string, unknown>).map(([key, value]) => ({
          key: typeof key === 'string' ? key : String(key),
          value: toFieldValue(value)
        }));
      }
      return [];
    };

    if (!raw) {
      return [];
    }
    if (typeof raw === 'string') {
      try {
        return normalizeProfileExtraFields(JSON.parse(raw));
      } catch {
        return [];
      }
    }
    if (Array.isArray(raw)) {
      return raw.map((item) => ({
        title: typeof item?.title === 'string' ? item.title : '',
        fields: toFieldArray(item?.fields)
      }));
    }
    if (typeof raw === 'object') {
      const entries = Object.entries(raw as Record<string, unknown>);
      if (!entries.length) {
        return [];
      }
      return [
        {
          title: 'Informations',
          fields: entries.map(([key, value]) => ({
            key: typeof key === 'string' ? key : String(key),
            value: toFieldValue(value)
          }))
        }
      ];
    }
    return [];
  };

  const ensureEditableCategories = (categories: FieldCategory[]): FieldCategory[] => {
    if (!categories.length) {
      return [
        {
          title: 'Informations',
          fields: [{ key: '', value: '' }]
        }
      ];
    }
    return categories.map((category) => ({
      title: typeof category.title === 'string' ? category.title : '',
      fields:
        Array.isArray(category.fields) && category.fields.length
          ? category.fields.map((field) => ({
              key: typeof field.key === 'string' ? field.key : '',
              value: toFieldValue(field.value)
            }))
          : [{ key: '', value: '' }]
    }));
  };

  const upsertField = (
    categories: FieldCategory[],
    label: string,
    value: unknown,
    options: { includeWhenEmpty?: boolean; matchLabels?: string[] } = {}
  ): FieldCategory[] => {
    const targets = new Set(
      [label, ...(options.matchLabels ?? [])]
        .map((target) => target.trim().toLowerCase())
        .filter(Boolean)
    );
    let found = false;
    const updated = categories.map((category) => ({
      ...category,
      fields: category.fields.map((field) => {
        const normalizedKey = (field.key || '').trim().toLowerCase();
        if (targets.has(normalizedKey)) {
          found = true;
          return {
            key: field.key || label,
            value: toFieldValue(value)
          };
        }
        return field;
      })
    }));
    if (found) {
      return updated;
    }
    const shouldAdd = options.includeWhenEmpty ? value !== undefined : Boolean(value);
    if (!shouldAdd) {
      return updated;
    }
    if (!updated.length) {
      return [
        {
          title: 'Informations',
          fields: [{ key: label, value: toFieldValue(value) }]
        }
      ];
    }
    const [first, ...rest] = updated;
    const placeholderIndex = first.fields.findIndex((field) => {
      const key = (field.key || '').trim();
      const fieldValue = (field.value || '').trim();
      return key === '' && fieldValue === '';
    });
    const newField = { key: label, value: toFieldValue(value) };
    if (placeholderIndex !== -1) {
      const newFields = [...first.fields];
      newFields[placeholderIndex] = newField;
      return [{ ...first, fields: newFields }, ...rest];
    }
    return [{ ...first, fields: [...first.fields, newField] }, ...rest];
  };
  const [profileDefaults, setProfileDefaults] = useState<{
    comment?: string;
    extra_fields?: FieldCategory[];
    photo_path?: string | null;
    attachments?: { id: number; original_name: string | null; file_path: string }[];
    folder_id?: number | null;
  }>({});
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileFormFolderId, setProfileFormFolderId] = useState<number | null>(null);

  // États des demandes d'identification
  const [requests, setRequests] = useState<IdentificationRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [identifyingRequest, setIdentifyingRequest] = useState<IdentificationRequest | null>(null);
  const [readNotifications, setReadNotifications] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [highlightedRequestId, setHighlightedRequestId] = useState<number | null>(null);
  const [serverNotifications, setServerNotifications] = useState<ServerNotification[]>([]);
  const isAdmin = useMemo(
    () => (currentUser ? currentUser.admin === 1 || currentUser.admin === "1" : false),
    [currentUser]
  );
  const [hiddenRequestIds, setHiddenRequestIds] = useState<number[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setReadNotifications([]);
      setServerNotifications([]);
      return;
    }
    try {
      const stored = localStorage.getItem(`readNotifications_${currentUser.login}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setReadNotifications(parsed.map((value: string | number) => String(value)));
        } else {
          setReadNotifications([]);
        }
      } else {
        setReadNotifications([]);
      }
    } catch {
      setReadNotifications([]);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    try {
      localStorage.setItem(`readNotifications_${currentUser.login}`, JSON.stringify(readNotifications));
    } catch {
      // Ignore write errors (e.g., private browsing)
    }
  }, [readNotifications, currentUser]);

  useEffect(() => {
    if (!isAdmin || !currentUser) {
      setHiddenRequestIds([]);
      return;
    }
    try {
      const stored = localStorage.getItem(`hiddenRequests_${currentUser.login}`);
      if (!stored) {
        setHiddenRequestIds([]);
        return;
      }
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const sanitized = parsed
          .map((value: unknown) => {
            const numeric = typeof value === 'string' ? Number(value) : value;
            return typeof numeric === 'number' && Number.isFinite(numeric)
              ? Math.trunc(numeric)
              : null;
          })
          .filter((value): value is number => value !== null);
        setHiddenRequestIds(sanitized);
      } else {
        setHiddenRequestIds([]);
      }
    } catch {
      setHiddenRequestIds([]);
    }
  }, [isAdmin, currentUser]);

  useEffect(() => {
    if (!isAdmin || !currentUser) return;
    try {
      localStorage.setItem(
        `hiddenRequests_${currentUser.login}`,
        JSON.stringify(hiddenRequestIds)
      );
    } catch {
      // Ignore persistence errors
    }
  }, [hiddenRequestIds, isAdmin, currentUser]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIdentifyingRequest(null);
      }
    };

    if (identifyingRequest) {
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [identifyingRequest]);

  const [requestSearchInput, setRequestSearchInput] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestPage, setRequestPage] = useState(1);
  const [requestsPerPage, setRequestsPerPage] = useState(10);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'all' | 'identified' | 'in-progress'>('all');

  const visibleRequests = useMemo(() => {
    let base = requests;
    if (!isAdmin && currentUser) {
      const userId = currentUser.id;
      const userLogin = currentUser.login;
      base = base.filter(
        (r) => r.user_id === userId || r.user_login === userLogin
      );
    }
    if (isAdmin && hiddenRequestIds.length > 0) {
      const hiddenSet = new Set(hiddenRequestIds);
      base = base.filter((r) => !hiddenSet.has(r.id));
    }
    if (requestStatusFilter === 'identified') {
      base = base.filter((r) => r.status === 'identified');
    } else if (requestStatusFilter === 'in-progress') {
      base = base.filter((r) => r.status !== 'identified');
    }
    const trimmedSearch = requestSearch.trim();
    if (!trimmedSearch) {
      return base;
    }
    const lowered = trimmedSearch.toLowerCase();
    return base.filter((request) =>
      getSearchableValues(request).some((value) => value.toLowerCase().includes(lowered))
    );
  }, [requests, isAdmin, currentUser, hiddenRequestIds, requestSearch, requestStatusFilter]);

  const totalRequestPages = Math.ceil(visibleRequests.length / requestsPerPage);
  const paginatedRequests = useMemo(
    () =>
      visibleRequests.slice(
        (requestPage - 1) * requestsPerPage,
        requestPage * requestsPerPage
      ),
    [visibleRequests, requestPage, requestsPerPage]
  );

  const requestStats = useMemo(() => {
    const total = visibleRequests.length;
    const identified = visibleRequests.filter((r) => r.status === 'identified').length;
    const inProgress = visibleRequests.filter((r) => r.status !== 'identified').length;
    const identificationRate = total > 0 ? Math.round((identified / total) * 100) : 0;
    return { total, identified, inProgress, identificationRate };
  }, [visibleRequests]);

  const totalBlacklistPages = Math.max(
    1,
    Math.ceil(blacklist.length / Math.max(blacklistPerPage, 1))
  );

  const paginatedBlacklist = useMemo(
    () => {
      const size = Math.max(blacklistPerPage, 1);
      const start = (blacklistPage - 1) * size;
      return blacklist.slice(start, start + size);
    },
    [blacklist, blacklistPage, blacklistPerPage]
  );

  // Ensure the current request page is within bounds when the filtered
  // results change. Otherwise, a shrinking dataset can leave the user on an
  // out-of-range page with no navigation controls.
  useEffect(() => {
    setRequestPage(p => Math.min(p, Math.max(totalRequestPages, 1)));
  }, [totalRequestPages]);

  useEffect(() => {
    setBlacklistPage(page => Math.min(page, Math.max(totalBlacklistPages, 1)));
  }, [totalBlacklistPages]);

  const identifyingInitialValues = useMemo(
    () => ({
      extra_fields: [
        {
          title: 'Informations',
          fields: [{ key: 'Téléphone', value: identifyingRequest?.phone || '' }]
        }
      ]
    }),
    [identifyingRequest?.phone]
  );

  // États d'authentification
  const [loginData, setLoginData] = useState({ login: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginInfo, setLoginInfo] = useState('');

  // États de gestion des utilisateurs
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    login: '',
    password: '',
    admin: 0,
    active: 1,
    divisionId: 0
  });
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(null);
  const [divisions, setDivisions] = useState<DivisionEntry[]>([]);
  const [newDivisionName, setNewDivisionName] = useState('');
  const [creatingDivision, setCreatingDivision] = useState(false);
  const [deletingDivisionId, setDeletingDivisionId] = useState<number | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [uploadTable, setUploadTable] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const openCreateProfile = (
    data: BulkProfilePrefillData & {
      extra_fields?: Record<string, string> | FieldCategory[];
    } = {},
    folderId?: number | null
  ) => {
    const rawExtra = data.extra_fields;
    let categories: FieldCategory[];
    if (Array.isArray(rawExtra)) {
      categories = ensureEditableCategories(rawExtra);
    } else {
      categories = ensureEditableCategories(
        normalizeProfileExtraFields(rawExtra || {})
      );
    }
    if (data.email) {
      categories = upsertField(categories, 'Email', data.email, { matchLabels: ['email'] });
    }
    if (data.phone) {
      categories = upsertField(categories, 'Téléphone', data.phone, {
        matchLabels: ['téléphone', 'telephone', 'phone']
      });
    }
    if (data.first_name) {
      categories = upsertField(categories, 'Prénom', data.first_name, {
        matchLabels: ['prénom', 'prenom', 'first name']
      });
    }
    if (data.last_name) {
      categories = upsertField(categories, 'Nom', data.last_name, {
        matchLabels: ['nom', 'last name']
      });
    }
    setProfileDefaults({
      comment: data.comment || '',
      extra_fields: categories,
      photo_path: null,
      attachments: [],
      folder_id: folderId ?? null
    });
    setProfileFormFolderId(folderId ?? null);
    setEditingProfileId(null);
    setShowProfileForm(true);
    navigateToPage('profiles');
  };

  const openEditProfile = async (id: number) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/profiles/${id}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : ''
      }
    });
    const data = await res.json();
    if (res.ok && data.profile) {
      const profile = data.profile;
      let extras = ensureEditableCategories(
        normalizeProfileExtraFields(profile.extra_fields)
      );
      extras = upsertField(extras, 'Email', profile.email, {
        includeWhenEmpty: Boolean(profile.email),
        matchLabels: ['email']
      });
      extras = upsertField(extras, 'Téléphone', profile.phone, {
        includeWhenEmpty: Boolean(profile.phone),
        matchLabels: ['téléphone', 'telephone', 'phone']
      });
      extras = upsertField(extras, 'Prénom', profile.first_name, {
        includeWhenEmpty: Boolean(profile.first_name),
        matchLabels: ['prénom', 'prenom', 'first name']
      });
      extras = upsertField(extras, 'Nom', profile.last_name, {
        includeWhenEmpty: Boolean(profile.last_name),
        matchLabels: ['nom', 'last name']
      });
      setProfileFormFolderId(profile.folder_id ?? null);
      setProfileDefaults({
        comment: profile.comment || '',
        extra_fields: extras,
        photo_path: profile.photo_path || null,
        attachments: Array.isArray(profile.attachments) ? profile.attachments : [],
        folder_id: profile.folder_id ?? null
      });
      setEditingProfileId(id);
      setShowProfileForm(true);
      navigateToPage('profiles');
      logPageVisit('profile', { profile_id: id });
    }
  };
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [uploadHistoryPage, setUploadHistoryPage] = useState(1);
  const [uploadHistoryPerPage, setUploadHistoryPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
  const totalUploadHistoryPages = Math.ceil(uploadHistory.length / uploadHistoryPerPage) || 1;
  const paginatedUploadHistory = useMemo(
    () =>
      uploadHistory.slice(
        (uploadHistoryPage - 1) * uploadHistoryPerPage,
        uploadHistoryPage * uploadHistoryPerPage
      ),
    [uploadHistory, uploadHistoryPage, uploadHistoryPerPage]
  );
  useEffect(() => {
    setUploadHistoryPage((page) => Math.min(page, Math.max(totalUploadHistoryPages, 1)));
  }, [totalUploadHistoryPages]);
  useEffect(() => {
    setUploadHistoryPage(1);
  }, [uploadHistoryPerPage]);

  const uploadSummary = useMemo(() => {
    if (!uploadHistory.length) {
      return {
        totalImports: 0,
        totalRows: 0,
        successRate: null as number | null,
        lastImportRelative: null as string | null,
        lastImportTable: null as string | null,
        lastImportUser: null as string | null,
        lastImportMode: null as string | null
      };
    }

    let totalRows = 0;
    let errorRows = 0;

    uploadHistory.forEach((item) => {
      const currentTotal =
        typeof item.total_rows === 'number'
          ? item.total_rows
          : typeof item.success_rows === 'number'
            ? item.success_rows
            : 0;
      totalRows += currentTotal;
      if (typeof item.error_rows === 'number') {
        errorRows += item.error_rows;
      }
    });

    const lastImport = uploadHistory[0];
    const lastImportDate = lastImport?.created_at ? parseISO(lastImport.created_at) : null;

    return {
      totalImports: uploadHistory.length,
      totalRows,
      successRate: totalRows > 0 ? Math.round(((totalRows - errorRows) / totalRows) * 100) : null,
      lastImportRelative: lastImportDate
        ? formatDistanceToNow(lastImportDate, { addSuffix: true, locale: fr })
        : null,
      lastImportTable: lastImport?.table_name ?? null,
      lastImportUser: lastImport?.username ?? null,
      lastImportMode: getUploadModeLabel(lastImport?.upload_mode)
    };
  }, [uploadHistory]);

  // États annuaire gendarmerie
  const [gendarmerieData, setGendarmerieData] = useState<GendarmerieEntry[]>([]);
  const [gendarmerieSearch, setGendarmerieSearch] = useState('');
  const [gendarmeriePage, setGendarmeriePage] = useState(1);
  const [gendarmerieLoading, setGendarmerieLoading] = useState(false);
  const [gendarmeriePerPage, setGendarmeriePerPage] = useState(10);

  // États ONG
  const [ongData, setOngData] = useState<OngEntry[]>([]);
  const [ongSearch, setOngSearch] = useState('');
  const [ongPage, setOngPage] = useState(1);
  const [ongLoading, setOngLoading] = useState(false);
  const [ongPerPage, setOngPerPage] = useState(10);

  // États entreprises
  const [entreprisesData, setEntreprisesData] = useState<EntrepriseEntry[]>([]);
  const [entreprisesSearch, setEntreprisesSearch] = useState('');
  const [entreprisesPage, setEntreprisesPage] = useState(1);
  const [entreprisesLoading, setEntreprisesLoading] = useState(false);
  const [entreprisesPerPage, setEntreprisesPerPage] = useState(10);
  const [entreprisesTotal, setEntreprisesTotal] = useState(0);

  const [vehiculesData, setVehiculesData] = useState<VehiculeEntry[]>([]);
  const [vehiculesSearch, setVehiculesSearch] = useState('');
  const [vehiculesPage, setVehiculesPage] = useState(1);
  const [vehiculesLoading, setVehiculesLoading] = useState(false);
  const [vehiculesPerPage, setVehiculesPerPage] = useState(10);
  const [vehiculesTotal, setVehiculesTotal] = useState(0);

  // États CDR
  const [cdrIdentifiers, setCdrIdentifiers] = useState<string[]>([]);
  const [cdrIdentifierInput, setCdrIdentifierInput] = useState('');
  const [cdrIdentifierType, setCdrIdentifierType] = useState<'phone' | 'imei'>('phone');
  const [cdrStart, setCdrStart] = useState('');
  const [cdrEnd, setCdrEnd] = useState('');
  const [cdrStartTime, setCdrStartTime] = useState('');
  const [cdrEndTime, setCdrEndTime] = useState('');
  const [cdrItinerary, setCdrItinerary] = useState(false);
  const [cdrResult, setCdrResult] = useState<CdrSearchResult | null>(null);
  const [cdrLoading, setCdrLoading] = useState(false);
  const [cdrError, setCdrError] = useState('');
  const [cdrInfoMessage, setCdrInfoMessage] = useState('');
  const [cdrSearchRequests, setCdrSearchRequests] = useState<string[]>([]);
  const [cdrCaseName, setCdrCaseName] = useState('');
  const [cdrCaseMessage, setCdrCaseMessage] = useState('');
  const [cdrExportNumber, setCdrExportNumber] = useState('');
  const [cdrExportStart, setCdrExportStart] = useState('');
  const [cdrExportEnd, setCdrExportEnd] = useState('');
  const [cdrExporting, setCdrExporting] = useState(false);
  const [cdrExportError, setCdrExportError] = useState('');
  const [cdrExportInfo, setCdrExportInfo] = useState('');
  const [showCaseExportModal, setShowCaseExportModal] = useState(false);
  const [caseExportTarget, setCaseExportTarget] = useState<CdrCase | null>(null);
  const [caseExportNumber, setCaseExportNumber] = useState('');
  const [cases, setCases] = useState<CdrCase[]>([]);
  const [renamingCaseId, setRenamingCaseId] = useState<number | null>(null);
  const [renamingCaseName, setRenamingCaseName] = useState('');
  const [renamingCaseError, setRenamingCaseError] = useState('');
  const [renamingCaseLoading, setRenamingCaseLoading] = useState(false);
  const [casePage, setCasePage] = useState(1);
  const [casesPerPage, setCasesPerPage] = useState(CASE_PAGE_SIZE_OPTIONS[0]);
  const totalCasePages = Math.ceil(cases.length / casesPerPage);
  const paginatedCases = useMemo(
    () =>
      cases.slice(
        (casePage - 1) * casesPerPage,
        casePage * casesPerPage
      ),
    [cases, casePage, casesPerPage]
  );
  const ownedCasesCount = useMemo(
    () => cases.filter((caseItem) => Boolean(caseItem.is_owner)).length,
    [cases]
  );
  const sharedCasesCount = useMemo(
    () =>
      cases.filter((caseItem) => !Boolean(caseItem.is_owner) && caseItem.shared_with_me).length,
    [cases]
  );
  useEffect(() => {
    setCasePage((page) => Math.min(page, Math.max(totalCasePages, 1)));
  }, [totalCasePages]);
  const [showCdrMap, setShowCdrMap] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CdrCase | null>(null);
  const [linkDiagram, setLinkDiagram] = useState<LinkDiagramData | null>(null);
  const [linkDiagramNumbers, setLinkDiagramNumbers] = useState<string[]>([]);
  const [linkDiagramNumberInput, setLinkDiagramNumberInput] = useState('');
  const [linkDiagramStart, setLinkDiagramStart] = useState('');
  const [linkDiagramEnd, setLinkDiagramEnd] = useState('');
  const [linkDiagramLoading, setLinkDiagramLoading] = useState(false);
  const [linkDiagramError, setLinkDiagramError] = useState('');
  const [linkDiagramInfo, setLinkDiagramInfo] = useState('');
  const [showMeetingPoints, setShowMeetingPoints] = useState(false);
  const [monitoringInput, setMonitoringInput] = useState('');
  const [monitoringType, setMonitoringType] = useState<MonitoringType>('number');
  const [monitoringTargets, setMonitoringTargets] = useState<FraudMonitoringTarget[]>([]);
  const [monitoringAlerts, setMonitoringAlerts] = useState<FraudMonitoringAlert[]>([]);
  const [fraudResult, setFraudResult] = useState<FraudDetectionResult | null>(null);
  const [fraudLoading, setFraudLoading] = useState(false);
  const [fraudError, setFraudError] = useState('');
  const [globalFraudIdentifier, setGlobalFraudIdentifier] = useState('');
  const [globalFraudIdentifierType, setGlobalFraudIdentifierType] = useState<'number' | 'imei'>('number');
  const [globalFraudStart, setGlobalFraudStart] = useState('');
  const [globalFraudEnd, setGlobalFraudEnd] = useState('');
  const [globalFraudLoading, setGlobalFraudLoading] = useState(false);
  const [globalFraudError, setGlobalFraudError] = useState('');
  const [globalFraudResult, setGlobalFraudResult] = useState<GlobalFraudDetectionResult | null>(null);

  const readMonitoringStorage = useCallback((): FraudMonitoringStorage => {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem(FRAUD_MONITORING_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as FraudMonitoringStorage;
      }
    } catch (error) {
      console.warn('Impossible de lire la configuration de surveillance:', error);
    }
    return {};
  }, []);

  const readStoredArray = useCallback((key: string) => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn(`Impossible de lire les données depuis ${key}:`, error);
      return [];
    }
  }, []);


  const sanitizeTargetsForUser = useCallback(
    (targets: unknown, user: User): FraudMonitoringTarget[] => {
      if (!Array.isArray(targets)) return [];
      return targets
        .filter((item): item is FraudMonitoringTarget =>
          item && typeof item === 'object' &&
          typeof (item as FraudMonitoringTarget).value === 'string' &&
          ((item as FraudMonitoringTarget).type === 'number' || (item as FraudMonitoringTarget).type === 'imei')
        )
        .filter((item) => {
          const matchesLogin = !item.createdByLogin || item.createdByLogin === user.login;
          const matchesId = !item.createdById || item.createdById === user.id;
          return matchesLogin && matchesId;
        })
        .map((item) => ({
          ...item,
          knownPeers: Array.isArray(item.knownPeers) ? item.knownPeers : [],
          createdById: item.createdById ?? user.id,
          createdByLogin: item.createdByLogin ?? user.login,
        }));
    },
    []
  );

  const sanitizeAlertsForUser = useCallback(
    (alerts: unknown, targets: FraudMonitoringTarget[]): FraudMonitoringAlert[] => {
      if (!Array.isArray(alerts)) return [];
      const targetIds = new Set(targets.map((target) => target.id));
      return alerts
        .filter((alert): alert is FraudMonitoringAlert =>
          alert && typeof alert === 'object' &&
          typeof (alert as FraudMonitoringAlert).targetValue === 'string' &&
          ((alert as FraudMonitoringAlert).targetType === 'number' || (alert as FraudMonitoringAlert).targetType === 'imei')
        )
        .filter((alert) => targetIds.has(alert.targetId))
        .map((alert) => ({
          ...alert,
          newPeers: Array.isArray(alert.newPeers) ? alert.newPeers : [],
        }))
        .slice(0, 40);
    },
    []
  );

  const loadMonitoringStateForUser = useCallback(
    (user: User) => {
      const storage = readMonitoringStorage();
      const storedEntry = storage[user.login];

      const legacyTargetKey = `fraudMonitoringTargets_${user.login}`;
      const legacyAlertKey = `fraudMonitoringAlerts_${user.login}`;

      const targetsFromStorage = sanitizeTargetsForUser(storedEntry?.targets, user);
      const alertsFromStorage = sanitizeAlertsForUser(storedEntry?.alerts, targetsFromStorage);

      if (targetsFromStorage.length > 0 || alertsFromStorage.length > 0) {
        return { targets: targetsFromStorage, alerts: alertsFromStorage };
      }

      const storedTargets = readStoredArray(legacyTargetKey);
      const legacyTargets = readStoredArray('fraudMonitoringTargets');
      const sourceTargets = storedTargets.length > 0 ? storedTargets : legacyTargets;
      const targets = sanitizeTargetsForUser(sourceTargets, user);

      const storedAlerts = readStoredArray(legacyAlertKey);
      const legacyAlerts = readStoredArray('fraudMonitoringAlerts');
      const sourceAlerts = storedAlerts.length > 0 ? storedAlerts : legacyAlerts;
      const alerts = sanitizeAlertsForUser(sourceAlerts, targets);

      if (storedTargets.length > 0 || storedAlerts.length > 0) {
        localStorage.removeItem(legacyTargetKey);
        localStorage.removeItem(legacyAlertKey);
      }
      if (legacyTargets.length > 0 || legacyAlerts.length > 0) {
        localStorage.removeItem('fraudMonitoringTargets');
        localStorage.removeItem('fraudMonitoringAlerts');
      }

      return { targets, alerts };
    },
    [readMonitoringStorage, readStoredArray, sanitizeAlertsForUser, sanitizeTargetsForUser]
  );

  const persistMonitoringStateForUser = useCallback(
    (user: User, targets: FraudMonitoringTarget[], alerts: FraudMonitoringAlert[]) => {
      if (typeof window === 'undefined') return;

      const storage = readMonitoringStorage();
      storage[user.login] = {
        userId: user.id,
        targets: sanitizeTargetsForUser(targets, user),
        alerts: sanitizeAlertsForUser(alerts, targets),
      };

      localStorage.setItem(FRAUD_MONITORING_STORAGE_KEY, JSON.stringify(storage));
    },
    [readMonitoringStorage, sanitizeAlertsForUser, sanitizeTargetsForUser]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!currentUser) {
      setMonitoringTargets([]);
      setMonitoringAlerts([]);
      return;
    }

    const { targets, alerts } = loadMonitoringStateForUser(currentUser);
    setMonitoringTargets(targets);
    setMonitoringAlerts(alerts);
  }, [currentUser, loadMonitoringStateForUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    persistMonitoringStateForUser(currentUser, monitoringTargets, monitoringAlerts);
  }, [currentUser, monitoringAlerts, monitoringTargets, persistMonitoringStateForUser]);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTargetCase, setShareTargetCase] = useState<CdrCase | null>(null);
  const [shareDivisionUsers, setShareDivisionUsers] = useState<CaseShareUser[]>([]);
  const [shareSelectedUserIds, setShareSelectedUserIds] = useState<number[]>([]);
  const [shareAllUsers, setShareAllUsers] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareOwnerId, setShareOwnerId] = useState<number | null>(null);
  const [pendingShareCaseId, setPendingShareCaseId] = useState<number | null>(null);
  const [showFolderShareModal, setShowFolderShareModal] = useState(false);
  const [folderShareTarget, setFolderShareTarget] = useState<{ id: number; name: string } | null>(null);
  const [folderShareUsers, setFolderShareUsers] = useState<ProfileShareUser[]>([]);
  const [folderShareSelectedIds, setFolderShareSelectedIds] = useState<number[]>([]);
  const [folderShareAll, setFolderShareAll] = useState(false);
  const [folderShareOwnerId, setFolderShareOwnerId] = useState<number | null>(null);
  const [folderShareMessage, setFolderShareMessage] = useState('');
  const [folderShareLoading, setFolderShareLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogOptions | null>(null);
  const openConfirmDialog = (options: ConfirmDialogOptions) => setConfirmDialog(options);
  const closeConfirmDialog = () => setConfirmDialog(null);
  const [profileListRefreshKey, setProfileListRefreshKey] = useState(0);
  const [highlightedProfileId, setHighlightedProfileId] = useState<number | null>(null);
  const [highlightedFolderId, setHighlightedFolderId] = useState<number | null>(null);
  const hasFraudSuspiciousNumbers = useMemo(() => {
    if (!fraudResult) return false;
    return fraudResult.imeis.some((entry) =>
      entry.numbers.some((number) => number.status === 'nouveau')
    );
  }, [fraudResult]);
  const fraudStats = useMemo(() => {
    if (!fraudResult) {
      return { totalImeis: 0, totalNumbers: 0, newNumbers: 0, expectedNumbers: 0 };
    }
    let totalNumbers = 0;
    let newNumbers = 0;
    fraudResult.imeis.forEach((entry) => {
      totalNumbers += entry.numbers.length;
      newNumbers += entry.numbers.filter((number) => number.status === 'nouveau').length;
    });
    return {
      totalImeis: fraudResult.imeis.length,
      totalNumbers,
      newNumbers,
      expectedNumbers: Math.max(0, totalNumbers - newNumbers)
    };
  }, [fraudResult]);
  const hasGlobalFraudImeiAlerts = useMemo(() => {
    if (!globalFraudResult) return false;
    return Array.isArray(globalFraudResult.imeis) && globalFraudResult.imeis.length > 0;
  }, [globalFraudResult]);
  const hasGlobalFraudNumberAlerts = useMemo(() => {
    if (!globalFraudResult) return false;
    return Array.isArray(globalFraudResult.numbers) && globalFraudResult.numbers.length > 0;
  }, [globalFraudResult]);
  const globalFraudStats = useMemo(() => {
    if (!globalFraudResult) {
      return { totalImeis: 0, totalNumbers: 0, alerts: 0 };
    }
    const imeiCountFromImeis = Array.isArray(globalFraudResult.imeis) ? globalFraudResult.imeis.length : 0;
    const imeiCountFromNumbers = Array.isArray(globalFraudResult.numbers)
      ? globalFraudResult.numbers.reduce((acc, entry) => acc + entry.imeis.length, 0)
      : 0;
    const numbersCountFromImeis = Array.isArray(globalFraudResult.imeis)
      ? globalFraudResult.imeis.reduce((acc, entry) => acc + entry.numbers.length, 0)
      : 0;
    const numbersCountFromNumbers = Array.isArray(globalFraudResult.numbers) ? globalFraudResult.numbers.length : 0;
    const alertCount = Math.max(numbersCountFromNumbers, imeiCountFromImeis);

    return {
      totalImeis: Math.max(imeiCountFromImeis, imeiCountFromNumbers),
      totalNumbers: Math.max(numbersCountFromImeis, numbersCountFromNumbers),
      alerts: alertCount,
    };
  }, [globalFraudResult]);

  useEffect(() => {
    setFraudResult(null);
    setFraudError('');
  }, [selectedCase, cdrIdentifiers]);

  const normalizeCdrNumber = useCallback((value: string) => {
    let sanitized = value.trim();
    if (!sanitized) return '';
    sanitized = sanitized.replace(/\s+/g, '');
    if (sanitized.startsWith('+')) {
      sanitized = sanitized.slice(1);
    }
    while (sanitized.startsWith('00')) {
      sanitized = sanitized.slice(2);
    }
    sanitized = sanitized.replace(/\D/g, '');
    if (!sanitized) return '';
    if (sanitized.startsWith('221')) {
      return sanitized;
    }
    sanitized = sanitized.replace(/^0+/, '');
    return sanitized ? `221${sanitized}` : '';
  }, []);

  const normalizeImei = useCallback((value: string) => {
    let sanitized = value.trim();
    if (!sanitized) return '';
    sanitized = sanitized.replace(/\s+/g, '');
    sanitized = sanitized.replace(/[^0-9]/g, '');
    return sanitized;
  }, []);

  const computeImeiLuhnCheckDigit = useCallback((imeiBody: string) => {
    const digits = imeiBody.split('').map((digit) => Number(digit));
    let sum = 0;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let value = digits[index];
      const positionFromRight = digits.length - 1 - index;
      if (positionFromRight % 2 === 0) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      sum += value;
    }
    return String((10 - (sum % 10)) % 10);
  }, []);

  const normalizeImeiForDetection = useCallback(
    (value: string) => {
      const normalized = normalizeImei(value);
      if (!normalized) return '';
      if (normalized.length !== 15) return normalized;
      return `${normalized.slice(0, 14)}0`;
    },
    [normalizeImei]
  );

  const replaceImeiCheckDigitWithZero = useCallback(
    (value: string) => {
      const normalized = normalizeImei(value);
      if (!normalized) return '';
      if (normalized.length < 15) return normalized;
      return `${normalized.slice(0, 14)}0`;
    },
    [normalizeImei]
  );

  const formatImeiForDisplay = useCallback(
    (value: string) => {
      const normalized = normalizeImei(value);
      if (!normalized) return value;
      if (normalized.length < 14) return normalized;
      const body = normalized.slice(0, 14);
      return `${body}${computeImeiLuhnCheckDigit(body)}`;
    },
    [computeImeiLuhnCheckDigit, normalizeImei]
  );

  const normalizeCdrIdentifier = useCallback(
    (value: string) => {
      if (cdrIdentifierType === 'imei') {
        return normalizeImei(value);
      }
      return normalizeCdrNumber(value);
    },
    [cdrIdentifierType, normalizeCdrNumber, normalizeImei]
  );

  const dedupeCdrIdentifiers = useCallback(
    (values: string[]) => {
      const seen = new Set<string>();
      const result: string[] = [];

      values.forEach((value) => {
        const normalized = normalizeCdrIdentifier(value);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        result.push(normalized);
      });

      return result;
    },
    [normalizeCdrIdentifier]
  );

  const normalizeMonitoringValue = useCallback(
    (value: string, type: MonitoringType) => {
      if (type === 'imei') {
        return normalizeImei(value);
      }
      return normalizeCdrNumber(value);
    },
    [normalizeCdrNumber, normalizeImei]
  );

  const handleAddMonitoringTarget = useCallback(() => {
    const normalizedValue = normalizeMonitoringValue(monitoringInput, monitoringType);
    if (!normalizedValue) {
      notifyWarning("Ajoutez un numéro ou un IMEI valide pour activer la surveillance.");
      return;
    }

    if (!currentUser) {
      notifyWarning('Connectez-vous pour gérer vos veilles.');
      return;
    }

    setMonitoringTargets((prev) => {
      if (prev.some((target) => target.value === normalizedValue && target.type === monitoringType)) {
        notifyInfo('Cette cible est déjà surveillée.');
        return prev;
      }
      const now = new Date().toISOString();
      notifySuccess(
        `${monitoringType === 'imei' ? "L'IMEI" : 'Le numéro'} ${normalizedValue} est désormais monitoré.`
      );
      return [
        {
          id: `${monitoringType}-${normalizedValue}`,
          type: monitoringType,
          value: normalizedValue,
          knownPeers: [],
          createdAt: now,
          createdById: currentUser.id,
          createdByLogin: currentUser.login,
        },
        ...prev,
      ];
    });

    setMonitoringInput('');
  }, [currentUser, monitoringInput, monitoringType, normalizeMonitoringValue, notifyInfo, notifySuccess, notifyWarning]);

  const handleRemoveMonitoringTarget = useCallback(
    (target: FraudMonitoringTarget) => {
      if (!currentUser) {
        notifyWarning('Connectez-vous pour gérer vos veilles.');
        return;
      }

      if (
        (target.createdByLogin && target.createdByLogin !== currentUser.login) ||
        (target.createdById && target.createdById !== currentUser.id)
      ) {
        notifyWarning('Vous ne pouvez supprimer que vos propres veilles.');
        return;
      }

      const label = `${target.type === 'imei' ? "l'IMEI" : 'le numéro'} ${target.value}`;
      if (!window.confirm(`Confirmez-vous la suppression de la veille pour ${label} ?`)) {
        return;
      }

      setMonitoringTargets((prev) => prev.filter((item) => item.id !== target.id));
      setMonitoringAlerts((prev) => prev.filter((alert) => alert.targetId !== target.id));
    },
    [currentUser, notifyWarning]
  );

  const handleClearMonitoringAlerts = useCallback(() => {
    setMonitoringAlerts([]);
  }, []);

  const getEffectiveCdrIdentifiers = useCallback(() => {
    const combined = cdrIdentifierInput
      ? [...cdrIdentifiers, cdrIdentifierInput]
      : [...cdrIdentifiers];

    return dedupeCdrIdentifiers(combined);
  }, [cdrIdentifierInput, cdrIdentifiers, dedupeCdrIdentifiers]);

  const handleCdrIdentifierTypeChange = useCallback(
    (nextType: 'phone' | 'imei') => {
      if (cdrIdentifierType === nextType) {
        return;
      }
      setCdrIdentifierType(nextType);
      setCdrIdentifiers([]);
      setCdrIdentifierInput('');
      setCdrResult(null);
      setCdrError('');
      setCdrInfoMessage('');
    },
    [cdrIdentifierType]
  );

  const commitCdrIdentifiers = useCallback(
    (next: string[]) => {
      setCdrIdentifiers((prev) => {
        if (prev.length === next.length && prev.every((value, index) => value === next[index])) {
          return prev;
        }
        return next;
      });
    },
    [setCdrIdentifiers]
  );

  const effectiveCdrIdentifiers = useMemo(
    () => getEffectiveCdrIdentifiers(),
    [getEffectiveCdrIdentifiers]
  );
  const cdrTrackedIdentifiers = useMemo(
    () => dedupeCdrIdentifiers(cdrIdentifiers),
    [cdrIdentifiers, dedupeCdrIdentifiers]
  );
  const hasFraudDetectionNumbers = effectiveCdrIdentifiers.length > 0;

  const formatFraudDate = (value?: string | null) => {
    if (!value) return '-';
    try {
      return format(parseISO(value), 'P', { locale: fr });
    } catch {
      return value;
    }
  };

  const formatFraudDateTime = (value?: string | null) => {
    if (!value) return '-';
    try {
      return format(parseISO(value), 'Pp', { locale: fr });
    } catch {
      return value;
    }
  };

  // États des statistiques
  const [statsData, setStatsData] = useState<DashboardStats | null>(null);
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(DASHBOARD_CARD_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.filter((item): item is string =>
              typeof item === 'string' && DEFAULT_CARD_ORDER.includes(item)
            );
            const missing = DEFAULT_CARD_ORDER.filter(id => !sanitized.includes(id));
            return [...sanitized, ...missing];
          }
        } catch (error) {
          console.warn('Impossible de lire la configuration du dashboard:', error);
        }
      }
    }
    return DEFAULT_CARD_ORDER;
  });
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [searchLogs, setSearchLogs] = useState([]);
  const [blacklistAlerts, setBlacklistAlerts] = useState<any[]>([]);
  const [logUserFilter, setLogUserFilter] = useState('');
  const [loadingStats, setLoadingStats] = useState(false);
  const [timeSeries, setTimeSeries] = useState<any[]>([]);

  const numberFormatter = useMemo(() => new Intl.NumberFormat('fr-FR'), []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DASHBOARD_CARD_STORAGE_KEY, JSON.stringify(cardOrder));
    }
  }, [cardOrder]);

  const addCdrIdentifier = () => {
    const normalized = normalizeCdrIdentifier(cdrIdentifierInput);
    if (normalized && !cdrIdentifiers.includes(normalized)) {
      setCdrIdentifiers([...cdrIdentifiers, normalized]);
      setCdrIdentifierInput('');
    } else {
      setCdrIdentifierInput(normalized);
    }
  };

  const removeCdrIdentifier = (index: number) => {
    setCdrIdentifiers(cdrIdentifiers.filter((_, i) => i !== index));
  };

  const normalizeLinkDiagramEntry = useCallback(
    (value: string) => {
      const normalized = normalizeCdrNumber(value);
      if (!normalized) return null;
      const isAllowedPrefix = LINK_DIAGRAM_PREFIXES.some((prefix) => normalized.startsWith(prefix));
      return isAllowedPrefix ? normalized : null;
    },
    [normalizeCdrNumber]
  );

  const splitLinkDiagramInput = useCallback((input: string) => {
    if (!input) return [];
    return input
      .split(/[\s,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }, []);

  const collectLinkDiagramNumbers = useCallback(() => {
    const tokens = splitLinkDiagramInput(linkDiagramNumberInput);
    const normalizedFromInput: string[] = [];
    const invalidTokens: string[] = [];
    tokens.forEach((token) => {
      const normalized = normalizeLinkDiagramEntry(token);
      if (normalized) {
        normalizedFromInput.push(normalized);
      } else {
        invalidTokens.push(token);
      }
    });

    const numbers = Array.from(new Set([...linkDiagramNumbers, ...normalizedFromInput]));
    return { numbers, invalidTokens };
  }, [linkDiagramNumberInput, linkDiagramNumbers, normalizeLinkDiagramEntry, splitLinkDiagramInput]);

  const addLinkDiagramNumbersFromInput = useCallback(() => {
    const tokens = splitLinkDiagramInput(linkDiagramNumberInput);
    if (tokens.length === 0) return;
    const validNumbers: string[] = [];
    const invalidTokens: string[] = [];

    tokens.forEach((token) => {
      const normalized = normalizeLinkDiagramEntry(token);
      if (normalized) {
        validNumbers.push(normalized);
      } else {
        invalidTokens.push(token);
      }
    });

    if (validNumbers.length > 0) {
      setLinkDiagramNumbers((prev) => Array.from(new Set([...prev, ...validNumbers])));
    }

    setLinkDiagramNumberInput('');

    if (invalidTokens.length > 0) {
      setLinkDiagramError(`Numéros invalides ou préfixe non supporté : ${invalidTokens.join(', ')}`);
      return;
    }

    setLinkDiagramError('');
  }, [linkDiagramNumberInput, normalizeLinkDiagramEntry, splitLinkDiagramInput]);

  const removeLinkDiagramNumber = useCallback((value: string) => {
    setLinkDiagramNumbers((prev) => prev.filter((item) => item !== value));
  }, []);

  const linkDiagramPrimaryNumber = useMemo(
    () => linkDiagramNumbers[0] ?? null,
    [linkDiagramNumbers]
  );

  // Vérification de l'authentification au démarrage
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      verifyToken(token);
    }
  }, []);

  const verifyToken = async (token: string) => {
    try {
      const response = await fetch('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Données utilisateur reçues:', data.user);
        console.log('🔍 Admin status:', data.user.admin, 'Type:', typeof data.user.admin);
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        navigateToPage('dashboard', { replace: true });
        setLogoutReason(null);
      } else {
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Erreur vérification token:', error);
      localStorage.removeItem('token');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    setLoginInfo('');

    try {
      const payload = {
        login: loginData.login,
        password: loginData.password
      };

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        console.log('🔍 Utilisateur connecté:', data.user);
        console.log('🔍 Admin status:', data.user.admin, 'Type:', typeof data.user.admin);
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        navigateToPage('dashboard', { replace: true });
        setLogoutReason(null);
        setLoginData({ login: '', password: '' });
        setLoginInfo('');
        setLoginError('');
      } else {
        setLoginError(data.error || 'Erreur de connexion');
      }
    } catch (error) {
      setLoginError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = useCallback((reason?: 'inactivity') => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }).catch((error) => {
        console.error('Erreur lors de la déconnexion:', error);
      });
    }

    localStorage.removeItem('token');
    setCurrentUser(null);
    setIsAuthenticated(false);
    navigateToPage('login', { replace: true });
    setSearchResults(null);
    setShowNotifications(false);
    setReadNotifications([]);
    setHighlightedRequestId(null);
    setLogoutReason(reason ?? null);
    setLoginData({ login: '', password: '' });
    setLoginError('');
    setLoginInfo('');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isAuthenticated) {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const resetTimer = () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = window.setTimeout(() => {
        handleLogout('inactivity');
      }, 5 * 60 * 1000);
    };

    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'focus',
      'wheel'
    ];

    const scrollableElement = mainContentRef.current;
    const elementActivityEvents: (keyof HTMLElementEventMap)[] = ['scroll', 'wheel'];
    const handleElementActivity: EventListener = () => {
      resetTimer();
    };

    activityEvents.forEach((event) => window.addEventListener(event, resetTimer));
    if (scrollableElement) {
      elementActivityEvents.forEach((event) =>
        scrollableElement.addEventListener(event, handleElementActivity)
      );
    }

    resetTimer();

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer));
      if (scrollableElement) {
        elementActivityEvents.forEach((event) =>
          scrollableElement.removeEventListener(event, handleElementActivity)
        );
      }
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [isAuthenticated, handleLogout]);

  const fetchBlacklist = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/blacklist', {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      if (res.ok) {
        const data = await res.json();
        setBlacklist(data);
      }
    } catch (err) {
      console.error('Erreur chargement blacklist:', err);
    }
  };

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = blacklistNumber.trim();
    if (!num) return;
    try {
      const res = await fetch('/api/blacklist', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ number: num })
      });
      const data = await res.json();
      if (res.ok) {
        setBlacklist(data);
        setBlacklistNumber('');
        setBlacklistError('');
        setBlacklistPage(1);
      } else {
        setBlacklistError(data.error || 'Erreur lors de l\'ajout');
      }
    } catch (err) {
      setBlacklistError('Erreur de connexion');
    }
  };

  const handleUploadBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blacklistFile) return;
    try {
      const formData = new FormData();
      formData.append('file', blacklistFile);
      const res = await fetch('/api/blacklist/upload', {
        method: 'POST',
        headers: createAuthHeaders(),
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setBlacklist(data);
        setBlacklistFile(null);
        setBlacklistError('');
        setBlacklistPage(1);
      } else {
        setBlacklistError(data.error || "Erreur lors de l'import");
      }
    } catch (err) {
      setBlacklistError('Erreur de connexion');
    }
  };

  const handleDeleteBlacklist = (id: number) => {
    openConfirmDialog({
      title: 'Supprimer le numéro',
      description: 'Confirmer la suppression de ce numéro blacklisté ?',
      confirmLabel: 'Supprimer',
      tone: 'danger',
      icon: <Trash2 className="h-5 w-5" />,
      onConfirm: async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/blacklist/${id}`, {
            method: 'DELETE',
            headers: { Authorization: token ? `Bearer ${token}` : '' }
          });
          if (res.ok) {
            const data = await res.json();
            setBlacklist(data);
          }
        } catch (err) {
          console.error('Erreur suppression blacklist:', err);
        }
      }
    });
  };

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(LOGS_LIMIT));
      if (logUserFilter) params.set('username', logUserFilter);
      const res = await fetch(`/api/logs?${params.toString()}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      if (res.ok) {
        const data = await res.json();
        setLogsData(data.logs || []);
        setLogTotal(data.total || 0);
        setLogPage(page);
      }
    } catch (err) {
      console.error('Erreur chargement logs:', err);
    }
  }, [logUserFilter]);

  const fetchSessions = useCallback(async (page = 1) => {
    setSessionLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(LOGS_LIMIT));
      if (logUserFilter) params.set('username', logUserFilter);
      const res = await fetch(`/api/logs/sessions?${params.toString()}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      if (res.ok) {
        const data = await res.json();
        setSessionLogs(data.sessions || []);
        setSessionTotal(data.total || 0);
        setSessionPage(page);
      }
    } catch (err) {
      console.error('Erreur chargement sessions:', err);
    } finally {
      setSessionLoading(false);
    }
  }, [logUserFilter]);

  const formatSessionDuration = useCallback((durationSeconds?: number | null) => {
    if (!durationSeconds || durationSeconds < 1) {
      return 'Moins d\'une minute';
    }

    const duration = intervalToDuration({ start: 0, end: durationSeconds * 1000 });
    const units: string[] = [];

    if (duration.days) units.push('days');
    if (duration.hours) units.push('hours');
    if (duration.minutes) units.push('minutes');

    if (units.length === 0 || (!duration.minutes && duration.seconds)) {
      units.push('seconds');
    } else if (units.length < 3 && duration.seconds && durationSeconds < 3600) {
      units.push('seconds');
    }

    return formatDuration(duration, {
      format: units,
      locale: fr
    });
  }, []);

  const exportLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const query = logUserFilter ? `?username=${encodeURIComponent(logUserFilter)}` : '';
      const res = await fetch(`/api/logs/export${query}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'logs.csv';
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Erreur export logs:', err);
    }
  };

  const clearLogs = useCallback(async () => {
    const confirmClear = window.confirm('Êtes-vous sûr de vouloir vider tous les logs ? Cette action est irréversible.');
    if (!confirmClear) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/logs/clear', {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });

      if (!res.ok) {
        throw new Error('Erreur lors de la suppression des logs');
      }

      setLogsData([]);
      setLogTotal(0);
      setLogPage(1);
      await fetchLogs(1);
      alert('Tous les logs ont été supprimés avec succès.');
    } catch (err) {
      console.error('Erreur lors du vidage des logs:', err);
      alert("Une erreur est survenue lors de la suppression des logs. Veuillez réessayer.");
    }
  }, [fetchLogs]);

  const logPageVisit = useCallback(async (page: string, extra: Record<string, any> = {}) => {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'page_view', details: { page, ...extra } })
      });
    } catch (err) {
      console.error('Erreur log page:', err);
    }
  }, []);

  useEffect(() => {
    if (currentUser && currentPage !== 'login') {
      logPageVisit(currentPage);
    }
  }, [currentPage, currentUser, logPageVisit]);

  const handleSearch = async (e?: React.FormEvent, forcedQuery?: string) => {
    e?.preventDefault();
    if (loading) return;
    const trimmedQuery = (forcedQuery ?? searchQuery).trim();
    if (!trimmedQuery) return;

    if (currentPage !== 'search') {
      navigateToPage('search');
    }

    const requestedPage = 1;
    const requestedLimit = 20;

    if (
      lastQueryRef.current &&
      lastQueryRef.current.query === trimmedQuery &&
      lastQueryRef.current.page === requestedPage &&
      lastQueryRef.current.limit === requestedLimit
    ) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    resetProgressiveDisplay();
    setLoading(true);
    setSearchError('');
    setSearchResults(null);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          query: trimmedQuery,
          page: requestedPage,
          limit: requestedLimit
        }),
        signal: controller.signal
      });

      const data: SearchResponseFromApi = await response.json();
      if (response.ok) {
        const normalizedData = normalizeSearchResponse(data);
        setSearchResults(normalizedData);
        progressivelyDisplayHits(normalizedData.hits, { reset: true });
        addToSearchHistory(trimmedQuery);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('page');
        nextParams.set('query', trimmedQuery);
        setSearchParams(nextParams);
        lastQueryRef.current = { query: trimmedQuery, page: requestedPage, limit: requestedLimit };
      } else {
        setSearchError(data.error || 'Erreur lors de la recherche');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setSearchError('Erreur de connexion au serveur');
        setIsProgressiveLoading(false);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  historySearchRef.current = (query: string) => {
    setSearchQuery(query);
    void handleSearch(undefined, query);
  };

  const loadMoreResults = async () => {
    if (loading) return;
    if (!searchResults || searchResults.page >= searchResults.pages) return;

    const requestedPage = searchResults.page + 1;
    const requestedLimit = 20;
    const trimmedQuery = searchQuery.trim();

    if (
      lastQueryRef.current &&
      lastQueryRef.current.query === trimmedQuery &&
      lastQueryRef.current.page === requestedPage &&
      lastQueryRef.current.limit === requestedLimit
    ) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setSearchError('');

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          query: trimmedQuery,
          page: requestedPage,
          limit: requestedLimit
        }),
        signal: controller.signal
      });

      const data: SearchResponseFromApi = await response.json();

      if (response.ok) {
        const normalizedData = normalizeSearchResponse(data);
        setSearchResults((prev) =>
          prev
            ? {
                ...prev,
                ...normalizedData,
                hits: [...prev.hits, ...normalizedData.hits],
                tables_searched: Array.from(
                  new Set([...(prev.tables_searched || []), ...(normalizedData.tables_searched || [])])
                )
              }
            : normalizedData
        );
        progressivelyDisplayHits(normalizedData.hits);
        lastQueryRef.current = { query: trimmedQuery, page: requestedPage, limit: requestedLimit };
      } else {
        setSearchError(data.error || 'Erreur lors du chargement des résultats');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setSearchError('Erreur de connexion au serveur');
        setIsProgressiveLoading(false);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const runSearchForNumber = useCallback(
    async (number: string) => {
      const query = number.trim();
      if (!query) {
        return [];
      }
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query, page: 1, limit: 20 })
      });
      let data: SearchResponseFromApi = {
        hits: [],
        tables_searched: []
      };
      try {
        data = await response.json();
      } catch {
        // Ignore parse errors, handled below
      }
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la recherche');
      }
      const normalized = normalizeSearchResponse(data);
      return normalized.hits;
    },
    [createAuthHeaders]
  );

  useEffect(() => {
    if (!isAuthenticated || hasAppliedInitialRoute) return;

    const pageParam = searchParams.get('page') as AppPage | null;
    const queryParam = searchParams.get('query') || undefined;
    const hasPageParam = Boolean(pageParam && pageToPath[pageParam]);

    if (hasPageParam) {
      navigateToPage(pageParam as AppPage, { replace: true });
    } else if (queryParam) {
      navigateToPage('search');
    }

    if (queryParam) {
      setSearchQuery(queryParam);
      handleSearch(undefined, queryParam);
    }

    if (hasPageParam || queryParam) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('page');
      nextParams.delete('query');
      setSearchParams(nextParams, { replace: true });
    }

    setHasAppliedInitialRoute(true);
  }, [
    isAuthenticated,
    hasAppliedInitialRoute,
    searchParams,
    navigateToPage,
    handleSearch,
    setSearchParams
  ]);

  const handleImeiLookup = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const normalizedImei = imeiInput.replace(/\D/g, '');
      if (!normalizedImei) {
        setImeiError('Veuillez saisir un IMEI valide.');
        setImeiResult(null);
        return;
      }

      setImeiError('');
      setImeiLoading(true);

      try {
        const imeiCheckParams = new URLSearchParams({
          key: IMEICHECK_API_KEY,
          imei: normalizedImei,
          format: 'json'
        });

        const response = await fetch(
          `https://alpha.imeicheck.com/api/free_with_key/modelBrandName?${imeiCheckParams.toString()}`
        );

        const data: ImeiCheckResult = await response.json();

        if (!response.ok) {
          throw new Error(
            data.result || data.error || "Impossible de vérifier cet IMEI pour le moment."
          );
        }

        const status = data.status?.toLowerCase() ?? '';
        const isSuccess = status.startsWith('succes');

        if (!isSuccess) {
          setImeiError(data.result || "La vérification n'a pas abouti. Veuillez réessayer.");
          setImeiResult(null);
          return;
        }

        setImeiResult({ ...data, imei: normalizedImei });
        setImeiInput(normalizedImei);
      } catch (error) {
        console.error('Erreur vérification IMEI:', error);
        setImeiError("Une erreur est survenue lors de la vérification. Veuillez réessayer.");
        setImeiResult(null);
      } finally {
        setImeiLoading(false);
      }
    },
    [imeiInput]
  );

  const handlePhoneIdentifierSearch = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const value = phoneIdentifierInput.trim();
      if (!value) {
        setPhoneIdentifierError('Veuillez saisir un numéro valide.');
        setPhoneIdentifierResult(null);
        return;
      }

      setPhoneIdentifierError('');
      setPhoneIdentifierLoading(true);

      try {
        const params = new URLSearchParams({ number: value });
        const response = await fetch(`/api/phone-identifier/search?${params.toString()}`, {
          headers: createAuthHeaders()
        });

        const data: PhoneIdentifierResult & { error?: string } = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Impossible de lancer la recherche pour ce numéro.");
        }

        const normalizedDevices = (data.devices || []).map((device) => ({
          ...device,
          imei: normalizeImeiWithCheckDigit(device.imei)
        }));
        const normalizedImeis = [...new Set(normalizedDevices.map((device) => device.imei).filter(Boolean))];
        const imeiCheckLookups = await Promise.allSettled(
          normalizedImeis.map((imei) => fetchImeiCheckDetails(imei))
        );
        const imeiCheckMap = new Map<string, ImeiCheckResult>();
        imeiCheckLookups.forEach((lookup, index) => {
          const imei = normalizedImeis[index];
          if (!imei) {
            return;
          }

          if (lookup.status === 'fulfilled') {
            imeiCheckMap.set(imei, lookup.value);
          } else {
            imeiCheckMap.set(imei, { imei, error: "Impossible de récupérer les détails IMEI." });
          }
        });

        const enrichedDevices = normalizedDevices.map((device) => {
          const imeiCheckResult = imeiCheckMap.get(device.imei);
          const mappedInfo = mapImeiCheckToInfo(imeiCheckResult);
          const shouldUseFallback = mappedInfo?.error && device.imeiInfo;

          return {
            ...device,
            imeiInfo: shouldUseFallback ? device.imeiInfo : mappedInfo ?? device.imeiInfo
          };
        });

        setPhoneIdentifierResult({
          ...data,
          devices: enrichedDevices,
          stats: {
            ...data.stats,
            uniqueImeis: normalizedImeis.length
          }
        });
      } catch (error) {
        console.error('Erreur identification téléphone:', error);
        const message = error instanceof Error ? error.message : "Une erreur est survenue.";
        setPhoneIdentifierError(message);
        setPhoneIdentifierResult(null);
      } finally {
        setPhoneIdentifierLoading(false);
      }
    },
    [phoneIdentifierInput, createAuthHeaders]
  );

  const formatPhoneIdentifierDate = useCallback((value: string | null) => {
    if (!value) return 'Non renseignée';
    try {
      const parsed = parseISO(value);
      const absolute = format(parsed, "dd MMM yyyy 'à' HH:mm", { locale: fr });
      const relative = formatDistanceToNow(parsed, { locale: fr, addSuffix: true });
      return `${absolute} · ${relative}`;
    } catch (error) {
      return value;
    }
  }, []);

  const handleRequestIdentification = async () => {
    const normalizedSearchPhone = searchQuery.replace(/\D/g, '');
    const hasPendingRequest =
      normalizedSearchPhone.length > 0 &&
      requests.some((request) => {
        const requestPhoneDigits = request.phone.replace(/\D/g, '');
        return request.status !== 'identified' && requestPhoneDigits === normalizedSearchPhone;
      });
    if (hasPendingRequest) {
      notifyError('Une demande est déjà en cours pour ce numéro.');
      return;
    }
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ phone: searchQuery.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        notifySuccess('Demande envoyée');
        await fetchRequests();
      } else {
        notifyError(data.error || 'Erreur lors de la demande');
      }
    } catch (error) {
      notifyError('Erreur de connexion');
    }
  };

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/requests', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        const parsed = data.map((r: any) => ({
          ...r,
          profile: r.profile
            ? {
                ...r.profile,
                extra_fields: r.profile.extra_fields
                  ? typeof r.profile.extra_fields === 'string'
                    ? JSON.parse(r.profile.extra_fields)
                    : r.profile.extra_fields
                  : []
              }
            : null
        }));
        const unique = Array.from(
          new Map(parsed.map(r => [r.id, r])).values()
        );
        setRequests(unique);
      }
    } catch (error) {
      console.error('Erreur chargement demandes:', error);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const fetchServerNotifications = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch('/api/notifications?limit=20', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const entries: ServerNotification[] = Array.isArray(data.notifications)
          ? data.notifications
          : [];
        setServerNotifications(entries);
      }
    } catch (error) {
      console.error('Erreur chargement notifications serveur:', error);
    }
  }, []);

useEffect(() => {
  if (currentUser) {
    fetchRequests();
    fetchServerNotifications();
  }
}, [currentUser, fetchRequests, fetchServerNotifications]);

  const markRequestIdentified = async (id: number, profileId?: number) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'identified', profile_id: profileId })
      });
      if (res.ok) {
        await fetchRequests();
        if (currentPage === 'dashboard') {
          await loadStatistics();
        }
      }
    } catch (error) {
      console.error('Erreur mise à jour demande:', error);
    }
  };

  const deleteRequest = (
    id: number,
    options?: {
      permanent?: boolean;
    }
  ) => {
    const permanent = options?.permanent ?? false;
    const description = permanent
      ? "Supprimer définitivement cette demande ? Cette action est irréversible."
      : 'Supprimer cette demande ?';
    openConfirmDialog({
      title: permanent ? 'Suppression définitive' : 'Supprimer la demande',
      description,
      confirmLabel: permanent ? 'Supprimer définitivement' : 'Supprimer',
      tone: 'danger',
      icon: <Trash2 className="h-5 w-5" />,
      onConfirm: async () => {
        if (isAdmin && !permanent) {
          setHiddenRequestIds((prev) => {
            if (prev.includes(id)) {
              return prev;
            }
            return [...prev, id];
          });
          return;
        }
        try {
          const token = localStorage.getItem('token');
          await fetch(`/api/requests/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (permanent) {
            setHiddenRequestIds((prev) => prev.filter((hiddenId) => hiddenId !== id));
          }
          await fetchRequests();
          if (currentPage === 'dashboard') {
            await loadStatistics();
          }
        } catch (error) {
          console.error('Erreur suppression demande:', error);
        }
      }
    });
  };

  const handleResetHiddenRequests = () => {
    if (!isAdmin) return;
    openConfirmDialog({
      title: 'Réafficher les demandes',
      description: 'Réafficher toutes les demandes supprimées ?',
      confirmLabel: 'Réafficher',
      icon: <RefreshCw className="h-5 w-5 text-blue-600" />,
      onConfirm: async () => {
        setHiddenRequestIds([]);
      }
    });
  };

  const startIdentify = (request: IdentificationRequest) => {
    setIdentifyingRequest(request);
  };

  const handleProfileSaved = async (profileId?: number) => {
    if (identifyingRequest && profileId) {
      await markRequestIdentified(identifyingRequest.id, profileId);
    }
    setIdentifyingRequest(null);
  };

  // Gestion des utilisateurs
  const loadUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const loadDivisions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/divisions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const entries: DivisionEntry[] = Array.isArray(data.divisions) ? data.divisions : [];
        setDivisions(entries);
        setUserFormData(prev => {
          if (prev.admin === 1) {
            return prev.divisionId == null
              ? prev
              : {
                  ...prev,
                  divisionId: null
                };
          }
          const currentDivisionId = typeof prev.divisionId === 'number' ? prev.divisionId : 0;
          const hasSelection = currentDivisionId > 0 && entries.some((division) => division.id === currentDivisionId);
          const nextDivisionId = hasSelection ? currentDivisionId : (entries[0]?.id ?? 0);
          if (nextDivisionId === currentDivisionId) {
            return prev;
          }
          return {
            ...prev,
            divisionId: nextDivisionId
          };
        });
      }
    } catch (error) {
      console.error('Erreur chargement divisions:', error);
    }
  };

  const filteredUsers = useMemo(() => {
    const term = userSearchTerm.trim().toLowerCase();
    if (!term) {
      return users;
    }
    return users.filter((user) => {
      const login = (user.login || '').toLowerCase();
      const divisionName = (user.admin === 1 || user.admin === '1')
        ? 'admin'
        : (user.division_name || '').toLowerCase();
      const idMatch = String(user.id || '').includes(term);
      const roleLabel = (user.admin === 1 || user.admin === '1') ? 'administrateur' : 'utilisateur';
      const statusLabel = (user.active === 1 || user.active === '1') ? 'actif' : 'inactif';
      return (
        login.includes(term) ||
        divisionName.includes(term) ||
        idMatch ||
        roleLabel.includes(term) ||
        statusLabel.includes(term)
      );
    });
  }, [userSearchTerm, users]);

  const userStats = useMemo(() => {
    let activeCount = 0;
    let adminCount = 0;
    users.forEach((user) => {
      if (user.active === 1 || user.active === '1') {
        activeCount += 1;
      }
      if (user.admin === 1 || user.admin === '1') {
        adminCount += 1;
      }
    });
    const total = users.length;
    return {
      total,
      active: activeCount,
      inactive: Math.max(0, total - activeCount),
      admins: adminCount
    };
  }, [users]);

  const divisionUserCount = useMemo(() => {
    const counts: Record<number, number> = {};
    users.forEach((user) => {
      const divisionId = Number(user.division_id);
      if (!Number.isInteger(divisionId) || divisionId <= 0) {
        return;
      }
      counts[divisionId] = (counts[divisionId] ?? 0) + 1;
    });
    return counts;
  }, [users]);

  // Charger les statistiques
  const loadStatistics = async () => {
    if (!currentUser) return;

    try {
      setLoadingStats(true);
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

      if (!isAdmin) {
        setBlacklistAlerts([]);
      }

      const logQuery = isAdmin && logUserFilter
        ? `?username=${encodeURIComponent(logUserFilter)}`
        : '';

      const alertLogsPromise = (() => {
        if (!isAdmin) {
          return null;
        }
        const params = new URLSearchParams({
          page: '1',
          limit: String(LOGS_LIMIT)
        });
        if (logUserFilter) {
          params.set('username', logUserFilter);
        }
        return fetch(`/api/logs?${params.toString()}`, { headers });
      })();

      const responses = await Promise.all([
        fetch('/api/stats/overview', { headers }),
        fetch(`/api/stats/search-logs${logQuery}`, { headers }),
        fetch('/api/stats/time-series?days=7', { headers }),
        ...(alertLogsPromise ? [alertLogsPromise] : [])
      ]);

      const [statsResponse, logsResponse, timeResponse, alertResponse] = responses;

      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        setStatsData(stats);
      }

      if (logsResponse.ok) {
        const logs = await logsResponse.json();
        setSearchLogs(logs.logs || []);
      }

      if (timeResponse.ok) {
        const ts = await timeResponse.json();
        setTimeSeries(ts.time_series || []);
      }

      if (alertResponse) {
        if (alertResponse.ok) {
          const data = await alertResponse.json();
          const alertLogs = Array.isArray(data.logs)
            ? data.logs.filter((log: any) => {
                if (!log) return false;
                if (log.action === 'blacklist_search_attempt' || log.action === 'blacklist_fraud_detection') {
                  return true;
                }
                try {
                  const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                  return details?.alert === true;
                } catch {
                  return false;
                }
              })
            : [];
          setBlacklistAlerts(alertLogs);
        } else {
          setBlacklistAlerts([]);
        }
      }
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
      if (isAdmin) {
        setBlacklistAlerts([]);
      }
    } finally {
      setLoadingStats(false);
    }
  };

  const dashboardCards = useMemo<DashboardCard[]>(() => {
    const profiles = statsData?.profiles;
    const requests = statsData?.requests;
    const operations = statsData?.operations;
    const dataStats = statsData?.data;

    return [
      {
        id: 'total-searches',
        title: 'Recherches totales',
        value: numberFormatter.format(statsData?.total_searches ?? 0),
        icon: Search,
        gradient: 'from-blue-500 via-blue-600 to-indigo-600',
        badge: {
          label: `${numberFormatter.format(statsData?.today_searches ?? 0)} aujourd'hui`,
          tone: 'bg-white/20 text-white'
        },
        description: 'Suivi global des requêtes effectuées sur la plateforme'
      },
      {
        id: 'data',
        title: 'Données disponibles',
        value: numberFormatter.format(dataStats?.total_records ?? 0),
        icon: Database,
        gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
        badge: {
          label: `${numberFormatter.format(dataStats?.sources ?? 0)} sources`,
          tone: 'bg-white/20 text-white'
        },
        description: 'Volume total de données exploitables via la plateforme'
      },
      {
        id: 'profiles',
        title: 'Profils créés',
        value: numberFormatter.format(profiles?.total ?? 0),
        icon: UserCircle,
        gradient: 'from-rose-500 via-pink-500 to-fuchsia-600',
        badge: {
          label: `${numberFormatter.format(profiles?.today ?? 0)} aujourd'hui`,
          tone: 'bg-white/20 text-white'
        },
        description: 'Identités consolidées par les analystes'
      },
      {
        id: 'requests',
        title: "Demandes d'identification",
        value: numberFormatter.format(requests?.total ?? 0),
        icon: ClipboardList,
        gradient: 'from-indigo-500 via-indigo-600 to-purple-600',
        badge: {
          label: `${numberFormatter.format(requests?.pending ?? 0)} en attente`,
          tone: 'bg-white/20 text-white'
        },
        description: 'Flux global des requêtes d’identification'
      },
      {
        id: 'operations',
        title: 'Géolocalisation',
        value: numberFormatter.format(operations?.total ?? 0),
        icon: Activity,
        gradient: 'from-amber-500 via-orange-500 to-red-500',
        badge: {
          label: `${numberFormatter.format(operations?.today ?? 0)} nouvelles`,
          tone: 'bg-white/20 text-white'
        },
        description: 'Dossiers d’analyse et investigations actives'
      }
    ];
    }, [numberFormatter, statsData]);

  const orderedDashboardCards = useMemo(() => {
    const cardsMap = new Map(dashboardCards.map(card => [card.id, card]));
    const knownOrder = cardOrder.filter(id => cardsMap.has(id)).map(id => cardsMap.get(id)!);
    const missing = dashboardCards.filter(card => !cardOrder.includes(card.id));
    return [...knownOrder, ...missing];
  }, [cardOrder, dashboardCards]);

  const handleCardDragStart = useCallback((id: string) => () => {
    setDraggedCard(id);
  }, []);

  const handleCardDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleCardDrop = useCallback((targetId: string) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedCard || draggedCard === targetId) {
      setDraggedCard(null);
      return;
    }

    setCardOrder(prev => {
      const next = [...prev];
      const fromIndex = next.indexOf(draggedCard);
      const toIndex = next.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) {
        return prev;
      }
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggedCard);
      return next;
    });
    setDraggedCard(null);
  }, [draggedCard]);

  const handleCardDragEnd = useCallback(() => {
    setDraggedCard(null);
  }, []);

  const resetCardOrder = useCallback(() => {
    setCardOrder(DEFAULT_CARD_ORDER);
    setDraggedCard(null);
  }, []);

  const requestMetrics = useMemo<RequestMetric[]>(() => {
    const requests = statsData?.requests;
    const total = requests?.total ?? 0;
    const pending = requests?.pending ?? 0;
    const identified = requests?.identified ?? 0;
    const today = requests?.today ?? 0;
    const recent = requests?.recent ?? 0;
    const percentage = (value: number) => (total ? Math.round((value / total) * 100) : 0);

    return [
      {
        key: 'total',
        label: 'Total des demandes',
        value: total,
        icon: ClipboardList,
        tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
        caption: `30 derniers jours : ${numberFormatter.format(recent)}`
      },
      {
        key: 'pending',
        label: 'En attente',
        value: pending,
        icon: AlertTriangle,
        tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
        caption: 'En cours de traitement',
        progress: percentage(pending)
      },
      {
        key: 'identified',
        label: 'Identifiées',
        value: identified,
        icon: UserCheck,
        tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
        caption: 'Demandes résolues',
        progress: percentage(identified)
      },
      {
        key: 'today',
        label: "Aujourd'hui",
        value: today,
        icon: Clock,
        tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
        caption: 'Nouvelle activité du jour'
      }
    ];
  }, [numberFormatter, statsData]);

  const profileStats = statsData?.profiles;
  const operationStats = statsData?.operations;
  const profilesTotal = profileStats?.total ?? 0;
  const profilesRecent = profileStats?.recent ?? 0;
  const operationsTotal = operationStats?.total ?? 0;
  const operationsRecent = operationStats?.recent ?? 0;
  const profileProgress = profilesTotal ? Math.min(100, Math.round((profilesRecent / profilesTotal) * 100)) : 0;
  const operationsProgress = operationsTotal ? Math.min(100, Math.round((operationsRecent / operationsTotal) * 100)) : 0;

  const searchTypeChips = useMemo(() => {
    return (statsData?.searches_by_type || []).map(type => ({
      key: type.search_type,
      label: type.search_type.replace(/_/g, ' '),
      value: numberFormatter.format(type.search_count || 0)
    }));
  }, [numberFormatter, statsData]);

  const topSearchTerms = useMemo(() => statsData?.top_search_terms ?? [], [statsData]);

  const handleUserRoleChange = (adminValue: number) => {
    setUserFormData(prev => {
      if (adminValue === 1) {
        return {
          ...prev,
          admin: 1,
          divisionId: null
        };
      }

      const currentDivisionId = typeof prev.divisionId === 'number' ? prev.divisionId : 0;
      const hasSelection = currentDivisionId > 0 && divisions.some((division) => division.id === currentDivisionId);
      const nextDivisionId = hasSelection ? currentDivisionId : (divisions[0]?.id ?? 0);

      return {
        ...prev,
        admin: 0,
        divisionId: nextDivisionId
      };
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const isAdminRole = userFormData.admin === 1;
      if (!isAdminRole && (!userFormData.divisionId || userFormData.divisionId <= 0)) {
        notifyWarning('Veuillez sélectionner une division');
        setLoading(false);
        return;
      }
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          login: userFormData.login,
          password: userFormData.password,
          role: userFormData.admin === 1 ? 'ADMIN' : 'USER',
          active: userFormData.active === 1 ? 1 : 0,
          divisionId: isAdminRole ? null : userFormData.divisionId
        })
      });

      const data = await response.json();

      if (response.ok) {
        notifySuccess('Utilisateur créé avec succès');
        setShowUserModal(false);
        setUserFormData({
          login: '',
          password: '',
          admin: 0,
          active: 1,
          divisionId: divisions[0]?.id || 0
        });
        setEditingUser(null);
        loadUsers();
      } else {
        console.error('❌ Erreur création:', data);
        notifyError(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('❌ Erreur réseau:', error);
      notifyError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setLoading(true);

    try {
      const isAdminRole = userFormData.admin === 1;
      if (!isAdminRole && (!userFormData.divisionId || userFormData.divisionId <= 0)) {
        notifyWarning('Veuillez sélectionner une division');
        setLoading(false);
        return;
      }
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          login: userFormData.login,
          admin: userFormData.admin,
          active: userFormData.active === 1 ? 1 : 0,
          divisionId: isAdminRole ? null : userFormData.divisionId
        })
      });

      const data = await response.json();

      if (response.ok) {
        notifySuccess('Utilisateur modifié avec succès');
        setShowUserModal(false);
        setUserFormData({
          login: '',
          password: '',
          admin: 0,
          active: 1,
          divisionId: divisions[0]?.id || 0
        });
        setEditingUser(null);
        loadUsers();
      } else {
        notifyError(data.error || 'Erreur lors de la modification');
      }
    } catch (error) {
      notifyError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDivisionName.trim()) {
      notifyWarning('Veuillez saisir un nom de division');
      return;
    }
    setCreatingDivision(true);
    try {
      const response = await fetch('/api/divisions', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: newDivisionName.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        notifySuccess('Division créée avec succès');
        setNewDivisionName('');
        loadDivisions();
      } else {
        notifyError(data.error || 'Erreur lors de la création de la division');
      }
    } catch (error) {
      console.error('Erreur création division:', error);
      notifyError('Erreur de connexion au serveur');
    } finally {
      setCreatingDivision(false);
    }
  };

  const handleDeleteDivision = (divisionId: number) => {
    openConfirmDialog({
      title: 'Supprimer la division',
      description: 'Supprimer cette division ? Les utilisateurs associés ne seront plus rattachés.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
      icon: <Building2 className="h-5 w-5" />,
      onConfirm: async () => {
        setDeletingDivisionId(divisionId);
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/divisions/${divisionId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });

          if (response.ok) {
            const data = await response.json();
            let message = 'Division supprimée avec succès';
            if (data.detachedUsers > 0) {
              message += ` ( ${data.detachedUsers} utilisateur(s) détaché(s) )`;
            }
            notifySuccess(message);
            await loadDivisions();
            await loadUsers();
          } else {
            const data = await response.json();
            notifyError(data.error || 'Erreur lors de la suppression de la division');
          }
        } catch (error) {
          console.error('Erreur suppression division:', error);
          notifyError('Erreur de connexion au serveur');
        } finally {
          setDeletingDivisionId(null);
        }
      }
    });
  };

  const handleDeleteUser = (userId: number) => {
    openConfirmDialog({
      title: 'Supprimer l’utilisateur',
      description: 'Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est définitive.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
      icon: <User className="h-5 w-5" />,
      onConfirm: async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });

          if (response.ok) {
            notifySuccess('Utilisateur supprimé avec succès');
            loadUsers();
          } else {
            const data = await response.json();
            notifyError(data.error || 'Erreur lors de la suppression');
          }
        } catch (error) {
          notifyError('Erreur de connexion au serveur');
        }
      }
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetUser = passwordTargetUser || currentUser;
    if (!targetUser) return;

    const changingOther = targetUser.id !== currentUser?.id;
    const requireCurrent = !isAdmin || !changingOther;

    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      notifyWarning('Les nouveaux mots de passe ne correspondent pas');
      return;
    }

    if (passwordFormData.newPassword.length < 8) {
      notifyWarning('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (requireCurrent && !passwordFormData.currentPassword) {
      notifyWarning('Mot de passe actuel requis');
      return;
    }

    setLoading(true);

    try {
      const body: any = { newPassword: passwordFormData.newPassword };
      if (requireCurrent) {
        body.currentPassword = passwordFormData.currentPassword;
      }
      const response = await fetch(`/api/users/${targetUser.id}/change-password`, {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok) {
        notifySuccess('Mot de passe modifié avec succès');
        setShowPasswordModal(false);
        setPasswordTargetUser(null);
        setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setShowPasswords({ current: false, new: false, confirm: false });
      } else {
        notifyError(data.error || 'Erreur lors du changement de mot de passe');
      }
    } catch (error) {
      notifyError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const openPasswordModal = (user: User | null = null) => {
    setPasswordTargetUser(user || currentUser);
    setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setShowPasswords({ current: false, new: false, confirm: false });
    setShowPasswordModal(true);
  };

    const openEditModal = (user: User) => {
      setEditingUser(user);
      setUserFormData({
        login: user.login,
        password: '',
        admin: user.admin,
        active: user.active,
        divisionId: (user.admin === 1)
          ? 0
          : (typeof user.division_id === 'number' && user.division_id > 0
            ? user.division_id
            : divisions[0]?.id || 0)
      });
      setShowUserModal(true);
    };

  const openCreateModal = () => {
    setEditingUser(null);
    setUserFormData({
      login: '',
      password: '',
      admin: 0,
      active: 1,
      divisionId: divisions[0]?.id || 0
    });
    setShowUserModal(true);
  };

  const handleUploadData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      notifyWarning('Veuillez sélectionner un fichier');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('dataFile', uploadFile);
      formData.append('tableName', uploadTable);
      const response = await fetch('/api/upload/file', {
        method: 'POST',
        headers: createAuthHeaders(),
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        notifySuccess('Données chargées avec succès');
        setUploadTable('');
        setUploadFile(null);
        lastQueryRef.current = null;
        fetchUploadHistory();
      } else {
        notifyError(data.error || 'Erreur lors du chargement');
      }
    } catch (error) {
      notifyError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const fetchUploadHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/upload/history?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUploadHistory(data.history);
      }
    } catch (error) {
      console.error('Erreur chargement historique upload:', error);
    }
  };

  const handleDeleteUpload = (id: number) => {
    openConfirmDialog({
      title: 'Supprimer les données importées',
      description: 'Supprimer ces données importées de façon définitive ?',
      confirmLabel: 'Supprimer',
      tone: 'danger',
      icon: <Database className="h-5 w-5" />,
      onConfirm: async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/upload/history/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok) {
            lastQueryRef.current = null;
            fetchUploadHistory();
          } else {
            notifyError(data.error || 'Erreur lors de la suppression');
          }
        } catch (error) {
          notifyError('Erreur de connexion au serveur');
        }
      }
    });
  };

  const fetchAnnuaire = async () => {
    setGendarmerieLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/annuaire-gendarmerie', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const entries = data.entries || data.contacts || data;
        setGendarmerieData(entries);
      }
    } catch (error) {
      console.error('Erreur chargement annuaire:', error);
    } finally {
      setGendarmerieLoading(false);
    }
  };

  const fetchOng = async () => {
    setOngLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ong', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const entries = data.entries || data;
        setOngData(entries);
      }
    } catch (error) {
      console.error('Erreur chargement ONG:', error);
    } finally {
      setOngLoading(false);
    }
  };

  const fetchEntreprises = async () => {
    setEntreprisesLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: entreprisesPage.toString(),
        limit: entreprisesPerPage.toString()
      });
      if (entreprisesSearch.trim()) {
        params.append('search', entreprisesSearch.trim());
      }
      const response = await fetch(`/api/entreprises?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const entries = data.entries || [];
        setEntreprisesData(entries);
        setEntreprisesTotal(data.total || entries.length);
      }
    } catch (error) {
      console.error('Erreur chargement entreprises:', error);
    } finally {
      setEntreprisesLoading(false);
    }
  };

  const fetchVehicules = async () => {
    setVehiculesLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: vehiculesPage.toString(),
        limit: vehiculesPerPage.toString()
      });
      if (vehiculesSearch.trim()) {
        params.append('search', vehiculesSearch.trim());
      }
      const response = await fetch(`/api/vehicules?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const entries = data.entries || [];
        setVehiculesData(entries);
        setVehiculesTotal(data.total || entries.length);
      }
    } catch (error) {
      console.error('Erreur chargement véhicules:', error);
    } finally {
      setVehiculesLoading(false);
    }
  };

  const fetchCdrData = async (identifiersOverride?: string[]) => {
    const ids = dedupeCdrIdentifiers(identifiersOverride ?? cdrIdentifiers).filter(
      (identifier) => Boolean(identifier)
    );
    const isPhoneSearch = cdrIdentifierType === 'phone';
    const requestParam = isPhoneSearch ? 'phone' : 'imei';
    const requestLogs: string[] = [];

    if (ids.length === 0) {
      setLinkDiagram(null);
      setCdrResult(null);
      setCdrLoading(false);
      setCdrError('');
      setCdrInfoMessage('Ajoutez au moins un identifiant valide pour lancer la recherche');
      setCdrSearchRequests([]);
      setShowCdrMap(false);
      return;
    }

    setLinkDiagram(null);
    setCdrLoading(true);
    setCdrError('');
    setCdrInfoMessage('');
    setCdrSearchRequests([]);
    setShowCdrMap(false);

    try {
      const token = localStorage.getItem('token');

      const allPaths: CdrPoint[] = [];
      const contactCandidates: CdrContactCandidate[] = [];
      const contactSummariesMap = new Map<
        string,
        {
          number: string;
          callCount: number;
          smsCount: number;
          callDurationSeconds: number;
          events: CdrContactEvent[];
        }
      >();

      for (const id of ids) {
        const params = new URLSearchParams();
        params.append(requestParam, id);
        const startDate = normalizeDateParam(cdrStart);
        const endDate = normalizeDateParam(cdrEnd);
        if (startDate) params.append('start', startDate);
        if (endDate) params.append('end', endDate);
        if (cdrStartTime) params.append('startTime', cdrStartTime);
        if (cdrEndTime) params.append('endTime', cdrEndTime);
        const requestDescription = `/api/cdr/realtime/search?${params.toString()}`;
        requestLogs.push(requestDescription);
        console.info('Requête CDR envoyée', {
          identifiant: id,
          requete: requestDescription
        });
        const res = await fetch(`/api/cdr/realtime/search?${params.toString()}`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (res.ok) {
          const rawPath = Array.isArray(data.path) ? data.path : [];
          const sanitizedPath = rawPath.map((rawPoint: unknown) => {
            if (!rawPoint || typeof rawPoint !== 'object') {
              return rawPoint;
            }

            const record = rawPoint as Record<string, unknown>;
            const candidate = normalizeOptionalTextField(record.number);
            const normalizedCandidate = candidate ? normalizeCdrNumber(candidate) : '';

            if (normalizedCandidate && normalizedCandidate.startsWith('2214')) {
              return { ...record, number: null };
            }

            return record;
          });

          sanitizedPath.forEach((rawPoint: unknown) => {
            const contactCandidate = normalizeCdrContactFields(rawPoint, id);
            if (contactCandidate) {
              contactCandidates.push(contactCandidate);
            }

            const normalizedPoint = normalizeCdrPointFields(rawPoint, id);
            if (normalizedPoint) {
              allPaths.push(normalizedPoint);
            }
          });

          const apiContacts = Array.isArray(data.contacts) ? data.contacts : [];
          apiContacts.forEach((contact: any) => {
            if (!contact || typeof contact !== 'object') return;
            const number = normalizeOptionalTextField(contact.number);
            const normalized = number ? normalizeCdrNumber(number) : '';
            if (!normalized) return;

            const callCount = Number(contact.callCount ?? 0);
            const smsCount = Number(contact.smsCount ?? 0);
            const existing =
              contactSummariesMap.get(normalized) || {
                number: number || normalized,
                callCount: 0,
                smsCount: 0,
                callDurationSeconds: 0,
                events: []
              };

            if (number && (!existing.number || existing.number === normalized)) {
              existing.number = number;
            }

            if (!Number.isNaN(callCount)) {
              existing.callCount += callCount;
            }

            if (!Number.isNaN(smsCount)) {
              existing.smsCount += smsCount;
            }

            const contactDuration =
              typeof contact.callDurationSeconds === 'number'
                ? contact.callDurationSeconds
                : parseDurationToSeconds(normalizeOptionalTextField(contact.callDuration) || '');
            if (!Number.isNaN(contactDuration) && contactDuration > 0) {
              existing.callDurationSeconds += contactDuration;
            }

            const rawEvents = Array.isArray(contact.events) ? contact.events : [];
            rawEvents.forEach((event: any, index: number) => {
              const eventDate = normalizeOptionalTextField(event.date) || undefined;
              const eventTime = normalizeOptionalTextField(event.time) || undefined;
              const durationValue = normalizeOptionalTextField(event.duration) || '';
              const durationSeconds = parseDurationToSeconds(durationValue);

              if (!Number.isNaN(durationSeconds) && durationSeconds > 0) {
                existing.callDurationSeconds += durationSeconds;
              }

              const eventId = `${normalized}-${existing.events.length + index + 1}-${eventDate || 'event'}`;
              existing.events.push({
                id: eventId,
                date: eventDate,
                time: eventTime,
                duration: durationValue || null,
                direction: normalizeOptionalTextField(event.direction) || undefined,
                type: normalizeOptionalTextField(event.type) || undefined
              });
            });

            contactSummariesMap.set(normalized, existing);
          });
        } else {
          setCdrError(data.error || 'Erreur lors de la recherche');
        }
      }

      const trackedNumbersSet = new Set<string>();
      if (isPhoneSearch) {
        ids.forEach((value) => {
          const normalized = normalizeCdrNumber(value);
          if (normalized) {
            trackedNumbersSet.add(normalized);
          }
        });
      }
      const excludeTrackedContacts = trackedNumbersSet.size >= 2;

      const contactsMap = new Map<
        string,
        {
          number: string;
          callCount: number;
          smsCount: number;
          callDurationSeconds: number;
          events: CdrContactEvent[];
        }
      >();
      contactCandidates.forEach((p: CdrContactCandidate) => {
        const eventType = (p.type || '').toLowerCase();
        const trackedRaw = (p.tracked ?? '').toString().trim();
        const trackedNormalized = isPhoneSearch ? normalizeCdrNumber(trackedRaw) : '';
        if (trackedNormalized) {
          const rawNumber = (p.number ?? '').toString().trim();
          const rawCaller = (p.caller ?? '').toString().trim();
          const rawCallee = (p.callee ?? '').toString().trim();

          const callerNormalized = normalizeCdrNumber(rawCaller);
          const calleeNormalized = normalizeCdrNumber(rawCallee);
          type ContactCandidate = { normalized?: string; raw: string };
          const candidates: ContactCandidate[] = [
            { normalized: normalizeCdrNumber(rawNumber), raw: rawNumber },
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
            if (!excludeTrackedContacts || !trackedNumbersSet.has(contactNormalized)) {
              const key = contactNormalized;
              const entry =
                contactsMap.get(key) ||
                {
                  number: contactRaw || key,
                  callCount: 0,
                  smsCount: 0,
                  callDurationSeconds: 0,
                  events: []
                };

              if (contactRaw && (!entry.number || entry.number === key)) {
                entry.number = contactRaw;
              }

              const record = (p.rawRecord as Record<string, unknown>) || {};
              if (eventType === 'sms') {
                entry.smsCount += 1;
              } else {
                entry.callCount += 1;
                const callDurationSeconds = getCallDurationInSeconds(record);
                entry.callDurationSeconds += callDurationSeconds;

                const callDate =
                  normalizeOptionalTextField(record.callDate) ||
                  normalizeOptionalTextField(record.date_debut_appel) ||
                  '';
                const startTime =
                  normalizeOptionalTextField(record.startTime) ||
                  normalizeOptionalTextField(record.start_time) ||
                  normalizeOptionalTextField(record.heure_debut_appel) ||
                  '';
                const endTime =
                  normalizeOptionalTextField(record.endTime) ||
                  normalizeOptionalTextField(record.end_time) ||
                  normalizeOptionalTextField(record.heure_fin_appel) ||
                  '';
                const timestampLabel = callDate && startTime
                  ? Date.parse(`${callDate}T${startTime}`)
                  : null;

                const durationLabel = formatSecondsAsDuration(callDurationSeconds);

                entry.events.push({
                  id: `${key}-${entry.events.length + 1}-${timestampLabel ?? 'ts'}`,
                  timestamp: Number.isFinite(timestampLabel) ? timestampLabel : null,
                  date: callDate || undefined,
                  time: startTime || endTime || undefined,
                  duration: durationLabel === '-' ? null : durationLabel,
                  direction: normalizeTextField(record.direction, ''),
                  type: p.type
                });
              }

              contactsMap.set(key, entry);
            }
          }
        }
      });

      const mergedContactsMap = new Map(contactsMap);
      contactSummariesMap.forEach((summary, key) => {
        const entry =
          mergedContactsMap.get(key) || {
            number: summary.number || key,
            callCount: 0,
            smsCount: 0,
            callDurationSeconds: 0,
            events: contactsMap.get(key)?.events ?? []
          };

        if (summary.number && (!entry.number || entry.number === key)) {
          entry.number = summary.number;
        }

        entry.callCount += summary.callCount ?? 0;
        entry.smsCount += summary.smsCount ?? 0;
        entry.callDurationSeconds = (entry.callDurationSeconds ?? 0) + (summary.callDurationSeconds ?? 0);
        const mergedEvents = [...(entry.events ?? []), ...(summary.events ?? [])];
        entry.events = mergedEvents;
        mergedContactsMap.set(key, entry);
      });

      const locationsMap = new Map<string, CdrLocation>();
      allPaths.forEach((p: CdrPoint) => {
        const key = `${p.latitude},${p.longitude},${p.nom || ''}`;
        const loc = locationsMap.get(key) || {
          latitude: p.latitude,
          longitude: p.longitude,
          nom: p.nom,
          count: 0
        };
        loc.count += 1;
        locationsMap.set(key, loc);
      });

      const contacts = Array.from(mergedContactsMap.values())
        .map((c) => ({
          number: c.number,
          callCount: c.callCount,
          smsCount: c.smsCount,
          total: c.callCount + c.smsCount,
          callDurationSeconds: c.callDurationSeconds,
          callDuration: formatSecondsAsDuration(c.callDurationSeconds),
          events: c.events?.slice() ?? []
        }))
        .sort((a, b) => b.total - a.total);

      const locations = Array.from(locationsMap.values()).sort((a, b) => b.count - a.count);

      setCdrSearchRequests(requestLogs);

      const result: CdrSearchResult = {
        total: allPaths.length,
        contacts,
        topContacts: contacts,
        locations,
        topLocations: locations.slice(0, 10),
        path: allPaths
      };
      setCdrResult(result);

      const hasPath = allPaths.length > 0;
      setShowCdrMap(true);
      setCdrInfoMessage(hasPath ? '' : 'Aucun résultat trouvé pour le filtre sélectionné');
    } catch (error) {
      console.error('Erreur recherche CDR:', error);
      setCdrSearchRequests(requestLogs);
      setCdrError('Erreur lors de la recherche');
      setCdrResult(null);
      setCdrInfoMessage('');
    } finally {
      setCdrLoading(false);
    }
  };

  const fetchFraudDetection = async (numbersOverride?: string[]) => {
    if (!selectedCase) return;

    const providedNumbers = Array.isArray(numbersOverride) ? numbersOverride : [];
    const dedupedInput = providedNumbers.length > 0
      ? dedupeCdrIdentifiers(providedNumbers)
      : dedupeCdrIdentifiers(cdrIdentifiers);
    const numbersForRequest = dedupedInput;

    if (numbersForRequest.length === 0) {
      setFraudResult(null);
      setFraudError('Ajoutez au moins un numéro à analyser.');
      return;
    }

    setFraudLoading(true);
    setFraudError('');

    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      const startDate = normalizeDateParam(cdrStart);
      const endDate = normalizeDateParam(cdrEnd);
      if (startDate) params.append('start', startDate);
      if (endDate) params.append('end', endDate);
      numbersForRequest.forEach((identifier) => {
        params.append('numbers', identifier);
      });
      const query = params.toString();
      const res = await fetch(
        `/api/cases/${selectedCase.id}/fraud-detection${query ? `?${query}` : ''}`,
        {
          headers: { Authorization: token ? `Bearer ${token}` : '' }
        }
      );
      const data = await res.json();
      if (res.ok) {
        setFraudResult(data);
      } else {
        setFraudResult(null);
        setFraudError(data.error || 'Erreur lors de la détection de fraude');
      }
    } catch (error) {
      console.error('Erreur détection fraude:', error);
      setFraudResult(null);
      setFraudError('Erreur lors de la détection de fraude');
    } finally {
      setFraudLoading(false);
    }
  };

  const handleFraudDetectionClick = async () => {
    const identifiers = getEffectiveCdrIdentifiers();
    const numbersForDetection = identifiers;

    if (numbersForDetection.length === 0) {
      setFraudResult(null);
      setFraudError('Ajoutez au moins un numéro pour lancer l’analyse');
      return;
    }

    if (cdrIdentifierInput) {
      setCdrIdentifierInput('');
    }

    if (identifiers.length > 0) {
      commitCdrIdentifiers(identifiers);
    }
    await fetchFraudDetection(numbersForDetection);
  };

  const handleReplaceImeiCheckDigit = useCallback(() => {
    if (!globalFraudIdentifier.trim()) {
      setGlobalFraudError('IMEI requis');
      return;
    }
    setGlobalFraudIdentifier(replaceImeiCheckDigitWithZero(globalFraudIdentifier));
    if (globalFraudError) setGlobalFraudError('');
  }, [globalFraudError, globalFraudIdentifier, replaceImeiCheckDigitWithZero]);

  const handleGlobalFraudSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedIdentifier = globalFraudIdentifier.trim();
    const normalizedIdentifier =
      globalFraudIdentifierType === 'imei' ? normalizeImeiForDetection(trimmedIdentifier) : trimmedIdentifier;
    if (!normalizedIdentifier) {
      setGlobalFraudError('Numéro ou IMEI requis');
      setGlobalFraudResult(null);
      return;
    }
    if (globalFraudStart && globalFraudEnd && new Date(globalFraudStart) > new Date(globalFraudEnd)) {
      setGlobalFraudError('La date de début doit précéder la date de fin');
      return;
    }

    setGlobalFraudLoading(true);
    setGlobalFraudError('');

    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('identifier', normalizedIdentifier);
      if (globalFraudStart) params.append('start', globalFraudStart);
      if (globalFraudEnd) params.append('end', globalFraudEnd);
      const query = params.toString();
      const res = await fetch(`/api/fraud-detection${query ? `?${query}` : ''}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (res.ok) {
        const normalized: GlobalFraudDetectionResult = {
          imeis: Array.isArray(data?.imeis) ? data.imeis : [],
          numbers: Array.isArray(data?.numbers) ? data.numbers : [],
          updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
        };
        setGlobalFraudResult(normalized);
      } else {
        setGlobalFraudResult(null);
        setGlobalFraudError(data.error || 'Erreur lors de la détection de fraude');
      }
    } catch (error) {
      console.error('Erreur détection fraude globale:', error);
      setGlobalFraudResult(null);
      setGlobalFraudError('Erreur lors de la détection de fraude');
    } finally {
      setGlobalFraudLoading(false);
    }
  };

  const resetGlobalFraudSearch = () => {
    setGlobalFraudIdentifier('');
    setGlobalFraudStart('');
    setGlobalFraudEnd('');
    setGlobalFraudIdentifierType('number');
    setGlobalFraudResult(null);
    setGlobalFraudError('');
  };

  useEffect(() => {
    if (!globalFraudResult || monitoringTargets.length === 0) return;
    const alertsToAdd: FraudMonitoringAlert[] = [];
    const now = new Date().toISOString();

    setMonitoringTargets((prevTargets) => {
      let hasChanges = false;
      const updatedTargets = prevTargets.map((target) => {
        let peers: string[] = [];
        if (target.type === 'imei') {
          const match = globalFraudResult.imeis.find((entry) => entry.imei === target.value);
          peers = match ? match.numbers.map((number) => number.number) : [];
        } else {
          const match = globalFraudResult.numbers.find((entry) => entry.number === target.value);
          peers = match ? match.imeis.map((imeiEntry) => imeiEntry.imei) : [];
        }

        if (peers.length === 0) {
          return target;
        }

        const newPeers = peers.filter((peer) => !target.knownPeers.includes(peer));
        if (newPeers.length === 0) {
          return target;
        }

        hasChanges = true;
        const alertId = `${target.id}-${Date.now()}-${newPeers.length}`;
        alertsToAdd.push({
          id: alertId,
          targetId: target.id,
          targetType: target.type,
          targetValue: target.value,
          createdAt: now,
          newPeers,
        });

        return {
          ...target,
          knownPeers: Array.from(new Set([...target.knownPeers, ...peers])),
          lastAlertAt: now,
        };
      });

      return hasChanges ? updatedTargets : prevTargets;
    });

    if (alertsToAdd.length > 0) {
      setMonitoringAlerts((prev) => [...alertsToAdd, ...prev].slice(0, 40));
      alertsToAdd.forEach((alert) => {
        const peerLabel = alert.targetType === 'imei' ? 'numéro' : 'IMEI';
        notifyWarning(
          `Surveillance: ${alert.newPeers.length} ${peerLabel}${alert.newPeers.length > 1 ? 's' : ''} détecté${
            alert.newPeers.length > 1 ? 's' : ''
          } pour ${alert.targetValue}`
        );
      });
    }
  }, [globalFraudResult, monitoringTargets, notifyWarning]);

  const logCdrSearch = useCallback(
    async (identifiers: string[]) => {
      if (!currentUser || identifiers.length === 0) return;
      try {
        await fetch('/api/logs', {
          method: 'POST',
          headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            action: 'cdr_geolocation_search',
            details: {
              identifiers,
              case_id: selectedCase?.id ?? null,
              case_name: selectedCase?.name ?? null
            }
          })
        });
      } catch (error) {
        console.error('Erreur log géolocalisation:', error);
      }
    },
    [createAuthHeaders, currentUser, selectedCase]
  );

  const handleCdrSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedCase) return;
    if (cdrStart && cdrEnd && new Date(cdrStart) > new Date(cdrEnd)) {
      setCdrError('La date de début doit précéder la date de fin');
      return;
    }
    const identifiers = getEffectiveCdrIdentifiers();
    if (identifiers.length === 0) {
      setCdrError('Identifiant requis');
      return;
    }
    if (cdrIdentifierInput) {
      setCdrIdentifierInput('');
    }
    commitCdrIdentifiers(identifiers);
    await logCdrSearch(identifiers);
    await fetchCdrData(identifiers);
  };

  const handleCdrExport = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmedNumber = cdrExportNumber.trim();

    if (!trimmedNumber) {
      setCdrExportError('Veuillez renseigner un numéro.');
      setCdrExportInfo('');
      return;
    }

    if (cdrExportStart && cdrExportEnd && new Date(cdrExportStart) > new Date(cdrExportEnd)) {
      setCdrExportError('La date de début doit précéder la date de fin.');
      setCdrExportInfo('');
      return;
    }

    try {
      setCdrExporting(true);
      setCdrExportError('');
      setCdrExportInfo('');

      const params = new URLSearchParams();
      params.append('numero', trimmedNumber);
      if (cdrExportStart) params.append('start', cdrExportStart);
      if (cdrExportEnd) params.append('end', cdrExportEnd);

      const res = await fetch(`/api/cdr/realtime/export?${params.toString()}`, {
        headers: createAuthHeaders()
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const errorMessage = payload?.error || "Impossible d'exporter les données.";
        setCdrExportError(errorMessage);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `export-cdr-temps-reel-${trimmedNumber}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      setCdrExportInfo('Export terminé avec succès.');
    } catch (error) {
      console.error('Erreur export CDR:', error);
      setCdrExportError("Impossible d'exporter les données.");
    } finally {
      setCdrExporting(false);
    }
  };

  const handleStandaloneLinkDiagram = async () => {
    const { numbers, invalidTokens } = collectLinkDiagramNumbers();

    if (invalidTokens.length > 0) {
      setLinkDiagramError(`Numéros invalides ou préfixe non supporté : ${invalidTokens.join(', ')}`);
      return;
    }

    if (numbers.length === 0) {
      setLinkDiagramError('Ajoutez au moins un numéro valide (préfixe 221).');
      return;
    }
    if (linkDiagramStart && linkDiagramEnd && new Date(linkDiagramStart) > new Date(linkDiagramEnd)) {
      setLinkDiagramError('La date de début doit précéder la date de fin.');
      return;
    }

    try {
      setLinkDiagramLoading(true);
      setLinkDiagramError('');
      setLinkDiagramInfo('');
      setLinkDiagramNumbers(numbers);
      setLinkDiagramNumberInput('');

      const payload: Record<string, unknown> = { numbers };
      if (linkDiagramStart) payload.start = linkDiagramStart.trim();
      if (linkDiagramEnd) payload.end = linkDiagramEnd.trim();

      const res = await fetch('/api/cdr/realtime/link-diagram', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      const responseError =
        typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : '';

      if (!res.ok) {
        setLinkDiagram(null);
        setLinkDiagramError(responseError || 'Erreur lors de la génération du diagramme.');
        return;
      }

      if (data.links && data.links.length > 0) {
        setLinkDiagram(data);
        setLinkDiagramInfo('');
      } else {
        setLinkDiagram(null);
        setLinkDiagramInfo(responseError || 'Aucune liaison trouvée pour ce numéro.');
      }
    } catch (error) {
      console.error('Erreur diagramme des liens (menu):', error);
      setLinkDiagramError('Impossible de générer le diagramme pour le moment.');
    } finally {
      setLinkDiagramLoading(false);
    }
  };

  const fetchCases = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/cases', {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      if (res.ok) {
        const data = await res.json();
        const normalized = Array.isArray(data)
          ? data.map((item: any) => ({
              ...item,
              is_owner: item?.is_owner === 1 || item?.is_owner === true,
              shared_with_me: Boolean(item?.shared_with_me),
              shared_user_ids: Array.isArray(item?.shared_user_ids) ? item.shared_user_ids : []
            }))
          : [];
        setCases(normalized);
        if (pendingShareCaseId) {
          const target = normalized.find((item) => item.id === pendingShareCaseId);
          if (target) {
            setSelectedCase(target);
            navigateToPage('cdr-case');
          }
          setPendingShareCaseId(null);
        }
      }
    } catch (error) {
      console.error('Erreur chargement cases:', error);
    }
  };

  const openShareModalForCase = async (cdrCase: CdrCase) => {
    setShareTargetCase(cdrCase);
    setShareMessage('');
    setShareSelectedUserIds([]);
    setShareAllUsers(false);
    setShareDivisionUsers([]);
    setShareOwnerId(null);
    setShowShareModal(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cases/${cdrCase.id}/share`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (res.ok) {
        const users: CaseShareUser[] = Array.isArray(data.users) ? data.users : [];
        const recipients: number[] = Array.isArray(data.recipients) ? data.recipients : [];
        const ownerId = typeof data.owner?.id === 'number' ? data.owner.id : null;
        setShareDivisionUsers(users);
        setShareSelectedUserIds(recipients);
        setShareOwnerId(ownerId);
        const eligibleIds = users.filter((user) => user.id !== ownerId).map((user) => user.id);
        setShareAllUsers(
          eligibleIds.length > 0 && eligibleIds.every((id) => recipients.includes(id))
        );
      } else {
        setShareMessage(data.error || "Erreur lors du chargement des informations de partage");
      }
    } catch (error) {
      console.error('Erreur chargement informations partage:', error);
      setShareMessage('Erreur lors du chargement des informations de partage');
    }
  };

  const toggleShareUser = (userId: number) => {
    setShareSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
    setShareAllUsers(false);
  };

  const toggleShareAllUsers = () => {
    const availableIds = shareDivisionUsers
      .filter((user) => user.id !== shareOwnerId)
      .map((user) => user.id);
    if (shareAllUsers) {
      setShareSelectedUserIds([]);
      setShareAllUsers(false);
    } else {
      setShareSelectedUserIds(availableIds);
      setShareAllUsers(true);
    }
  };

  const handleSubmitShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTargetCase) return;
    setShareLoading(true);
    setShareMessage('');
    try {
      const response = await fetch(`/api/cases/${shareTargetCase.id}/share`, {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          shareAll: shareAllUsers,
          userIds: shareAllUsers ? [] : shareSelectedUserIds
        })
      });
      const data = await response.json();
      if (response.ok) {
        setShareMessage('Partage mis à jour');
        const recipients: number[] = Array.isArray(data.recipients) ? data.recipients : [];
        setShareSelectedUserIds(recipients);
        if (shareAllUsers) {
          const availableIds = shareDivisionUsers
            .filter((user) => user.id !== shareOwnerId)
            .map((user) => user.id);
          setShareAllUsers(
            availableIds.length > 0 && availableIds.every((id) => recipients.includes(id))
          );
        }
        fetchCases();
      } else {
        setShareMessage(data.error || "Erreur lors de la mise à jour du partage");
      }
    } catch (error) {
      console.error('Erreur partage opération:', error);
      setShareMessage('Erreur lors de la mise à jour du partage');
    } finally {
      setShareLoading(false);
    }
  };

  const openFolderShareModal = async (folder: { id: number; name: string }) => {
    setFolderShareTarget(folder);
    setFolderShareMessage('');
    setFolderShareSelectedIds([]);
    setFolderShareAll(false);
    setFolderShareUsers([]);
    setFolderShareOwnerId(null);
    setShowFolderShareModal(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/profile-folders/${folder.id}/share`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      const data: ProfileShareInfo = await res.json();
      if (res.ok) {
        const users: ProfileShareUser[] = Array.isArray(data.users) ? data.users : [];
        const recipients: number[] = Array.isArray(data.recipients) ? data.recipients : [];
        const ownerId = typeof data.owner?.id === 'number' ? data.owner.id : null;
        setFolderShareUsers(users);
        setFolderShareSelectedIds(recipients);
        setFolderShareOwnerId(ownerId);
        const eligibleIds = users.filter((user) => user.id !== ownerId).map((user) => user.id);
        setFolderShareAll(
          eligibleIds.length > 0 && eligibleIds.every((id) => recipients.includes(id))
        );
      } else {
        setFolderShareMessage(
          (data as any)?.error || 'Erreur lors du chargement des informations de partage'
        );
      }
    } catch (error) {
      console.error('Erreur chargement informations partage dossier:', error);
      setFolderShareMessage('Erreur lors du chargement des informations de partage');
    }
  };

  const toggleFolderShareUser = (userId: number) => {
    setFolderShareSelectedIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
    setFolderShareAll(false);
  };

  const toggleFolderShareAll = () => {
    const availableIds = folderShareUsers
      .filter((user) => user.id !== folderShareOwnerId)
      .map((user) => user.id);
    if (folderShareAll) {
      setFolderShareSelectedIds([]);
      setFolderShareAll(false);
    } else {
      setFolderShareSelectedIds(availableIds);
      setFolderShareAll(true);
    }
  };

  const handleSubmitFolderShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderShareTarget) return;
    setFolderShareLoading(true);
    setFolderShareMessage('');
    try {
      const response = await fetch(`/api/profile-folders/${folderShareTarget.id}/share`, {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          shareAll: folderShareAll,
          userIds: folderShareAll ? [] : folderShareSelectedIds
        })
      });
      const data = await response.json();
      if (response.ok) {
        setFolderShareMessage('Partage mis à jour');
        const recipients: number[] = Array.isArray(data.recipients) ? data.recipients : [];
        setFolderShareSelectedIds(recipients);
        if (folderShareAll) {
          const availableIds = folderShareUsers
            .filter((user) => user.id !== folderShareOwnerId)
            .map((user) => user.id);
          setFolderShareAll(
            availableIds.length > 0 && availableIds.every((id) => recipients.includes(id))
          );
        }
        setProfileListRefreshKey((prev) => prev + 1);
      } else {
        setFolderShareMessage(data.error || 'Erreur lors de la mise à jour du partage');
      }
    } catch (error) {
      console.error('Erreur partage dossier:', error);
      setFolderShareMessage('Erreur lors de la mise à jour du partage');
    } finally {
      setFolderShareLoading(false);
    }
  };

  const markServerNotificationAsRead = async (notificationId: number) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: createAuthHeaders()
      });
      setServerNotifications((prev) =>
        prev.map((notif) =>
          notif.id === notificationId ? { ...notif, read_at: new Date().toISOString() } : notif
        )
      );
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la notification:', error);
    }
  };

  useEffect(() => {
    if (!selectedCase) {
      setFraudResult(null);
      setFraudError('');
      setFraudLoading(false);
    } else {
      setFraudResult(null);
      setFraudError('');
    }
  }, [selectedCase]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cdrCaseName.trim()) return;
    setCdrCaseMessage('');
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: cdrCaseName.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setCdrCaseMessage('Opération créée');
        setCdrCaseName('');
        await fetchCases();
        if (currentPage === 'dashboard') {
          await loadStatistics();
        }
      } else {
        setCdrCaseMessage(data.error || 'Erreur création d\'opération');
      }
    } catch (err) {
      console.error('Erreur création opération:', err);
      setCdrCaseMessage('Erreur création d\'opération');
    }
  };

  const startRenameCase = (cdrCase: CdrCase) => {
    setRenamingCaseId(cdrCase.id);
    setRenamingCaseName(cdrCase.name || '');
    setRenamingCaseError('');
    setRenamingCaseLoading(false);
  };

  const cancelRenameCase = () => {
    setRenamingCaseId(null);
    setRenamingCaseName('');
    setRenamingCaseError('');
    setRenamingCaseLoading(false);
  };

  const submitRenameCase = async () => {
    if (!renamingCaseId) return;
    const trimmedName = renamingCaseName.trim();
    if (!trimmedName) {
      setRenamingCaseError('Nom requis');
      return;
    }
    setRenamingCaseLoading(true);
    setRenamingCaseError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cases/${renamingCaseId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ name: trimmedName })
      });
      if (res.ok) {
        await fetchCases();
        setSelectedCase((prev) => (prev && prev.id === renamingCaseId ? { ...prev, name: trimmedName } : prev));
        cancelRenameCase();
      } else {
        let message = 'Erreur lors de la mise à jour du nom';
        try {
          const data = await res.json();
          if (data?.error) {
            message = data.error;
          }
        } catch {
          // Ignorer les erreurs de parsing
        }
        setRenamingCaseError(message);
      }
    } catch (error) {
      console.error('Erreur renommage opération:', error);
      setRenamingCaseError('Erreur lors de la mise à jour du nom');
    } finally {
      setRenamingCaseLoading(false);
    }
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitRenameCase();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRenameCase();
    }
  };

  const handleDeleteCase = (id: number) => {
    openConfirmDialog({
      title: 'Supprimer l’opération',
      description: 'Supprimer cette opération et toutes les données associées ?',
      confirmLabel: 'Supprimer',
      tone: 'danger',
      icon: <Shield className="h-5 w-5" />,
      onConfirm: async () => {
        try {
          const token = localStorage.getItem('token');
          await fetch(`/api/cases/${id}`, {
            method: 'DELETE',
            headers: { Authorization: token ? `Bearer ${token}` : '' }
          });
          await fetchCases();
          if (currentPage === 'dashboard') {
            await loadStatistics();
          }
        } catch (err) {
          console.error('Erreur suppression opération:', err);
        }
      }
    });
  };

  const openCaseExportModal = useCallback(
    (cdrCase: CdrCase) => {
      setCaseExportTarget(cdrCase);
      setCaseExportNumber('');
      setShowCaseExportModal(true);
    },
    []
  );

  const closeCaseExportModal = useCallback(() => {
    setShowCaseExportModal(false);
    setCaseExportTarget(null);
    setCaseExportNumber('');
  }, []);

  const handleExportCaseReport = async (cdrCase: CdrCase, targetNumber?: string) => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (targetNumber) {
        params.append('number', targetNumber);
      }
      const res = await fetch(`/api/cases/${cdrCase.id}/report${params.toString() ? `?${params.toString()}` : ''}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      if (!res.ok) {
        throw new Error('Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const sanitizedName = cdrCase.name
        ? cdrCase.name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_')
        : `operation_${cdrCase.id}`;
      const sanitizedTarget = targetNumber ? targetNumber.replace(/[^a-zA-Z0-9_-]+/g, '_') : '';
      const suffix = sanitizedTarget ? `_${sanitizedTarget}` : '';
      link.download = `${sanitizedName || 'operation'}_rapport${suffix}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur export rapport opération:', error);
      notifyError("Impossible d'exporter le rapport PDF de l'opération.");
    }
  };

  const handleExportCaseWithNumber = useCallback(async () => {
    if (!caseExportTarget) return;
    const trimmedNumber = caseExportNumber.trim();
    if (!trimmedNumber) return;
    await handleExportCaseReport(caseExportTarget, trimmedNumber);
    closeCaseExportModal();
  }, [caseExportNumber, caseExportTarget, closeCaseExportModal, handleExportCaseReport]);

  const handleExportCaseFullReport = useCallback(async () => {
    if (!caseExportTarget) return;
    await handleExportCaseReport(caseExportTarget);
    closeCaseExportModal();
  }, [caseExportTarget, closeCaseExportModal, handleExportCaseReport]);

  // Charger les utilisateurs quand on accède à la page
  useEffect(() => {
    if (currentPage === 'users' && isAdmin) {
      loadUsers();
      loadDivisions();
    }
    if (currentPage === 'dashboard' && currentUser) {
      loadStatistics();
    }
    if (currentPage === 'upload' && isAdmin) {
      fetchUploadHistory();
    }
    if (currentPage === 'annuaire' && currentUser) {
      fetchAnnuaire();
    }
    if (currentPage === 'ong' && currentUser) {
      fetchOng();
    }
    if (currentPage === 'entreprises' && currentUser) {
      fetchEntreprises();
    }
    if (currentPage === 'vehicules' && currentUser) {
      fetchVehicules();
    }
    if ((currentPage === 'cdr' || currentPage === 'link-diagram') && currentUser) {
      fetchCases();
    }
    if (currentPage === 'requests' && currentUser) {
      fetchRequests();
    }
  }, [
    currentPage,
    currentUser,
    entreprisesPage,
    entreprisesSearch,
    entreprisesPerPage,
    vehiculesPage,
    vehiculesSearch,
    vehiculesPerPage,
    isAdmin
  ]);

  useEffect(() => {
    if (currentPage === 'blacklist' && isAdmin) {
      fetchBlacklist();
    }
  }, [currentPage, isAdmin]);

  useEffect(() => {
    if (currentPage !== 'link-diagram') {
      setLinkDiagramError('');
      setLinkDiagramInfo('');
      setLinkDiagramLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== 'profiles') {
      setHighlightedProfileId(null);
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage === 'logs' && isAdmin) {
      fetchLogs(1);
      fetchSessions(1);
    }
  }, [currentPage, isAdmin, fetchLogs, fetchSessions]);

  const notifications = useMemo<NotificationItem[]>(() => {
    if (!currentUser) {
      return [];
    }

    const items: NotificationItem[] = [];

    requests.forEach((request) => {
      if (isAdmin && request.status !== 'identified') {
        items.push({
          id: `admin-${request.id}`,
          requestId: request.id,
          phone: request.phone,
          status: 'pending',
          message: 'Nouvelle demande d\'identification',
          description: request.user_login
            ? `Envoyée par ${request.user_login}`
            : 'Demande en attente de traitement',
          type: 'request'
        });
      }

      if (
        !isAdmin &&
        request.status === 'identified' &&
        (request.user_id === currentUser.id || request.user_login === currentUser.login)
      ) {
        items.push({
          id: `user-${request.id}`,
          requestId: request.id,
          phone: request.phone,
          status: 'identified',
          message: 'Identification terminée',
          description: `Le numéro ${request.phone} a été identifié`,
          type: 'request'
        });
      }
    });

    serverNotifications.forEach((notif) => {
      if (notif.type === 'case_shared' && notif.data) {
        const caseId = typeof notif.data.caseId === 'number' ? notif.data.caseId : undefined;
        const caseName = typeof notif.data.caseName === 'string' ? notif.data.caseName : '';
        const ownerLogin = typeof notif.data.owner === 'string' ? notif.data.owner : '';
        if (caseId) {
          items.push({
            id: `share-${notif.id}`,
            notificationId: notif.id,
            caseId,
            status: 'pending',
            message: 'Nouvelle opération partagée',
            description: caseName
              ? ownerLogin
                ? `"${caseName}" partagé par ${ownerLogin}`
                : `"${caseName}" est disponible`
              : 'Une opération a été partagée avec vous',
            type: 'case_shared',
            read: Boolean(notif.read_at)
          });
        }
      } else if (notif.type === 'profile_shared' && notif.data) {
        const folderId = typeof notif.data.folderId === 'number' ? notif.data.folderId : undefined;
        const folderName = typeof notif.data.folderName === 'string' ? notif.data.folderName : '';
        const ownerLogin = typeof notif.data.owner === 'string' ? notif.data.owner : '';
        if (folderId) {
          items.push({
            id: `profile-share-${notif.id}`,
            notificationId: notif.id,
            folderId,
            folderName,
            status: 'pending',
            message: 'Nouveau dossier de profils partagé',
            description: folderName
              ? ownerLogin
                ? `"${folderName}" partagé par ${ownerLogin}`
                : `"${folderName}" est disponible`
              : 'Un dossier de profils a été partagé avec vous',
            type: 'profile_shared',
            read: Boolean(notif.read_at)
          });
        }
      }
    });

    monitoringAlerts.forEach((alert) => {
      const isImei = alert.targetType === 'imei';
      const noun = isImei ? 'numéro' : 'IMEI';
      const plural = alert.newPeers.length > 1 ? 's' : '';
      items.push({
        id: `monitoring-${alert.id}`,
        status: 'pending',
        message: isImei ? 'Nouvelle activité sur un IMEI surveillé' : 'Nouvelle activité sur un numéro surveillé',
        description: `${alert.newPeers.length} ${noun}${plural} détecté${plural} pour ${alert.targetValue}`,
        type: 'monitoring',
        targetType: alert.targetType,
        targetValue: alert.targetValue,
      });
    });

    return items
      .sort((a, b) => {
        const idA = a.requestId ?? a.notificationId ?? 0;
        const idB = b.requestId ?? b.notificationId ?? 0;
        return idB - idA;
      })
      .slice(0, 20);
  }, [currentUser, requests, isAdmin, serverNotifications, monitoringAlerts]);

  const notificationCount = notifications.filter(
    (notification) => !notification.read && !readNotifications.includes(notification.id)
  ).length;
  const totalNotifications = notifications.length;

  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      fetchRequests();
      fetchServerNotifications();
    }, 60000);
    return () => clearInterval(interval);
  }, [currentUser, fetchRequests, fetchServerNotifications]);

  const handleNotificationClick = () => {
    setShowNotifications(prev => !prev);
  };

  const handleNotificationSelect = (notification: NotificationItem) => {
    setReadNotifications(prev =>
      prev.includes(notification.id) ? prev : [...prev, notification.id]
    );
    if (notification.type === 'case_shared') {
      if (notification.notificationId) {
        markServerNotificationAsRead(notification.notificationId);
      }
      setShowNotifications(false);
      if (notification.caseId) {
        const match = cases.find((c) => c.id === notification.caseId);
        if (match) {
          setSelectedCase(match);
          navigateToPage('cdr-case');
        } else {
          setPendingShareCaseId(notification.caseId);
          fetchCases();
          navigateToPage('cdr');
        }
      } else {
        navigateToPage('cdr');
      }
      return;
    } else if (notification.type === 'profile_shared') {
      if (notification.notificationId) {
        markServerNotificationAsRead(notification.notificationId);
      }
      setShowNotifications(false);
      setHighlightedProfileId(null);
      if (notification.folderId) {
        setHighlightedFolderId(notification.folderId);
      }
      setProfileListRefreshKey((prev) => prev + 1);
      navigateToPage('profiles');
      return;
    } else if (notification.type === 'monitoring') {
      setShowNotifications(false);
      navigateToPage('fraud-monitoring');
      return;
    }
    setShowNotifications(false);
    navigateToPage('requests');
    setHighlightedRequestId(notification.requestId);
  };

  useEffect(() => {
    if (!highlightedRequestId || currentPage !== 'requests') return;
    const timeout = setTimeout(() => {
      const element = document.getElementById(`request-${highlightedRequestId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    return () => clearTimeout(timeout);
  }, [highlightedRequestId, currentPage, visibleRequests]);

  useEffect(() => {
    if (!highlightedRequestId) return;
    const timeout = setTimeout(() => setHighlightedRequestId(null), 5000);
    return () => clearTimeout(timeout);
  }, [highlightedRequestId]);

  const numericSearch = searchQuery.replace(/\D/g, '');
  const hasPendingRequestForSearch =
    numericSearch.length > 0 &&
    requests.some((request) => {
      const requestPhoneDigits = request.phone.replace(/\D/g, '');
      return request.status !== 'identified' && requestPhoneDigits === numericSearch;
    });
  const canRequestIdentification =
    !!searchResults &&
    searchResults.total === 0 &&
    (numericSearch.startsWith('77') || numericSearch.startsWith('78')) &&
    numericSearch.length >= 9 &&
    !hasPendingRequestForSearch;

  const filteredGendarmerie =
    gendarmerieSearch.trim() === ''
      ? gendarmerieData
      : (() => {
          const results: GendarmerieEntry[] = [];
          const addedTitles = new Set<number>();
          const searchLower = gendarmerieSearch.toLowerCase();
          gendarmerieData.forEach((entry, index) => {
            const matches =
              entry.libelle.toLowerCase().includes(searchLower) ||
              (entry.telephone || '').toLowerCase().includes(searchLower) ||
              (entry.souscategorie || '').toLowerCase().includes(searchLower) ||
              (entry.secteur || '').toLowerCase().includes(searchLower) ||
              entry.id.toString().includes(searchLower);

            if (matches) {
              if (entry.telephone && entry.telephone.trim() !== '') {
                const prev = gendarmerieData[index - 1];
                if (
                  prev &&
                  (!prev.telephone || prev.telephone.trim() === '') &&
                  !addedTitles.has(prev.id)
                ) {
                  results.push(prev);
                  addedTitles.add(prev.id);
                }
              }
              results.push(entry);
            }
          });
          return results;
        })();

  const gendarmerieTotalPages = Math.max(
    1,
    Math.ceil(filteredGendarmerie.length / gendarmeriePerPage)
  );
  const paginatedGendarmerie = filteredGendarmerie.slice(
    (gendarmeriePage - 1) * gendarmeriePerPage,
    gendarmeriePage * gendarmeriePerPage
  );

  useEffect(() => {
    setGendarmeriePage(page => Math.min(page, gendarmerieTotalPages));
  }, [gendarmerieTotalPages]);

  const filteredOng =
    ongSearch.trim() === ''
      ? ongData
      : ongData.filter(entry =>
          Object.values(entry).some(val =>
            String(val || '')
              .toLowerCase()
              .includes(ongSearch.toLowerCase())
          )
        );

  const ongTotalPages = Math.max(
    1,
    Math.ceil(filteredOng.length / ongPerPage)
  );
  const paginatedOng = filteredOng.slice(
    (ongPage - 1) * ongPerPage,
    ongPage * ongPerPage
  );

  useEffect(() => {
    setOngPage(page => Math.min(page, ongTotalPages));
  }, [ongTotalPages]);

  const entreprisesTotalPages = Math.max(
    1,
    Math.ceil(entreprisesTotal / entreprisesPerPage)
  );
  const paginatedEntreprises = entreprisesData;

  useEffect(() => {
    setEntreprisesPage(page => Math.min(page, entreprisesTotalPages));
  }, [entreprisesTotalPages]);

  const vehiculesTotalPages = Math.max(
    1,
    Math.ceil(vehiculesTotal / vehiculesPerPage)
  );
  const paginatedVehicules = vehiculesData;

  useEffect(() => {
    setVehiculesPage(page => Math.min(page, vehiculesTotalPages));
  }, [vehiculesTotalPages]);

  useEffect(() => {
    setGendarmeriePage(1);
  }, [gendarmerieSearch]);

  useEffect(() => {
    setOngPage(1);
  }, [ongSearch]);

  useEffect(() => {
    setEntreprisesPage(1);
  }, [entreprisesSearch]);

  useEffect(() => {
    setVehiculesPage(1);
  }, [vehiculesSearch]);

  // Page de connexion
  if (!isAuthenticated) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-4 ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100'
            : 'bg-gradient-to-br from-blue-50 via-white to-blue-50'
        }`}
      >
        <div className="max-w-md w-full">
          <div className="bg-white shadow-2xl rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4 text-white">
                  <SoraLogo className="h-10 w-10" />
                </div>
                <h2 className="text-2xl font-bold text-white">SORA</h2>
              </div>
            </div>
            
            <div className="px-8 py-6">
              <form onSubmit={handleLogin} className="space-y-6">
                {logoutReason === 'inactivity' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                    Votre session a expiré après une période d'inactivité. Veuillez vous reconnecter.
                  </div>
                )}
                <div>
                  <label htmlFor="login" className="block text-sm font-semibold text-gray-700 mb-2">
                    Nom d'utilisateur
                  </label>
                  <input
                    id="login"
                    type="text"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Entrez votre nom d'utilisateur"
                    value={loginData.login}
                    onChange={(e) => setLoginData({ ...loginData, login: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                    Mot de passe
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Entrez votre mot de passe"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  />
                </div>

                {loginInfo && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
                    {loginInfo}
                  </div>
                )}

                {loginError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all"
                >
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Connexion...
                    </div>
                  ) : (
                    'Se connecter'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderCdrSearchForm = (variant: 'standalone' | 'map' = 'standalone') => {
    const showDetectionPanel = false;
    const isStandalone = variant === 'standalone';

    const sectionClassName = isStandalone
      ? 'relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100 shadow-2xl shadow-slate-200/60 ring-1 ring-slate-200/60 backdrop-blur-sm dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-900 dark:to-slate-950 dark:shadow-black/40 dark:ring-slate-800/60'
      : 'rounded-3xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/50 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40';

    const contentClassName = isStandalone ? 'space-y-6 p-6 sm:p-8' : 'space-y-8 p-6 sm:p-8';

    const combinedSection = (
      <section className={sectionClassName}>
        {isStandalone && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-100/40 via-transparent to-indigo-100/60 dark:from-blue-500/10 dark:to-indigo-500/10" aria-hidden />
        )}
        <div className={contentClassName}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Géolocalisation</h3>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                  <Search className="h-3.5 w-3.5" />
                  {effectiveCdrIdentifiers.length} identifiant{effectiveCdrIdentifiers.length > 1 ? 's' : ''}
                </span>
                {(cdrStart || cdrEnd) && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                    <Clock className="h-3.5 w-3.5" />
                    Période : {cdrStart || 'non définie'} → {cdrEnd || 'non définie'}
                  </span>
                )}
                {cdrItinerary && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50 px-3 py-1 text-blue-600 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
                    <Car className="h-3.5 w-3.5" />
                    Itinéraire activé
                  </span>
                )}
                {selectedCase && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                    <Database className="h-3.5 w-3.5" />
                    {selectedCase.name || `Opération #${selectedCase.id}`}
                  </span>
                )}
              </div>
            </div>
            {showDetectionPanel && (
              <div className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40 lg:w-[320px]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Détection de fraude</p>
                    <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">Changement de numéro</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Analysez les terminaux identifiés dans l'opération en cours.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleFraudDetectionClick}
                    disabled={fraudLoading || !selectedCase || !hasFraudDetectionNumbers}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {fraudLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scan className="h-3.5 w-3.5" />}
                    <span>Analyser</span>
                  </button>
                </div>
                <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">IMEI analysés</dt>
                    <dd className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{fraudStats.totalImeis}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Numéros détectés</dt>
                    <dd className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{fraudStats.totalNumbers}</dd>
                  </div>
                  <div
                    className={`rounded-xl px-4 py-3 shadow-sm ${
                      fraudStats.newNumbers > 0
                        ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
                    }`}
                  >
                    <dt className="text-[11px] font-semibold uppercase tracking-wide">Nouveaux numéros</dt>
                    <dd className="mt-1 text-xl font-semibold">{fraudStats.newNumbers}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>

          <div
            className={`grid gap-6 ${
              showDetectionPanel ? 'xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:items-start' : ''
            }`}
          >
            <form
              onSubmit={handleCdrSearch}
              className="space-y-6 rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/40 dark:border-slate-700/60 dark:bg-slate-900/70"
            >

              <div>
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Entrer la cible</label>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="uppercase tracking-wide">Rechercher par téléphone</span>
                  <div className="inline-flex rounded-full bg-slate-100/80 p-1 shadow-inner dark:bg-slate-800/60">
                    <button
                      type="button"
                      onClick={() => handleCdrIdentifierTypeChange('phone')}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${
                        cdrIdentifierType === 'phone'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                      aria-pressed={cdrIdentifierType === 'phone'}
                    >
                      <Phone className="h-3.5 w-3.5" />
                      <span>Téléphone</span>
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300/70 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                  {cdrIdentifiers.map((id, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
                    >
                      {id}
                      <button
                        type="button"
                        onClick={() => removeCdrIdentifier(idx)}
                        className="text-blue-500 transition hover:text-blue-700 dark:hover:text-blue-100"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={cdrIdentifierInput}
                    onChange={(e) => setCdrIdentifierInput(e.target.value)}
                    onBlur={(e) => setCdrIdentifierInput(normalizeCdrIdentifier(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCdrIdentifier();
                      }
                    }}
                    placeholder="Ajouter un numéro"
                    inputMode="tel"
                    className="flex-1 min-w-[150px] border-none bg-transparent py-1 text-sm focus:outline-none focus:ring-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Date de début</label>
                  <input
                    type="date"
                    value={cdrStart}
                    onChange={(e) => setCdrStart(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Date de fin</label>
                  <input
                    type="date"
                    value={cdrEnd}
                    onChange={(e) => setCdrEnd(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Heure de début</label>
                  <input
                    type="time"
                    value={cdrStartTime}
                    onChange={(e) => setCdrStartTime(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Heure de fin</label>
                  <input
                    type="time"
                    value={cdrEndTime}
                    onChange={(e) => setCdrEndTime(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-900/60">
                <ToggleSwitch
                  label={
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-200">
                      <Car className="h-4 w-4 text-indigo-500" />
                      <span>Calculer l'itinéraire</span>
                    </div>
                  }
                  checked={cdrItinerary}
                  onChange={setCdrItinerary}
                  activeColor="peer-checked:bg-indigo-500 dark:peer-checked:bg-indigo-500"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={cdrLoading}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-300/40 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Search className="h-4 w-4" />
                    <span>Rechercher</span>
                  </button>
                </div>
              </div>
            </form>
            {showDetectionPanel && (
              <div className="space-y-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-6 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                {fraudError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                    {fraudError}
                  </div>
                )}
                {!hasFraudDetectionNumbers ? (
                  <div className="rounded-xl border border-dashed border-slate-300/70 bg-white px-4 py-4 text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                    Importez des CDR ou ajoutez un numéro à la recherche pour lancer l’analyse de fraude.
                  </div>
                ) : fraudLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-slate-100" />
                  </div>
                ) : fraudResult ? (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <span>Dernière analyse&nbsp;: {formatFraudDateTime(fraudResult.updatedAt)}</span>
                      {hasFraudSuspiciousNumbers && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 text-rose-600 dark:text-rose-300">
                          <AlertTriangle className="h-3.5 w-3.5" /> Anomalies détectées
                        </span>
                      )}
                    </div>
                    {fraudResult.imeis.length === 0 ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700 shadow-inner dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-100">
                        Aucun changement de numéro détecté pour les identifiants recherchés.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {fraudResult.imeis.map((imeiEntry) => (
                          <div
                            key={imeiEntry.imei}
                            className="space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/60"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-100">IMEI {imeiEntry.imei}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {imeiEntry.numbers.length} numéro{imeiEntry.numbers.length > 1 ? 's' : ''} détecté{imeiEntry.numbers.length > 1 ? 's' : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100/70 px-3 py-1 font-medium text-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
                                  <Activity className="h-3.5 w-3.5" /> {imeiEntry.numbers.reduce((acc, item) => acc + item.occurrences, 0)} occurrences
                                </span>
                              </div>
                            </div>
                            {imeiEntry.numbers.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-300/70 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                                Aucun numéro détecté pour cet IMEI sur la période sélectionnée.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {imeiEntry.numbers.map((numberEntry) => {
                                  const isNew = numberEntry.status === 'nouveau';
                                  return (
                                    <div
                                      key={`${imeiEntry.imei}-${numberEntry.number}`}
                                      className={`rounded-2xl border px-4 py-3 transition shadow-sm ${
                                        isNew
                                          ? 'border-rose-200 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10'
                                          : 'border-slate-200 bg-slate-50/70 dark:border-slate-700/60 dark:bg-slate-900/50'
                                      }`}
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                          <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{numberEntry.number}</p>
                                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                            <span
                                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${
                                                isNew
                                                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-200'
                                                  : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-200'
                                              }`}
                                            >
                                              {isNew ? 'Nouveau numéro détecté' : 'Numéro attendu'}
                                            </span>
                                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-3 py-1 font-medium text-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
                                              <Clock className="h-3.5 w-3.5" /> {numberEntry.occurrences} occurrence{numberEntry.occurrences > 1 ? 's' : ''}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="flex flex-col items-end text-xs text-slate-500 dark:text-slate-300">
                                          <span>
                                            Première vue :{' '}
                                            <span className="font-semibold text-slate-700 dark:text-slate-100">
                                              {formatFraudDate(numberEntry.firstSeen)}
                                            </span>
                                          </span>
                                          <span>
                                            Dernière vue :{' '}
                                            <span className="font-semibold text-slate-700 dark:text-slate-100">
                                              {formatFraudDate(numberEntry.lastSeen)}
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        {numberEntry.roles.length === 0 ? (
                                          <span className="rounded-full bg-slate-200/80 px-3 py-1 text-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
                                            Aucun rôle identifié
                                          </span>
                                        ) : (
                                          numberEntry.roles.map((role) => (
                                            <span
                                              key={role}
                                              className="rounded-full bg-slate-200/80 px-3 py-1 text-slate-600 dark:bg-slate-800/70 dark:text-slate-200"
                                            >
                                              {FRAUD_ROLE_LABELS[role] || role}
                                            </span>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-300/70 bg-white px-4 py-4 text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                    Lancez une analyse pour détecter les nouveaux numéros associés aux identifiants recherchés.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    );

    if (showCdrMap) {
      return (
        <div className="fixed bottom-6 left-6 z-[1000] w-[32rem] max-h-[88vh] overflow-y-auto rounded-3xl border border-white/60 bg-white/90 p-5 shadow-2xl shadow-blue-500/20 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/85">
          {combinedSection}
        </div>
      );
    }

    return combinedSection;
  };

  return (
    <>
      <div
      className="min-h-screen flex bg-slate-100 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100"
    >
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="group fixed top-6 left-6 z-[1100] flex h-12 w-12 items-center justify-center rounded-xl border border-white/70 bg-white/90 text-slate-700 shadow-lg shadow-blue-500/20 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200"
          title="Déployer le menu"
          aria-label="Déployer le menu"
        >
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 opacity-0 transition-opacity group-hover:opacity-100" />
          <ChevronRight className="relative h-5 w-5" />
        </button>
      )}
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-72' : 'w-20'
        } relative overflow-hidden bg-white/80 dark:bg-gray-900/60 border-r border-white/60 dark:border-gray-800/70 backdrop-blur-xl shadow-[0_20px_50px_rgba(8,112,184,0.12)] transition-all duration-300 flex flex-col`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/60 via-white/20 to-transparent dark:from-gray-900/60 dark:via-gray-900/30" />
        {/* Header */}
        <div className="relative p-6 border-b border-white/60 dark:border-gray-800/70">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center gap-0'}`}>
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30">
                <SoraLogo className="h-7 w-7" />
              </div>
              {sidebarOpen && (
                <div>
                  <h1 className="text-xl font-extrabold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-tight">SORA</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Surveillance &amp; Operations</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/70 text-gray-600 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-700/70 dark:bg-gray-800/70 dark:text-gray-200"
                aria-label="Toggle theme"
                title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              >
                <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 opacity-0 transition-opacity group-hover:opacity-100 dark:from-blue-500 dark:to-indigo-500" />
                <span className="relative">
                  {theme === 'dark' ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </span>
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="group relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/70 text-gray-600 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-700/70 dark:bg-gray-800/70 dark:text-gray-200"
                title={sidebarOpen ? 'Réduire le menu' : 'Déployer le menu'}
              >
                <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="relative">
                  {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 overflow-y-auto p-4 pb-48">
          <div className="space-y-2">
            <button
              onClick={() => navigateToPage('dashboard')}
              title="Dashboard"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'dashboard'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Activity className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Dashboard</span>}
            </button>

            <button
              onClick={() => navigateToPage('search')}
              title="Recherche"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'search'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Search className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Recherche</span>}
            </button>

            <button
              onClick={() => {
                navigateToPage('profiles');
                setShowProfileForm(false);
              }}
              title="Fiches de profil"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'profiles'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <FileText className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Fiches de profil</span>}
            </button>

            <button
              onClick={() => navigateToPage('requests')}
              title="Demandes"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'requests'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <ClipboardList className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Demandes</span>}
            </button>

            <button
              onClick={() => navigateToPage('cdr')}
              title="Géolocalisation"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'cdr'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Clock className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Géolocalisation</span>}
            </button>

            <button
              onClick={() => navigateToPage('cdr-export')}
              title="Données téléphoniques"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'cdr-export'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Download className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Données téléphoniques</span>}
            </button>

            <button
              onClick={() => navigateToPage('link-diagram')}
              title="Diagramme des liens"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'link-diagram'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Share2 className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Diagramme des liens</span>}
            </button>

            <button
              onClick={() => navigateToPage('imei-check')}
              title="Imei Check"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'imei-check'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Smartphone className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Imei Check</span>}
            </button>

            <button
              onClick={() => navigateToPage('phone-identifier')}
              title="Identifier Téléphone"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'phone-identifier'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <SatelliteDish className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Identifier Téléphone</span>}
            </button>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setBtsMenuOpen((prev) => !prev)}
                title="BTS"
                className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  isBtsPage
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                } ${!sidebarOpen && 'justify-center px-0'}`}
              >
                <Database className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                {sidebarOpen && (
                  <>
                    <span className="ml-3 flex-1 text-left">BTS</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${btsMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </>
                )}
              </button>

              {btsMenuOpen && (
                <div className={`flex flex-col gap-1 ${sidebarOpen ? 'pl-3' : ''}`}>
                  <button
                    onClick={() => {
                      setBtsProvider('orange');
                      navigateToPage('bts');
                    }}
                    title="BTS Orange"
                    className={`w-full group flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                      isBtsPage && btsProvider === 'orange'
                        ? 'bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-lg shadow-orange-500/30'
                        : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                    } ${sidebarOpen ? 'pl-10 pr-4' : 'justify-center px-0'}`}
                  >
                    <MapPin className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    {sidebarOpen && <span className="ml-3">Orange</span>}
                  </button>

                  <button
                    onClick={() => {
                      setBtsProvider('free');
                      navigateToPage('bts');
                    }}
                    title="BTS Free"
                    className={`w-full group flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                      isBtsPage && btsProvider === 'free'
                        ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/30'
                        : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                    } ${sidebarOpen ? 'pl-10 pr-4' : 'justify-center px-0'}`}
                  >
                    <MapPinOff className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    {sidebarOpen && <span className="ml-3">Free</span>}
                  </button>

                  <button
                    onClick={() => {
                      setBtsProvider('expresso');
                      navigateToPage('bts');
                    }}
                    title="BTS Expresso"
                    className={`w-full group flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                      isBtsPage && btsProvider === 'expresso'
                        ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/30'
                        : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                    } ${sidebarOpen ? 'pl-10 pr-4' : 'justify-center px-0'}`}
                  >
                    <Sparkles className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    {sidebarOpen && <span className="ml-3">Expresso</span>}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setFraudMenuOpen((prev) => !prev)}
                title="Détection de Fraude"
                className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  isFraudPage
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                } ${!sidebarOpen && 'justify-center px-0'}`}
              >
                <AlertTriangle className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                {sidebarOpen && (
                  <>
                    <span className="ml-3 flex-1 text-left">Détection de Fraude</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${fraudMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </>
                )}
              </button>

              {fraudMenuOpen && (
                <div className={`flex flex-col gap-1 ${sidebarOpen ? 'pl-3' : ''}`}>
                  <button
                    onClick={() => navigateToPage('fraud-detection-form')}
                    title="Formulaire de Détection"
                    className={`w-full group flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                      currentPage === 'fraud-detection-form'
                        ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                        : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                    } ${sidebarOpen ? 'pl-10 pr-4' : 'justify-center px-0'}`}
                  >
                    <Scan className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    {sidebarOpen && <span className="ml-3">Formulaire de Détection</span>}
                  </button>

                  <button
                    onClick={() => navigateToPage('fraud-monitoring')}
                    title="Monotoring"
                    className={`w-full group flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                      currentPage === 'fraud-monitoring'
                        ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                        : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                    } ${sidebarOpen ? 'pl-10 pr-4' : 'justify-center px-0'}`}
                  >
                    <Radar className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    {sidebarOpen && <span className="ml-3">Monotoring</span>}
                  </button>
                </div>
              )}
            </div>

            {isAdmin && (
              <button
                onClick={() => navigateToPage('blacklist')}
                title="White List"
                className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'blacklist'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                } ${!sidebarOpen && 'justify-center px-0'}`}
              >
                <Ban className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                {sidebarOpen && <span className="ml-3">White List</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => navigateToPage('logs')}
                title="Logs"
                className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'logs'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                } ${!sidebarOpen && 'justify-center px-0'}`}
              >
                <List className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                {sidebarOpen && <span className="ml-3">Logs</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => navigateToPage('users')}
                title="Utilisateurs"
                className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'users'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                } ${!sidebarOpen && 'justify-center px-0'}`}
              >
                <Users className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                {sidebarOpen && <span className="ml-3">Utilisateurs</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => navigateToPage('upload')}
                title="Charger des données"
                className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'upload'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                } ${!sidebarOpen && 'justify-center px-0'}`}
              >
                <Upload className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                {sidebarOpen && <span className="ml-3">Charger des données</span>}
              </button>
            )}
          </div>

        </nav>

        {/* User info */}
        <div className="absolute inset-x-0 bottom-0 z-20">
          <div className="relative border-t border-white/60 bg-white/90 p-4 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-gray-800/70 dark:bg-gray-900/85 dark:shadow-black/40">
            <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-white/90 via-white/40 to-transparent dark:from-gray-900/80" />
            <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center'}`}>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-500 via-gray-600 to-gray-800 text-white shadow-md shadow-gray-500/30">
                <User className="h-5 w-5" />
              </div>
              {sidebarOpen && (
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{currentUser?.login}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {isAdmin ? (
                      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-rose-500/20 to-orange-500/20 px-2.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-300">
                        <Shield className="mr-1 h-3 w-3" />
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-300">
                        <UserCheck className="mr-1 h-3 w-3" />
                        Utilisateur
                      </span>
                    )}
                  </div>
                  <p className="mt-2 inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                    Division : {currentUser?.division_name || 'Non renseignée'}
                  </p>
                </div>
              )}
            </div>

            {sidebarOpen && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => openPasswordModal()}
                  className="group relative flex items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-xs font-semibold text-gray-700 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:text-blue-600 dark:border-gray-700/70 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:text-white"
                >
                  <Key className="h-3 w-3 transition-transform duration-200 group-hover:scale-110" />
                  Mot de passe
                </button>
                <button
                  onClick={() => handleLogout()}
                  className="group relative flex items-center justify-center gap-2 rounded-xl border border-red-200/70 bg-red-50/70 px-3 py-2 text-xs font-semibold text-red-600 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                >
                  <LogOut className="h-3 w-3 transition-transform duration-200 group-hover:scale-110" />
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
        <div ref={mainContentRef} className="flex-1 overflow-auto scroll-smooth bg-white/70 dark:bg-slate-900/50">
          <div className="p-8">
              <div className="flex justify-end mb-4 relative">
                <button
                  onClick={handleNotificationClick}
                  className="relative p-2 rounded-full bg-white shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-200 text-gray-600 hover:text-blue-600 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 dark:hover:text-white"
                >
                  <Bell className="h-6 w-6" />
                  {notificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[1.75rem] px-1 h-5 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-full text-xs font-semibold flex items-center justify-center shadow-lg">
                      {notificationCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-3 w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl ring-1 ring-black/5 z-50 overflow-hidden border border-gray-100/50 dark:border-gray-700/50">
                    <div className="px-4 py-3 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                      <div>
                        <div className="text-xs uppercase tracking-wide opacity-80">Centre de notifications</div>
                        <div className="text-sm font-semibold">{totalNotifications} notification{totalNotifications > 1 ? 's' : ''}</div>
                      </div>
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-100/70 dark:divide-gray-800/80">
                      {totalNotifications === 0 ? (
                        <div className="p-6 text-sm text-center text-gray-500 dark:text-gray-400">
                          Aucune notification disponible pour le moment.
                        </div>
                      ) : (
                        notifications.map(notification => {
                          const isUnread = !notification.read && !readNotifications.includes(notification.id);
                          return (
                            <button
                              key={notification.id}
                              onClick={() => handleNotificationSelect(notification)}
                              className={`w-full text-left p-4 transition-all duration-200 flex items-start gap-3 focus:outline-none ${
                                isUnread
                                  ? 'bg-blue-50/70 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                              }`}
                            >
                              <div
                                className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${
                                  notification.status === 'pending'
                                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
                                }`}
                              >
                                {notification.status === 'pending' ? (
                                  <Clock className="h-5 w-5" />
                                ) : (
                                  <UserCheck className="h-5 w-5" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {notification.message}
                                  </span>
                                  <span
                                    className={`text-xs font-medium ${
                                      isUnread ? 'text-blue-600 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500'
                                    }`}
                                  >
                                    {isUnread ? 'Non lu' : 'Lu'}
                                  </span>
                                </div>
                                <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                  {notification.description}
                                </div>
                                {notification.phone && (
                                  <div className="mt-2 inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                                      {notification.phone}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
          {currentPage === 'search' && (
            <div className="space-y-8">
              {/* Header */}
              <PageHeader icon={<Search className="h-6 w-6" />} title="Recherche Unifiée" subtitle="Explorez toutes les bases de données en une seule recherche" />

              {/* Barre de recherche */}
              <div className="bg-white shadow-xl rounded-2xl p-8">
                <form onSubmit={handleSearch} className="space-y-6">
                  <div ref={searchHistoryContainerRef}>
                    <div className="relative">
                      <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Entrez votre recherche (CNI, nom, téléphone, immatriculation...)"
                        className="w-full pl-12 pr-40 py-4 text-lg bg-gray-50 border border-gray-200 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => {
                          if (searchHistory.length > 0) {
                            setIsHistoryOpen(true);
                          }
                        }}
                        autoComplete="off"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {searchHistory.length > 0 && (
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              setIsHistoryOpen((prev) => !prev);
                            }}
                            className={`hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition-all ${
                              isHistoryOpen
                                ? 'border-blue-200 bg-blue-50 text-blue-600 shadow-sm'
                                : 'border-gray-200 bg-white/80 text-gray-500 shadow-sm hover:border-blue-200 hover:text-blue-600'
                            }`}
                            aria-expanded={isHistoryOpen}
                            aria-label="Afficher l'historique des recherches"
                          >
                            <History className="h-4 w-4" />
                            Historique
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all flex items-center"
                        >
                          {loading ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          ) : (
                            <>
                              Rechercher
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {searchHistory.length > 0 && (
                      <div className="mt-6 rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-blue-50/40 to-blue-100/20 p-5 shadow-inner dark:border-slate-700/60 dark:from-slate-900/60 dark:via-slate-900/40 dark:to-slate-800/50">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-200">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 shadow-sm dark:bg-blue-500/20 dark:text-blue-200">
                              <History className="h-4 w-4" />
                            </span>
                            Recherches récentes
                          </div>
                          <div className="flex items-center gap-2">
                            {hasMoreHistoryEntries && (
                              <button
                                type="button"
                                onClick={() => setIsHistoryOpen((prev) => !prev)}
                                className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                              >
                                {isHistoryOpen ? 'Réduire' : 'Tout afficher'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                clearSearchHistory();
                                setIsHistoryOpen(false);
                              }}
                              className="text-xs font-medium text-slate-400 transition-colors hover:text-red-500 dark:text-slate-500 dark:hover:text-red-300"
                            >
                              Effacer tout
                            </button>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {visibleHistoryEntries.map((entry) => (
                            <div
                              key={`${entry.query}-${entry.timestamp}`}
                              className="group inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/80 pr-1 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/80 dark:border-slate-700/60 dark:bg-slate-900/50 dark:hover:border-blue-500/40 dark:hover:bg-slate-800/70"
                            >
                              <button
                                type="button"
                                onClick={() => handleHistorySelection(entry.query)}
                                className="flex items-center gap-2 rounded-full pl-3 pr-2 py-1.5 text-sm font-medium text-slate-600 transition-colors group-hover:text-blue-700 dark:text-slate-200 dark:group-hover:text-blue-200"
                              >
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600 shadow-sm dark:bg-blue-500/20 dark:text-blue-200">
                                  <Search className="h-4 w-4" />
                                </span>
                                <span className="flex flex-col text-left">
                                  <span>{entry.query}</span>
                                  <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                                    {getHistoryRelativeLabel(entry.timestamp)}
                                  </span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeSearchHistoryEntry(entry.query);
                                }}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                                aria-label={`Supprimer ${entry.query} de l'historique`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </form>
              </div>

              {/* Erreur de recherche */}
              {searchError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <X className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium">{searchError}</p>
                    </div>
                  </div>
                </div>
              )}
              {loading && <LoadingSpinner />}

              {/* Résultats */}
              {searchResults && (
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg shadow-2xl rounded-3xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-xl font-bold">Résultats de recherche</h2>
                        <div className="flex items-center mt-2 space-x-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/20">
                            <Activity className="w-4 h-4 mr-1" />
                            {resultsCountLabel}
                          </span>
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/20">
                            <Clock className="w-4 h-4 mr-1" />
                            {searchResults.elapsed_ms}ms
                          </span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setViewMode(viewMode === 'list' ? 'profile' : 'list')}
                          className="flex items-center px-4 py-2 bg-white/20 text-white rounded-lg transition-colors hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white"
                        >
                          {viewMode === 'list' ? (
                            <>
                              <UserCircle className="w-4 h-4 mr-2" />
                              Vue profils
                            </>
                          ) : (
                            <>
                              <List className="w-4 h-4 mr-2" />
                              Vue liste
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                    {searchResults.total === 0 ? (
                      <div className="text-center py-16">
                        <Search className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Aucun résultat trouvé</h3>
                        <p className="text-gray-500">
                          Essayez avec d'autres termes de recherche ou vérifiez l'orthographe.
                        </p>
                        {hasPendingRequestForSearch ? (
                          <p className="mt-4 text-sm font-medium text-amber-600">
                            Une demande d'identification est déjà en cours pour ce numéro.
                          </p>
                        ) : (
                          canRequestIdentification && (
                            <button
                              onClick={handleRequestIdentification}
                              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              Demander identification
                            </button>
                          )
                        )}
                      </div>
                    ) : viewMode === 'list' ? (
                      <div className="p-8 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700">
                        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                          {displayedHits.map((result, index) => {
                            const previewEntries = result.previewEntries;

                            return (
                              <div
                                key={index}
                                className="group relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-2xl p-6 hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-500 transform transition-all duration-300 hover:-translate-y-1"
                              >
                              {/* Header de la carte */}
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center space-x-3">
                                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-700 rounded-xl text-white shadow-md">
                                    <Database className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Résultat {index + 1}</h3>
                                  </div>
                                </div>
                              </div>

                              {/* Contenu des données */}
                              <div className="space-y-4">
                                <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {previewEntries.map((entry) => (
                                    <div
                                      key={entry.key}
                                      className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm transition-colors group-hover:border-blue-200 dark:border-slate-700/70 dark:bg-slate-800/60 dark:group-hover:border-blue-500"
                                    >
                                      <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                                        {entry.label}
                                      </dt>
                                      <dd className="mt-2 text-sm text-slate-900 dark:text-slate-100">
                                        <StructuredPreviewValue value={entry.value} />
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>

                              {/* Footer avec actions */}
                              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                <div className="text-xs text-gray-500">
                                  {previewEntries.length}{' '}
                                  champs disponibles
                                </div>
                                <button
                                  onClick={() => {
                                    // Copier les données dans le presse-papier
                                    const dataText = previewEntries
                                      .map((entry) => `${entry.label}: ${entry.value}`)
                                      .join('\n');
                                    navigator.clipboard
                                      .writeText(dataText)
                                      .then(() => {
                                        notifySuccess('Données copiées dans le presse-papier !');
                                      })
                                      .catch(() => {
                                        notifyError('Impossible de copier les données dans le presse-papier.');
                                      });
                                  }}
                                  className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900 rounded-md hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
                                >
                                  <User className="w-3 h-3 mr-1" />
                                  Copier
                                </button>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                        <div className="mt-8 text-center">
                          <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            onClick={() => {
                              const combined: Record<string, string> = {};
                              const mergeEntry = (entry: NormalizedPreviewEntry) => {
                                const key = entry.key || entry.label;
                                if (combined[key] === undefined) {
                                  combined[key] = entry.value;
                                }
                              };

                              displayedHits.forEach((h) => {
                                h.previewEntries.forEach(mergeEntry);
                              });
                              const { email, ...extra } = combined;
                              const data = {
                                email: String(email || ''),
                                extra_fields: Object.fromEntries(
                                  Object.entries(extra).map(([k, v]) => [k, String(v ?? '')])
                                )
                              };
                              openCreateProfile(data);
                            }}
                          >
                            Créer profil
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700">
                        {displayedHits.length === 0 ? (
                          <div className="flex flex-col items-center justify-center space-y-3 py-10 text-blue-600">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                              Initialisation des résultats...
                            </p>
                          </div>
                        ) : (
                          <SearchResultProfiles
                            hits={displayedHits}
                            query={searchQuery}
                            onCreateProfile={openCreateProfile}
                          />
                        )}
                      </div>
                    )}
                    {searchResults.page < searchResults.pages && (
                      <div className="text-center p-4">
                        <button
                          onClick={loadMoreResults}
                          disabled={loading || isProgressiveLoading}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {loading || isProgressiveLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Chargement...
                            </>
                          ) : (
                            'Charger plus'
                          )}
                        </button>
                      </div>
                    )}
                    {isProgressiveLoading && (
                      <div className="text-center pb-6">
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center px-6 py-3 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg cursor-wait"
                        >
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Affichage progressif des résultats...
                        </button>
                      </div>
                    )}
                </div>
              )}
            </div>
            )}

            {currentPage === 'imei-check' && (
              <div className="space-y-8">
                <PageHeader
                  icon={<Fingerprint className="h-6 w-6" />}
                  title="Imei Check"
                  subtitle="Analyse instantanée d'un terminal mobile via son IMEI"
                />

                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 p-8 shadow-xl dark:border-slate-800/70 dark:from-slate-900 dark:via-slate-900/80 dark:to-blue-950/60">
                      <div className="pointer-events-none absolute -left-10 top-0 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
                      <div className="pointer-events-none absolute bottom-0 right-0 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
                      <div className="relative space-y-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-blue-600 dark:text-blue-300">Nouvelle vérification</p>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Scanner un IMEI</h3>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                              Saisissez l'IMEI complet pour récupérer la marque et le modèle du terminal via l'API publique
                              d'ImeiCheck.
                            </p>
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-white/60 backdrop-blur dark:bg-slate-800/70 dark:text-slate-100 dark:ring-slate-700/70">
                            <Sparkles className="h-4 w-4 text-amber-500" />
                            Accès instantané
                          </div>
                        </div>

                        <form onSubmit={handleImeiLookup} className="space-y-4">
                          <div className="flex flex-col gap-4 sm:flex-row">
                            <div className="flex-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                                Numéro IMEI
                              </label>
                              <div className="relative mt-2">
                                <div className="absolute left-3 top-1/2 flex h-10 -translate-y-1/2 items-center rounded-xl bg-white/80 px-3 text-xs font-semibold uppercase tracking-wide text-blue-600 ring-1 ring-blue-100 shadow-sm dark:bg-slate-800/70 dark:text-blue-300 dark:ring-slate-700">
                                  IMEI
                                </div>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={18}
                                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 pl-20 text-lg font-medium text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900"
                                  placeholder="Ex: 353843245663428"
                                  value={imeiInput}
                                  onChange={(e) => setImeiInput(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="flex items-end">
                              <button
                                type="submit"
                                disabled={imeiLoading}
                                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60 disabled:shadow-none"
                              >
                                {imeiLoading ? (
                                  <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Vérification...
                                  </>
                                ) : (
                                  <>
                                    <Scan className="mr-2 h-5 w-5" />
                                    Lancer le scan
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </form>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100">
                            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              <Fingerprint className="h-4 w-4" />
                              Authenticité
                            </div>
                            <p className="mt-2 text-lg">IMEI normalisé</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Les espaces et caractères spéciaux sont ignorés.</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100">
                            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              <Radar className="h-4 w-4" />
                              Couverture mondiale
                            </div>
                            <p className="mt-2 text-lg">Modèle et marque détectés</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Basé sur la base de données publique ImeiCheck.</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100">
                            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              <Clock className="h-4 w-4" />
                              Temps réel
                            </div>
                            <p className="mt-2 text-lg">Réponse instantanée</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Accédez aux données dès la soumission du formulaire.</p>
                          </div>
                        </div>

                        {imeiError && (
                          <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-inner dark:border-rose-900/60 dark:bg-rose-900/40 dark:text-rose-100">
                            <div className="flex items-center gap-2 font-semibold">
                              <AlertTriangle className="h-4 w-4" />
                              {imeiError}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {imeiResult ? (
                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-800/70 dark:bg-slate-900/80 dark:shadow-black/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Identité de l'appareil</p>
                              <h4 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{imeiResult.object?.brand || 'Inconnu'}</h4>
                              <p className="text-sm text-slate-500 dark:text-slate-300">{imeiResult.object?.name || imeiResult.object?.model || 'Modèle non communiqué'}</p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30">
                              <Smartphone className="h-6 w-6" />
                            </div>
                          </div>
                          <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm shadow-inner dark:border-slate-700/60 dark:bg-slate-800/60">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Modèle complet</p>
                              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{imeiResult.object?.model || 'Non renseigné'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm shadow-inner dark:border-slate-700/60 dark:bg-slate-800/60">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">IMEI interrogé</p>
                              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{imeiResult.imei}</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-800/70 dark:bg-slate-900/80 dark:shadow-black/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Résultats</p>
                              <h4 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50">Détails de la réponse</h4>
                            </div>
                          </div>
                          <pre className="mt-4 whitespace-pre-line rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-sm leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100">
                            {formatImeiResultText(imeiResult.result) || 'Aucun détail supplémentaire fourni.'}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-center shadow-inner dark:border-slate-700 dark:bg-slate-900/60">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/30">
                          <Scan className="h-8 w-8" />
                        </div>
                        <h4 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">Prêt à scanner</h4>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                          Lancez une vérification pour afficher ici les informations détaillées de l'appareil.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-800/70 dark:bg-slate-900/80 dark:shadow-black/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30">
                          <Sparkles className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Conseils</p>
                          <h4 className="text-lg font-bold text-slate-900 dark:text-slate-50">Optimiser vos recherches</h4>
                        </div>
                      </div>
                      <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-1 h-4 w-4 text-emerald-500" />
                          Préférez un IMEI complet sur 15 chiffres pour des résultats précis.
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-1 h-4 w-4 text-emerald-500" />
                          Supprimez les espaces, tirets ou caractères spéciaux avant envoi.
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-1 h-4 w-4 text-emerald-500" />
                          Comparez la marque et le modèle obtenus avec les déclarations de l'utilisateur.
                        </li>
                      </ul>
                    </div>

                    {imeiResult && (
                      <div className="rounded-3xl border border-blue-200/70 bg-blue-50/80 p-6 shadow-inner dark:border-blue-900/60 dark:bg-blue-950/30">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-200">Synthèse</p>
                            <h4 className="text-lg font-bold text-blue-900 dark:text-blue-50">Profil détecté</h4>
                            <p className="text-sm text-blue-800/80 dark:text-blue-200/80">IMEI {imeiResult.imei}</p>
                          </div>
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 text-blue-600 shadow-lg shadow-blue-500/30 dark:bg-blue-900/60 dark:text-blue-200">
                            <Fingerprint className="h-6 w-6" />
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-white/90 p-4 text-sm font-semibold text-blue-900 shadow-sm ring-1 ring-white/70 dark:bg-blue-900/40 dark:text-blue-50 dark:ring-blue-800/60">
                            {imeiResult.object?.brand || 'Marque inconnue'}
                          </div>
                          <div className="rounded-2xl bg-white/90 p-4 text-sm text-blue-900 shadow-sm ring-1 ring-white/70 dark:bg-blue-900/40 dark:text-blue-50 dark:ring-blue-800/60">
                            {imeiResult.object?.model || imeiResult.object?.name || 'Modèle non communiqué'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'bts' && (
              <BtsPage
                provider={btsProvider}
                onProviderChange={(next) => setBtsProvider(next)}
              />
            )}

            {currentPage === 'annuaire' && (
              <div className="space-y-6">
                <PageHeader icon={<Phone className="h-6 w-6" />} title="Annuaire Gendarmerie" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={gendarmerieSearch}
                onChange={(e) => setGendarmerieSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60 dark:bg-slate-900/70 dark:border-slate-700/60">
                {gendarmerieLoading ? (
                  <div className="loading-bar-container my-4">
                    <div className="loading-bar"></div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                      <thead className="bg-slate-100/80 dark:bg-slate-800/80">
                        <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                          <th className="px-6 py-3">ID</th>
                          <th className="px-6 py-3">Libellé</th>
                          <th className="px-6 py-3">Téléphone</th>
                          <th className="px-6 py-3">SousCategorie</th>
                          <th className="px-6 py-3">Secteur</th>
                          <th className="px-6 py-3">Créé le</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                        {paginatedGendarmerie.map((entry) => {
                          const isTitle = !entry.telephone || entry.telephone.trim() === '';
                          return isTitle ? (
                            <tr key={entry.id} className="bg-slate-100/80 dark:bg-slate-800/70">
                              <td colSpan={6} className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                                {entry.libelle}
                              </td>
                            </tr>
                          ) : (
                            <tr
                              key={entry.id}
                              className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/60 dark:even:bg-slate-800/60"
                            >
                              <td className="px-6 py-4 whitespace-nowrap">{entry.id}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.libelle}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.telephone}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.souscategorie}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.secteur}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="border-t border-slate-200/80 px-6 py-4 dark:border-slate-800/60">
                      <div className="flex flex-col gap-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          Page {gendarmeriePage} sur {gendarmerieTotalPages}
                        </span>
                        <PaginationControls
                          currentPage={gendarmeriePage}
                          totalPages={gendarmerieTotalPages}
                          onPageChange={setGendarmeriePage}
                          onLoadMore={() =>
                            setGendarmeriePage((page) =>
                              Math.min(page + 1, gendarmerieTotalPages)
                            )
                          }
                          canLoadMore={gendarmeriePage < gendarmerieTotalPages}
                          pageSize={gendarmeriePerPage}
                          pageSizeOptions={PAGE_SIZE_OPTIONS}
                          onPageSizeChange={(size) => {
                            setGendarmeriePerPage(size);
                            setGendarmeriePage(1);
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {currentPage === 'link-diagram' && (
            <div className="space-y-10">
              <PageHeader
                icon={<Share2 className="h-6 w-6" />}
                title="Diagramme des liens"
                subtitle="Explorez les interactions entre plusieurs numéros en quelques secondes."
              />

              <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-indigo-50/70 p-8 shadow-[0_30px_60px_-24px_rgba(79,70,229,0.35)] backdrop-blur dark:border-slate-700/60 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/50">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.12),transparent_25%),radial-gradient(circle_at_80%_0%,rgba(147,51,234,0.14),transparent_28%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.12),transparent_30%)]" aria-hidden />
                <div className="relative grid gap-10 lg:grid-cols-1 lg:items-start">
                  <div className="space-y-6 rounded-3xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-indigo-500/15 ring-1 ring-white/60 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:ring-slate-800/60">
                    <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 dark:border-slate-700/60">
                      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Configuration</p>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Composez votre graphe</h2>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Renseignez un numéro (221) pour découvrir ses interactions. Les filtres temporels affinent la période
                        d'analyse.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Numéros de téléphone</label>
                      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/50">
                        <div className="flex flex-wrap items-center gap-2">
                          {linkDiagramNumbers.map((number) => (
                            <span
                              key={number}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-slate-100"
                            >
                              {number}
                              <button
                                type="button"
                                onClick={() => removeLinkDiagramNumber(number)}
                                className="text-slate-400 transition hover:text-rose-500"
                                aria-label={`Supprimer ${number}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            placeholder="Ex: 221781234567, +22177..."
                            value={linkDiagramNumberInput}
                            onChange={(event) => setLinkDiagramNumberInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ',') {
                                event.preventDefault();
                                addLinkDiagramNumbersFromInput();
                              }
                            }}
                            onBlur={() => addLinkDiagramNumbersFromInput()}
                            className="min-w-[200px] flex-1 rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => addLinkDiagramNumbersFromInput()}
                            className="inline-flex items-center justify-center rounded-full border border-slate-200/70 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-indigo-500/60 dark:hover:text-indigo-100"
                          >
                            Ajouter
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Ajoutez plusieurs numéros (préfixe 221). Séparez-les par une virgule ou validez avec Entrée.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Date de début</label>
                        <input
                          type="date"
                          value={linkDiagramStart}
                          onChange={(event) => setLinkDiagramStart(event.target.value)}
                          className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Date de fin</label>
                        <input
                          type="date"
                          value={linkDiagramEnd}
                          onChange={(event) => setLinkDiagramEnd(event.target.value)}
                          className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    {linkDiagramError && (
                      <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                        <AlertTriangle className="h-4 w-4" />
                        {linkDiagramError}
                      </div>
                    )}
                    {linkDiagramInfo && (
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100">
                        <Info className="h-4 w-4" />
                        {linkDiagramInfo}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleStandaloneLinkDiagram}
                        disabled={linkDiagramLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {linkDiagramLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        <span>Analyser</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLinkDiagramNumbers([]);
                          setLinkDiagramNumberInput('');
                          setLinkDiagramStart('');
                          setLinkDiagramEnd('');
                          setLinkDiagramError('');
                          setLinkDiagramInfo('');
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-indigo-500/60 dark:hover:text-indigo-100"
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span>Réinitialiser</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {linkDiagram && (
                <LinkDiagram
                  data={linkDiagram}
                  rootId={linkDiagram.root ?? linkDiagramPrimaryNumber}
                  rootIds={linkDiagramNumbers}
                  filters={{
                    number: linkDiagramPrimaryNumber ?? undefined,
                    start: linkDiagramStart,
                    end: linkDiagramEnd
                  }}
                  startFullscreen
                  onClose={() => setLinkDiagram(null)}
                />
              )}
            </div>
          )}

          {currentPage === 'ong' && (
            <div className="space-y-6">
              <PageHeader icon={<Users className="h-6 w-6" />} title="ONG" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={ongSearch}
                onChange={(e) => {
                  setOngSearch(e.target.value);
                  setOngPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60 dark:bg-slate-900/70 dark:border-slate-700/60">
                {ongLoading ? (
                  <div className="loading-bar-container my-4">
                    <div className="loading-bar"></div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                      <thead className="bg-slate-100/80 dark:bg-slate-800/80">
                        <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                          <th className="px-6 py-3">ID</th>
                          <th className="px-6 py-3">organization_name</th>
                          <th className="px-6 py-3">type</th>
                          <th className="px-6 py-3">name</th>
                          <th className="px-6 py-3">title</th>
                          <th className="px-6 py-3">email_address</th>
                          <th className="px-6 py-3">telephone</th>
                          <th className="px-6 py-3">select_area_of_Interest</th>
                          <th className="px-6 py-3">select_sectors_of_interest</th>
                          <th className="px-6 py-3">created_at</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                        {paginatedOng.map(entry => (
                          <tr key={entry.id} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/60 dark:even:bg-slate-800/60">
                            <td className="px-6 py-4 whitespace-nowrap">{entry.id}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.organization_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.type}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.title}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.email_address}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.telephone}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.select_area_of_Interest}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.select_sectors_of_interest}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t border-slate-200/80 px-6 py-4 dark:border-slate-800/60">
                      <div className="flex flex-col gap-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          Page {ongPage} sur {ongTotalPages}
                        </span>
                        <PaginationControls
                          currentPage={ongPage}
                          totalPages={ongTotalPages}
                          onPageChange={setOngPage}
                          onLoadMore={() =>
                            setOngPage(page => Math.min(page + 1, ongTotalPages))
                          }
                          canLoadMore={ongPage < ongTotalPages}
                          pageSize={ongPerPage}
                          pageSizeOptions={PAGE_SIZE_OPTIONS}
                          onPageSizeChange={(size) => {
                            setOngPerPage(size);
                            setOngPage(1);
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {currentPage === 'entreprises' && (
            <div className="space-y-6">
              <PageHeader icon={<Building2 className="h-6 w-6" />} title="Entreprises" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={entreprisesSearch}
                onChange={(e) => {
                  setEntreprisesSearch(e.target.value);
                  setEntreprisesPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60 dark:bg-slate-900/70 dark:border-slate-700/60">
                {entreprisesLoading ? (
                  <div className="loading-bar-container my-4">
                    <div className="loading-bar"></div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                      <thead className="bg-slate-100/80 dark:bg-slate-800/80">
                        <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                          <th className="px-6 py-3 whitespace-nowrap">ninea_ninet</th>
                          <th className="px-6 py-3 whitespace-nowrap">cuci</th>
                          <th className="px-6 py-3 whitespace-nowrap">raison_social</th>
                          <th className="px-6 py-3 whitespace-nowrap">ensemble_sigle</th>
                          <th className="px-6 py-3 whitespace-nowrap">numrc</th>
                          <th className="px-6 py-3 whitespace-nowrap">syscoa1</th>
                          <th className="px-6 py-3 whitespace-nowrap">syscoa2</th>
                          <th className="px-6 py-3 whitespace-nowrap">syscoa3</th>
                          <th className="px-6 py-3 whitespace-nowrap">naemas</th>
                          <th className="px-6 py-3 whitespace-nowrap">naemas_rev1</th>
                          <th className="px-6 py-3 whitespace-nowrap">citi_rev4</th>
                          <th className="px-6 py-3 whitespace-nowrap">adresse</th>
                          <th className="px-6 py-3 whitespace-nowrap">telephone</th>
                          <th className="px-6 py-3 whitespace-nowrap">telephone1</th>
                          <th className="px-6 py-3 whitespace-nowrap">numero_telecopie</th>
                          <th className="px-6 py-3 whitespace-nowrap">email</th>
                          <th className="px-6 py-3 whitespace-nowrap">bp</th>
                          <th className="px-6 py-3 whitespace-nowrap">region</th>
                          <th className="px-6 py-3 whitespace-nowrap">departement</th>
                          <th className="px-6 py-3 whitespace-nowrap">ville</th>
                          <th className="px-6 py-3 whitespace-nowrap">commune</th>
                          <th className="px-6 py-3 whitespace-nowrap">quartier</th>
                          <th className="px-6 py-3 whitespace-nowrap">personne_contact</th>
                          <th className="px-6 py-3 whitespace-nowrap">adresse_personne_contact</th>
                          <th className="px-6 py-3 whitespace-nowrap">qualite_personne_contact</th>
                          <th className="px-6 py-3 whitespace-nowrap">premiere_annee_exercice</th>
                          <th className="px-6 py-3 whitespace-nowrap">forme_juridique</th>
                          <th className="px-6 py-3 whitespace-nowrap">regime_fiscal</th>
                          <th className="px-6 py-3 whitespace-nowrap">pays_du_siege_de_lentreprise</th>
                          <th className="px-6 py-3 whitespace-nowrap">nombre_etablissement</th>
                          <th className="px-6 py-3 whitespace-nowrap">controle</th>
                          <th className="px-6 py-3 whitespace-nowrap">date_reception</th>
                          <th className="px-6 py-3 whitespace-nowrap">libelle_activite_principale</th>
                          <th className="px-6 py-3 whitespace-nowrap">observations</th>
                          <th className="px-6 py-3 whitespace-nowrap">systeme</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                        {paginatedEntreprises.map((entry, index) => (
                          <tr key={index} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/60 dark:even:bg-slate-800/60">
                            <td className="px-6 py-4 whitespace-nowrap">{entry.ninea_ninet}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.cuci}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.raison_social}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.ensemble_sigle}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.numrc}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.syscoa1}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.syscoa2}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.syscoa3}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.naemas}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.naemas_rev1}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.citi_rev4}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.adresse}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.telephone}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.telephone1}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.numero_telecopie}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.email}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.bp}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.region}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.departement}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.ville}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.commune}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.quartier}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.personne_contact}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.adresse_personne_contact}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.qualite_personne_contact}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.premiere_annee_exercice}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.forme_juridique}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.regime_fiscal}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.pays_du_siege_de_lentreprise}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.nombre_etablissement}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.controle}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.date_reception}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.libelle_activite_principale}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.observations}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.systeme}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t border-slate-200/80 px-6 py-4 dark:border-slate-800/60">
                      <div className="flex flex-col gap-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          Page {entreprisesPage} sur {entreprisesTotalPages}
                        </span>
                        <PaginationControls
                          currentPage={entreprisesPage}
                          totalPages={entreprisesTotalPages}
                          onPageChange={setEntreprisesPage}
                          onLoadMore={() =>
                            setEntreprisesPage((page) =>
                              Math.min(page + 1, entreprisesTotalPages)
                            )
                          }
                          canLoadMore={entreprisesPage < entreprisesTotalPages}
                          pageSize={entreprisesPerPage}
                          pageSizeOptions={PAGE_SIZE_OPTIONS}
                          onPageSizeChange={(size) => {
                            setEntreprisesPerPage(size);
                            setEntreprisesPage(1);
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {currentPage === 'vehicules' && (
            <div className="space-y-6">
              <PageHeader icon={<Car className="h-6 w-6" />} title="Véhicules" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={vehiculesSearch}
                onChange={(e) => {
                  setVehiculesSearch(e.target.value);
                  setVehiculesPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/60 dark:bg-slate-900/70 dark:border-slate-700/60">
                {vehiculesLoading ? (
                  <div className="loading-bar-container my-4">
                    <div className="loading-bar"></div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                      <thead className="bg-slate-100/80 dark:bg-slate-800/80">
                        <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                          <th className="px-6 py-3 whitespace-nowrap">ID</th>
                          <th className="px-6 py-3 whitespace-nowrap">Numero_Immatriculation</th>
                          <th className="px-6 py-3 whitespace-nowrap">Code_Type</th>
                          <th className="px-6 py-3 whitespace-nowrap">Numero_Serie</th>
                          <th className="px-6 py-3 whitespace-nowrap">Date_Immatriculation</th>
                          <th className="px-6 py-3 whitespace-nowrap">Serie_Immatriculation</th>
                          <th className="px-6 py-3 whitespace-nowrap">Categorie</th>
                          <th className="px-6 py-3 whitespace-nowrap">Marque</th>
                          <th className="px-6 py-3 whitespace-nowrap">Appelation_Com</th>
                          <th className="px-6 py-3 whitespace-nowrap">Genre</th>
                          <th className="px-6 py-3 whitespace-nowrap">Carrosserie</th>
                          <th className="px-6 py-3 whitespace-nowrap">Etat_Initial</th>
                          <th className="px-6 py-3 whitespace-nowrap">Immat_Etrangere</th>
                          <th className="px-6 py-3 whitespace-nowrap">Date_Etrangere</th>
                          <th className="px-6 py-3 whitespace-nowrap">Date_Mise_Circulation</th>
                          <th className="px-6 py-3 whitespace-nowrap">Date_Premiere_Immat</th>
                          <th className="px-6 py-3 whitespace-nowrap">Energie</th>
                          <th className="px-6 py-3 whitespace-nowrap">Puissance_Adm</th>
                          <th className="px-6 py-3 whitespace-nowrap">Cylindre</th>
                          <th className="px-6 py-3 whitespace-nowrap">Places_Assises</th>
                          <th className="px-6 py-3 whitespace-nowrap">PTR</th>
                          <th className="px-6 py-3 whitespace-nowrap">PTAC_Code</th>
                          <th className="px-6 py-3 whitespace-nowrap">Poids_Vide</th>
                          <th className="px-6 py-3 whitespace-nowrap">CU</th>
                          <th className="px-6 py-3 whitespace-nowrap">Prenoms</th>
                          <th className="px-6 py-3 whitespace-nowrap">Nom</th>
                          <th className="px-6 py-3 whitespace-nowrap">Date_Naissance</th>
                          <th className="px-6 py-3 whitespace-nowrap">Exact</th>
                          <th className="px-6 py-3 whitespace-nowrap">Lieu_Naissance</th>
                          <th className="px-6 py-3 whitespace-nowrap">Adresse_Vehicule</th>
                          <th className="px-6 py-3 whitespace-nowrap">Code_Localite</th>
                          <th className="px-6 py-3 whitespace-nowrap">Tel_Fixe</th>
                          <th className="px-6 py-3 whitespace-nowrap">Tel_Portable</th>
                          <th className="px-6 py-3 whitespace-nowrap">PrecImmat</th>
                          <th className="px-6 py-3 whitespace-nowrap">Date_PrecImmat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                        {paginatedVehicules.map((entry) => (
                          <tr key={entry.id} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/60 dark:even:bg-slate-800/60">
                            <td className="px-6 py-4 whitespace-nowrap">{entry.id}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Numero_Immatriculation}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Code_Type}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Numero_Serie}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Date_Immatriculation}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Serie_Immatriculation}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Categorie}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Marque}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Appelation_Com}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Genre}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Carrosserie}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Etat_Initial}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Immat_Etrangere}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Date_Etrangere}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Date_Mise_Circulation}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Date_Premiere_Immat}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Energie}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Puissance_Adm}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Cylindre}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Places_Assises}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.PTR}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.PTAC_Code}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Poids_Vide}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.CU}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Prenoms}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Nom}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Date_Naissance}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Exact}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Lieu_Naissance}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Adresse_Vehicule}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Code_Localite}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Tel_Fixe}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Tel_Portable}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.PrecImmat}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Date_PrecImmat}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t border-slate-200/80 px-6 py-4 dark:border-slate-800/60">
                      <div className="flex flex-col gap-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          Page {vehiculesPage} sur {vehiculesTotalPages}
                        </span>
                        <PaginationControls
                          currentPage={vehiculesPage}
                          totalPages={vehiculesTotalPages}
                          onPageChange={setVehiculesPage}
                          onLoadMore={() =>
                            setVehiculesPage((page) =>
                              Math.min(page + 1, vehiculesTotalPages)
                            )
                          }
                          canLoadMore={vehiculesPage < vehiculesTotalPages}
                          pageSize={vehiculesPerPage}
                          pageSizeOptions={PAGE_SIZE_OPTIONS}
                          onPageSizeChange={(size) => {
                            setVehiculesPerPage(size);
                            setVehiculesPage(1);
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
            </div>
            </div>
          )}

          {currentPage === 'cdr' && (
            <div className="space-y-10">
              <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-8 shadow-[0_30px_60px_-20px_rgba(30,64,175,0.45)] backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-purple-500/20" />
                <div className="relative grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 shadow-lg shadow-blue-500/40 dark:bg-slate-900/80">
                        <Clock className="h-6 w-6 text-blue-600 dark:text-blue-200" />
                      </div>
                      <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Géolocalisation</h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          Une interface repensée pour gérer vos analyses télécoms en toute fluidité.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                        <Database className="h-3.5 w-3.5" />
                        {cases.length} dossier{cases.length > 1 ? 's' : ''}
                      </span>
                      {ownedCasesCount > 0 && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                          <User className="h-3.5 w-3.5" />
                          {ownedCasesCount} à votre charge
                        </span>
                      )}
                      {sharedCasesCount > 0 && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                          <Share2 className="h-3.5 w-3.5" />
                          {sharedCasesCount} partagées
                        </span>
                      )}
                    </div>
                  </div>
                  <form
                    onSubmit={handleCreateCase}
                    className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-blue-500/20 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80"
                  >
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Créer une opération</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                      Nommez votre nouvelle analyse pour démarrer.
                    </p>
                    <div className="mt-4 flex flex-col gap-3">
                      <input
                        type="text"
                        placeholder="Nom de l'opération"
                        value={cdrCaseName}
                        onChange={(e) => setCdrCaseName(e.target.value)}
                        className="w-full rounded-full border border-transparent bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/30 dark:bg-slate-800/80 dark:text-slate-200"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Créer l'opération</span>
                      </button>
                    </div>
                    {cdrCaseMessage && (
                      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                        {cdrCaseMessage}
                      </div>
                    )}
                  </form>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Vos dossiers</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      Retrouvez l'ensemble des opérations accessibles.
                    </p>
                  </div>
                  {Math.max(totalCasePages, 1) > 1 && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                      Page {casePage} sur {Math.max(totalCasePages, 1)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {paginatedCases.length === 0 ? (
                    <div className="col-span-full rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-10 text-center text-sm text-slate-500 shadow-inner dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-slate-300">
                      Aucune opération enregistrée pour le moment.
                    </div>
                  ) : (
                    paginatedCases.map((c) => (
                      <div
                        key={c.id}
                        className="group relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-slate-700/60 dark:bg-slate-900/70"
                      >
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/0 via-indigo-500/10 to-purple-500/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                        <div className="relative flex h-full flex-col gap-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                              {renamingCaseId === c.id ? (
                                <input
                                  type="text"
                                  value={renamingCaseName}
                                  onChange={(event) => setRenamingCaseName(event.target.value)}
                                  onKeyDown={handleRenameKeyDown}
                                  className="w-full rounded-2xl border border-slate-300/70 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600/70 dark:bg-slate-900/60 dark:text-slate-100"
                                  placeholder="Nouveau nom de l'opération"
                                  autoFocus
                                />
                              ) : (
                                <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{c.name}</h4>
                              )}
                              {isAdmin && c.user_login && (
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  {c.user_login}
                                </p>
                              )}
                              {Boolean(!c.is_owner && c.shared_with_me) ? (
                                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                                  <Share2 className="h-3.5 w-3.5" />
                                  Partagée avec vous
                                </span>
                              ) : Boolean(c.is_owner) ? (
                                <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                                  <User className="h-3.5 w-3.5" />
                                  Propriétaire
                                </span>
                              ) : null}
                              {c.division_name && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{c.division_name}</p>
                              )}
                              {c.created_at && (
                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                  Créée le {format(parseISO(c.created_at), 'd MMM yyyy', { locale: fr })}
                                </p>
                              )}
                              {renamingCaseId === c.id && renamingCaseError && (
                                <p className="text-xs font-medium text-rose-600 dark:text-rose-300">{renamingCaseError}</p>
                              )}
                            </div>
                            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm dark:bg-white/5 dark:text-slate-300">
                              #{c.id}
                            </span>
                          </div>
                          <div className="mt-auto flex flex-wrap gap-2">
                            {renamingCaseId === c.id ? (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={submitRenameCase}
                                  disabled={renamingCaseLoading}
                                >
                                  {renamingCaseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                  <span>Enregistrer</span>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-600/70 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-slate-100"
                                  onClick={cancelRenameCase}
                                  disabled={renamingCaseLoading}
                                >
                                  <X className="h-4 w-4" />
                                  <span>Annuler</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                                onClick={() => {
                                  cancelRenameCase();
                                  setSelectedCase(c);
                                  setCdrResult(null);
                                  setShowCdrMap(false);
                                  navigateToPage('cdr-case');
                                }}
                                >
                                  <ArrowRight className="h-4 w-4" />
                                  <span>Ouvrir</span>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-600/70 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
                                  onClick={() => openCaseExportModal(c)}
                                >
                                  <Download className="h-4 w-4" />
                                  <span>Exporter</span>
                                </button>
                                {(isAdmin || c.is_owner) && (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-600/70 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
                                    onClick={() => openShareModalForCase(c)}
                                  >
                                    <Share2 className="h-4 w-4" />
                                    <span>Partager</span>
                                  </button>
                                )}
                                {(isAdmin || c.is_owner) && (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-600/70 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
                                    onClick={() => startRenameCase(c)}
                                  >
                                    <Edit className="h-4 w-4" />
                                    <span>Renommer</span>
                                  </button>
                                )}
                                {Boolean(c.is_owner) && (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-full border border-rose-300/70 bg-rose-50/80 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-400 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:border-rose-400/60"
                                    onClick={() => handleDeleteCase(c.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span>Supprimer</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {cases.length > 0 && (
                  <div className="border-t border-slate-200/80 pt-4 dark:border-slate-800/60">
                    <PaginationControls
                      currentPage={casePage}
                      totalPages={Math.max(totalCasePages, 1)}
                      onPageChange={setCasePage}
                      pageSize={casesPerPage}
                      pageSizeOptions={CASE_PAGE_SIZE_OPTIONS}
                      onPageSizeChange={(size) => {
                        setCasesPerPage(size);
                        setCasePage(1);
                      }}
                    />
                  </div>
                )}
              </section>
            </div>
          )}

          {currentPage === 'cdr-export' && (
            <div className="space-y-8">
              <PageHeader
                icon={<Download className="h-6 w-6" />}
                title="Données téléphoniques"
                subtitle="Générez un fichier Excel à partir de la table Realtime."
              />

              <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-200/60 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Paramètres d'export</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      Indiquez le numéro à filtrer et la période à couvrir pour exporter les appels.
                    </p>
                  </div>

                  <form onSubmit={handleCdrExport} className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Numéro</label>
                        <input
                          type="text"
                          value={cdrExportNumber}
                          onChange={(e) => {
                            setCdrExportNumber(e.target.value);
                            if (cdrExportError) setCdrExportError('');
                          }}
                          placeholder="Ex : 221771234567"
                          className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Période</label>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input
                            type="date"
                            value={cdrExportStart}
                            onChange={(e) => {
                              setCdrExportStart(e.target.value);
                              if (cdrExportError) setCdrExportError('');
                            }}
                            className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                          />
                          <input
                            type="date"
                            value={cdrExportEnd}
                            onChange={(e) => {
                              setCdrExportEnd(e.target.value);
                              if (cdrExportError) setCdrExportError('');
                            }}
                            className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={cdrExporting}
                        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cdrExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        <span>{cdrExporting ? 'Export en cours...' : 'Exporter en Excel'}</span>
                      </button>
                    </div>

                    {cdrExportError && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
                        {cdrExportError}
                      </div>
                    )}
                    {cdrExportInfo && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                        {cdrExportInfo}
                      </div>
                    )}
                  </form>
                </div>
              </section>
            </div>
          )}

          {currentPage === 'fraud-detection-form' && (
            <div className="space-y-8">
              <PageHeader
                icon={<AlertTriangle className="h-6 w-6" />}
                title="Formulaire de Détection"
                subtitle="Analyse centralisée des communications sensibles"
              />

              <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/60 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-rose-500/10 via-purple-500/10 to-blue-500/10" />
                <div className="relative p-8">
                  <div className="mx-auto max-w-3xl space-y-8">
                    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          Détection de changement de numéro ou d'appareil
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-300">
                          Surveillez les comportements critiques sans exposer les paramètres de détection.
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200/80 backdrop-blur dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
                        <Scan className="h-4 w-4" />
                        Analyse globale
                      </div>
                    </div>

                    <form onSubmit={handleGlobalFraudSearch} className="space-y-5 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-slate-200/50 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-black/40">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                            Numéro ou IMEI à analyser
                          </label>
                          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <span className="uppercase tracking-wide">Rechercher par</span>
                            <div className="inline-flex rounded-full bg-slate-100/80 p-1 shadow-inner dark:bg-slate-800/60">
                              <button
                                type="button"
                                onClick={() => {
                                  setGlobalFraudIdentifierType('number');
                                  if (globalFraudError) setGlobalFraudError('');
                                }}
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${
                                  globalFraudIdentifierType === 'number'
                                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                                aria-pressed={globalFraudIdentifierType === 'number'}
                              >
                                <Phone className="h-3.5 w-3.5" />
                                <span>Téléphone</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setGlobalFraudIdentifierType('imei');
                                  if (globalFraudError) setGlobalFraudError('');
                                }}
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 transition ${
                                  globalFraudIdentifierType === 'imei'
                                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                                aria-pressed={globalFraudIdentifierType === 'imei'}
                              >
                                <Fingerprint className="h-3.5 w-3.5" />
                                <span>IMEI</span>
                              </button>
                            </div>
                          </div>
                          <div className="relative">
                            <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                              <Search className="h-4 w-4" />
                            </div>
                            <input
                              type="text"
                              value={globalFraudIdentifier}
                              onChange={(e) => {
                                const nextValue =
                                  globalFraudIdentifierType === 'imei' ? normalizeImei(e.target.value) : e.target.value;
                                setGlobalFraudIdentifier(nextValue);
                                if (globalFraudError) setGlobalFraudError('');
                              }}
                              placeholder={
                                globalFraudIdentifierType === 'imei'
                                  ? 'Ex : 356789104567890'
                                  : 'Ex : 221771234567'
                              }
                              inputMode={globalFraudIdentifierType === 'imei' ? 'numeric' : 'tel'}
                              className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-12 py-3 text-base font-medium text-slate-800 shadow-inner focus:border-transparent focus:outline-none focus:ring-4 focus:ring-purple-500/30 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                              Date de début (optionnel)
                            </label>
                            <input
                              type="date"
                              value={globalFraudStart}
                              onChange={(e) => {
                                setGlobalFraudStart(e.target.value);
                                if (globalFraudError) setGlobalFraudError('');
                              }}
                              className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                              Date de fin (optionnel)
                            </label>
                            <input
                              type="date"
                              value={globalFraudEnd}
                              onChange={(e) => {
                                setGlobalFraudEnd(e.target.value);
                                if (globalFraudError) setGlobalFraudError('');
                              }}
                              className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
                        <button
                          type="submit"
                          disabled={globalFraudLoading}
                          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-300/40 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {globalFraudLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                          <span>Lancer l'analyse</span>
                        </button>
                        <button
                          type="button"
                          onClick={resetGlobalFraudSearch}
                          className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50/80 px-6 py-2.5 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:border-blue-400"
                        >
                          <X className="h-4 w-4" />
                          <span>Réinitialiser</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </section>

              {globalFraudError && (
                <div className="rounded-3xl border border-rose-200 bg-rose-50/80 px-6 py-4 text-sm text-rose-700 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                  {globalFraudError}
                </div>
              )}

              {globalFraudLoading ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : globalFraudResult ? (
                !hasGlobalFraudImeiAlerts && !hasGlobalFraudNumberAlerts ? (
                  <section className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-8 text-emerald-700 shadow-inner dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-100">
                        <Shield className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Aucune anomalie détectée</h3>
                        <p className="mt-1 text-sm">
                          Aucun IMEI partagé entre plusieurs numéros ni numéro associé à plusieurs IMEI sur la période analysée.
                        </p>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/60 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40">
                    <div className="border-b border-slate-200/70 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-500 px-8 py-6 text-white dark:border-slate-700/60">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">Résultats de l'analyse</h3>
                            <p className="text-sm text-white/80">
                              Dernière exécution&nbsp;: {formatFraudDateTime(globalFraudResult.updatedAt)}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
                            <Scan className="h-3.5 w-3.5" /> Analyse globale
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm">
                            <p className="text-white/70">IMEI suspects</p>
                            <p className="mt-1 text-2xl font-semibold text-white">{globalFraudStats.totalImeis}</p>
                          </div>
                          <div className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm">
                            <p className="text-white/70">Numéros associés</p>
                            <p className="mt-1 text-2xl font-semibold text-white">{globalFraudStats.totalNumbers}</p>
                          </div>
                          <div className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm">
                            <p className="text-white/70">Alertes multi-IMEI</p>
                            <p className="mt-1 text-2xl font-semibold text-white">{globalFraudStats.alerts}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {hasGlobalFraudImeiAlerts && (
                      <div className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                        {globalFraudResult.imeis.map((imeiEntry) => (
                          <div key={imeiEntry.imei} className="space-y-5 p-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-400/40">
                                  <AlertTriangle className="h-7 w-7" />
                                </div>
                                <div>
                                  <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                    IMEI {formatImeiForDisplay(imeiEntry.imei)}
                                  </h4>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                        imeiEntry.roleSummary.caller >= 2
                                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-200'
                                          : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'
                                      }`}
                                    >
                                      <PhoneOutgoing className="h-3.5 w-3.5" />
                                      Appelants&nbsp;: {imeiEntry.roleSummary.caller}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                        imeiEntry.roleSummary.callee >= 2
                                          ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200'
                                          : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'
                                      }`}
                                    >
                                      <PhoneIncoming className="h-3.5 w-3.5" />
                                      Appelés&nbsp;: {imeiEntry.roleSummary.callee}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/50">
                              <table className="min-w-full text-sm text-slate-700 dark:text-slate-200">
                                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
                                  <tr>
                                    <th className="px-4 py-3 text-left">Numéro</th>
                                    <th className="px-4 py-3 text-left">Dernière apparition</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80 dark:divide-white/10">
                                  {imeiEntry.numbers.map((numberEntry) => (
                                    <tr
                                      key={`${imeiEntry.imei}-${numberEntry.number}`}
                                      className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900/40 dark:even:bg-slate-900/20"
                                    >
                                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                                        {numberEntry.number}
                                      </td>
                                      <td className="px-4 py-3 text-slate-500 dark:text-slate-300">
                                        {formatFraudDate(numberEntry.lastSeen)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {hasGlobalFraudNumberAlerts && (
                      <div className={`${hasGlobalFraudImeiAlerts ? 'border-t border-slate-200/70 dark:border-slate-700/60' : ''}`}>
                        <div className="bg-slate-50/80 px-8 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-300">
                          Numéros associés à plusieurs IMEI
                        </div>
                        <div className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                          {globalFraudResult.numbers.map((numberEntry) => (
                            <div key={numberEntry.number} className="space-y-5 p-6">
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-start gap-4">
                                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 text-white shadow-lg shadow-blue-400/40">
                                    <Phone className="h-7 w-7" />
                                  </div>
                                  <div>
                                    <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Numéro {numberEntry.number}</h4>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                          numberEntry.roleSummary.caller >= 2
                                            ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-200'
                                            : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'
                                        }`}
                                      >
                                        <PhoneOutgoing className="h-3.5 w-3.5" />
                                        IMEI appelants&nbsp;: {numberEntry.roleSummary.caller}
                                      </span>
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                          numberEntry.roleSummary.callee >= 2
                                            ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200'
                                            : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'
                                        }`}
                                      >
                                        <PhoneIncoming className="h-3.5 w-3.5" />
                                        IMEI appelés&nbsp;: {numberEntry.roleSummary.callee}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/50">
                                <table className="min-w-full text-sm text-slate-700 dark:text-slate-200">
                                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
                                    <tr>
                                      <th className="px-4 py-3 text-left">IMEI</th>
                                      <th className="px-4 py-3 text-left">Dernière apparition</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100/80 dark:divide-white/10">
                                    {numberEntry.imeis.map((imeiInfo) => (
                                      <tr
                                        key={`${numberEntry.number}-${imeiInfo.imei}`}
                                        className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900/40 dark:even:bg-slate-900/20"
                                      >
                                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                                          {formatImeiForDisplay(imeiInfo.imei)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-300">
                                          {formatFraudDate(imeiInfo.lastSeen)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )
              ) : (
                <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-slate-200/60 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-300/40">
                        <AlertTriangle className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Surveillance active</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                          Les critères précis de détection sont confidentiels. Seuls les résultats essentiels sont présentés.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-100/60 px-4 py-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                      Analyse tous les CDR disponibles
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {currentPage === 'fraud-monitoring' && (
            <div className="space-y-8">
              <PageHeader
                icon={<Radar className="h-6 w-6" />}
                title="Surveillance"
                subtitle="Surveillance proactive des numéros et IMEI"
              />

              <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/85 shadow-2xl shadow-slate-200/60 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-gradient-to-br from-blue-500/25 via-indigo-500/10 to-purple-500/10 blur-3xl" />
                  <div className="absolute -right-20 bottom-4 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-400/15 via-cyan-400/15 to-blue-500/15 blur-3xl" />
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-70" />
                </div>
                <div className="relative space-y-6 p-8">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-400/40">
                        <SatelliteDish className="h-6 w-6" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Surveillance proactive</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-300">
                          Lancez une veille ciblée sur un numéro ou un IMEI et recevez des alertes dès qu’un nouveau correspondant apparaît.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-700 shadow-sm ring-1 ring-white/70 backdrop-blur dark:bg-white/10 dark:text-slate-200 dark:ring-white/5">
                            <Radar className="h-4 w-4" />
                            Veille continue
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full bg-blue-600/10 px-3 py-1 font-semibold text-blue-700 ring-1 ring-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
                            <BellRing className="h-4 w-4" />
                            Alertes automatiques
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                            <Activity className="h-4 w-4" />
                            Réactivité instantanée
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="grid w-full max-w-md grid-cols-2 gap-3 rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/60">
                      <div className="rounded-2xl bg-white/80 p-3 text-center shadow-inner dark:bg-white/5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cibles actives</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{monitoringTargets.length}</p>
                      </div>
                      <div className="rounded-2xl bg-white/80 p-3 text-center shadow-inner dark:bg-white/5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Alertes récentes</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{monitoringAlerts.length}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4 rounded-2xl border border-white/80 bg-white/90 p-5 shadow-lg shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/60 dark:shadow-black/30">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                          <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                          Nouvelle cible à surveiller
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 shadow-inner dark:bg-white/5 dark:text-slate-300">
                          {monitoringTargets.length} cible{monitoringTargets.length > 1 ? 's' : ''} suivie{monitoringTargets.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="inline-flex rounded-full bg-slate-100/80 p-1 shadow-inner dark:bg-slate-800/70">
                          <button
                            type="button"
                            onClick={() => setMonitoringType('number')}
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                              monitoringType === 'number'
                                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            Numéro
                          </button>
                          <button
                            type="button"
                            onClick={() => setMonitoringType('imei')}
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                              monitoringType === 'imei'
                                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                          >
                            <Fingerprint className="h-3.5 w-3.5" />
                            IMEI
                          </button>
                        </div>
                        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={monitoringInput}
                              onChange={(e) => setMonitoringInput(e.target.value)}
                              placeholder={monitoringType === 'imei' ? 'Ex : 356789104567890' : 'Ex : 221771234567'}
                              className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                            />
                            <div className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2 text-slate-300 dark:text-slate-500">
                              <Sparkles className="h-4 w-4" />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddMonitoringTarget}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-400/30 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                          >
                            <Plus className="h-4 w-4" />
                            Activer la veille
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {monitoringTargets.length === 0 ? (
                          <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-slate-300/80 bg-slate-50 px-4 py-4 text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                            <div className="inline-flex items-center gap-2 rounded-full bg-blue-100/70 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-100">
                              <Bell className="h-3.5 w-3.5" />
                              Notification instantanée
                            </div>
                            Commencez par ajouter un numéro ou un IMEI pour être notifié des nouvelles associations détectées.
                          </div>
                        ) : (
                          monitoringTargets.map((target) => (
                            <div
                              key={target.id}
                              className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/60"
                            >
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/10 opacity-0 transition group-hover:opacity-100" />
                              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 shadow-inner dark:bg-white/10 dark:text-slate-200">
                                      {target.type === 'imei' ? <Fingerprint className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                                      {target.type === 'imei' ? 'IMEI' : 'Numéro'}
                                    </span>
                                    <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3 py-1 text-sm font-semibold text-white shadow-lg shadow-blue-400/40">
                                      {target.value}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-white/5 dark:text-slate-200">
                                      <Activity className="h-3.5 w-3.5 text-blue-500" />
                                      {target.knownPeers.length} correspondant{target.knownPeers.length > 1 ? 's' : ''} surveillée{target.knownPeers.length > 1 ? 's' : ''}
                                    </span>
                                    {target.lastAlertAt && (
                                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-100">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Dernière alerte {formatDistanceToNow(parseISO(target.lastAlertAt), { addSuffix: true, locale: fr })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                                    Créé le {formatFraudDate(target.createdAt)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMonitoringTarget(target)}
                                    className="inline-flex items-center justify-center rounded-full border border-slate-200/80 bg-white/80 p-2 text-slate-500 transition hover:text-rose-600 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:text-rose-300"
                                    title="Arrêter la surveillance"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 rounded-2xl border border-white/80 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-5 text-white shadow-lg shadow-indigo-500/30">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-white/60">Notifications</p>
                          <h4 className="text-lg font-semibold">Timeline des alertes</h4>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearMonitoringAlerts}
                          disabled={monitoringAlerts.length === 0}
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <History className="h-3.5 w-3.5" />
                          Nettoyer
                        </button>
                      </div>

                      {monitoringAlerts.length === 0 ? (
                        <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-white/80">
                          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                            <Sparkles className="h-3.5 w-3.5" />
                            En attente d’alertes
                          </div>
                          Les nouvelles associations détectées apparaîtront ici automatiquement.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {monitoringAlerts.map((alert) => (
                            <div key={alert.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20">
                              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-indigo-500/10 to-purple-500/10 opacity-0 transition group-hover:opacity-100" />
                              <div className="relative flex flex-col gap-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white shadow-inner shadow-black/30">
                                      <BellRing className="h-5 w-5" />
                                    </span>
                                    <div>
                                      <p className="text-sm font-semibold text-white">
                                        {alert.targetType === 'imei' ? 'Nouveaux numéros détectés' : 'Nouveaux IMEI détectés'}
                                      </p>
                                      <p className="text-xs text-white/70">{alert.targetValue}</p>
                                    </div>
                                  </div>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                                    {formatDistanceToNow(parseISO(alert.createdAt), { addSuffix: true, locale: fr })}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {alert.newPeers.map((peer) => (
                                    <span
                                      key={`${alert.id}-${peer}`}
                                      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                                    >
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                                      {peer}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {currentPage === 'cdr-case' && selectedCase && (
            <div className="space-y-6">
              <PageHeader icon={<Clock className="h-6 w-6" />} title={`CDR - ${selectedCase.name}`} />
              <button
                onClick={() => {
                  cancelRenameCase();
                  navigateToPage('cdr');
                  setSelectedCase(null);
                }}
                className="text-blue-600"
              >
                &larr; Retour
              </button>

              {(isAdmin || selectedCase.is_owner) && (
                <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nom de l'opération</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-300">Mettez à jour l'intitulé pour garder vos dossiers organisés.</p>
                    </div>
                    {renamingCaseId === selectedCase.id ? (
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <input
                          type="text"
                          value={renamingCaseName}
                          onChange={(event) => setRenamingCaseName(event.target.value)}
                          onKeyDown={handleRenameKeyDown}
                          className="w-full rounded-2xl border border-slate-300/70 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600/70 dark:bg-slate-900/60 dark:text-slate-100"
                          placeholder="Nouveau nom de l'opération"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={submitRenameCase}
                            disabled={renamingCaseLoading}
                          >
                            {renamingCaseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            <span>Enregistrer</span>
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-600/70 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-slate-100"
                            onClick={cancelRenameCase}
                            disabled={renamingCaseLoading}
                          >
                            <X className="h-4 w-4" />
                            <span>Annuler</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                        <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedCase.name}</span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-600/70 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
                          onClick={() => startRenameCase(selectedCase)}
                        >
                          <Edit className="h-4 w-4" />
                          <span>Renommer</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {renamingCaseId === selectedCase.id && renamingCaseError && (
                    <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-300">{renamingCaseError}</p>
                  )}
                </div>
              )}

              {!showCdrMap && (
                <div className="grid grid-cols-1 gap-6">
                  {renderCdrSearchForm('standalone')}
                </div>
              )}

              {cdrLoading && (
                <div className="loading-bar-container my-4">
                  <div className="loading-bar"></div>
                </div>
              )}
              {cdrError && <p className="text-red-600">{cdrError}</p>}
              {cdrInfoMessage && <p className="text-gray-600">{cdrInfoMessage}</p>}
              {cdrSearchRequests.length > 0 && (
                <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white/80 p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                  <ol className="space-y-1">
                    {cdrSearchRequests.map((request, index) => (
                      <li key={`${request}-${index}`} className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
                        <span className="mt-[2px] rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                          {index + 1}
                        </span>
                        <code className="break-all text-[13px]">{request}</code>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {showCdrMap && cdrResult && !cdrLoading && (
                <>
                  <div className="fixed inset-0 z-0 flex">
                    {renderCdrSearchForm('map')}
                    <div className="flex-1 relative h-screen">
                      {cdrResult.total > 0 ? (
                        <CdrMap
                          points={cdrResult.path}
                          contactSummaries={cdrResult.contacts}
                          showRoute={cdrItinerary}
                          showMeetingPoints={showMeetingPoints}
                          onToggleMeetingPoints={() => setShowMeetingPoints((v) => !v)}
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-white/90 text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                          <div className="flex flex-col items-center gap-3 px-6 text-center">
                            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 shadow-inner shadow-blue-500/20 dark:bg-blue-500/20 dark:text-blue-200">
                              <MapPinOff className="h-8 w-8" />
                            </span>
                            <div className="space-y-1">
                              <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                                Aucun résultat cartographique
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-300">
                                Ajustez vos filtres ou élargissez votre recherche pour afficher des points sur la carte.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCdrMap(false)}
                    className="fixed top-4 right-4 z-[1000] bg-white/90 backdrop-blur rounded-full p-2 shadow"
                    aria-label="Fermer la carte"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  
                </>
              )}
              {linkDiagram && (
                <LinkDiagram
                  data={linkDiagram}
                  rootId={linkDiagram.root ?? linkDiagramPrimaryNumber}
                  rootIds={linkDiagramNumbers}
                  filters={{
                    number: linkDiagramPrimaryNumber ?? undefined,
                    start: linkDiagramStart,
                    end: linkDiagramEnd
                  }}
                  onClose={() => setLinkDiagram(null)}
                />
              )}
              </div>
            )}

          {currentPage === 'phone-identifier' && (
            <div className="space-y-10">
              <PageHeader
                icon={<SatelliteDish className="h-6 w-6" />}
                title="Identifier Téléphone"
                subtitle="Associez un numéro aux terminaux observés et enrichissez automatiquement chaque IMEI."
              />

              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-blue-50 via-white to-indigo-50/70 p-8 shadow-xl shadow-blue-200/60 dark:border-slate-700/60 dark:from-slate-900 dark:via-slate-900/80 dark:to-indigo-950/50">
                  <div className="pointer-events-none absolute -left-24 top-0 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" />
                  <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
                  <div className="relative space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-300">Recherche téléphonique</p>
                        <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Identifier un téléphone</h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                          Analysez la table <span className="font-semibold text-blue-600 dark:text-blue-300">Realtime</span>
                          &nbsp;pour révéler toutes les IMEI et IMSI associées au numéro fourni, puis enrichir chaque terminal.
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-white/70 backdrop-blur dark:bg-slate-900/70 dark:text-slate-200 dark:ring-slate-700/70">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        Enrichissement IMEI
                      </div>
                    </div>

                    <form onSubmit={handlePhoneIdentifierSearch} className="space-y-4">
                      <div className="flex flex-col gap-4 sm:flex-row">
                        <div className="flex-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                            Numéro à analyser
                          </label>
                          <div className="relative mt-2">
                            <div className="absolute left-3 top-1/2 flex h-10 -translate-y-1/2 items-center rounded-xl bg-white/80 px-3 text-xs font-semibold uppercase tracking-wide text-blue-600 ring-1 ring-blue-100 shadow-sm dark:bg-slate-800/70 dark:text-blue-300 dark:ring-slate-700">
                              NUM
                            </div>
                            <input
                              type="text"
                              inputMode="numeric"
                              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 pl-20 text-lg font-medium text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-900"
                              placeholder="Ex: 77 123 45 67"
                              value={phoneIdentifierInput}
                              onChange={(e) => setPhoneIdentifierInput(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="submit"
                            disabled={phoneIdentifierLoading}
                            className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60 disabled:shadow-none"
                          >
                            {phoneIdentifierLoading ? (
                              <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Recherche en cours...
                              </>
                            ) : (
                              <>
                                <Scan className="mr-2 h-5 w-5" />
                                Lancer l'identification
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </form>

                    {phoneIdentifierError && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-inner dark:border-rose-900/60 dark:bg-rose-900/40 dark:text-rose-100">
                        <div className="flex items-center gap-2 font-semibold">
                          <AlertTriangle className="h-4 w-4" />
                          {phoneIdentifierError}
                        </div>
                      </div>
                    )}

                    {phoneIdentifierResult && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <Fingerprint className="h-4 w-4" />
                            IMEI uniques
                          </div>
                          <p className="mt-2 text-2xl">{phoneIdentifierResult.stats.uniqueImeis}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Référencés pour ce numéro</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <UserCheck className="h-4 w-4" />
                            IMSI recensés
                          </div>
                          <p className="mt-2 text-2xl">{phoneIdentifierResult.stats.uniqueImsis}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Cartes SIM observées</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <History className="h-4 w-4" />
                            Dernière apparition
                          </div>
                          <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-50">
                            {formatPhoneIdentifierDate(phoneIdentifierResult.stats.lastSeen)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Sur la ligne ciblée</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-400/40">
                        <Database className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Source live</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-50">Realtime</p>
                        <p className="text-sm text-slate-500 dark:text-slate-300">Extraction directe des enregistrements temps réel.</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex items-start gap-3 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/60 dark:ring-slate-700/60">
                        <Fingerprint className="mt-1 h-4 w-4 text-blue-500" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">Corrélation IMEI / IMSI</p>
                          <p className="text-sm">Chaque IMEI est enrichi par ImeiCheck pour exposer marque, modèle et nom de l'appareil.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/60 dark:ring-slate-700/60">
                        <Clock className="mt-1 h-4 w-4 text-indigo-500" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">Chronologie modernisée</p>
                          <p className="text-sm">Affichage immédiat de la première et de la dernière apparition du terminal dans les CDR.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/60 dark:ring-slate-700/60">
                        <Shield className="mt-1 h-4 w-4 text-emerald-500" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-100">Vue prête pour l'enquête</p>
                          <p className="text-sm">Badges dynamiques, regroupement par appareil et alertes en cas d'IMEI introuvable.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Résultats détaillés</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      {phoneIdentifierResult
                        ? `Numéro analysé : ${phoneIdentifierResult.query.normalized || phoneIdentifierResult.query.input}`
                        : 'Les IMEI enrichies apparaîtront ici après la recherche.'}
                    </p>
                  </div>
                  {phoneIdentifierResult && (
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                        <GripVertical className="h-3.5 w-3.5" /> {phoneIdentifierResult.stats.totalAssociations} associations
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-100 dark:ring-indigo-700/60">
                        <Sparkles className="h-3.5 w-3.5" /> Enrichissement dynamique
                      </span>
                    </div>
                  )}
                </div>

                {phoneIdentifierLoading && (
                  <div className="flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-10 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/70">
                    <div className="flex items-center gap-3 text-blue-600 dark:text-blue-200">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-sm font-semibold">Analyse du numéro en cours...</span>
                    </div>
                  </div>
                )}

                {!phoneIdentifierLoading && !phoneIdentifierResult && (
                  <div className="rounded-2xl border border-dashed border-slate-300/80 bg-white/80 p-10 text-center text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                    Saisissez un numéro pour afficher immédiatement les terminaux correspondants.
                  </div>
                )}

                {!phoneIdentifierLoading && phoneIdentifierResult && phoneIdentifierResult.devices.length === 0 && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-10 text-center text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-300">
                    Aucun terminal associé n'a été trouvé dans la table Realtime.
                  </div>
                )}

                {phoneIdentifierResult && phoneIdentifierResult.devices.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {phoneIdentifierResult.devices.map((device, index) => (
                      <div
                        key={`${device.imei}-${device.imsi}-${index}`}
                        className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-slate-700/60 dark:bg-slate-900/80"
                      >
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/0 via-indigo-500/10 to-purple-500/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                        <div className="relative flex h-full flex-col gap-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">IMEI</p>
                              <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{device.imei}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">IMSI : {device.imsi || 'Non renseigné'}</p>
                            </div>
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-400/40">
                              <Smartphone className="h-5 w-5" />
                            </span>
                          </div>

                          <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 text-sm shadow-sm dark:border-indigo-800/50 dark:from-slate-900/60 dark:via-slate-900/70 dark:to-blue-950/40">
                          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">
                            <Sparkles className="h-4 w-4" />
                            Détails ImeiCheck
                          </div>

                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div className="rounded-xl border border-indigo-100 bg-white/90 p-3 shadow-sm dark:border-indigo-800/60 dark:bg-slate-900/70">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Marque</p>
                                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{device.imeiInfo?.brand || 'Inconnue'}</p>
                              </div>
                              <div className="rounded-xl border border-indigo-100 bg-white/90 p-3 shadow-sm dark:border-indigo-800/60 dark:bg-slate-900/70">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Modèle</p>
                                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{device.imeiInfo?.model || 'Non communiqué'}</p>
                              </div>
                              <div className="rounded-xl border border-indigo-100 bg-white/90 p-3 shadow-sm dark:border-indigo-800/60 dark:bg-slate-900/70">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nom du modèle</p>
                                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                                  {device.imeiInfo?.name || device.imeiInfo?.result || 'Description non disponible'}
                                </p>
                              </div>
                            </div>
                          </div>

                          {device.imeiInfo?.error && (
                            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3 text-xs font-semibold text-amber-700 shadow-inner dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                              <AlertTriangle className="mr-2 inline h-3.5 w-3.5" /> {device.imeiInfo.error}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentPage === 'requests' && (
            <div className="space-y-8">
              <PageHeader icon={<ClipboardList className="h-6 w-6" />} title="Liste des demandes" />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/95 p-5 shadow-lg shadow-blue-200/40 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                  <div className="absolute -right-16 top-0 h-32 w-32 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-900/30" />
                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Total des demandes</p>
                      <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">{requestStats.total}</p>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 shadow-inner shadow-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200">
                      <ClipboardList className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Toutes les demandes visibles selon vos droits d'accès.</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/95 p-5 shadow-lg shadow-emerald-200/40 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                  <div className="absolute -right-20 bottom-0 h-32 w-32 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/30" />
                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Demandes identifiées</p>
                      <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">{requestStats.identified}</p>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 shadow-inner shadow-emerald-400/30 dark:bg-emerald-500/20 dark:text-emerald-200">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Profils confirmés et demandes résolues.</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/95 p-5 shadow-lg shadow-amber-200/40 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                  <div className="absolute -left-16 top-0 h-32 w-32 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-900/30" />
                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Demandes en cours</p>
                      <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">{requestStats.inProgress}</p>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 shadow-inner shadow-amber-400/30 dark:bg-amber-500/20 dark:text-amber-200">
                      <Clock className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Demandes nécessitant une identification.</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/95 p-5 shadow-lg shadow-indigo-200/40 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                  <div className="absolute -right-16 -top-6 h-32 w-32 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-900/30" />
                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Taux d'identification</p>
                      <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">{requestStats.identificationRate}%</p>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 shadow-inner shadow-indigo-400/30 dark:bg-indigo-500/20 dark:text-indigo-200">
                      <TrendingUp className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Part des demandes résolues sur l'ensemble visible.</p>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/95 p-6 shadow-xl shadow-blue-200/40 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70">
                <div className="absolute -left-24 top-0 h-48 w-48 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-900/30" />
                <div className="absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-900/30" />
                <div className="relative z-10 space-y-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Centre de suivi des demandes</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-300">
                        Affinez votre recherche et suivez les demandes en temps réel. {requestStats.total === 0 ? 'Aucune demande visible actuellement.' : `${requestStats.total} demande${requestStats.total > 1 ? 's' : ''} au total.`}
                      </p>
                    </div>
                    {requestSearch && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/20 dark:text-blue-200">
                        Filtre texte actif
                      </span>
                    )}
                  </div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      setRequestSearch(requestSearchInput.trim());
                      setRequestPage(1);
                    }}
                    className="flex flex-col gap-3 lg:flex-row lg:items-center"
                  >
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex flex-1 items-center overflow-hidden rounded-full border border-slate-200/70 bg-white/90 shadow-inner focus-within:border-blue-400/60 focus-within:ring-2 focus-within:ring-blue-500/30 dark:border-slate-700/70 dark:bg-slate-900/60">
                        <span className="pl-4 text-slate-400 dark:text-slate-500">
                          <Search className="h-4 w-4" />
                        </span>
                        <input
                          type="text"
                          placeholder="Rechercher un numéro ou un utilisateur"
                          value={requestSearchInput}
                          onChange={(e) => setRequestSearchInput(e.target.value)}
                          className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
                        />
                        {requestSearch && (
                          <button
                            type="button"
                            onClick={() => {
                              setRequestSearchInput('');
                              setRequestSearch('');
                              setRequestPage(1);
                            }}
                            className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 transition hover:text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:text-white"
                            aria-label="Effacer la recherche"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      >
                        <Search className="h-4 w-4" />
                        Lancer la recherche
                      </button>
                    </div>
                  </form>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestStatusFilter('all');
                        setRequestPage(1);
                      }}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        requestStatusFilter === 'all'
                          ? 'border-blue-400/70 bg-blue-500/10 text-blue-600 dark:border-blue-400/50 dark:bg-blue-500/20 dark:text-blue-200'
                          : 'border-slate-200/70 bg-white/80 text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-blue-400/50 dark:hover:text-blue-200'
                      }`}
                    >
                      Toutes
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-300">
                        {requestStats.total}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestStatusFilter('in-progress');
                        setRequestPage(1);
                      }}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        requestStatusFilter === 'in-progress'
                          ? 'border-amber-400/70 bg-amber-500/10 text-amber-600 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-200'
                          : 'border-slate-200/70 bg-white/80 text-slate-600 hover:border-amber-300 hover:text-amber-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-amber-400/50 dark:hover:text-amber-200'
                      }`}
                    >
                      En cours
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-300">
                        {requestStats.inProgress}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestStatusFilter('identified');
                        setRequestPage(1);
                      }}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        requestStatusFilter === 'identified'
                          ? 'border-emerald-400/70 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-200'
                          : 'border-slate-200/70 bg-white/80 text-slate-600 hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-emerald-400/50 dark:hover:text-emerald-200'
                      }`}
                    >
                      Identifiées
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-300">
                        {requestStats.identified}
                      </span>
                    </button>
                    {isAdmin && hiddenRequestIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleResetHiddenRequests}
                        className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:-translate-y-0.5 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 dark:border-blue-500/40 dark:bg-blue-500/20 dark:text-blue-200"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Réafficher les demandes supprimées
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {identifyingRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
                  <div
                    className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                    onClick={() => setIdentifyingRequest(null)}
                  />
                  <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-3xl border border-blue-100 bg-white text-slate-900 shadow-2xl ring-1 ring-blue-100 dark:border-blue-100 dark:bg-white dark:text-slate-900 dark:ring-blue-100">
                    <div className="relative max-h-[80vh] space-y-6 overflow-y-auto p-8">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-blue-700 ring-1 ring-blue-200 dark:bg-blue-50 dark:text-blue-700 dark:ring-blue-200">
                            Demande
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
                              <Phone className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="text-2xl font-bold text-slate-900">Identification en cours</h3>
                              <p className="text-sm text-slate-700 dark:text-slate-900">
                                Complétez le profil associé pour finaliser l'identification de ce numéro.
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3 text-sm text-slate-800 dark:text-slate-900">
                          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 font-semibold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-50 dark:text-blue-700 dark:ring-blue-200">
                            <Phone className="h-4 w-4" />
                            {identifyingRequest.phone}
                          </span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-blue-200 hover:text-blue-700 dark:border-slate-200 dark:bg-white dark:text-slate-600 dark:hover:border-blue-200 dark:hover:text-blue-700"
                            onClick={() => setIdentifyingRequest(null)}
                          >
                            <X className="h-4 w-4" />
                            Fermer
                          </button>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-inner dark:border-blue-100 dark:bg-white">
                        <ProfileForm initialValues={identifyingInitialValues} onSaved={handleProfileSaved} />
                      </div>
                      <div className="flex items-center justify-end gap-3">
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-slate-200 dark:bg-white dark:text-slate-700 dark:hover:border-blue-200 dark:hover:text-blue-700"
                          onClick={() => setIdentifyingRequest(null)}
                        >
                          <X className="h-4 w-4" />
                          Annuler
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {requestsLoading ? (
                <LoadingSpinner />
              ) : (
                <>
                  <div className="grid gap-5">
                    {paginatedRequests.length === 0 && (
                      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300/70 bg-white/70 px-6 py-12 text-center text-slate-500 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                          <ClipboardList className="h-6 w-6" />
                        </span>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-600 dark:text-slate-200">Aucune demande à afficher</p>
                          <p className="text-xs text-slate-400 dark:text-slate-400">Modifiez vos filtres ou revenez plus tard.</p>
                        </div>
                      </div>
                    )}
                    {paginatedRequests.map((r) => {
                      const isHighlighted = highlightedRequestId === r.id;
                      const createdAt = r.created_at ? parseISO(r.created_at) : null;
                      const updatedAt = r.updated_at ? parseISO(r.updated_at) : null;
                      const createdLabel = createdAt ? format(createdAt, 'Pp', { locale: fr }) : null;
                      const createdAgo = createdAt ? formatDistanceToNow(createdAt, { addSuffix: true, locale: fr }) : null;
                      const updatedLabel = updatedAt ? format(updatedAt, 'Pp', { locale: fr }) : null;
                      const updatedAgo = updatedAt ? formatDistanceToNow(updatedAt, { addSuffix: true, locale: fr }) : null;
                      const statusLabel = r.status === 'identified' ? 'Identifiée' : 'En cours';
                      const statusClasses =
                        r.status === 'identified'
                          ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200'
                          : 'border-amber-400/60 bg-amber-500/10 text-amber-600 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200';
                      const baseProfileFields = r.profile
                        ? [
                            { label: 'Prénom', value: r.profile.first_name },
                            { label: 'Nom', value: r.profile.last_name },
                            { label: 'Téléphone', value: r.profile.phone },
                            { label: 'Email', value: r.profile.email }
                          ].filter((field) => field.value)
                        : [];
                      const extraCategories = r.profile && Array.isArray(r.profile.extra_fields)
                        ? r.profile.extra_fields
                        : [];
                      return (
                        <div
                          id={`request-${r.id}`}
                          key={r.id}
                          className={`group relative overflow-hidden rounded-3xl border border-white/70 bg-white/95 p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-slate-700/60 dark:bg-slate-900/70 ${
                            isHighlighted ? 'ring-2 ring-blue-500/70 shadow-blue-200/50 dark:ring-blue-400/40' : ''
                          }`}
                        >
                          <div className="absolute -right-24 top-0 h-48 w-48 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-900/30" />
                          <div className="absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-900/30" />
                          <div className="relative z-10 space-y-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex items-start gap-4">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 shadow-inner shadow-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200">
                                  <PhoneIncoming className="h-6 w-6" />
                                </span>
                                <div className="space-y-2">
                                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{r.phone}</p>
                                  {isAdmin && (
                                    <p className="text-sm text-slate-500 dark:text-slate-300">Ajoutée par {r.user_login}</p>
                                  )}
                                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${statusClasses}`}>
                                    {r.status === 'identified' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                                    {statusLabel}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col items-start gap-2 text-sm text-slate-500 dark:text-slate-300 lg:items-end">
                                {createdAgo && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-blue-500/70 dark:text-blue-300/80" />
                                    <span>Créée {createdAgo}</span>
                                  </div>
                                )}
                                {createdLabel && (
                                  <span className="rounded-full bg-slate-100/70 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800/60 dark:text-slate-300">{createdLabel}</span>
                                )}
                                {updatedAgo && updatedLabel && updatedLabel !== createdLabel && (
                                  <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                                    Mise à jour {updatedAgo}
                                  </span>
                                )}
                              </div>
                            </div>

                            {r.status === 'identified' && r.profile && (
                              <div className="rounded-2xl border border-white/60 bg-white/90 p-4 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60">
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Profil associé</p>
                                {baseProfileFields.length > 0 && (
                                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    {baseProfileFields.map((field) => (
                                      <div key={field.label} className="rounded-xl border border-slate-200/60 bg-white/95 p-3 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">{field.label}</p>
                                        <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{field.value as string}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {extraCategories.length > 0 && (
                                  <div className="mt-4 space-y-3">
                                    {extraCategories.map((category: any, categoryIndex: number) => (
                                      <div key={`${category.title}-${categoryIndex}`} className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-slate-900/50">
                                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">{category.title}</p>
                                        <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                                          {Array.isArray(category.fields) &&
                                            category.fields.map((field: any, fieldIndex: number) => (
                                              <div key={fieldIndex} className="flex flex-wrap items-baseline gap-2">
                                                <span className="min-w-[6rem] text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                                                  {field.key}
                                                </span>
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{field.value}</span>
                                              </div>
                                            ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3">
                              {isAdmin && r.status !== 'identified' && (
                                <button
                                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                                  onClick={() => startIdentify(r)}
                                >
                                  <UserCheck className="h-4 w-4" />
                                  Identifier
                                </button>
                              )}
                              {isAdmin ? (
                                <>
                                  <button
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-500/60"
                                    onClick={() => deleteRequest(r.id)}
                                  >
                                    <Ban className="h-4 w-4" />
                                    Masquer
                                  </button>
                                  <button
                                    className="inline-flex items-center gap-2 rounded-full border border-rose-400/70 bg-rose-600/90 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/40 transition hover:-translate-y-0.5 hover:bg-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:border-rose-500/60 dark:bg-rose-500"
                                    onClick={() => deleteRequest(r.id, { permanent: true })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Supprimer définitivement
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="inline-flex items-center gap-2 rounded-full border border-rose-300/60 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200"
                                  onClick={() => deleteRequest(r.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Supprimer
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {visibleRequests.length > 0 && (
                    <div className="mt-6 rounded-3xl border border-white/70 bg-white/85 p-4 shadow-inner shadow-slate-200/40 dark:border-slate-700/60 dark:bg-slate-900/70">
                      <PaginationControls
                        currentPage={requestPage}
                        totalPages={totalRequestPages}
                        onPageChange={setRequestPage}
                        onLoadMore={() =>
                          setRequestPage((page) =>
                            Math.min(page + 1, Math.max(totalRequestPages, 1))
                          )
                        }
                        canLoadMore={requestPage < totalRequestPages}
                        pageSize={requestsPerPage}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                        onPageSizeChange={(size) => {
                          setRequestsPerPage(size);
                          setRequestPage(1);
                        }}
                        className="gap-3"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {currentPage === 'profiles' && (
            <div className="space-y-8">
              <PageHeader icon={<FileText className="h-6 w-6" />} title="Fiches de profil" />

              {showProfileForm ? (
                <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-slate-200/50 dark:border-slate-700/60 dark:bg-slate-900/80">
                  <div className="pointer-events-none absolute -right-28 top-10 h-56 w-56 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/40" />
                  <div className="pointer-events-none absolute -left-24 bottom-0 h-48 w-48 rounded-full bg-sky-200/30 blur-3xl dark:bg-sky-900/30" />
                  <div className="relative z-10 space-y-6">
                    <div className="space-y-2 text-center md:text-left">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                        {editingProfileId ? 'Edition en cours' : 'Nouvelle fiche'}
                      </span>
                      <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                        {editingProfileId ? 'Modifier la fiche de profil' : 'Créer une fiche de profil'}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-300">
                        Renseignez les informations pertinentes, ajoutez des pièces jointes et catégorisez votre fiche pour la retrouver instantanément.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/95 p-6 shadow-inner shadow-slate-200/50 dark:border-slate-700/60 dark:bg-slate-900/70">
                      <ProfileForm
                        initialValues={profileDefaults}
                        profileId={editingProfileId || undefined}
                        onSaved={(savedProfileId) => {
                          setShowProfileForm(false);
                          setProfileListRefreshKey((prev) => prev + 1);
                          if (savedProfileId) {
                            setHighlightedProfileId(savedProfileId);
                          }
                        }}
                        initialFolderId={profileFormFolderId}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Les modifications sont automatiquement versionnées afin de conserver l’historique des actions.
                      </p>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-800 dark:border-slate-600/60 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white"
                        onClick={() => setShowProfileForm(false)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Retour à la gestion
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <section
                  id="profiles-list"
                  className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/80"
                >
                  <div className="pointer-events-none absolute -right-28 top-10 h-64 w-64 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-900/30" />
                  <div className="pointer-events-none absolute -left-32 bottom-0 h-52 w-52 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-900/30" />
                  <div className="relative z-10 space-y-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-300">
                          Bibliothèque dynamique
                        </span>
                        <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">Vos dossiers et fiches</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          Filtrez vos contacts, retrouvez les partages récents et organisez vos dossiers par thématiques.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openCreateProfile({})}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                        >
                          <Plus className="h-4 w-4" />
                          Nouvelle fiche
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBulkImportModal(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600/60 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
                        >
                          <UploadCloud className="h-4 w-4" />
                          Importer des numéros
                        </button>
                        <button
                          type="button"
                          onClick={() => setProfileListRefreshKey((prev) => prev + 1)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-800 dark:border-slate-600/60 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Actualiser
                        </button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/95 p-2 shadow-inner shadow-slate-200/50 dark:border-slate-700/60 dark:bg-slate-900/70">
                      <ProfileList
                        onCreate={folderId => openCreateProfile({}, folderId)}
                        onEdit={openEditProfile}
                        currentUser={currentUser}
                        isAdmin={isAdmin}
                        onShareFolder={openFolderShareModal}
                        refreshKey={profileListRefreshKey}
                        focusedProfileId={highlightedProfileId}
                        onFocusedProfileHandled={() => setHighlightedProfileId(null)}
                        focusedFolderId={highlightedFolderId}
                        onFocusedFolderHandled={() => setHighlightedFolderId(null)}
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

        {currentPage === 'blacklist' && isAdmin && (
          <div className="space-y-6">
            <PageHeader icon={<Ban className="h-6 w-6" />} title="White List" />
            <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/90 to-blue-50/40 p-6 shadow-xl shadow-blue-200/50 backdrop-blur-sm dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-900/60 dark:to-slate-900/40 dark:shadow-black/40">
              <div className="absolute -right-32 top-10 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-900/30" />
              <div className="absolute -left-36 bottom-0 h-56 w-56 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-900/30" />
              <div className="relative z-10 space-y-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Gestion des numéros bloqués</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Surveillez les numéros sensibles, importez des listes en masse et gardez une vue d'ensemble claire.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="rounded-2xl border border-white/60 bg-white/80 px-6 py-4 shadow-sm shadow-blue-200/60 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Numéros surveillés</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{blacklist.length}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
                  <form
                    onSubmit={handleAddBlacklist}
                    className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">Ajouter un numéro</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Insérez un numéro unique à surveiller dans la liste noire.</p>
                      </div>
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                        <Plus className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="text"
                        placeholder="Numéro à ajouter"
                        value={blacklistNumber}
                        onChange={(e) => setBlacklistNumber(e.target.value)}
                        className="w-full rounded-xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        disabled={!blacklistNumber.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/40 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" />
                        Ajouter
                      </button>
                    </div>
                  </form>

                  <form
                    onSubmit={handleUploadBlacklist}
                    className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">Import massif</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Chargez un fichier CSV ou TXT contenant plusieurs numéros.</p>
                      </div>
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                        <UploadCloud className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="flex flex-col gap-3">
                      <input
                        id="blacklist-upload"
                        type="file"
                        accept=".txt,.csv"
                        className="sr-only"
                        onChange={(e) => setBlacklistFile(e.target.files?.[0] || null)}
                      />
                      <label
                        htmlFor="blacklist-upload"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 bg-white/90 px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-600 dark:border-slate-600/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-blue-400/60 dark:hover:text-blue-300"
                      >
                        <UploadCloud className="h-4 w-4" />
                        {blacklistFile ? 'Changer de fichier' : 'Sélectionner un fichier'}
                      </label>
                      {blacklistFile && (
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-300">
                          Fichier sélectionné :{' '}
                          <span className="text-slate-700 dark:text-slate-100">{blacklistFile.name}</span>
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={!blacklistFile}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition-all hover:-translate-y-0.5 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <UploadCloud className="h-4 w-4" />
                        Importer
                      </button>
                    </div>
                  </form>
                </div>

                {blacklistError && (
                  <div className="rounded-2xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                    {blacklistError}
                  </div>
                )}

                <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/70">
                  {paginatedBlacklist.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-slate-500 dark:text-slate-300">
                      <Ban className="h-10 w-10 text-blue-500/60 dark:text-blue-400/60" />
                      <div>
                        <p className="text-sm font-semibold">Aucun numéro blacklisté</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Ajoutez un numéro ou importez une liste pour commencer.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                        <thead className="bg-white/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                          <tr>
                            <th className="px-6 py-3">#</th>
                            <th className="px-6 py-3">Numéro</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                          {paginatedBlacklist.map((entry, index) => {
                            const size = Math.max(blacklistPerPage, 1);
                            const displayIndex = (blacklistPage - 1) * size + index + 1;
                            return (
                              <tr
                                key={entry.id}
                                className="odd:bg-white even:bg-slate-50/70 transition-colors hover:bg-blue-50/50 dark:odd:bg-slate-900/40 dark:even:bg-slate-800/40 dark:hover:bg-slate-800/70"
                              >
                                <td className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                  #{String(displayIndex).padStart(2, '0')}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium text-slate-800 dark:text-slate-100">
                                  <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                                    {entry.number}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBlacklist(entry.id)}
                                    className="inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Supprimer
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {blacklist.length > 0 && (
                  <div className="rounded-2xl border border-white/60 bg-white/85 p-4 shadow-inner shadow-slate-200/50 dark:border-slate-700/60 dark:bg-slate-900/70">
                    <PaginationControls
                      currentPage={blacklistPage}
                      totalPages={totalBlacklistPages}
                      onPageChange={setBlacklistPage}
                      pageSize={blacklistPerPage}
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
                      onPageSizeChange={(size) => {
                        setBlacklistPerPage(size);
                        setBlacklistPage(1);
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {currentPage === 'logs' && isAdmin && (
          <div className="space-y-6">
            <PageHeader icon={<List className="h-6 w-6" />} title="Logs" />
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-blue-50/60 p-8 shadow-xl shadow-blue-200/60 dark:border-slate-700/60 dark:from-slate-900/80 dark:via-slate-900/60 dark:to-slate-900/40">
              <div className="absolute -right-32 top-1/4 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-900/30"></div>
              <div className="absolute -left-32 top-2/3 h-64 w-64 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-900/30"></div>
              <div className="relative z-10 space-y-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Tableau de bord des logs</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      Surveillez les actions des utilisateurs, identifiez rapidement les alertes et exportez les journaux pour vos audits.
                    </p>
                  </div>
                  <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
                    <div className="rounded-2xl border border-white/60 bg-white/80 px-5 py-4 shadow-sm shadow-blue-200/50 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Logs totaux</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{logTotal}</p>
                    </div>
                    <div className="rounded-2xl border border-white/60 bg-white/80 px-5 py-4 shadow-sm shadow-blue-200/50 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Logs récents</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{logsData.length}</p>
                    </div>
                    <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-5 py-4 shadow-sm shadow-rose-200/40 backdrop-blur-sm dark:border-rose-500/40 dark:bg-rose-500/20">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-500 dark:text-rose-200">Alertes critiques</p>
                      <p className="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-200">{criticalAlertCount}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:max-w-md">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={logUserFilter}
                      onChange={(e) => setLogUserFilter(e.target.value)}
                      placeholder="Filtrer par utilisateur"
                      className="w-full rounded-2xl border border-white/60 bg-white/80 py-3 pl-11 pr-4 text-sm text-slate-800 shadow-inner focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      onClick={() => {
                        fetchLogs(1);
                        fetchSessions(1);
                      }}
                      className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition-transform hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                    >
                      Rechercher
                    </button>
                    <button
                      onClick={exportLogs}
                      className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-400/40 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      Exporter
                    </button>
                    <button
                      type="button"
                      onClick={clearLogs}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-500/60 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-600 shadow-sm shadow-rose-500/20 transition-transform hover:-translate-y-0.5 hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-500/40 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                    >
                      <Trash2 className="h-4 w-4" />
                      Vider log
                    </button>
                  </div>
                </div>

                {lastLogUpdateLabel && (
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400 dark:text-slate-500">
                    <Clock className="h-4 w-4" />
                    Dernière mise à jour : {lastLogUpdateLabel}
                  </div>
                )}

                <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-xl shadow-blue-200/40 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                  <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                    <thead className="bg-white/80 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 backdrop-blur-sm dark:bg-slate-800/80 dark:text-slate-300">
                      <tr>
                        <th className="px-6 py-4">Utilisateur</th>
                        <th className="px-6 py-4">Action</th>
                        <th className="px-6 py-4">Page</th>
                        <th className="px-6 py-4">Profil</th>
                        <th className="px-6 py-4">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                      {logsData.map((log: any) => {
                      let details: any = {};
                      try {
                        details = log.details ? JSON.parse(log.details) : {};
                      } catch {}

                      const hasPageName = typeof details.page === 'string' && details.page.trim() !== '';
                      const pageName = hasPageName ? details.page.trim() : '';
                      const isAlertLog =
                        log.action === 'blacklist_search_attempt' || details.alert === true;
                      const alertNumber = details.number || details.phone || details.search_term;
                      const baseAlertMessage =
                        typeof details.message === 'string' && details.message.trim() !== ''
                          ? details.message.trim()
                          : 'Numéro blacklisté détecté';
                      const alertMessage = isAlertLog
                        ? alertNumber
                          ? `${baseAlertMessage} : ${alertNumber}`
                          : baseAlertMessage
                        : '';
                      const alertContext =
                        isAlertLog && typeof details.context === 'string' && details.context.trim() !== ''
                          ? details.context.trim()
                          : '';

                      const descriptionText = (() => {
                        if (isAlertLog || hasPageName) {
                          return '';
                        }
                        if (typeof details.description === 'string' && details.description.trim() !== '') {
                          return details.description.trim();
                        }
                        if (typeof log.details === 'string' && log.details.trim() !== '') {
                          return log.details.trim();
                        }
                        return '';
                      })();

                      const detailContent = isAlertLog
                        ? (
                            <div className="mt-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm shadow-sm shadow-rose-300/30 backdrop-blur-sm">
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-sm shadow-rose-500/40">
                                  <AlertTriangle className="h-4 w-4" />
                                </span>
                                <div className="space-y-1 text-left">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-rose-600 dark:text-rose-200/80">
                                    Alerte prioritaire
                                  </p>
                                  <p className="text-sm font-medium text-rose-700 dark:text-rose-100">{alertMessage}</p>
                                  {alertContext && (
                                    <p className="text-xs text-rose-600/80 dark:text-rose-200/70">{alertContext}</p>
                                  )}
                                  {alertNumber && (
                                    <p className="text-xs text-rose-600/80 dark:text-rose-200/70">Cible : {alertNumber}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        : descriptionText
                        ? (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{descriptionText}</p>
                          )
                        : null;

                      return (
                        <tr
                          key={log.id}
                          className={`transition-colors duration-200 ${
                            isAlertLog
                              ? 'bg-rose-50/70 hover:bg-rose-100/70 dark:bg-rose-500/10 dark:hover:bg-rose-500/20'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${isAlertLog ? 'text-rose-700 dark:text-rose-100' : 'text-slate-900 dark:text-slate-100'}`}>
                            {log.username || 'Inconnu'}
                          </td>
                          <td className="px-6 py-4 align-top text-sm">
                            <div className={`flex flex-col gap-3 ${isAlertLog ? 'text-rose-700 dark:text-rose-100' : 'text-slate-900 dark:text-slate-100'}`}>
                              {isAlertLog ? (
                                <div className="inline-flex items-center gap-2 self-start rounded-full border border-rose-400/60 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200">
                                  <AlertTriangle className="h-4 w-4" />
                                  {log.action}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200/70 bg-slate-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
                                  {log.action}
                                </span>
                              )}
                              {detailContent}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {pageName ? (
                              <span className="inline-flex items-center rounded-full border border-blue-200/60 bg-blue-50/70 px-3 py-1 text-xs font-medium text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
                                {pageName}
                              </span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                            {details.profile_id ? (
                              <button
                                className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:-translate-y-0.5 hover:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-blue-500/40 dark:text-blue-300"
                                onClick={() => openEditProfile(details.profile_id)}
                              >
                                Voir le profil
                              </button>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">
                            {log.created_at ? format(parseISO(log.created_at), 'Pp', { locale: fr }) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between gap-3 border-t border-slate-100/80 bg-white/80 px-6 py-4 text-sm text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                    <button
                      onClick={() => fetchLogs(logPage - 1)}
                      disabled={logPage <= 1}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                    >
                      Précédent
                    </button>
                    <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                      Page {logPage} / {Math.max(1, Math.ceil(logTotal / LOGS_LIMIT))}
                    </span>
                    <button
                      onClick={() => fetchLogs(logPage + 1)}
                      disabled={logPage >= Math.ceil(logTotal / LOGS_LIMIT)}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative mt-8 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-xl shadow-slate-200/70 dark:border-slate-700/60 dark:bg-slate-900/70">
              <div className="absolute -right-20 top-0 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/30"></div>
              <div className="absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-900/30"></div>
              <div className="relative z-10 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-emerald-500" />
                      Sessions utilisateur
                    </h4>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      Gardez un œil sur les connexions actives et l'activité récente des membres de votre équipe.
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                    Total : {sessionTotal}
                  </span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-inner backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70">
                  {sessionLogs.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-300">
                      {sessionLoading ? 'Chargement des sessions...' : 'Aucune session enregistrée.'}
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                      {sessionLogs.map((session) => {
                        const loginDate = session.login_at ? parseISO(session.login_at) : null;
                        const logoutDate = session.logout_at ? parseISO(session.logout_at) : null;
                        const loginLabel = loginDate ? format(loginDate, 'Pp', { locale: fr }) : '-';
                        const logoutLabel = logoutDate ? format(logoutDate, 'Pp', { locale: fr }) : 'Session active';
                        const loginRelative = loginDate
                          ? formatDistanceToNow(loginDate, { addSuffix: true, locale: fr })
                          : '';
                        const logoutRelative = logoutDate
                          ? formatDistanceToNow(logoutDate, { addSuffix: true, locale: fr })
                          : '';
                        const durationLabel = formatSessionDuration(session.duration_seconds);
                        const isActive = !session.logout_at;
                        return (
                          <li
                            key={session.id}
                            className="group px-6 py-5 transition-colors duration-200 hover:bg-blue-50/40 dark:hover:bg-slate-800/60"
                          >
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                              <div className="flex items-start gap-4">
                                <span
                                  className={`mt-1 flex h-10 w-10 items-center justify-center rounded-full ${
                                    isActive
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200'
                                      : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300'
                                  }`}
                                >
                                  <Clock className="h-5 w-5" />
                                </span>
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{session.username}</p>
                                    <span
                                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] ${
                                        isActive
                                          ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200'
                                          : 'bg-slate-200/60 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
                                      }`}
                                    >
                                      {isActive ? 'Active' : 'Terminée'}
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-500 dark:text-slate-300">
                                    {isActive
                                      ? `Connecté ${loginRelative}`
                                      : logoutRelative
                                        ? `Déconnexion ${logoutRelative}`
                                        : loginRelative}
                                  </p>
                                </div>
                              </div>
                              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Connexion</p>
                                  <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{loginLabel}</p>
                                  {loginRelative && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{loginRelative}</p>
                                  )}
                                </div>
                                <div className="rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Déconnexion</p>
                                  <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{logoutLabel}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {isActive ? `En cours depuis ${durationLabel.toLowerCase()}` : logoutRelative || '—'}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Durée totale</p>
                                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{durationLabel}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">Calculée à la seconde près</p>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    onClick={() => fetchSessions(sessionPage - 1)}
                    disabled={sessionPage <= 1 || sessionLoading}
                    className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    Précédent
                  </button>
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                    Page {sessionPage} sur {Math.max(1, Math.ceil(sessionTotal / LOGS_LIMIT))}
                  </span>
                  <button
                    onClick={() => fetchSessions(sessionPage + 1)}
                    disabled={sessionPage >= Math.ceil(sessionTotal / LOGS_LIMIT) || sessionLoading}
                    className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/30 transition hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentPage === 'users' && isAdmin && (
          <div className="space-y-8">
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-blue-50/60 to-indigo-50/40 p-6 shadow-xl shadow-blue-200/50 dark:border-slate-700/60 dark:from-slate-900/70 dark:via-slate-900/40 dark:to-blue-950/40">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <PageHeader icon={<User className="h-6 w-6" />} title="Gestion des utilisateurs" subtitle="Créez et gérez les comptes utilisateurs" />
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <button
                    onClick={openCreateModal}
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition-transform hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                  >
                    <Plus className="mr-2 h-5 w-5" />
                    Nouvel utilisateur
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="flex items-center justify-between rounded-2xl border border-blue-100/70 bg-white/95 p-5 shadow-lg shadow-blue-100/60 dark:border-slate-700/60 dark:bg-slate-900/70">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Utilisateurs</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{userStats.total}</p>
                </div>
                <span className="rounded-full bg-blue-500/10 p-3 text-blue-600 dark:text-blue-300">
                  <Users className="h-5 w-5" />
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-emerald-100/70 bg-white/95 p-5 shadow-lg shadow-emerald-100/60 dark:border-slate-700/60 dark:bg-slate-900/70">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Utilisateurs actifs</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{userStats.active}</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-300">
                  <UserCheck className="h-5 w-5" />
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-rose-100/70 bg-white/95 p-5 shadow-lg shadow-rose-100/60 dark:border-slate-700/60 dark:bg-slate-900/70">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Administrateurs</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{userStats.admins}</p>
                </div>
                <span className="rounded-full bg-rose-500/10 p-3 text-rose-600 dark:text-rose-300">
                  <Shield className="h-5 w-5" />
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-indigo-100/70 bg-white/95 p-5 shadow-lg shadow-indigo-100/60 dark:border-slate-700/60 dark:bg-slate-900/70">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Divisions</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{divisions.length}</p>
                </div>
                <span className="rounded-full bg-indigo-500/10 p-3 text-indigo-600 dark:text-indigo-300">
                  <Building2 className="h-5 w-5" />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/80 dark:border-slate-700/60 dark:bg-slate-900/70 xl:col-span-2">
                <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-900/30"></div>
                <div className="relative z-10">
                  <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">Créer une nouvelle division</h4>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Organisez vos équipes en regroupant les utilisateurs par division.</p>
                </div>
                <form onSubmit={handleCreateDivision} className="relative z-10 mt-5 flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1">
                    <label htmlFor="divisionName" className="sr-only">Nom de la division</label>
                    <input
                      id="divisionName"
                      type="text"
                      value={newDivisionName}
                      onChange={(e) => setNewDivisionName(e.target.value)}
                      placeholder="Nom de la division"
                      className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-inner focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={creatingDivision}
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-transform hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingDivision ? 'Création...' : 'Créer la division'}
                  </button>
                </form>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/80 dark:border-slate-700/60 dark:bg-slate-900/70">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">Divisions existantes</h4>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Supprimez les divisions inutiles pour garder vos équipes à jour.</p>
                  </div>
                  <span className="rounded-full bg-indigo-500/10 p-3 text-indigo-600 dark:text-indigo-300">
                    <Building2 className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-5 space-y-3">
                  {divisions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200/70 bg-white/80 p-4 text-sm text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                      Aucune division créée pour le moment.
                    </div>
                  ) : (
                    divisions.map((division) => {
                      const memberCount = divisionUserCount[division.id] ?? 0;
                      const createdLabel = division.created_at ? new Date(division.created_at).toLocaleDateString('fr-FR') : null;
                      return (
                        <div
                          key={division.id}
                          className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/60"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{division.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-300">
                              {memberCount} membre{memberCount > 1 ? 's' : ''}
                              {createdLabel ? ` · Créée le ${createdLabel}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteDivision(division.id)}
                            disabled={deletingDivisionId === division.id}
                            className="inline-flex items-center justify-center rounded-full border border-rose-200/70 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
                            aria-label={`Supprimer la division ${division.name}`}
                          >
                            {deletingDivisionId === division.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/70 dark:border-slate-700/60 dark:bg-slate-900/70">
              <div className="flex flex-col gap-4 border-b border-slate-200/60 px-6 py-5 md:flex-row md:items-center md:justify-between dark:border-slate-700/60">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Utilisateurs de la plateforme</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Visualisez les membres de votre organisation et gérez leurs accès.</p>
                </div>
                <div className="flex w-full items-center gap-3 md:w-auto">
                  <div className="relative w-full max-w-xs">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      placeholder="Rechercher un utilisateur, un rôle ou une division"
                      className="w-full rounded-xl border border-slate-200/70 bg-white/80 py-2.5 pl-10 pr-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                    />
                  </div>
                  <button
                    onClick={openCreateModal}
                    className="hidden items-center rounded-xl border border-blue-200/70 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300 md:inline-flex"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nouvel utilisateur
                  </button>
                </div>
              </div>
              {users.length === 0 ? (
                <div className="flex flex-col items-center justify-center space-y-4 px-8 py-16 text-center">
                  <Users className="h-16 w-16 text-slate-300 dark:text-slate-600" />
                  <div>
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">Aucun utilisateur</h3>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">Commencez par créer un utilisateur pour votre équipe.</p>
                  </div>
                  <button
                    onClick={openCreateModal}
                    className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-400/40 transition hover:-translate-y-0.5 hover:shadow-xl"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Créer un utilisateur
                  </button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="px-8 py-14 text-center text-sm text-slate-500 dark:text-slate-300">
                  Aucun utilisateur ne correspond à votre recherche.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200/70 text-sm text-slate-700 dark:divide-slate-700/60 dark:text-slate-200">
                    <thead className="bg-slate-100/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-800/80 dark:text-slate-300">
                      <tr>
                        <th className="px-6 py-3 text-left">Utilisateur</th>
                        <th className="px-6 py-3 text-left">Rôle</th>
                        <th className="px-6 py-3 text-left">Division</th>
                        <th className="px-6 py-3 text-left">Statut</th>
                        <th className="px-6 py-3 text-left">Créé le</th>
                        <th className="px-6 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="bg-white/95 transition hover:bg-slate-50/80 dark:bg-slate-900/60 dark:hover:bg-slate-800/60">
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-200/70">
                                <User className="h-5 w-5" />
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user.login}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-300">ID: {user.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(user.admin === 1 || user.admin === '1') ? (
                              <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                                <Shield className="h-3 w-3" />
                                Administrateur
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-300">
                                <UserCheck className="h-3 w-3" />
                                Utilisateur
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">
                            {(user.admin === 1 || user.admin === '1')
                              ? 'Admin'
                              : (user.division_name || '—')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(user.active === 1 || user.active === '1') ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                                Actif
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-slate-400/20 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Désactivé
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">
                            {new Date(user.created_at).toLocaleDateString('fr-FR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => openEditModal(user)}
                                className="text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Modifier l'utilisateur"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => openPasswordModal(user)}
                                className="text-emerald-500 transition-colors hover:text-emerald-400 dark:text-emerald-300 dark:hover:text-emerald-200"
                                title="Changer le mot de passe"
                              >
                                <Key className="h-4 w-4" />
                              </button>
                              {user.id !== currentUser?.id && (
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="text-rose-600 transition-colors hover:text-rose-500 dark:text-rose-400 dark:hover:text-rose-300"
                                  title="Supprimer l'utilisateur"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}


          {currentPage === 'dashboard' && (
            <div className="space-y-8">
              {/* Header */}
              <PageHeader icon={<BarChart3 className="h-6 w-6" />} title="Dashboard" subtitle="Analyse complète de l'utilisation de la plateforme SORA" />

              {loadingStats ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <span className="ml-4 text-lg text-gray-600">Chargement des statistiques...</span>
                </div>
              ) : (
                <>
                  {/* Métriques principales */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-sm text-gray-500 dark:text-gray-300">
                        Glissez-déposez les cartes pour personnaliser votre tableau de bord.
                      </p>
                      <button
                        type="button"
                        onClick={resetCardOrder}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
                      >
                        Réinitialiser l'ordre
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
                      {orderedDashboardCards.map((card) => {
                        const Icon = card.icon;
                        return (
                          <div
                            key={card.id}
                            draggable
                            onDragStart={handleCardDragStart(card.id)}
                            onDragOver={handleCardDragOver}
                            onDrop={handleCardDrop(card.id)}
                            onDragEnd={handleCardDragEnd}
                            className={`relative overflow-hidden rounded-3xl p-6 shadow-xl transition-transform duration-200 cursor-grab active:cursor-grabbing ${draggedCard === card.id ? 'ring-2 ring-white/70 scale-[1.02]' : 'hover:-translate-y-1'}`}
                          >
                            <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-95`}></div>
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.25),transparent)]"></div>
                            <div className="relative z-10 flex flex-col h-full text-white">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-medium text-white/80">{card.title}</p>
                                  <p className="mt-2 text-3xl font-bold">{card.value}</p>
                                  {card.description && (
                                    <p className="mt-3 text-sm text-white/70 leading-relaxed">
                                      {card.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-3">
                                  <span className="inline-flex items-center justify-center p-3 rounded-full bg-white/20 backdrop-blur-sm">
                                    <Icon className="h-7 w-7" />
                                  </span>
                                  <GripVertical className="h-5 w-5 text-white/70" />
                                </div>
                              </div>
                              {card.badge && (
                                <div className="mt-auto pt-6">
                                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm border border-white/30 ${card.badge.tone}`}>
                                    {card.badge.label}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Graphiques */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Graphique des recherches par jour */}
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                        <BarChart3 className="h-6 w-6 mr-2 text-blue-600" />
                        Recherches des 7 derniers jours
                      </h3>
                      <div className="h-80">
                        <Line
                          data={{
                            labels: timeSeries.map(item =>
                              format(parseISO(item.date), 'dd/MM', { locale: fr })
                            ),
                            datasets: [{
                              label: 'Nombre de recherches',
                              data: timeSeries.map(item => item.searches),
                              borderColor: 'rgb(59, 130, 246)',
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              tension: 0.4,
                              fill: true
                            }]
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: {
                                display: false
                              }
                            },
                            scales: {
                              y: {
                                beginAtZero: true,
                                grid: {
                                  color: 'rgba(0, 0, 0, 0.05)'
                                }
                              },
                              x: {
                                grid: {
                                  display: false
                                }
                              }
                            }
                          }}
                        />
                      </div>
                    </div>

                    {/* Graphique des temps de réponse */}
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                        <Timer className="h-6 w-6 mr-2 text-purple-600" />
                        Temps de réponse (ms)
                      </h3>
                      <div className="h-80">
                        <Bar
                          data={{
                            labels: timeSeries.map(item =>
                              format(parseISO(item.date), 'dd/MM', { locale: fr })
                            ),
                            datasets: [{
                              label: 'Temps moyen (ms)',
                              data: timeSeries.map(item => item.avg_time),
                              backgroundColor: 'rgba(147, 51, 234, 0.8)',
                              borderColor: 'rgb(147, 51, 234)',
                              borderWidth: 1,
                              borderRadius: 8
                            }]
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: {
                                display: false
                              }
                            },
                            scales: {
                              y: {
                                beginAtZero: true,
                                grid: {
                                  color: 'rgba(0, 0, 0, 0.05)'
                                }
                              },
                              x: {
                                grid: {
                                  display: false
                                }
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Activité opérationnelle */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="space-y-6">
                      <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-gray-800">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          <ClipboardList className="h-6 w-6 mr-2 text-indigo-600 dark:text-indigo-400" />
                          Activité des demandes
                        </h3>
                        <div className="space-y-4">
                          {requestMetrics.map(item => {
                            const Icon = item.icon;
                            return (
                            <div
                              key={item.key}
                              className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <span className={`flex h-11 w-11 items-center justify-center rounded-full ${item.tone}`}>
                                    <Icon className="h-5 w-5" />
                                  </span>
                                  <div>
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-100">{item.label}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.caption}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{numberFormatter.format(item.value)}</p>
                                  {item.progress !== undefined && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.progress}% du total</p>
                                  )}
                                </div>
                              </div>
                              {item.progress !== undefined && (
                                <div className="mt-3 h-2 rounded-full bg-white/60 dark:bg-gray-800/70">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                                    style={{ width: `${item.progress}%` }}
                                  ></div>
                                </div>
                              )}
                            </div>
                          );
                          })}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-gray-800">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          <Activity className="h-6 w-6 mr-2 text-rose-600 dark:text-rose-400" />
                          Profils & opérations
                        </h3>
                        <div className="space-y-6">
                          <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 p-5 bg-gradient-to-br from-rose-50 via-white to-white dark:from-rose-950/30 dark:via-gray-900/60">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-rose-600 dark:text-rose-300">Profils enregistrés</p>
                                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{numberFormatter.format(profilesTotal)}</p>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-rose-700 dark:text-rose-200">
                                  <span className="inline-flex items-center rounded-full bg-white/70 dark:bg-white/10 px-3 py-1">
                                    Aujourd'hui : {numberFormatter.format(profileStats?.today ?? 0)}
                                  </span>
                                  <span className="inline-flex items-center rounded-full bg-white/70 dark:bg-white/10 px-3 py-1">
                                    30 derniers jours : {numberFormatter.format(profilesRecent)}
                                  </span>
                                </div>
                              </div>
                              <span className="inline-flex items-center justify-center p-3 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-200">
                                <UserCircle className="h-6 w-6" />
                              </span>
                            </div>
                            <div className="mt-4 h-2 rounded-full bg-rose-100 dark:bg-rose-900/40">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-500"
                                style={{ width: `${profileProgress}%` }}
                              ></div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 p-5 bg-gradient-to-br from-amber-50 via-white to-white dark:from-amber-950/30 dark:via-gray-900/60">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-amber-600 dark:text-amber-300">Géolocalisation</p>
                                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{numberFormatter.format(operationsTotal)}</p>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-amber-700 dark:text-amber-200">
                                  <span className="inline-flex items-center rounded-full bg-white/70 dark:bg-white/10 px-3 py-1">
                                    Aujourd'hui : {numberFormatter.format(operationStats?.today ?? 0)}
                                  </span>
                                  <span className="inline-flex items-center rounded-full bg-white/70 dark:bg-white/10 px-3 py-1">
                                    30 derniers jours : {numberFormatter.format(operationsRecent)}
                                  </span>
                                </div>
                              </div>
                              <span className="inline-flex items-center justify-center p-3 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-200">
                                <Activity className="h-6 w-6" />
                              </span>
                            </div>
                            <div className="mt-4 h-2 rounded-full bg-amber-100 dark:bg-amber-900/40">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                                style={{ width: `${operationsProgress}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700/60">
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Types de recherche</h4>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {searchTypeChips.length > 0 ? (
                              searchTypeChips.map(type => (
                                <span
                                  key={type.key}
                                  className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-900/60 dark:text-gray-200"
                                >
                                  <span className="inline-flex h-2 w-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"></span>
                                  <span className="capitalize">{type.label}</span>
                                  <span className="text-gray-500 dark:text-gray-400">• {type.value}</span>
                                </span>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500 dark:text-gray-400">Aucun historique de type de recherche disponible.</p>
                            )}
                          </div>
                        </div>
                    </div>
                  </div>

                  {/* Logs de recherche récents */}
                  <div className="lg:col-span-2">
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                            <FileText className="h-6 w-6 mr-2 text-blue-600" />
                            Logs de recherche
                          </h3>
                          {isAdmin && (
                            <div className="mb-4 flex">
                              <input
                                type="text"
                                value={logUserFilter}
                                onChange={(e) => setLogUserFilter(e.target.value)}
                                placeholder="Filtrer par utilisateur"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                onClick={loadStatistics}
                                className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                              >
                                Rechercher
                              </button>
                            </div>
                          )}
                          <div className="max-h-80 overflow-y-auto">
                            <div className="space-y-3">
                              {searchLogs.length > 0 ? (
                                searchLogs.map((log, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-3">
                                        <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                                          <User className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div>
                                          <p className="font-medium text-gray-900 dark:text-gray-100">
                                            {log.username || 'Utilisateur inconnu'}
                                          </p>
                                          <p className="text-sm text-gray-500 truncate max-w-xs">"{log.search_term}"</p>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="flex items-center space-x-2">
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          {log.results_count || 0} résultats
                                        </span>
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                          {log.execution_time_ms || 0}ms
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-400 mt-1">
                                        {log.search_date ? format(parseISO(log.search_date), 'dd/MM HH:mm', { locale: fr }) : 'Date inconnue'}
                                      </p>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-8">
                                  <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                  <p className="text-gray-500">Aucune recherche récente</p>
                                </div>
                              )}
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="mt-6 rounded-2xl border border-rose-200/60 bg-rose-50/70 p-4 shadow-inner dark:border-rose-500/40 dark:bg-rose-500/10">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <h4 className="flex items-center text-sm font-semibold uppercase tracking-[0.25em] text-rose-600 dark:text-rose-200">
                                  <AlertTriangle className="mr-2 h-4 w-4" />
                                  Alertes blacklist
                                </h4>
                                <span className="inline-flex items-center rounded-full border border-rose-300/60 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100">
                                  {blacklistAlerts.length} alerte{blacklistAlerts.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="mt-4 space-y-3">
                                {blacklistAlerts.length > 0 ? (
                                  blacklistAlerts.map((alertLog, index) => {
                                    let details: Record<string, any> = {};
                                    if (alertLog?.details) {
                                      if (typeof alertLog.details === 'string') {
                                        try {
                                          details = JSON.parse(alertLog.details);
                                        } catch {
                                          details = {};
                                        }
                                      } else if (typeof alertLog.details === 'object') {
                                        details = alertLog.details as Record<string, any>;
                                      }
                                    }

                                    const appendNumber = (value: unknown, collector: Set<string>) => {
                                      if (Array.isArray(value)) {
                                        value.forEach((entry) => appendNumber(entry, collector));
                                        return;
                                      }
                                      if (value === null || value === undefined) {
                                        return;
                                      }
                                      const normalized = typeof value === 'string' ? value.trim() : String(value);
                                      if (!normalized) {
                                        return;
                                      }
                                      collector.add(normalized);
                                    };

                                    const numbersSet = new Set<string>();
                                    appendNumber(details?.numbers, numbersSet);
                                    appendNumber(details?.number, numbersSet);
                                    appendNumber(details?.phone, numbersSet);
                                    appendNumber(details?.search_term, numbersSet);
                                    appendNumber(details?.target, numbersSet);
                                    const numbersLabel = Array.from(numbersSet).join(', ');

                                    const baseMessage = typeof details?.message === 'string' && details.message.trim()
                                      ? details.message.trim()
                                      : alertLog?.action === 'blacklist_fraud_detection'
                                      ? 'Détection de fraude - numéro blacklisté'
                                      : 'Tentative de recherche sur un numéro blacklisté';

                                    const contextText = typeof details?.context === 'string' ? details.context.trim() : '';
                                    const pageName = typeof details?.page === 'string' ? details.page.trim() : '';

                                    const rawProfileId =
                                      details?.profile_id !== undefined ? details.profile_id : details?.profileId;
                                    let profileId: number | null = null;
                                    if (typeof rawProfileId === 'number' && Number.isFinite(rawProfileId)) {
                                      profileId = rawProfileId;
                                    } else if (typeof rawProfileId === 'string' && rawProfileId.trim() !== '') {
                                      const parsed = Number(rawProfileId.trim());
                                      profileId = Number.isNaN(parsed) ? null : parsed;
                                    }

                                    const createdAtLabel = (() => {
                                      if (!alertLog?.created_at) {
                                        return 'Date inconnue';
                                      }
                                      try {
                                        const parsed = parseISO(alertLog.created_at);
                                        if (!Number.isNaN(parsed.getTime())) {
                                          return format(parsed, 'Pp', { locale: fr });
                                        }
                                      } catch {
                                        // Ignore ISO parsing errors
                                      }
                                      try {
                                        const parsed = new Date(alertLog.created_at);
                                        if (!Number.isNaN(parsed.getTime())) {
                                          return format(parsed, 'Pp', { locale: fr });
                                        }
                                      } catch {
                                        // Ignore generic parsing errors
                                      }
                                      return alertLog.created_at;
                                    })();

                                    return (
                                      <div
                                        key={alertLog?.id ?? `${alertLog?.created_at ?? 'alert'}-${index}`}
                                        className="flex items-start gap-3 rounded-2xl border border-rose-400/60 bg-white/90 px-4 py-3 text-sm text-rose-700 shadow-sm shadow-rose-200/40 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-100"
                                      >
                                        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-sm shadow-rose-500/40">
                                          <AlertTriangle className="h-4 w-4" />
                                        </span>
                                        <div className="flex-1 space-y-2">
                                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/60 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200">
                                                {alertLog?.action || 'blacklist_alert'}
                                              </span>
                                              {pageName && (
                                                <span className="inline-flex items-center rounded-full border border-blue-200/60 bg-blue-50/70 px-3 py-1 text-xs font-medium text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
                                                  {pageName}
                                                </span>
                                              )}
                                            </div>
                                            <span className="text-xs text-rose-600/80 dark:text-rose-200/80">{createdAtLabel}</span>
                                          </div>
                                          <p className="text-sm font-semibold text-rose-700 dark:text-rose-100">{baseMessage}</p>
                                          {numbersLabel && (
                                            <p className="text-xs font-medium text-rose-600/80 dark:text-rose-200/70">
                                              Numéro(s) : <span className="font-semibold">{numbersLabel}</span>
                                            </p>
                                          )}
                                          <p className="text-xs text-rose-600/70 dark:text-rose-200/70">
                                            Déclenché par{' '}
                                            <span className="font-semibold">{alertLog?.username || 'Utilisateur inconnu'}</span>
                                          </p>
                                          {contextText && (
                                            <p className="text-xs text-rose-600/70 dark:text-rose-200/70">Contexte : {contextText}</p>
                                          )}
                                          {profileId !== null && (
                                            <button
                                              onClick={() => openEditProfile(profileId!)}
                                              className="inline-flex w-max items-center gap-2 rounded-full border border-rose-400/50 bg-white/80 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-white dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
                                            >
                                              Voir le profil
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <p className="rounded-2xl border border-dashed border-rose-300/70 bg-white/80 px-4 py-3 text-sm text-rose-600/80 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200/80">
                                    Aucune alerte blacklist récente.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Termes de recherche populaires */}
                    <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-gray-800">
                      <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center dark:text-gray-100">
                        <TrendingUp className="h-6 w-6 mr-2 text-orange-600 dark:text-orange-400" />
                        Termes de recherche populaires
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {topSearchTerms.length > 0 ? (
                          topSearchTerms.slice(0, 9).map((term, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl hover:from-blue-50 hover:to-blue-100 transition-all dark:from-gray-800 dark:to-gray-700 dark:hover:from-blue-900 dark:hover:to-blue-800"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full text-blue-600 font-bold text-sm dark:bg-blue-900 dark:text-blue-200">
                                  {index + 1}
                                </div>
                                <span className="font-medium text-gray-900 truncate max-w-xs dark:text-gray-100">"{term.search_term}"</span>
                              </div>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {term.search_count} fois
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-full text-center py-8">
                            <Search className="mx-auto h-12 w-12 text-gray-400 mb-4 dark:text-gray-500" />
                            <p className="text-gray-500 dark:text-gray-400">Aucun terme de recherche populaire</p>
                          </div>
                        )}
                      </div>
                    </div>
                </>
              )}
            </div>
          )}

          {currentPage === 'upload' && isAdmin && (
            <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
              <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />
              <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
              <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="flex h-full flex-col justify-between gap-8 rounded-3xl border border-white/70 bg-white/80 p-8 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/60 dark:ring-white/10">
                    <div className="space-y-6">
                      <PageHeader
                        icon={<UploadCloud className="h-6 w-6" />}
                        title="Charger des données"
                        subtitle="Importez vos bases CSV et gardez une traçabilité claire de vos opérations."
                      />
                      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        Déposez vos fichiers structurés pour alimenter vos analyses et partager des jeux de données fiables avec vos équipes.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="rounded-2xl border border-blue-100/70 bg-blue-50/80 p-4 text-left shadow-sm dark:border-blue-500/30 dark:bg-blue-950/30">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-700 dark:text-blue-200">Imports réalisés</p>
                          <p className="mt-2 text-3xl font-bold text-blue-900 dark:text-blue-100">{uploadSummary.totalImports}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/80 p-4 text-left shadow-sm dark:border-emerald-500/30 dark:bg-emerald-950/30">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-200">Enregistrements traités</p>
                          <p className="mt-2 text-3xl font-bold text-emerald-800 dark:text-emerald-200">{uploadSummary.totalRows.toLocaleString('fr-FR')}</p>
                        </div>
                        <div className="rounded-2xl border border-purple-100/70 bg-purple-50/80 p-4 text-left shadow-sm dark:border-purple-500/30 dark:bg-purple-950/30">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-purple-700 dark:text-purple-200">Taux de réussite</p>
                          <p className="mt-2 text-3xl font-bold text-purple-800 dark:text-purple-200">
                            {uploadSummary.successRate !== null ? `${uploadSummary.successRate}%` : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                          <span className="mt-1 rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                            <FileText className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Préparez votre fichier CSV</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Assurez-vous d'utiliser un encodage UTF-8 et un séparateur cohérent.</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                          <span className="mt-1 rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">
                            <Shield className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Contrôles automatisés</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Nous vérifions automatiquement les lignes pour identifier les erreurs potentielles.</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                          <span className="mt-1 rounded-xl bg-purple-500/10 p-2 text-purple-600 dark:bg-purple-500/20 dark:text-purple-200">
                            <BarChart3 className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Suivi en temps réel</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Visualisez instantanément l'impact de vos imports sur vos tableaux de bord.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {uploadSummary.lastImportRelative && (
                      <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Dernier import</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {uploadSummary.lastImportTable ?? 'Table inconnue'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {uploadSummary.lastImportRelative}
                          {uploadSummary.lastImportUser ? ` par ${uploadSummary.lastImportUser}` : ''}
                        </p>
                        {uploadSummary.lastImportMode && (
                          <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                            <Settings className="h-3.5 w-3.5" />
                            {uploadSummary.lastImportMode}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="rounded-3xl border border-white/70 bg-white/90 p-8 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-white/10">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Importer un fichier CSV</h3>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Choisissez la table cible et téléchargez votre fichier. Les champs seront automatiquement validés.
                    </p>
                    <form onSubmit={handleUploadData} className="mt-6 space-y-6">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                          Nom de la table
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="ex: transactions_2024"
                          className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:focus:border-blue-400"
                          value={uploadTable}
                          onChange={(e) => setUploadTable(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                          Fichier à importer
                        </label>
                        <input
                          type="file"
                          accept=".csv"
                          required
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="mt-2 block w-full cursor-pointer rounded-2xl border border-dashed border-slate-300/80 bg-white/60 px-4 py-5 text-sm text-slate-500 shadow-sm transition file:mr-4 file:rounded-full file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-blue-400 hover:bg-blue-50 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-600/70 dark:bg-slate-900/60 dark:text-slate-300 dark:file:bg-blue-500 dark:hover:border-blue-400"
                        />
                        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                          Formats supportés : CSV (UTF-8). Conservez la première ligne pour les en-têtes de colonnes.
                        </p>
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="group relative flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-4 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Import en cours...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Upload className="h-5 w-5" />
                            Importer le fichier
                          </span>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
                <div className="relative mt-12">
                  <div className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-white/10">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-4 dark:border-slate-700/60">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Historique des imports</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Suivez vos dernières opérations et consultez les éventuelles erreurs.</p>
                      </div>
                      {uploadSummary.lastImportRelative && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-blue-100/70 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                          <Clock className="h-3.5 w-3.5" />
                          Dernier import {uploadSummary.lastImportRelative}
                        </span>
                      )}
                    </div>
                    {uploadHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Database className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Aucune base importée pour le moment.</p>
                        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Vos imports apparaîtront ici dès qu'ils seront terminés.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-6 pt-6">
                        <div className="space-y-4">
                          {paginatedUploadHistory.map((item, index) => {
                            const createdAt = item.created_at ? parseISO(item.created_at) : null;
                            const createdLabel = createdAt ? format(createdAt, 'dd/MM/yyyy HH:mm', { locale: fr }) : null;
                            const createdRelative = createdAt ? formatDistanceToNow(createdAt, { addSuffix: true, locale: fr }) : null;
                            const totalRows = typeof item.total_rows === 'number' ? item.total_rows : (typeof item.success_rows === 'number' ? item.success_rows : 0);
                            const successRows = typeof item.success_rows === 'number' ? item.success_rows : null;
                          const errorRows = typeof item.error_rows === 'number' ? item.error_rows : 0;
                          const hasErrors = (errorRows ?? 0) > 0 || Boolean(item.errors);
                          const uploadModeLabel = getUploadModeLabel(item.upload_mode);

                          return (
                            <div
                              key={item.id ?? `${item.table_name}-${index}`}
                              className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white/85 to-white/60 p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-700/60 dark:from-slate-900/60 dark:to-slate-900/40"
                            >
                              <div className="absolute -right-20 -top-16 h-36 w-36 rounded-full bg-blue-200/40 blur-3xl transition-opacity duration-300 group-hover:opacity-80 dark:bg-blue-500/20" />
                              <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="flex items-start gap-3">
                                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                                    <Database className="h-5 w-5" />
                                  </span>
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400 dark:text-slate-500">Base importée</p>
                                    <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{item.table_name}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-300">{item.file_name}</p>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 text-right">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400 dark:text-slate-500">Enregistrements</span>
                                  <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{totalRows.toLocaleString('fr-FR')}</span>
                                  {createdLabel && (
                                    <span className="text-xs text-slate-400 dark:text-slate-500">Importé le {createdLabel}</span>
                                  )}
                                  {createdRelative && (
                                    <span className="text-xs text-slate-400 dark:text-slate-500">{createdRelative}</span>
                                  )}
                                </div>
                              </div>
                              <div className="relative z-10 mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-emerald-200/60 bg-emerald-500/5 px-4 py-3 text-sm shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-200">Réussis</p>
                                  <p className="mt-1 text-base font-semibold text-emerald-600 dark:text-emerald-200">{(successRows ?? totalRows).toLocaleString('fr-FR')}</p>
                                </div>
                                <div
                                  className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
                                    hasErrors
                                      ? 'border-rose-300/70 bg-rose-500/10 text-rose-600 dark:border-rose-400/50 dark:bg-rose-500/20 dark:text-rose-200'
                                      : 'border-slate-200/70 bg-white/80 text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300'
                                  }`}
                                >
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em]">Erreurs</p>
                                  <p className="mt-1 text-base font-semibold">{errorRows.toLocaleString('fr-FR')}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Mode</p>
                                  <p className="mt-1 text-base font-semibold text-slate-700 dark:text-slate-100">{uploadModeLabel}</p>
                                </div>
                              </div>
                              <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                                <div className="flex flex-wrap items-center gap-3">
                                  {item.username && (
                                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                      <User className="h-3.5 w-3.5" />
                                      {item.username}
                                    </span>
                                  )}
                                  <span className="rounded-full bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                                    ID #{item.id}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleDeleteUpload(item.id)}
                                  className="inline-flex items-center gap-2 rounded-full border border-rose-400/60 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-50 dark:border-rose-400/50 dark:text-rose-200 dark:hover:bg-rose-500/20"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Supprimer
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                        <PaginationControls
                          currentPage={uploadHistoryPage}
                          totalPages={totalUploadHistoryPages}
                          onPageChange={setUploadHistoryPage}
                          pageSize={uploadHistoryPerPage}
                          pageSizeOptions={PAGE_SIZE_OPTIONS}
                          onPageSizeChange={setUploadHistoryPerPage}
                          className="pt-2"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showScrollTop && !showUserModal && !showPasswordModal && (
        <button
          type="button"
          onClick={handleScrollToTop}
          className="group fixed bottom-6 right-6 z-[1000] flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 text-white shadow-[0_15px_40px_rgba(79,70,229,0.35)] transition-all hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 relative"
          aria-label="Revenir en haut de la page"
        >
          <span className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <ArrowUp className="relative h-5 w-5 transition-transform duration-300 group-hover:-translate-y-1" />
        </button>
      )}

      {/* Modal de partage de dossier */}
      {showFolderShareModal && folderShareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900/95">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Partager le dossier
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {folderShareTarget.name?.trim() || `Dossier #${folderShareTarget.id}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowFolderShareModal(false);
                  setFolderShareTarget(null);
                }}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitFolderShare} className="space-y-5 px-6 py-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sélectionnez les membres de la division pour leur donner accès à ce dossier.
                Seuls les utilisateurs actifs apparaissent dans la liste.
              </p>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={folderShareAll}
                  onChange={toggleFolderShareAll}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Partager avec tous les membres actifs de la division
              </label>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200/80 bg-white/80 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60">
                {folderShareUsers.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-300">
                    Aucun utilisateur disponible dans cette division.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                    {folderShareUsers.map((member) => {
                      const disabled = member.id === folderShareOwnerId;
                      const checked = folderShareAll || folderShareSelectedIds.includes(member.id);
                      return (
                        <li key={member.id} className="flex items-center justify-between px-4 py-3 text-sm">
                          <label className={`flex items-center gap-3 ${disabled ? 'opacity-60' : ''}`}>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={disabled ? true : checked}
                              onChange={() => toggleFolderShareUser(member.id)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700 dark:text-slate-200">{member.login}</span>
                          </label>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {disabled ? 'Créateur' : member.active === 1 ? 'Actif' : 'Inactif'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {folderShareMessage && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{folderShareMessage}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowFolderShareModal(false);
                    setFolderShareTarget(null);
                  }}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={folderShareLoading}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/30 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {folderShareLoading ? 'Enregistrement...' : 'Enregistrer le partage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal utilisateur */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
              </h3>
            </div>
            
            <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Login</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={userFormData.login}
                  onChange={(e) => setUserFormData({ ...userFormData, login: e.target.value })}
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  />
                  <p className="mt-1 text-sm text-gray-500">Minimum 8 caractères</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rôle</label>
                <select
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={userFormData.admin}
                  onChange={(e) => handleUserRoleChange(parseInt(e.target.value, 10))}
                >
                  <option value={0}>Utilisateur</option>
                  <option value={1}>Administrateur</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Division</label>
                <select
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={userFormData.divisionId ?? 0}
                  onChange={(e) => setUserFormData({ ...userFormData, divisionId: parseInt(e.target.value, 10) })}
                  required={userFormData.admin !== 1}
                  disabled={userFormData.admin === 1}
                >
                  {userFormData.admin === 1 ? (
                    <option value={0}>Aucune division (administrateur)</option>
                  ) : divisions.length === 0 ? (
                    <option value={0}>Aucune division disponible</option>
                  ) : (
                    divisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.name}
                      </option>
                    ))
                  )}
                </select>
                {userFormData.admin === 1 && (
                  <p className="mt-1 text-sm text-gray-500">
                    Les administrateurs n'appartiennent à aucune division.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
                <select
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={userFormData.active}
                  onChange={(e) => setUserFormData({ ...userFormData, active: parseInt(e.target.value) })}
                >
                  <option value={1}>Actif</option>
                  <option value={0}>Désactivé</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false);
                    setEditingUser(null);
                    setUserFormData({
                      login: '',
                      password: '',
                      admin: 0,
                      active: 1,
                      divisionId: divisions[0]?.id || 0
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-600/70 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Enregistrement...' : (editingUser ? 'Modifier' : 'Créer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de partage d'opération */}
      {showShareModal && shareTargetCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900/95">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Partager l'opération
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {shareTargetCase.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareTargetCase(null);
                }}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitShare} className="space-y-5 px-6 py-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sélectionnez les membres de la division pour partager cette opération. Seuls les utilisateurs actifs de la division peuvent être sélectionnés.
              </p>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={shareAllUsers}
                  onChange={toggleShareAllUsers}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Partager avec tous les membres de la division
              </label>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200/80 bg-white/80 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60">
                {shareDivisionUsers.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-300">
                    Aucun utilisateur disponible dans cette division.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                    {shareDivisionUsers.map((member) => {
                      const disabled = member.id === shareOwnerId;
                      const checked = shareAllUsers || shareSelectedUserIds.includes(member.id);
                      return (
                        <li key={member.id} className="flex items-center justify-between px-4 py-3 text-sm">
                          <label className={`flex items-center gap-3 ${disabled ? 'opacity-60' : ''}`}>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={disabled ? true : checked}
                              onChange={() => toggleShareUser(member.id)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700 dark:text-slate-200">{member.login}</span>
                          </label>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {disabled ? 'Responsable' : member.active === 1 ? 'Actif' : 'Inactif'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {shareMessage && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{shareMessage}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowShareModal(false);
                    setShareTargetCase(null);
                  }}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={shareLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {shareLoading ? 'Enregistrement...' : 'Enregistrer le partage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCaseExportModal && caseExportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900/95">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Exporter un rapport ciblé
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {caseExportTarget.name || `Opération #${caseExportTarget.id}`}
                </p>
              </div>
              <button
                onClick={closeCaseExportModal}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Saisissez un numéro recherché pour générer son rapport ciblé.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Numéro cible
                </label>
                <input
                  type="text"
                  value={caseExportNumber}
                  onChange={(event) => setCaseExportNumber(event.target.value)}
                  placeholder="Ex : 221771234567"
                  className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Laissez vide pour exporter le rapport complet.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeCaseExportModal}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleExportCaseFullReport}
                className="rounded-xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-600/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
              >
                Exporter le rapport complet
              </button>
              <button
                type="button"
                onClick={handleExportCaseWithNumber}
                disabled={!caseExportNumber.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/30 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Exporter le rapport du numéro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal changement de mot de passe */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Changer le mot de passe
              </h3>
            </div>
            
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {(!isAdmin || passwordTargetUser?.id === currentUser?.id) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe actuel</label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      required
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={passwordFormData.currentPassword}
                      onChange={(e) => setPasswordFormData({ ...passwordFormData, currentPassword: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                    >
                      {showPasswords.current ? (
                        <VisibleIcon className="h-4 w-4 text-gray-400" />
                      ) : (
                        <HiddenIcon className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={passwordFormData.newPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                  >
                    {showPasswords.new ? (
                      <VisibleIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                      <HiddenIcon className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500">Minimum 8 caractères</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirmer le nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={passwordFormData.confirmPassword}
                    onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                  >
                    {showPasswords.confirm ? (
                      <VisibleIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                      <HiddenIcon className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordTargetUser(null);
                    setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    setShowPasswords({ current: false, new: false, confirm: false });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Modification...' : 'Changer le mot de passe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkProfileImportModal
        open={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        runSearch={runSearchForNumber}
      />

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
          onClose={closeConfirmDialog}
        />
      )}
    </div>

    </>
  );
};

export default App;
