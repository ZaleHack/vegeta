import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Bell,
  PhoneIncoming,
  PhoneOutgoing,
  MessageSquare,
  MapPin,
  AlertTriangle,
  Share2,
  GripVertical,
  X,
  Scan
} from 'lucide-react';
import ToggleSwitch from './components/ToggleSwitch';

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
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import PageHeader from './components/PageHeader';
import SearchResultProfiles from './components/SearchResultProfiles';
import LoadingSpinner from './components/LoadingSpinner';
import ProfileList, { ProfileListItem } from './components/ProfileList';
import ProfileForm from './components/ProfileForm';
import CdrMap from './components/CdrMap';
import LinkDiagram from './components/LinkDiagram';
import SoraLogo from './components/SoraLogo';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const LINK_DIAGRAM_PREFIXES = ['22177', '22176', '22178', '22170', '22175', '22133'];
const FRAUD_ROLE_LABELS: Record<string, string> = {
  caller: 'Appelant',
  callee: 'Appelé',
  target: 'Cible'
};

interface User {
  id: number;
  login: string;
  admin: number;
  created_at: string;
  active: number;
  division_id: number;
  division_name?: string | null;
  otp_enabled?: number;
  role?: 'ADMIN' | 'USER';
}

interface SearchResult {
  table: string;
  database: string;
  preview: Record<string, any>;
  primary_keys: { id: number };
  score: number;
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
const DEFAULT_CARD_ORDER = ['total-searches', 'total-records', 'profiles', 'requests', 'operations'];

interface GendarmerieEntry {
  id: number;
  Libelle: string;
  Telephone: string;
  SousCategorie?: string;
  Secteur?: string;
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

type NotificationType = 'request' | 'case_shared' | 'profile_shared';

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
  profileId?: number;
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
  OrganizationName: string;
  Type: string;
  Name: string;
  Title: string;
  EmailAddress: string;
  Telephone: string;
  SelectAreaofInterest: string;
  SelectSectorsofInterest: string;
  created_at: string;
}

interface VehiculeEntry {
  ID: number;
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

interface CdrContact {
  number: string;
  callCount: number;
  smsCount: number;
  total: number;
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
  imeiCaller?: string;
  imeiCalled?: string;
  source?: string;
}

interface CdrSearchResult {
  total: number;
  contacts: CdrContact[];
  topContacts: CdrContact[];
  locations: CdrLocation[];
  topLocations: CdrLocation[];
  path: CdrPoint[];
}

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

interface CaseFile {
  id: number;
  filename: string;
  uploaded_at: string;
  line_count: number;
  cdr_number: string | null;
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
}

interface BlacklistEntry {
  id: number;
  number: string;
  created_at: string;
}

const App: React.FC = () => {
  // États principaux
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('login');
  const [logoutReason, setLogoutReason] = useState<'inactivity' | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const [searchError, setSearchError] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<{ query: string; page: number; limit: number } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'profile'>('list');
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [blacklistNumber, setBlacklistNumber] = useState('');
  const [blacklistError, setBlacklistError] = useState('');
  const [blacklistFile, setBlacklistFile] = useState<File | null>(null);
  const [logsData, setLogsData] = useState<any[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const LOGS_LIMIT = 20;
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionLoading, setSessionLoading] = useState(false);
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
  const [profileDefaults, setProfileDefaults] = useState<{
    comment?: string;
    extra_fields?: FieldCategory[];
    photo_path?: string | null;
    attachments?: { id: number; original_name: string | null; file_path: string }[];
  }>({});
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);

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

  const [requestSearchInput, setRequestSearchInput] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestPage, setRequestPage] = useState(1);
  const requestsPerPage = 10;

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
    const trimmedSearch = requestSearch.trim();
    if (!trimmedSearch) {
      return base;
    }
    const lowered = trimmedSearch.toLowerCase();
    return base.filter(
      (r) =>
        r.phone.includes(trimmedSearch) ||
        (r.user_login || '').toLowerCase().includes(lowered)
    );
  }, [requests, isAdmin, currentUser, hiddenRequestIds, requestSearch]);

  const totalRequestPages = Math.ceil(visibleRequests.length / requestsPerPage);
  const paginatedRequests = useMemo(
    () =>
      visibleRequests.slice(
        (requestPage - 1) * requestsPerPage,
        requestPage * requestsPerPage
      ),
    [visibleRequests, requestPage]
  );

  // Ensure the current request page is within bounds when the filtered
  // results change. Otherwise, a shrinking dataset can leave the user on an
  // out-of-range page with no navigation controls.
  useEffect(() => {
    setRequestPage(p => Math.min(p, Math.max(totalRequestPages, 1)));
  }, [totalRequestPages]);

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

  const openCreateProfile = (data: {
    email?: string;
    comment?: string;
    extra_fields?: Record<string, string>;
  }) => {
    const infoFields: ExtraField[] = [
      { key: 'Email', value: data.email || '' }
    ];
    const extraFields: ExtraField[] = Object.entries(data.extra_fields || {}).map(([k, v]) => ({
      key: k,
      value: v
    }));
    const categories: FieldCategory[] = [
      { title: 'Informations', fields: [...infoFields, ...extraFields] }
    ];
    setProfileDefaults({
      comment: data.comment || '',
      extra_fields: categories,
      photo_path: null,
      attachments: []
    });
    setEditingProfileId(null);
    setShowProfileForm(true);
    setCurrentPage('profiles');
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
      let extras: FieldCategory[] = [];
      try {
        extras = profile.extra_fields ? JSON.parse(profile.extra_fields) : [];
      } catch {
        try {
          const obj = profile.extra_fields ? JSON.parse(profile.extra_fields) : {};
          extras = [
            {
              title: 'Informations',
              fields: Object.entries(obj).map(([k, v]) => ({
                key: k,
                value: v as string
              }))
            }
          ];
        } catch {
          extras = [];
        }
      }
      if (extras.length === 0) {
        extras = [
          {
            title: 'Informations',
            fields: [
              { key: 'Email', value: profile.email || '' }
            ]
          }
        ];
      }
      setProfileDefaults({
        comment: profile.comment || '',
        extra_fields: extras,
        photo_path: profile.photo_path || null,
        attachments: Array.isArray(profile.attachments) ? profile.attachments : []
      });
      setEditingProfileId(id);
      setShowProfileForm(true);
      setCurrentPage('profiles');
      logPageVisit('profile', { profile_id: id });
    }
  };
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);

  // États annuaire gendarmerie
  const [gendarmerieData, setGendarmerieData] = useState<GendarmerieEntry[]>([]);
  const [gendarmerieSearch, setGendarmerieSearch] = useState('');
  const [gendarmeriePage, setGendarmeriePage] = useState(1);
  const [gendarmerieLoading, setGendarmerieLoading] = useState(false);
  const gendarmeriePerPage = 12;

  // États ONG
  const [ongData, setOngData] = useState<OngEntry[]>([]);
  const [ongSearch, setOngSearch] = useState('');
  const [ongPage, setOngPage] = useState(1);
  const [ongLoading, setOngLoading] = useState(false);
  const ongPerPage = 12;

  // États entreprises
  const [entreprisesData, setEntreprisesData] = useState<EntrepriseEntry[]>([]);
  const [entreprisesSearch, setEntreprisesSearch] = useState('');
  const [entreprisesPage, setEntreprisesPage] = useState(1);
  const [entreprisesLoading, setEntreprisesLoading] = useState(false);
  const entreprisesPerPage = 12;
  const [entreprisesTotal, setEntreprisesTotal] = useState(0);

  const [vehiculesData, setVehiculesData] = useState<VehiculeEntry[]>([]);
  const [vehiculesSearch, setVehiculesSearch] = useState('');
  const [vehiculesPage, setVehiculesPage] = useState(1);
  const [vehiculesLoading, setVehiculesLoading] = useState(false);
  const vehiculesPerPage = 12;
  const [vehiculesTotal, setVehiculesTotal] = useState(0);

  // États CDR
  const [cdrIdentifiers, setCdrIdentifiers] = useState<string[]>([]);
  const [cdrIdentifierInput, setCdrIdentifierInput] = useState('');
  const [cdrStart, setCdrStart] = useState('');
  const [cdrEnd, setCdrEnd] = useState('');
  const [cdrStartTime, setCdrStartTime] = useState('');
  const [cdrEndTime, setCdrEndTime] = useState('');
  const [cdrIncoming, setCdrIncoming] = useState(true);
  const [cdrOutgoing, setCdrOutgoing] = useState(true);
  const [cdrSms, setCdrSms] = useState(true);
  const [cdrPosition, setCdrPosition] = useState(true);
  const [cdrItinerary, setCdrItinerary] = useState(false);
  const [cdrResult, setCdrResult] = useState<CdrSearchResult | null>(null);
  const [cdrLoading, setCdrLoading] = useState(false);
  const [cdrError, setCdrError] = useState('');
  const [cdrInfoMessage, setCdrInfoMessage] = useState('');
  const [cdrFile, setCdrFile] = useState<File | null>(null);
  const [cdrNumber, setCdrNumber] = useState('');
  const [cdrUploadMessage, setCdrUploadMessage] = useState('');
  const [cdrUploadError, setCdrUploadError] = useState('');
  const [cdrUploading, setCdrUploading] = useState(false);
  const [cdrCaseName, setCdrCaseName] = useState('');
  const [cdrCaseMessage, setCdrCaseMessage] = useState('');
  const [cases, setCases] = useState<CdrCase[]>([]);
  const [casePage, setCasePage] = useState(1);
  const CASES_PER_PAGE = 20;
  const totalCasePages = Math.ceil(cases.length / CASES_PER_PAGE);
  const paginatedCases = cases.slice(
    (casePage - 1) * CASES_PER_PAGE,
    casePage * CASES_PER_PAGE
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
    if (casePage > totalCasePages) {
      setCasePage(totalCasePages || 1);
    }
  }, [casePage, totalCasePages]);
  const [showCdrMap, setShowCdrMap] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CdrCase | null>(null);
  const [caseFiles, setCaseFiles] = useState<CaseFile[]>([]);
  const [linkDiagram, setLinkDiagram] = useState<LinkDiagramData | null>(null);
  const [showMeetingPoints, setShowMeetingPoints] = useState(false);
  const [zoneMode, setZoneMode] = useState(false);
  const [fraudResult, setFraudResult] = useState<FraudDetectionResult | null>(null);
  const [fraudLoading, setFraudLoading] = useState(false);
  const [fraudError, setFraudError] = useState('');
  const [globalFraudIdentifier, setGlobalFraudIdentifier] = useState('');
  const [globalFraudStart, setGlobalFraudStart] = useState('');
  const [globalFraudEnd, setGlobalFraudEnd] = useState('');
  const [globalFraudLoading, setGlobalFraudLoading] = useState(false);
  const [globalFraudError, setGlobalFraudError] = useState('');
  const [globalFraudResult, setGlobalFraudResult] = useState<GlobalFraudDetectionResult | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTargetCase, setShareTargetCase] = useState<CdrCase | null>(null);
  const [shareDivisionUsers, setShareDivisionUsers] = useState<CaseShareUser[]>([]);
  const [shareSelectedUserIds, setShareSelectedUserIds] = useState<number[]>([]);
  const [shareAllUsers, setShareAllUsers] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareOwnerId, setShareOwnerId] = useState<number | null>(null);
  const [pendingShareCaseId, setPendingShareCaseId] = useState<number | null>(null);
  const [showProfileShareModal, setShowProfileShareModal] = useState(false);
  const [profileShareTarget, setProfileShareTarget] = useState<ProfileListItem | null>(null);
  const [profileShareUsers, setProfileShareUsers] = useState<ProfileShareUser[]>([]);
  const [profileShareSelectedIds, setProfileShareSelectedIds] = useState<number[]>([]);
  const [profileShareAll, setProfileShareAll] = useState(false);
  const [profileShareOwnerId, setProfileShareOwnerId] = useState<number | null>(null);
  const [profileShareMessage, setProfileShareMessage] = useState('');
  const [profileShareLoading, setProfileShareLoading] = useState(false);
  const [profileListRefreshKey, setProfileListRefreshKey] = useState(0);
  const [highlightedProfileId, setHighlightedProfileId] = useState<number | null>(null);
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
    const imeiCount = Array.isArray(globalFraudResult.imeis) ? globalFraudResult.imeis.length : 0;
    const numbersCount = Array.isArray(globalFraudResult.imeis)
      ? globalFraudResult.imeis.reduce((acc, entry) => acc + entry.numbers.length, 0)
      : 0;
    const alertCount = Array.isArray(globalFraudResult.numbers) ? globalFraudResult.numbers.length : 0;
    return { totalImeis: imeiCount, totalNumbers: numbersCount, alerts: alertCount };
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
            const sanitized = parsed.filter((item): item is string => typeof item === 'string');
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
  const [logUserFilter, setLogUserFilter] = useState('');
  const [loadingStats, setLoadingStats] = useState(false);
  const [timeSeries, setTimeSeries] = useState<any[]>([]);
  const [tableDistribution, setTableDistribution] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);

  const numberFormatter = useMemo(() => new Intl.NumberFormat('fr-FR'), []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DASHBOARD_CARD_STORAGE_KEY, JSON.stringify(cardOrder));
    }
  }, [cardOrder]);

  const addCdrIdentifier = () => {
    const normalized = normalizeCdrNumber(cdrIdentifierInput);
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
        setCurrentPage('dashboard');
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
        setCurrentPage('dashboard');
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
    localStorage.removeItem('token');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setCurrentPage('login');
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
      const token = localStorage.getItem('token');
      const res = await fetch('/api/blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ number: num })
      });
      const data = await res.json();
      if (res.ok) {
        setBlacklist(data);
        setBlacklistNumber('');
        setBlacklistError('');
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
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', blacklistFile);
      const res = await fetch('/api/blacklist/upload', {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setBlacklist(data);
        setBlacklistFile(null);
        setBlacklistError('');
      } else {
        setBlacklistError(data.error || "Erreur lors de l'import");
      }
    } catch (err) {
      setBlacklistError('Erreur de connexion');
    }
  };

  const handleDeleteBlacklist = async (id: number) => {
    if (!window.confirm('Confirmer la suppression de ce numéro blacklisté ?')) {
      return;
    }
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

  const logPageVisit = useCallback(async (page: string, extra: Record<string, any> = {}) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
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

    setLoading(true);
    setSearchError('');
    setSearchResults(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: trimmedQuery, page: requestedPage, limit: requestedLimit }),
        signal: controller.signal
      });

      const data = await response.json();
      if (response.ok) {
        setSearchResults(data);
        lastQueryRef.current = { query: trimmedQuery, page: requestedPage, limit: requestedLimit };
      } else {
        setSearchError(data.error || 'Erreur lors de la recherche');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setSearchError('Erreur de connexion au serveur');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
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
      const token = localStorage.getItem('token');
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: trimmedQuery,
          page: requestedPage,
          limit: requestedLimit
        }),
        signal: controller.signal
      });

      const data = await response.json();

      if (response.ok) {
        setSearchResults((prev) =>
          prev
            ? {
                ...prev,
                ...data,
                hits: [...prev.hits, ...(data.hits || [])],
                tables_searched: Array.from(
                  new Set([...(prev.tables_searched || []), ...(data.tables_searched || [])])
                )
              }
            : data
        );
        lastQueryRef.current = { query: trimmedQuery, page: requestedPage, limit: requestedLimit };
      } else {
        setSearchError(data.error || 'Erreur lors du chargement des résultats');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setSearchError('Erreur de connexion au serveur');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const exportToCSV = () => {
    if (!searchResults || searchResults.hits.length === 0) {
      alert('Aucun résultat à exporter');
      return;
    }

    try {
      const allFields = new Set<string>();
      searchResults.hits.forEach(hit => {
        Object.keys(hit.preview).forEach(field => allFields.add(field));
      });

      const fields = ['Score', ...Array.from(allFields)];

      let csvContent = fields.map(field => `"${field}"`).join(',') + '\n';

      searchResults.hits.forEach(hit => {
        const row = [
          `"${hit.score || 0}"`,
          ...Array.from(allFields).map(field => {
            const value = hit.preview[field];
            if (value === null || value === undefined) return '""';
            return `"${String(value).replace(/"/g, '""')}"`;
          })
        ];
        csvContent += row.join(',') + '\n';
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const searchTerm = searchQuery.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
      link.setAttribute('download', `sora-export-${searchTerm}-${timestamp}.csv`);
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert(`Export réussi ! ${searchResults.hits.length} résultats exportés.`);
    } catch (error) {
      console.error('Erreur export:', error);
      alert('Erreur lors de l\'export');
    }
  };

  const handleRequestIdentification = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone: searchQuery })
      });
      const data = await response.json();
      if (response.ok) {
        alert('Demande envoyée');
      } else {
        alert(data.error || 'Erreur lors de la demande');
      }
    } catch (error) {
      alert('Erreur de connexion');
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
        fetchRequests();
      }
    } catch (error) {
      console.error('Erreur mise à jour demande:', error);
    }
  };

  const deleteRequest = async (id: number) => {
    if (!confirm('Supprimer cette demande ?')) return;
    if (isAdmin) {
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
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchRequests();
    } catch (error) {
      console.error('Erreur suppression demande:', error);
    }
  };

  const handleResetHiddenRequests = () => {
    if (!isAdmin) return;
    if (!confirm('Réafficher toutes les demandes supprimées ?')) return;
    setHiddenRequestIds([]);
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
          const hasSelection = prev.divisionId && entries.some((division) => division.id === prev.divisionId);
          const nextDivisionId = hasSelection ? prev.divisionId : (entries[0]?.id ?? 0);
          if (nextDivisionId === prev.divisionId) {
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
      const divisionName = (user.division_name || '').toLowerCase();
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
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

      const logQuery = isAdmin && logUserFilter
        ? `?username=${encodeURIComponent(logUserFilter)}`
        : '';

      const [statsResponse, logsResponse, timeResponse, distResponse] = await Promise.all([
        fetch('/api/stats/overview', { headers }),
        fetch(`/api/stats/search-logs${logQuery}`, { headers }),
        fetch('/api/stats/time-series?days=7', { headers }),
        fetch('/api/stats/data-distribution', { headers })
      ]);

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

      if (distResponse.ok) {
        const dist = await distResponse.json();
        const distribution = Object.entries(dist.distribution || {}).map(([key, info]: [string, any]) => ({
          table: (info as any).table_name || key,
          count: (info as any).total_records || (info as any).count || 0
        }));
        setTableDistribution(distribution);
        const total = distribution.reduce((sum, item) => sum + (item.count || 0), 0);
        setTotalRecords(total);
      }
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const dashboardCards = useMemo<DashboardCard[]>(() => {
    const profiles = statsData?.profiles;
    const requests = statsData?.requests;
    const operations = statsData?.operations;

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
        id: 'total-records',
        title: 'Enregistrements indexés',
        value: numberFormatter.format(totalRecords),
        icon: Database,
        gradient: 'from-emerald-500 via-emerald-600 to-teal-600',
        badge: {
          label: `${tableDistribution.length} sources actives`,
          tone: 'bg-white/20 text-white'
        },
        description: 'Volume agrégé des données disponibles pour la recherche'
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
        title: 'Opérations CDR',
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
  }, [numberFormatter, statsData, totalRecords, tableDistribution.length]);

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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userFormData.divisionId || userFormData.divisionId <= 0) {
        alert('Veuillez sélectionner une division');
        setLoading(false);
        return;
      }
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          login: userFormData.login,
          password: userFormData.password,
          role: userFormData.admin === 1 ? 'ADMIN' : 'USER',
          active: userFormData.active === 1 ? 1 : 0,
          divisionId: userFormData.divisionId
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Utilisateur créé avec succès');
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
        alert(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('❌ Erreur réseau:', error);
      alert('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setLoading(true);

    try {
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
          divisionId: userFormData.divisionId
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Utilisateur modifié avec succès');
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
        alert(data.error || 'Erreur lors de la modification');
      }
    } catch (error) {
      alert('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDivisionName.trim()) {
      alert('Veuillez saisir un nom de division');
      return;
    }
    setCreatingDivision(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/divisions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newDivisionName.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        alert('Division créée avec succès');
        setNewDivisionName('');
        loadDivisions();
      } else {
        alert(data.error || 'Erreur lors de la création de la division');
      }
    } catch (error) {
      console.error('Erreur création division:', error);
      alert('Erreur de connexion au serveur');
    } finally {
      setCreatingDivision(false);
    }
  };

  const handleDeleteDivision = async (divisionId: number) => {
    if (!confirm('Supprimer cette division ? Les utilisateurs associés ne seront plus rattachés.')) {
      return;
    }
    setDeletingDivisionId(divisionId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/divisions/${divisionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        let message = 'Division supprimée avec succès';
        if (data.detachedUsers > 0) {
          message += ` ( ${data.detachedUsers} utilisateur(s) détaché(s) )`;
        }
        alert(message);
        await loadDivisions();
        await loadUsers();
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la suppression de la division');
      }
    } catch (error) {
      console.error('Erreur suppression division:', error);
      alert('Erreur de connexion au serveur');
    } finally {
      setDeletingDivisionId(null);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        alert('Utilisateur supprimé avec succès');
        loadUsers();
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      alert('Erreur de connexion au serveur');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetUser = passwordTargetUser || currentUser;
    if (!targetUser) return;

    const changingOther = targetUser.id !== currentUser?.id;
    const requireCurrent = !isAdmin || !changingOther;

    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      alert('Les nouveaux mots de passe ne correspondent pas');
      return;
    }

    if (passwordFormData.newPassword.length < 8) {
      alert('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (requireCurrent && !passwordFormData.currentPassword) {
      alert('Mot de passe actuel requis');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const body: any = { newPassword: passwordFormData.newPassword };
      if (requireCurrent) {
        body.currentPassword = passwordFormData.currentPassword;
      }
      const response = await fetch(`/api/users/${targetUser.id}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok) {
        alert('Mot de passe modifié avec succès');
        setShowPasswordModal(false);
        setPasswordTargetUser(null);
        setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setShowPasswords({ current: false, new: false, confirm: false });
      } else {
        alert(data.error || 'Erreur lors du changement de mot de passe');
      }
    } catch (error) {
      alert('Erreur de connexion au serveur');
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
      divisionId: user.division_id || divisions[0]?.id || 0
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
      alert('Veuillez sélectionner un fichier');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('dataFile', uploadFile);
      formData.append('tableName', uploadTable);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/upload/file', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        alert('Données chargées avec succès');
        setUploadTable('');
        setUploadFile(null);
        fetchUploadHistory();
      } else {
        alert(data.error || 'Erreur lors du chargement');
      }
    } catch (error) {
      alert('Erreur de connexion au serveur');
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

  const handleDeleteUpload = async (id: number) => {
    if (!confirm('Supprimer les données importées ?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/upload/history/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        fetchUploadHistory();
      } else {
        alert(data.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      alert('Erreur de connexion au serveur');
    }
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

  const fetchCdrData = async () => {
    if (!selectedCase || cdrIdentifiers.length === 0) return;

    setLinkDiagram(null);
    setCdrLoading(true);
    setCdrError('');
    setCdrInfoMessage('');
    setShowCdrMap(false);

    try {
      const token = localStorage.getItem('token');
      const ids = cdrIdentifiers
        .map((i) => normalizeCdrNumber(i))
        .filter((i) => i && !i.startsWith('2214'));

      const allPaths: CdrPoint[] = [];

      for (const id of ids) {
        const params = new URLSearchParams();
        params.append('phone', id);
        if (cdrStart) params.append('start', new Date(cdrStart).toISOString().split('T')[0]);
        if (cdrEnd) params.append('end', new Date(cdrEnd).toISOString().split('T')[0]);
        if (cdrStartTime) params.append('startTime', cdrStartTime);
        if (cdrEndTime) params.append('endTime', cdrEndTime);
        const res = await fetch(`/api/cases/${selectedCase.id}/search?${params.toString()}`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (res.ok) {
          const filtered = Array.isArray(data.path)
            ? data.path.filter((p: CdrPoint) => {
                if (String(p.number || '').startsWith('2214')) return false;
                if (p.type === 'web') return cdrPosition;
                if (p.type === 'sms') return cdrSms;
                return p.direction === 'incoming'
                  ? cdrIncoming
                  : p.direction === 'outgoing'
                  ? cdrOutgoing
                  : false;
              })
            : [];
          filtered.forEach((p: CdrPoint) => (p.source = id));
          allPaths.push(...filtered);
        } else {
          setCdrError(data.error || 'Erreur lors de la recherche');
        }
      }

      const contactsMap = new Map<string, { callCount: number; smsCount: number }>();
      const locationsMap = new Map<string, CdrLocation>();
      allPaths.forEach((p: CdrPoint) => {
        if (p.number) {
          const entry = contactsMap.get(p.number) || { callCount: 0, smsCount: 0 };
          if (p.type === 'sms') entry.smsCount += 1; else entry.callCount += 1;
          contactsMap.set(p.number, entry);
        }
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

      const contacts = Array.from(contactsMap.entries())
        .map(([number, c]) => ({
          number,
          callCount: c.callCount,
          smsCount: c.smsCount,
          total: c.callCount + c.smsCount
        }))
        .sort((a, b) => b.total - a.total);

      const locations = Array.from(locationsMap.values()).sort((a, b) => b.count - a.count);

      const result: CdrSearchResult = {
        total: allPaths.length,
        contacts,
        topContacts: contacts.slice(0, 10),
        locations,
        topLocations: locations.slice(0, 10),
        path: allPaths
      };
      setCdrResult(result);

      const hasPath = allPaths.length > 0;
      setShowCdrMap(hasPath);
      setCdrInfoMessage(hasPath ? '' : 'Aucun CDR trouvé pour le filtre sélectionné');
    } catch (error) {
      console.error('Erreur recherche CDR:', error);
      setCdrError('Erreur lors de la recherche');
      setCdrResult(null);
      setCdrInfoMessage('');
    } finally {
      setCdrLoading(false);
    }
  };

  const fetchFraudDetection = async () => {
    if (!selectedCase) return;
    if (cdrIdentifiers.length === 0) {
      setFraudResult(null);
      setFraudError('Ajoutez au moins un numéro pour lancer l’analyse');
      return;
    }

    setFraudLoading(true);
    setFraudError('');

    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (cdrStart) params.append('start', new Date(cdrStart).toISOString().split('T')[0]);
      if (cdrEnd) params.append('end', new Date(cdrEnd).toISOString().split('T')[0]);
      cdrIdentifiers.forEach((identifier) => {
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

  const handleGlobalFraudSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedIdentifier = globalFraudIdentifier.trim();
    if (!trimmedIdentifier) {
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
      params.append('identifier', trimmedIdentifier);
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
    setGlobalFraudResult(null);
    setGlobalFraudError('');
  };

  useEffect(() => {
    if (cdrIdentifiers.length > 0) {
      fetchCdrData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cdrIncoming, cdrOutgoing, cdrSms, cdrPosition]);

  const handleCdrSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedCase) return;
    if (cdrStart && cdrEnd && new Date(cdrStart) > new Date(cdrEnd)) {
      setCdrError('La date de début doit précéder la date de fin');
      return;
    }
    if (cdrIdentifiers.length === 0) {
      setCdrError('Numéro requis');
      return;
    }
    await fetchCdrData();
  };

  const handleLinkDiagram = async () => {
    if (!selectedCase) return;
    const numbers = Array.from(
      new Set(
        caseFiles
          .map((f) => (f.cdr_number ? String(f.cdr_number) : null))
          .filter((n): n is string => !!n)
          .filter((n) => LINK_DIAGRAM_PREFIXES.some((p) => n.startsWith(p)))
      )
    );
    if (numbers.length < 2) {
      setCdrError('Au moins deux fichiers avec un numéro sont requis');
      return;
    }
    try {
      setCdrLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cases/${selectedCase.id}/link-diagram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ numbers })
      });
      const data = await res.json();
      if (res.ok && data.links && data.links.length > 0) {
        setLinkDiagram(data);
        setShowCdrMap(false);
        setCdrInfoMessage('');
      } else {
        setLinkDiagram(null);
        setCdrInfoMessage(data.error || 'Aucune liaison trouvée');
      }
    } catch (error) {
      console.error('Erreur diagramme des liens:', error);
      setCdrError('Erreur lors de la génération du diagramme');
    } finally {
      setCdrLoading(false);
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
            setCurrentPage('cdr-case');
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
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/cases/${shareTargetCase.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
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

  const openProfileShareModal = async (profile: ProfileListItem) => {
    setProfileShareTarget(profile);
    setProfileShareMessage('');
    setProfileShareSelectedIds([]);
    setProfileShareAll(false);
    setProfileShareUsers([]);
    setProfileShareOwnerId(null);
    setShowProfileShareModal(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/profiles/${profile.id}/share`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      const data: ProfileShareInfo = await res.json();
      if (res.ok) {
        const users: ProfileShareUser[] = Array.isArray(data.users) ? data.users : [];
        const recipients: number[] = Array.isArray(data.recipients) ? data.recipients : [];
        const ownerId = typeof data.owner?.id === 'number' ? data.owner.id : null;
        setProfileShareUsers(users);
        setProfileShareSelectedIds(recipients);
        setProfileShareOwnerId(ownerId);
        const eligibleIds = users.filter((user) => user.id !== ownerId).map((user) => user.id);
        setProfileShareAll(
          eligibleIds.length > 0 && eligibleIds.every((id) => recipients.includes(id))
        );
      } else {
        setProfileShareMessage(
          (data as any)?.error || 'Erreur lors du chargement des informations de partage'
        );
      }
    } catch (error) {
      console.error('Erreur chargement informations partage profil:', error);
      setProfileShareMessage('Erreur lors du chargement des informations de partage');
    }
  };

  const toggleProfileShareUser = (userId: number) => {
    setProfileShareSelectedIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
    setProfileShareAll(false);
  };

  const toggleProfileShareAll = () => {
    const availableIds = profileShareUsers
      .filter((user) => user.id !== profileShareOwnerId)
      .map((user) => user.id);
    if (profileShareAll) {
      setProfileShareSelectedIds([]);
      setProfileShareAll(false);
    } else {
      setProfileShareSelectedIds(availableIds);
      setProfileShareAll(true);
    }
  };

  const handleSubmitProfileShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileShareTarget) return;
    setProfileShareLoading(true);
    setProfileShareMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/profiles/${profileShareTarget.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          shareAll: profileShareAll,
          userIds: profileShareAll ? [] : profileShareSelectedIds
        })
      });
      const data = await response.json();
      if (response.ok) {
        setProfileShareMessage('Partage mis à jour');
        const recipients: number[] = Array.isArray(data.recipients) ? data.recipients : [];
        setProfileShareSelectedIds(recipients);
        if (profileShareAll) {
          const availableIds = profileShareUsers
            .filter((user) => user.id !== profileShareOwnerId)
            .map((user) => user.id);
          setProfileShareAll(
            availableIds.length > 0 && availableIds.every((id) => recipients.includes(id))
          );
        }
        setProfileListRefreshKey((prev) => prev + 1);
      } else {
        setProfileShareMessage(data.error || 'Erreur lors de la mise à jour du partage');
      }
    } catch (error) {
      console.error('Erreur partage profil:', error);
      setProfileShareMessage('Erreur lors de la mise à jour du partage');
    } finally {
      setProfileShareLoading(false);
    }
  };

  const markServerNotificationAsRead = async (notificationId: number) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' }
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

  const fetchCaseFiles = async (caseId: number) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cases/${caseId}/files`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      if (res.ok) {
        const data = await res.json();
        setCaseFiles(data);
      }
    } catch (err) {
      console.error('Erreur chargement fichiers:', err);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!selectedCase) return;
    if (!window.confirm('Supprimer ce fichier ?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/cases/${selectedCase.id}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      fetchCaseFiles(selectedCase.id);
    } catch (err) {
      console.error('Erreur suppression fichier:', err);
    }
  };

  useEffect(() => {
    if (!selectedCase) {
      setCaseFiles([]);
      setFraudResult(null);
      setFraudError('');
      setFraudLoading(false);
    } else {
      fetchCaseFiles(selectedCase.id);
      setFraudResult(null);
      setFraudError('');
    }
  }, [selectedCase]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cdrCaseName.trim()) return;
    setCdrCaseMessage('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ name: cdrCaseName.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setCdrCaseMessage('Opération créée');
        setCdrCaseName('');
        fetchCases();
      } else {
        setCdrCaseMessage(data.error || 'Erreur création d\'opération');
      }
    } catch (err) {
      console.error('Erreur création opération:', err);
      setCdrCaseMessage('Erreur création d\'opération');
    }
  };

  const handleDeleteCase = async (id: number) => {
    if (!window.confirm('Supprimer cette opération ?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/cases/${id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });
      fetchCases();
    } catch (err) {
      console.error('Erreur suppression opération:', err);
    }
  };

  const handleExportCaseReport = async (cdrCase: CdrCase) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/cases/${cdrCase.id}/report`, {
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
      link.download = `${sanitizedName || 'operation'}_rapport.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur export rapport opération:', error);
      alert("Impossible d'exporter le rapport PDF de l'opération.");
    }
  };

  const handleCdrUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cdrFile || !selectedCase || !cdrNumber.trim()) return;
    const normalizedNumber = normalizeCdrNumber(cdrNumber);
    if (!normalizedNumber) {
      setCdrUploadError('Numéro invalide');
      return;
    }
    setCdrNumber(normalizedNumber);
    setCdrUploading(true);
    setCdrUploadMessage('');
    setCdrUploadError('');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', cdrFile);
      formData.append('cdrNumber', normalizedNumber);
      const res = await fetch(`/api/cases/${selectedCase.id}/upload`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setCdrUploadMessage('Fichier importé avec succès');
        setCdrFile(null);
        setCdrNumber('');
        await fetchCaseFiles(selectedCase.id);
      } else {
        setCdrUploadError(data.error || "Erreur lors de l'import");
      }
    } catch (error) {
      console.error('Erreur upload CDR:', error);
      setCdrUploadError("Erreur lors de l'import");
    } finally {
      setCdrUploading(false);
    }
  };

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
    if (currentPage === 'cdr' && currentUser) {
      fetchCases();
    }
    if (currentPage === 'requests' && currentUser) {
      fetchRequests();
    }
  }, [currentPage, currentUser, entreprisesPage, entreprisesSearch, vehiculesPage, vehiculesSearch, isAdmin]);

  useEffect(() => {
    if (currentPage === 'blacklist' && isAdmin) {
      fetchBlacklist();
    }
  }, [currentPage, isAdmin]);

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
        const profileId = typeof notif.data.profileId === 'number' ? notif.data.profileId : undefined;
        const profileName = typeof notif.data.profileName === 'string' ? notif.data.profileName : '';
        const ownerLogin = typeof notif.data.owner === 'string' ? notif.data.owner : '';
        if (profileId) {
          items.push({
            id: `profile-share-${notif.id}`,
            notificationId: notif.id,
            profileId,
            status: 'pending',
            message: 'Nouvelle fiche de profil partagée',
            description: profileName
              ? ownerLogin
                ? `"${profileName}" partagé par ${ownerLogin}`
                : `"${profileName}" est disponible`
              : 'Une fiche de profil a été partagée avec vous',
            type: 'profile_shared',
            read: Boolean(notif.read_at)
          });
        }
      }
    });

    return items
      .sort((a, b) => {
        const idA = a.requestId ?? a.notificationId ?? 0;
        const idB = b.requestId ?? b.notificationId ?? 0;
        return idB - idA;
      })
      .slice(0, 20);
  }, [currentUser, requests, isAdmin, serverNotifications]);

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
          setCurrentPage('cdr-case');
        } else {
          setPendingShareCaseId(notification.caseId);
          fetchCases();
          setCurrentPage('cdr');
        }
      } else {
        setCurrentPage('cdr');
      }
      return;
    } else if (notification.type === 'profile_shared') {
      if (notification.notificationId) {
        markServerNotificationAsRead(notification.notificationId);
      }
      setShowNotifications(false);
      if (notification.profileId) {
        setHighlightedProfileId(notification.profileId);
        setProfileListRefreshKey((prev) => prev + 1);
      }
      setCurrentPage('profiles');
      return;
    }
    setShowNotifications(false);
    setCurrentPage('requests');
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
  const canRequestIdentification =
    !!searchResults &&
    searchResults.hits.length === 0 &&
    (numericSearch.startsWith('77') || numericSearch.startsWith('78')) &&
    numericSearch.length >= 9;

  const getPageNumbers = (current: number, total: number) => {
    const delta = 2;
    const pages: (number | string)[] = [];
    let last = 0;
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        if (last && i - last > 1) {
          pages.push('...');
        }
        pages.push(i);
        last = i;
      }
    }
    return pages;
  };

  const filteredGendarmerie =
    gendarmerieSearch.trim() === ''
      ? gendarmerieData
      : (() => {
          const results: GendarmerieEntry[] = [];
          const addedTitles = new Set<number>();
          const searchLower = gendarmerieSearch.toLowerCase();
          gendarmerieData.forEach((entry, index) => {
            const matches =
              entry.Libelle.toLowerCase().includes(searchLower) ||
              (entry.Telephone || '').toLowerCase().includes(searchLower) ||
              (entry.SousCategorie || '').toLowerCase().includes(searchLower) ||
              (entry.Secteur || '').toLowerCase().includes(searchLower) ||
              entry.id.toString().includes(searchLower);

            if (matches) {
              if (entry.Telephone && entry.Telephone.trim() !== '') {
                const prev = gendarmerieData[index - 1];
                if (
                  prev &&
                  (!prev.Telephone || prev.Telephone.trim() === '') &&
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

  const entreprisesTotalPages = Math.max(
    1,
    Math.ceil(entreprisesTotal / entreprisesPerPage)
  );
  const paginatedEntreprises = entreprisesData;

  const vehiculesTotalPages = Math.max(
    1,
    Math.ceil(vehiculesTotal / vehiculesPerPage)
  );
  const paginatedVehicules = vehiculesData;

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

  const renderCdrSearchForm = () => {
    const detectionSection = !showCdrMap && selectedCase && (
      <section className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-xl shadow-slate-200/60 dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-white/70">Détection de fraude</p>
              <h3 className="text-2xl font-semibold">Changement de numéro</h3>
              <p className="text-sm text-white/80">
                Analysez les numéros utilisés par les terminaux identifiés dans l'opération en cours.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchFraudDetection}
              disabled={fraudLoading || !selectedCase || cdrIdentifiers.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {fraudLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
              <span>Analyser</span>
            </button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm">
              <p className="text-white/70">IMEI analysés</p>
              <p className="mt-1 text-2xl font-semibold text-white">{fraudStats.totalImeis}</p>
            </div>
            <div className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm">
              <p className="text-white/70">Numéros détectés</p>
              <p className="mt-1 text-2xl font-semibold text-white">{fraudStats.totalNumbers}</p>
            </div>
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                fraudStats.newNumbers > 0
                  ? 'border border-rose-100/60 bg-rose-500/40 text-white'
                  : 'border border-emerald-100/60 bg-emerald-500/30 text-white'
              }`}
            >
              <p className="text-white/80">Nouveaux numéros</p>
              <p className="mt-1 text-2xl font-semibold">{fraudStats.newNumbers}</p>
            </div>
          </div>
        </div>
        <div className="space-y-6 p-6">
          {fraudError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {fraudError}
            </div>
          )}
          {cdrIdentifiers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300">
              Ajoutez au moins un numéro dans la recherche pour lancer l’analyse de fraude.
            </div>
          ) : fraudLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-slate-100" />
            </div>
          ) : fraudResult ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <span>Dernière analyse&nbsp;: {formatFraudDateTime(fraudResult.updatedAt)}</span>
                {hasFraudSuspiciousNumbers && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 font-semibold text-rose-500 dark:text-rose-300">
                    <AlertTriangle className="h-3.5 w-3.5" /> Anomalies détectées
                  </span>
                )}
              </div>
              {fraudResult.imeis.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700 shadow-inner dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-100">
                  Aucun changement de numéro détecté pour les identifiants recherchés.
                </div>
              ) : (
                fraudResult.imeis.map((imeiEntry) => (
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
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300">
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
                ))
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300">
              Lancez une analyse pour détecter les nouveaux numéros associés aux identifiants recherchés.
            </div>
          )}
        </div>
      </section>
    );

    const searchSection = (
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/60 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40">
        <div className="border-b border-slate-200/70 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white dark:border-slate-700/60">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Recherche CDR</h3>
              <p className="text-sm text-white/80">Affinez votre requête pour visualiser les communications pertinentes.</p>
            </div>
            <div className="hidden md:flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Search className="h-6 w-6" />
            </div>
          </div>
        </div>
        <form onSubmit={handleCdrSearch} className="space-y-5 p-6">
          <div>
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Numéros recherchés</label>
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700/60 dark:bg-slate-900/50">
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
                onBlur={(e) => setCdrIdentifierInput(normalizeCdrNumber(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCdrIdentifier();
                  }
                }}
                placeholder="Ajouter un numéro"
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
                className="w-full rounded-2xl border border-slate-200/80 px-4 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Date de fin</label>
              <input
                type="date"
                value={cdrEnd}
                onChange={(e) => setCdrEnd(e.target.value)}
                className="w-full rounded-2xl border border-slate-200/80 px-4 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60"
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
                className="w-full rounded-2xl border border-slate-200/80 px-4 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Heure de fin</label>
              <input
                type="time"
                value={cdrEndTime}
                onChange={(e) => setCdrEndTime(e.target.value)}
                className="w-full rounded-2xl border border-slate-200/80 px-4 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/60 dark:bg-slate-900/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ToggleSwitch
              label={
                <div className="flex items-center gap-2">
                  <PhoneIncoming className="h-4 w-4 text-emerald-500" />
                  <span>Appels entrants</span>
                </div>
              }
              checked={cdrIncoming}
              onChange={setCdrIncoming}
              activeColor="peer-checked:bg-emerald-500 dark:peer-checked:bg-emerald-500"
            />
            <ToggleSwitch
              label={
                <div className="flex items-center gap-2">
                  <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                  <span>Appels sortants</span>
                </div>
              }
              checked={cdrOutgoing}
              onChange={setCdrOutgoing}
              activeColor="peer-checked:bg-blue-500 dark:peer-checked:bg-blue-500"
            />
            <ToggleSwitch
              label={
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  <span>SMS</span>
                </div>
              }
              checked={cdrSms}
              onChange={setCdrSms}
              activeColor="peer-checked:bg-green-500 dark:peer-checked:bg-green-500"
            />
            <ToggleSwitch
              label={
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-rose-500" />
                  <span>Position</span>
                </div>
              }
              checked={cdrPosition}
              onChange={setCdrPosition}
              activeColor="peer-checked:bg-rose-500 dark:peer-checked:bg-rose-500"
            />
            <ToggleSwitch
              label={
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-indigo-500" />
                  <span>Itinéraire</span>
                </div>
              }
              checked={cdrItinerary}
              onChange={setCdrItinerary}
              activeColor="peer-checked:bg-indigo-500 dark:peer-checked:bg-indigo-500"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={cdrLoading}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-300/40 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              <span>Rechercher</span>
            </button>
            {caseFiles.filter((f) => f.cdr_number).length >= 2 && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-300/40 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
                onClick={handleLinkDiagram}
              >
                <Share2 className="h-4 w-4" />
                <span>Diagramme des liens</span>
              </button>
            )}
          </div>
        </form>
      </section>
    );

    const formContent = (
      <div className="space-y-6">
        {searchSection}
        {detectionSection}
      </div>
    );

    if (showCdrMap) {
      return (
        <div className="fixed bottom-6 left-6 z-[1000] w-[28rem] max-h-[88vh] overflow-y-auto rounded-3xl border border-white/60 bg-white/90 p-5 shadow-2xl shadow-blue-500/20 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/85">
          {formContent}
        </div>
      );
    }

    return (
      <div className="rounded-3xl border border-slate-200/80 bg-transparent">
        {formContent}
      </div>
    );
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
        <nav className="relative flex-1 p-4">
          <div className="space-y-2">
            <button
              onClick={() => setCurrentPage('dashboard')}
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
              onClick={() => setCurrentPage('search')}
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
              onClick={() => setCurrentPage('annuaire')}
              title="Annuaire Gendarmerie"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'annuaire'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Phone className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Annuaire Gendarmerie</span>}
            </button>

            <button
              onClick={() => setCurrentPage('ong')}
              title="ONG"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'ong'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Globe className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">ONG</span>}
            </button>

            <button
              onClick={() => setCurrentPage('entreprises')}
              title="Entreprises"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'entreprises'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Building2 className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Entreprises</span>}
            </button>

            <button
              onClick={() => setCurrentPage('vehicules')}
              title="Véhicules"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'vehicules'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Car className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Véhicules</span>}
            </button>

            <button
              onClick={() => setCurrentPage('cdr')}
              title="CDR"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'cdr'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <Clock className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">CDR</span>}
            </button>

            <button
              onClick={() => setCurrentPage('fraud-detection')}
              title="Détection de Fraude"
              className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'fraud-detection'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
              } ${!sidebarOpen && 'justify-center px-0'}`}
            >
              <AlertTriangle className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              {sidebarOpen && <span className="ml-3">Détection de Fraude</span>}
            </button>

            <button
              onClick={() => setCurrentPage('requests')}
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
              onClick={() => {
                setCurrentPage('profiles');
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

            {isAdmin && (
              <button
                onClick={() => setCurrentPage('blacklist')}
                title="Black List"
                className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'blacklist'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                } ${!sidebarOpen && 'justify-center px-0'}`}
              >
                <Ban className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                {sidebarOpen && <span className="ml-3">Black List</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setCurrentPage('logs')}
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
                onClick={() => setCurrentPage('users')}
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
                onClick={() => setCurrentPage('upload')}
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
        <div className="relative p-4 border-t border-white/60 dark:border-gray-800/70">
          <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center'}`}>
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-gray-500 via-gray-600 to-gray-800 text-white shadow-md shadow-gray-500/30">
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
                  <div className="relative">
                    <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Entrez votre recherche (CNI, nom, téléphone, immatriculation...)"
                      className="w-full pl-12 pr-40 py-4 text-lg bg-gray-50 border border-gray-200 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                      <button
                        type="submit"
                        disabled={loading}
                        className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all flex items-center"
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
                            {searchResults.total} résultat(s)
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
                          className="flex items-center px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-gray-100 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 transition-colors"
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
                        {searchResults.hits.length > 0 && (
                          <button
                            onClick={exportToCSV}
                            className="flex items-center px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-gray-100 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 transition-colors"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                    {searchResults.hits.length === 0 ? (
                      <div className="text-center py-16">
                        <Search className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Aucun résultat trouvé</h3>
                        <p className="text-gray-500">
                          Essayez avec d'autres termes de recherche ou vérifiez l'orthographe.
                        </p>
                          {canRequestIdentification && (
                          <button
                            onClick={handleRequestIdentification}
                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            Demander identification
                          </button>
                          )}
                      </div>
                    ) : viewMode === 'list' ? (
                      <div className="p-8 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700">
                        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                          {searchResults.hits.map((result, index) => (
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
                                <div className="flex items-center space-x-2">
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                    <Activity className="w-3 h-3 mr-1" />
                                    Score: {result.score.toFixed(1)}
                                  </span>
                                </div>
                              </div>

                              {/* Contenu des données */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.entries(result.preview).flatMap(([key, value]) => {
                                  if (!value || value === '' || value === null || value === undefined) return [];

                                  if (key === 'data') {
                                    try {
                                      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                                      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                        return Object.entries(parsed).map(([k, v]) => (
                                          <div
                                            key={`${key}-${k}`}
                                            className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg p-3 border border-transparent group-hover:border-blue-200 dark:group-hover:border-blue-500 transition-colors"
                                          >
                                            <div className="flex flex-col">
                                              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                                                {k.replace(/_/g, ' ')}
                                              </span>
                                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                                                {String(v)}
                                              </span>
                                            </div>
                                          </div>
                                        ));
                                      }
                                      return (
                                        <div
                                          key={key}
                                          className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg p-3 border border-transparent group-hover:border-blue-200 dark:group-hover:border-blue-500 transition-colors"
                                        >
                                          <div className="flex flex-col">
                                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                                              {key.replace(/_/g, ' ')}
                                            </span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                                              {String(parsed)}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    } catch {
                                      return (
                                        <div
                                          key={key}
                                          className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg p-3 border border-transparent group-hover:border-blue-200 dark:group-hover:border-blue-500 transition-colors"
                                        >
                                          <div className="flex flex-col">
                                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                                              {key.replace(/_/g, ' ')}
                                            </span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                                              {String(value)}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    }
                                  }

                                  return (
                                    <div
                                      key={key}
                                      className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg p-3 border border-transparent group-hover:border-blue-200 dark:group-hover:border-blue-500 transition-colors"
                                    >
                                      <div className="flex flex-col">
                                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                                          {key.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                                          {String(value)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Footer avec actions */}
                              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                <div className="text-xs text-gray-500">
                                  {Object.keys(result.preview)
                                    .filter(
                                      key =>
                                        result.preview[key] &&
                                        result.preview[key] !== '' &&
                                        result.preview[key] !== null &&
                                        result.preview[key] !== undefined
                                    ).length}{' '}
                                  champs disponibles
                                </div>
                                <button
                                  onClick={() => {
                                    // Copier les données dans le presse-papier
                                    const dataText = Object.entries(result.preview)
                                      .filter(([key, value]) => value && value !== '' && value !== null && value !== undefined)
                                      .map(([key, value]) => `${key}: ${value}`)
                                      .join('\n');
                                    navigator.clipboard.writeText(dataText);
                                    alert('Données copiées dans le presse-papier !');
                                  }}
                                  className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900 rounded-md hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
                                >
                                  <User className="w-3 h-3 mr-1" />
                                  Copier
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-8 text-center">
                          <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            onClick={() => {
                              const combined: Record<string, any> = {};
                              searchResults.hits.forEach(h => {
                                Object.entries(h.preview || {}).forEach(([k, v]) => {
                                  if (v != null && combined[k] === undefined) {
                                    combined[k] = v;
                                  }
                                });
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
                        <SearchResultProfiles
                          hits={searchResults.hits}
                          query={searchQuery}
                          onCreateProfile={openCreateProfile}
                        />
                      </div>
                    )}
                    {searchResults.page < searchResults.pages && (
                      <div className="text-center p-4">
                        <button
                          onClick={loadMoreResults}
                          disabled={loading}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          Charger plus
                        </button>
                      </div>
                    )}
                </div>
              )}
            </div>
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
                          const isTitle = !entry.Telephone || entry.Telephone.trim() === '';
                          return isTitle ? (
                            <tr key={entry.id} className="bg-slate-100/80 dark:bg-slate-800/70">
                              <td colSpan={6} className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                                {entry.Libelle}
                              </td>
                            </tr>
                          ) : (
                            <tr key={entry.id} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/60 dark:even:bg-slate-800/60">
                              <td className="px-6 py-4 whitespace-nowrap">{entry.id}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.Libelle}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.Telephone}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.SousCategorie}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.Secteur}</td>
                              <td className="px-6 py-4 whitespace-nowrap">{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="px-6 py-3 flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800/60">
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        Page {gendarmeriePage} sur {gendarmerieTotalPages}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setGendarmeriePage((p) => Math.max(p - 1, 1))}
                          disabled={gendarmeriePage === 1}
                          className="rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          Précédent
                        </button>
                        {getPageNumbers(gendarmeriePage, gendarmerieTotalPages).map((page, idx) =>
                          typeof page === 'number' ? (
                            <button
                              key={page}
                              onClick={() => setGendarmeriePage(page)}
                              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                                gendarmeriePage === page
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                  : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span key={`gend-ellipsis-${idx}`} className="px-3 py-1 text-slate-400 dark:text-slate-500">
                              ...
                            </span>
                          )
                        )}
                        <button
                          onClick={() => setGendarmeriePage((p) => Math.min(p + 1, gendarmerieTotalPages))}
                          disabled={gendarmeriePage === gendarmerieTotalPages}
                          className="rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          Suivant
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
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
                          <th className="px-6 py-3">OrganizationName</th>
                          <th className="px-6 py-3">Type</th>
                          <th className="px-6 py-3">Name</th>
                          <th className="px-6 py-3">Title</th>
                          <th className="px-6 py-3">EmailAddress</th>
                          <th className="px-6 py-3">Telephone</th>
                          <th className="px-6 py-3">SelectAreaofInterest</th>
                          <th className="px-6 py-3">SelectSectorsofInterest</th>
                          <th className="px-6 py-3">created_at</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                        {paginatedOng.map(entry => (
                          <tr key={entry.id} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/60 dark:even:bg-slate-800/60">
                            <td className="px-6 py-4 whitespace-nowrap">{entry.id}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.OrganizationName}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Type}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Title}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.EmailAddress}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.Telephone}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.SelectAreaofInterest}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.SelectSectorsofInterest}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{entry.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-6 py-3 flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800/60">
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        Page {ongPage} sur {ongTotalPages}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setOngPage(p => Math.max(p - 1, 1))}
                          disabled={ongPage === 1}
                          className="rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          Précédent
                        </button>
                        {getPageNumbers(ongPage, ongTotalPages).map((page, idx) =>
                          typeof page === 'number' ? (
                            <button
                              key={page}
                              onClick={() => setOngPage(page)}
                              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                                ongPage === page
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                  : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span key={`ong-ellipsis-${idx}`} className="px-3 py-1 text-slate-400 dark:text-slate-500">
                              ...
                            </span>
                          )
                        )}
                        <button
                          onClick={() => setOngPage(p => Math.min(p + 1, ongTotalPages))}
                          disabled={ongPage === ongTotalPages}
                          className="rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          Suivant
                        </button>
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
                    <div className="px-6 py-3 flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800/60">
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        Page {entreprisesPage} sur {entreprisesTotalPages}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setEntreprisesPage((p) => Math.max(p - 1, 1))}
                          disabled={entreprisesPage === 1}
                          className="rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          Précédent
                        </button>
                        {getPageNumbers(entreprisesPage, entreprisesTotalPages).map((page, idx) =>
                          typeof page === 'number' ? (
                            <button
                              key={page}
                              onClick={() => setEntreprisesPage(page)}
                              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                                entreprisesPage === page
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                  : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span key={`ent-ellipsis-${idx}`} className="px-3 py-1 text-slate-400 dark:text-slate-500">
                              ...
                            </span>
                          )
                        )}
                        <button
                          onClick={() => setEntreprisesPage((p) => Math.min(p + 1, entreprisesTotalPages))}
                          disabled={entreprisesPage === entreprisesTotalPages}
                          className="rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          Suivant
                        </button>
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
                          <tr key={entry.ID} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/60 dark:even:bg-slate-800/60">
                            <td className="px-6 py-4 whitespace-nowrap">{entry.ID}</td>
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
                    <div className="px-6 py-3 flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800/60">
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        Page {vehiculesPage} sur {vehiculesTotalPages}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setVehiculesPage((p) => Math.max(p - 1, 1))}
                          disabled={vehiculesPage === 1}
                          className="rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          Précédent
                        </button>
                        {getPageNumbers(vehiculesPage, vehiculesTotalPages).map((page, idx) =>
                          typeof page === 'number' ? (
                            <button
                              key={page}
                              onClick={() => setVehiculesPage(page)}
                              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                                vehiculesPage === page
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                  : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span key={`veh-ellipsis-${idx}`} className="px-3 py-1 text-slate-400 dark:text-slate-500">
                              ...
                            </span>
                          )
                        )}
                        <button
                          onClick={() => setVehiculesPage((p) => Math.min(p + 1, vehiculesTotalPages))}
                          disabled={vehiculesPage === vehiculesTotalPages}
                          className="rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        >
                          Suivant
                        </button>
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
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Opérations CDR</h1>
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
                  {totalCasePages > 1 && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
                      Page {casePage} sur {totalCasePages}
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
                              <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{c.name}</h4>
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
                            </div>
                            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm dark:bg-white/5 dark:text-slate-300">
                              #{c.id}
                            </span>
                          </div>
                          <div className="mt-auto flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/40 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                              onClick={() => {
                                setSelectedCase(c);
                                setCdrResult(null);
                                setShowCdrMap(false);
                                setCdrUploadMessage('');
                                setCdrUploadError('');
                                setCurrentPage('cdr-case');
                              }}
                            >
                              <ArrowRight className="h-4 w-4" />
                              <span>Ouvrir</span>
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-600/70 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
                              onClick={() => handleExportCaseReport(c)}
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
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {totalCasePages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
                      onClick={() => setCasePage((p) => p - 1)}
                      disabled={casePage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Précédent
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-200"
                      onClick={() => setCasePage((p) => p + 1)}
                      disabled={casePage === totalCasePages}
                    >
                      Suivant
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {currentPage === 'fraud-detection' && (
            <div className="space-y-8">
              <PageHeader
                icon={<AlertTriangle className="h-6 w-6" />}
                title="Détection de Fraude"
                subtitle="Analyse centralisée des communications sensibles"
              />

              <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/60 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/40">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-rose-500/10 via-purple-500/10 to-blue-500/10" />
                <div className="relative p-8 space-y-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Analyse transversale des CDR
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-300">
                        Surveillez les comportements critiques sans exposer les paramètres de détection.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur dark:bg-white/10 dark:text-slate-200">
                      <Scan className="h-4 w-4" />
                      Analyse globale
                    </div>
                  </div>

                  <form onSubmit={handleGlobalFraudSearch} className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                          Numéro ou IMEI à analyser
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                            <Search className="h-4 w-4" />
                          </div>
                          <input
                            type="text"
                            value={globalFraudIdentifier}
                            onChange={(e) => {
                              setGlobalFraudIdentifier(e.target.value);
                              if (globalFraudError) setGlobalFraudError('');
                            }}
                            placeholder="Ex : 221771234567 ou 356789104567890"
                            className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-12 py-3 text-base shadow-inner focus:border-transparent focus:outline-none focus:ring-4 focus:ring-purple-500/30 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                          />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          L'analyse s'effectue sur l'ensemble des données importées disponibles.
                        </p>
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
                            className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/60"
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
                            className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700/60 dark:bg-slate-900/60"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={globalFraudLoading}
                        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 via-purple-500 to-blue-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-300/40 transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {globalFraudLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                        <span>Lancer l'analyse</span>
                      </button>
                      <button
                        type="button"
                        onClick={resetGlobalFraudSearch}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-6 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-500"
                      >
                        <X className="h-4 w-4" />
                        <span>Réinitialiser</span>
                      </button>
                    </div>
                  </form>
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
                    <div className="border-b border-slate-200/70 bg-gradient-to-r from-rose-500 via-purple-500 to-blue-500 px-8 py-6 text-white dark:border-slate-700/60">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <h3 className="text-lg font-semibold">Résultats de l'analyse</h3>
                            <p className="text-sm text-white/80">
                              Dernière exécution&nbsp;: {formatFraudDateTime(globalFraudResult.updatedAt)}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
                            <Scan className="h-3.5 w-3.5" /> Analyse globale des CDR
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
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-purple-500 to-blue-500 text-white shadow-lg shadow-purple-400/40">
                                  <AlertTriangle className="h-7 w-7" />
                                </div>
                                <div>
                                  <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">IMEI {imeiEntry.imei}</h4>
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
                                    <th className="px-4 py-3 text-left">Rôles</th>
                                    <th className="px-4 py-3 text-left">Occurrences</th>
                                    <th className="px-4 py-3 text-left">Première apparition</th>
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
                                      <td className="px-4 py-3">
                                        {numberEntry.roles.length === 0 ? (
                                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
                                            -
                                          </span>
                                        ) : (
                                          <div className="flex flex-wrap gap-2">
                                            {numberEntry.roles.map((role) => (
                                              <span
                                                key={role}
                                                className="inline-flex items-center rounded-full bg-blue-100/80 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
                                              >
                                                {FRAUD_ROLE_LABELS[role] || role}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{numberEntry.occurrences}</td>
                                      <td className="px-4 py-3 text-slate-500 dark:text-slate-300">
                                        {formatFraudDate(numberEntry.firstSeen)}
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
                                      <th className="px-4 py-3 text-left">Rôles</th>
                                      <th className="px-4 py-3 text-left">Occurrences</th>
                                      <th className="px-4 py-3 text-left">Première apparition</th>
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
                                          {imeiInfo.imei}
                                        </td>
                                        <td className="px-4 py-3">
                                          {imeiInfo.roles.length === 0 ? (
                                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
                                              -
                                            </span>
                                          ) : (
                                            <div className="flex flex-wrap gap-2">
                                              {imeiInfo.roles.map((role) => (
                                                <span
                                                  key={role}
                                                  className="inline-flex items-center rounded-full bg-blue-100/80 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
                                                >
                                                  {FRAUD_ROLE_LABELS[role] || role}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{imeiInfo.occurrences}</td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-300">
                                          {formatFraudDate(imeiInfo.firstSeen)}
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

          {currentPage === 'cdr-case' && selectedCase && (
            <div className="space-y-6">
              <PageHeader icon={<Clock className="h-6 w-6" />} title={`CDR - ${selectedCase.name}`} />
              <button
                onClick={() => {
                  setCurrentPage('cdr');
                  setSelectedCase(null);
                }}
                className="text-blue-600"
              >
                &larr; Retour
              </button>

              {!showCdrMap && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:bg-slate-900/70 dark:border-slate-700/60 space-y-4">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Importation CDR</h3>
                  <form onSubmit={handleCdrUpload} className="space-y-4">
                    <input
                      type="text"
                      value={cdrNumber}
                      onChange={(e) => setCdrNumber(e.target.value)}
                      onBlur={(e) => setCdrNumber(normalizeCdrNumber(e.target.value))}
                      placeholder="Numéro associé"
                      className="block w-full rounded-xl border border-slate-200/70 bg-white/80 p-3 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/70 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                    />
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setCdrFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-500/10 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-blue-600 hover:file:bg-blue-500/20 dark:text-slate-300"
                    />
                      <button
                        type="submit"
                        disabled={cdrUploading || !cdrFile || !cdrNumber}
                        className="flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/40 transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-50"
                      >
                        {cdrUploading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          'Importer CDR'
                        )}
                      </button>
                    {cdrUploadMessage && <p className="text-green-600 dark:text-green-400">{cdrUploadMessage}</p>}
                    {cdrUploadError && <p className="text-red-600 dark:text-rose-400">{cdrUploadError}</p>}
                  </form>
                  {caseFiles.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Fichiers importés</h4>
                      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-inner dark:bg-slate-900/60 dark:border-slate-700/60">
                        <table className="min-w-full text-sm text-slate-700 dark:text-slate-200">
                          <thead className="bg-slate-100/80 dark:bg-slate-800/80">
                            <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                              <th className="px-4 py-2 text-left">Nom du fichier</th>
                              <th className="px-4 py-2 text-left">Numéro</th>
                              <th className="px-4 py-2 text-left">Lignes</th>
                              <th className="px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                            {caseFiles.map((f) => (
                              <tr key={f.id} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/40 dark:even:bg-slate-800/40">
                                <td className="px-4 py-2 truncate">{f.filename}</td>
                                <td className="px-4 py-2">{f.cdr_number || '-'}</td>
                                <td className="px-4 py-2">{f.line_count}</td>
                                <td className="px-4 py-2 text-right">
                                  <button
                                    className="text-rose-600 hover:underline dark:text-rose-400"
                                    onClick={() => handleDeleteFile(f.id)}
                                  >
                                    Supprimer
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                    {renderCdrSearchForm()}
                  </div>
                )}

              {cdrLoading && (
                <div className="loading-bar-container my-4">
                  <div className="loading-bar"></div>
                </div>
              )}
              {cdrError && <p className="text-red-600">{cdrError}</p>}
              {cdrInfoMessage && <p className="text-gray-600">{cdrInfoMessage}</p>}
              {showCdrMap && cdrResult && !cdrLoading && cdrResult.total > 0 && (
                <>
                  <div className="fixed inset-0 z-0 flex">
                    {renderCdrSearchForm()}
                    <div className="flex-1 relative h-screen">
                      <CdrMap
                        points={cdrResult.path}
                        showRoute={cdrItinerary}
                        showMeetingPoints={showMeetingPoints}
                        onToggleMeetingPoints={() => setShowMeetingPoints((v) => !v)}
                        zoneMode={zoneMode}
                        onZoneCreated={() => setZoneMode(false)}
                      />
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
                <LinkDiagram data={linkDiagram} onClose={() => setLinkDiagram(null)} />
              )}
              </div>
            )}

          {currentPage === 'requests' && (
            <div className="space-y-6">
              <PageHeader icon={<ClipboardList className="h-6 w-6" />} title="Liste des demandes" />
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex w-full md:max-w-md">
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    value={requestSearchInput}
                    onChange={(e) => setRequestSearchInput(e.target.value)}
                    className="flex-grow px-4 py-2 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      setRequestSearch(requestSearchInput);
                      setRequestPage(1);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-r-lg hover:bg-blue-700"
                  >
                    <Search className="h-5 w-5" />
                  </button>
                </div>
                {isAdmin && hiddenRequestIds.length > 0 && (
                  <button
                    onClick={handleResetHiddenRequests}
                    className="text-sm text-blue-600 hover:underline self-start"
                  >
                    Réafficher les demandes supprimées
                  </button>
                )}
              </div>
              {identifyingRequest && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-semibold mb-4">Identifier {identifyingRequest.phone}</h3>
                  <ProfileForm
                    initialValues={identifyingInitialValues}
                    onSaved={handleProfileSaved}
                  />
                  <div className="mt-4 text-right">
                    <button
                      className="text-sm text-gray-600 hover:underline"
                      onClick={() => setIdentifyingRequest(null)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
              {requestsLoading ? (
                <LoadingSpinner />
              ) : (
                <>
                  <div className="grid gap-4">
                    {paginatedRequests.length === 0 && (
                      <div className="text-center text-gray-500 py-10 border border-dashed border-gray-300 rounded-xl">
                        Aucune demande à afficher.
                      </div>
                    )}
                    {paginatedRequests.map(r => {
                      const isHighlighted = highlightedRequestId === r.id;
                      return (
                        <div
                          id={`request-${r.id}`}
                          key={r.id}
                          className={`bg-white rounded-2xl border border-gray-100 shadow-md p-6 flex flex-col md:flex-row md:items-center md:justify-between transition-all duration-200 ${
                            isHighlighted
                              ? 'ring-2 ring-blue-500/70 shadow-xl bg-blue-50/60 dark:bg-blue-950/30 dark:ring-blue-400/40'
                              : 'hover:shadow-lg hover:-translate-y-0.5'
                          }`}
                        >
                        <div className="space-y-1">
                          <div className="text-lg font-semibold">{r.phone}</div>
                          {isAdmin && <div className="text-sm text-gray-500">{r.user_login}</div>}
                          <div className="text-sm flex items-center">
                            <span className="mr-1">Statut:</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                r.status === 'identified'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {r.status === 'identified' ? 'identifié' : 'en cours'}
                            </span>
                          </div>
                          {r.status === 'identified' && r.profile && (
                            <div className="mt-2 text-sm text-gray-700 space-y-1">
                              {r.profile.first_name && (
                                <div>
                                  <span className="font-medium">Prénom:</span> {r.profile.first_name}
                                </div>
                              )}
                              {r.profile.last_name && (
                                <div>
                                  <span className="font-medium">Nom:</span> {r.profile.last_name}
                                </div>
                              )}
                              {r.profile.phone && (
                                <div>
                                  <span className="font-medium">Téléphone:</span> {r.profile.phone}
                                </div>
                              )}
                              {r.profile.email && (
                                <div>
                                  <span className="font-medium">Email:</span> {r.profile.email}
                                </div>
                              )}
                              {r.profile.extra_fields &&
                                r.profile.extra_fields.map((cat: any, idx: number) => (
                                  <div key={idx} className="mt-2">
                                    <div className="font-medium">{cat.title}</div>
                                    {cat.fields.map((f: any, fi: number) => (
                                      <div key={fi} className="flex text-xs">
                                        <span className="w-32 text-gray-500">{f.key}:</span>
                                        <span>{f.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                        <div className="mt-4 md:mt-0 flex space-x-2">
                          {isAdmin && r.status !== 'identified' && (
                            <button
                              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                              onClick={() => startIdentify(r)}
                            >
                              Identifier
                            </button>
                          )}
                          <button
                            className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            onClick={() => deleteRequest(r.id)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                  {totalRequestPages > 1 && (
                    <div className="flex flex-wrap justify-center items-center gap-2 mt-4">
                      <button
                        onClick={() => setRequestPage((p) => Math.max(p - 1, 1))}
                        disabled={requestPage === 1}
                        className="p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      {getPageNumbers(requestPage, totalRequestPages).map((page, idx) =>
                        page === '...'
                          ? (
                              <span key={`ellipsis-${idx}`} className="px-3 py-1 text-gray-500">
                                ...
                              </span>
                            )
                          : (
                              <button
                                key={`page-${page}`}
                                onClick={() => setRequestPage(Number(page))}
                                className={`px-3 py-1 rounded-lg transition ${
                                  page === requestPage
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                              >
                                {page}
                              </button>
                            )
                      )}
                      <button
                        onClick={() =>
                          setRequestPage((p) => Math.min(p + 1, totalRequestPages))
                        }
                        disabled={requestPage === totalRequestPages}
                        className="p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {currentPage === 'profiles' && (
            <div className="space-y-6">
              <PageHeader icon={<FileText className="h-6 w-6" />} title="Fiches de profil" />
            {showProfileForm ? (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-2xl font-bold text-center text-gray-800">
                  {editingProfileId ? 'Modifier la fiche de profil' : 'Créer une fiche de profil'}
                </h2>
                <ProfileForm
                  initialValues={profileDefaults}
                  profileId={editingProfileId || undefined}
                  onSaved={() => setShowProfileForm(false)}
                />
                <div className="mt-4">
                  <button
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700"
                    onClick={() => setShowProfileForm(false)}
                  >
                    Retour à la liste
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:bg-slate-900/70 dark:border-slate-700/60">
                <ProfileList
                  onCreate={() => openCreateProfile({})}
                  onEdit={openEditProfile}
                  currentUser={currentUser}
                  isAdmin={isAdmin}
                  onShare={openProfileShareModal}
                  refreshKey={profileListRefreshKey}
                  focusedProfileId={highlightedProfileId}
                  onFocusedProfileHandled={() => setHighlightedProfileId(null)}
                />
              </div>
            )}
          </div>
        )}

        {currentPage === 'blacklist' && isAdmin && (
          <div className="space-y-6">
            <PageHeader icon={<Ban className="h-6 w-6" />} title="Black List" />
            <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-lg shadow-slate-200/60 dark:bg-slate-900/70 dark:border-slate-700/60">
              <div className="flex flex-col md:flex-row gap-4">
                <form onSubmit={handleAddBlacklist} className="flex flex-1 gap-2">
                  <input
                    type="text"
                    placeholder="Numéro"
                    value={blacklistNumber}
                    onChange={(e) => setBlacklistNumber(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-2 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/70 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                  />
                  <button type="submit" className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/40 transition-transform hover:-translate-y-0.5">
                    Ajouter
                  </button>
                </form>
                <form onSubmit={handleUploadBlacklist} className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept=".txt,.csv"
                    onChange={(e) => setBlacklistFile(e.target.files?.[0] || null)}
                    className="flex-1 text-sm text-slate-600 dark:text-slate-300"
                  />
                  <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition-transform hover:-translate-y-0.5 hover:bg-emerald-600">
                    Importer
                  </button>
                </form>
              </div>
              {blacklistError && <p className="text-red-600 dark:text-rose-400">{blacklistError}</p>}
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/95 shadow-inner dark:bg-slate-900/60 dark:border-slate-700/60">
                <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/80">
                    <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                      <th className="px-6 py-3">Numéro</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                    {blacklist.map((b) => (
                      <tr key={b.id} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/40 dark:even:bg-slate-800/40">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{b.number}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button
                            onClick={() => handleDeleteBlacklist(b.id)}
                            className="text-rose-600 transition-colors hover:text-rose-500 dark:text-rose-400 dark:hover:text-rose-300"
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
                        <th className="px-6 py-4">Détails</th>
                        <th className="px-6 py-4">Page</th>
                        <th className="px-6 py-4">Profil</th>
                        <th className="px-6 py-4">Durée (min)</th>
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

                      const detailContent = (() => {
                        if (isAlertLog) {
                          return (
                            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm shadow-sm shadow-rose-300/30 backdrop-blur-sm">
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-sm shadow-rose-500/40">
                                  <AlertTriangle className="h-4 w-4" />
                                </span>
                                <div className="space-y-1">
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
                          );
                        }
                        if (hasPageName) {
                          return pageName;
                        }
                        if (typeof details.description === 'string' && details.description.trim() !== '') {
                          return details.description;
                        }
                        if (typeof log.details === 'string' && log.details.trim() !== '') {
                          return log.details;
                        }
                        return '-';
                      })();

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
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {isAlertLog ? (
                              <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/60 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200">
                                <AlertTriangle className="h-4 w-4" />
                                {log.action}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-slate-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
                                {log.action}
                              </span>
                            )}
                          </td>
                          <td className={`px-6 py-4 text-sm ${isAlertLog ? 'align-top text-rose-700 dark:text-rose-100' : 'text-slate-900 dark:text-slate-100'}`}>
                            {detailContent}
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{log.duration_ms ? Math.round(log.duration_ms / 60000) : '-'}</td>
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
                  <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
                    <thead className="bg-white/75 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 backdrop-blur-sm dark:bg-slate-800/80 dark:text-slate-300">
                      <tr>
                        <th className="px-6 py-4">Utilisateur</th>
                        <th className="px-6 py-4">Connexion</th>
                        <th className="px-6 py-4">Déconnexion</th>
                        <th className="px-6 py-4">Durée</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                      {sessionLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                            Aucune session enregistrée.
                          </td>
                        </tr>
                      ) : (
                        sessionLogs.map((session) => {
                          const loginAt = session.login_at ? format(parseISO(session.login_at), 'Pp', { locale: fr }) : '-';
                          const logoutAt = session.logout_at ? format(parseISO(session.logout_at), 'Pp', { locale: fr }) : 'Session active';
                          const durationMinutes = Math.max(0, Math.round((session.duration_seconds ?? 0) / 60));
                          return (
                            <tr
                              key={session.id}
                              className="transition-colors odd:bg-white/95 even:bg-slate-50/70 hover:bg-blue-50/40 dark:odd:bg-slate-900/40 dark:even:bg-slate-800/40 dark:hover:bg-slate-800/60"
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-100">{session.username}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{loginAt}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{logoutAt}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{durationMinutes} min</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
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
                            {user.division_name || '—'}
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
                      {orderedDashboardCards.map(card => (
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
                                  <card.icon className="h-7 w-7" />
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
                      ))}
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
                          {requestMetrics.map(item => (
                            <div
                              key={item.key}
                              className="rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <span className={`flex h-11 w-11 items-center justify-center rounded-full ${item.tone}`}>
                                    <item.icon className="h-5 w-5" />
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
                          ))}
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
                                <p className="text-sm font-semibold text-amber-600 dark:text-amber-300">Opérations CDR</p>
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
            <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
              <div className="w-full max-w-2xl">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                  <div className="text-center mb-8">
                    <UploadCloud className="h-12 w-12 mx-auto text-blue-600" />
                    <PageHeader icon={<UploadCloud className="h-6 w-6" />} title="Charger des données" />
                    <p className="mt-2 text-gray-600">Importez un fichier CSV dans la table de votre choix.</p>
                  </div>
                  <form onSubmit={handleUploadData} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Nom de la table</label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={uploadTable}
                        onChange={(e) => setUploadTable(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Fichier à importer</label>
                      <input
                        type="file"
                        accept=".csv"
                        required
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {loading ? (
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      ) : (
                        'Importer'
                      )}
                    </button>
                  </form>
                </div>

                <div className="mt-8">
                  <h2 className="text-xl font-semibold text-center text-gray-900 dark:text-gray-100 mb-4">Bases importées</h2>
                  {uploadHistory.length === 0 ? (
                    <p className="text-center text-gray-500">Aucune base importée pour le moment</p>
                  ) : (
                    <div className="bg-white rounded-2xl shadow overflow-hidden max-h-64 overflow-y-auto">
                      {uploadHistory.map((item, index) => (
                        <div
                          key={index}
                          className="p-4 flex items-center justify-between border-b last:border-b-0 border-gray-200"
                        >
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{item.table_name}</p>
                            <p className="text-sm text-gray-500">{item.file_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.created_at && (
                              <span className="text-xs text-gray-400">{format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm')}</span>
                            )}
                            <button
                              onClick={() => handleDeleteUpload(item.id)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

      {/* Modal de partage de profil */}
      {showProfileShareModal && profileShareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900/95">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Partager la fiche de profil
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {[profileShareTarget.first_name, profileShareTarget.last_name]
                    .filter(Boolean)
                    .join(' ')
                    .trim() || 'Profil sans nom'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowProfileShareModal(false);
                  setProfileShareTarget(null);
                }}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitProfileShare} className="space-y-5 px-6 py-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sélectionnez les membres de la division pour leur donner accès à cette fiche.
                Seuls les utilisateurs actifs apparaissent dans la liste.
              </p>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={profileShareAll}
                  onChange={toggleProfileShareAll}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Partager avec tous les membres actifs de la division
              </label>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200/80 bg-white/80 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/60">
                {profileShareUsers.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-300">
                    Aucun utilisateur disponible dans cette division.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                    {profileShareUsers.map((member) => {
                      const disabled = member.id === profileShareOwnerId;
                      const checked = profileShareAll || profileShareSelectedIds.includes(member.id);
                      return (
                        <li key={member.id} className="flex items-center justify-between px-4 py-3 text-sm">
                          <label className={`flex items-center gap-3 ${disabled ? 'opacity-60' : ''}`}>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={disabled ? true : checked}
                              onChange={() => toggleProfileShareUser(member.id)}
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
              {profileShareMessage && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{profileShareMessage}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileShareModal(false);
                    setProfileShareTarget(null);
                  }}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={profileShareLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {profileShareLoading ? 'Enregistrement...' : 'Enregistrer le partage'}
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
                  onChange={(e) => setUserFormData({ ...userFormData, admin: parseInt(e.target.value) })}
                >
                  <option value={0}>Utilisateur</option>
                  <option value={1}>Administrateur</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Division</label>
                <select
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={userFormData.divisionId}
                  onChange={(e) => setUserFormData({ ...userFormData, divisionId: parseInt(e.target.value) })}
                  required
                >
                  {divisions.length === 0 ? (
                    <option value={0}>Aucune division disponible</option>
                  ) : (
                    divisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.name}
                      </option>
                    ))
                  )}
                </select>
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
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
    </div>

    </>
  );
};

export default App;
