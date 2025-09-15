import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
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
  Menu,
  X,
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
  MapPin
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
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import PageHeader from './components/PageHeader';
import SearchResultProfiles from './components/SearchResultProfiles';
import LoadingSpinner from './components/LoadingSpinner';
import ProfileList from './components/ProfileList';
import ProfileForm from './components/ProfileForm';
import CdrMap from './components/CdrMap';
import LinkDiagram from './components/LinkDiagram';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend);

const LINK_DIAGRAM_PREFIXES = ['22177', '22176', '22178', '22170', '22175', '22133'];

interface User {
  id: number;
  login: string;
  admin: number;
  created_at: string;
  active: number;
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
  phone: string;
  status: string;
  user_login?: string;
  profile?: ProfileData | null;
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
}

interface CaseFile {
  id: number;
  filename: string;
  uploaded_at: string;
  line_count: number;
  cdr_number: string | null;
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
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

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
  }>({});
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);

  // États des demandes d'identification
  const [requests, setRequests] = useState<IdentificationRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [identifyingRequest, setIdentifyingRequest] = useState<IdentificationRequest | null>(null);
  const [readNotifications, setReadNotifications] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('readNotifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('readNotifications', JSON.stringify(readNotifications));
    } catch {
      // Ignore write errors (e.g., private browsing)
    }
  }, [readNotifications]);

  const [requestSearchInput, setRequestSearchInput] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestPage, setRequestPage] = useState(1);
  const requestsPerPage = 10;

  const filteredRequests = useMemo(
    () =>
      requests.filter(r =>
        r.phone.includes(requestSearch) ||
        r.user_login?.toLowerCase().includes(requestSearch.toLowerCase())
      ),
    [requests, requestSearch]
  );

  const totalRequestPages = Math.ceil(filteredRequests.length / requestsPerPage);
  const paginatedRequests = useMemo(
    () =>
      filteredRequests.slice(
        (requestPage - 1) * requestsPerPage,
        requestPage * requestsPerPage
      ),
    [filteredRequests, requestPage]
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

  // États de gestion des utilisateurs
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    login: '',
    password: '',
    admin: 0,
    active: 1
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
    setProfileDefaults({ comment: data.comment || '', extra_fields: categories, photo_path: null });
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
        photo_path: profile.photo_path || null
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

  // États des statistiques
  const [statsData, setStatsData] = useState(null);
  const [searchLogs, setSearchLogs] = useState([]);
  const [logUserFilter, setLogUserFilter] = useState('');
  const [loadingStats, setLoadingStats] = useState(false);
  const [timeSeries, setTimeSeries] = useState<any[]>([]);
  const [tableDistribution, setTableDistribution] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);

  const addCdrIdentifier = () => {
    const id = cdrIdentifierInput.trim();
    if (id && !cdrIdentifiers.includes(id)) {
      setCdrIdentifiers([...cdrIdentifiers, id]);
    }
    setCdrIdentifierInput('');
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

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        console.log('🔍 Utilisateur connecté:', data.user);
        console.log('🔍 Admin status:', data.user.admin, 'Type:', typeof data.user.admin);
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        setCurrentPage('dashboard');
        setLoginData({ login: '', password: '' });
      } else {
        setLoginError(data.error || 'Erreur de connexion');
      }
    } catch (error) {
      setLoginError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setCurrentPage('login');
    setSearchResults(null);
  };

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

  const fetchLogs = async (page = 1) => {
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
  };

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

useEffect(() => {
  if (currentUser) {
    fetchRequests();
  }
}, [currentUser, fetchRequests]);

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

  // Charger les statistiques
  const loadStatistics = async () => {
    if (!currentUser) return;

    try {
      setLoadingStats(true);
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

      const isAdmin = currentUser.admin === 1 || currentUser.admin === "1";
      const logQuery = isAdmin && logUserFilter ? `?username=${encodeURIComponent(logUserFilter)}` : '';

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


  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      console.log('🔍 Création utilisateur - Token:', token ? 'présent' : 'absent');
      console.log('🔍 Données à envoyer:', {
        login: userFormData.login,
        role: userFormData.admin === 1 ? 'ADMIN' : 'USER'
      });
      
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
          active: userFormData.active === 1 ? 1 : 0
        })
      });

      const data = await response.json();
      console.log('🔍 Réponse serveur:', { status: response.status, data });

      if (response.ok) {
        alert('Utilisateur créé avec succès');
        setShowUserModal(false);
        setUserFormData({ login: '', password: '', admin: 0, active: 1 });
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
          active: userFormData.active === 1 ? 1 : 0
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Utilisateur modifié avec succès');
        setShowUserModal(false);
        setUserFormData({ login: '', password: '', admin: 0, active: 1 });
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

    const isAdminUser = currentUser && (currentUser.admin === 1 || currentUser.admin === "1");
    const changingOther = targetUser.id !== currentUser?.id;
    const requireCurrent = !isAdminUser || !changingOther;

    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      alert('Les nouveaux mots de passe ne correspondent pas');
      return;
    }

    if (passwordFormData.newPassword.length < 6) {
      alert('Le nouveau mot de passe doit contenir au moins 6 caractères');
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
      active: user.active
    });
    setShowUserModal(true);
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setUserFormData({ login: '', password: '', admin: 0, active: 1 });
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
        .map((i) => i.trim())
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
        setCases(data);
      }
    } catch (error) {
      console.error('Erreur chargement cases:', error);
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
    } else {
      fetchCaseFiles(selectedCase.id);
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

  const handleCdrUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cdrFile || !selectedCase || !cdrNumber.trim()) return;
    setCdrUploading(true);
    setCdrUploadMessage('');
    setCdrUploadError('');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', cdrFile);
      formData.append('cdrNumber', cdrNumber.trim());
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
    if (currentPage === 'users' && currentUser && (currentUser.admin === 1 || currentUser.admin === "1")) {
      loadUsers();
    }
    if (currentPage === 'dashboard' && currentUser) {
      loadStatistics();
    }
    if (currentPage === 'upload' && currentUser && (currentUser.admin === 1 || currentUser.admin === "1")) {
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
  }, [currentPage, currentUser, entreprisesPage, entreprisesSearch, vehiculesPage, vehiculesSearch]);

  // Vérifier si l'utilisateur est admin
  const isAdmin = currentUser && (currentUser.admin === 1 || currentUser.admin === "1");

  useEffect(() => {
    if (currentPage === 'blacklist' && isAdmin) {
      fetchBlacklist();
    }
  }, [currentPage, isAdmin]);

  useEffect(() => {
    if (currentPage === 'logs' && isAdmin) {
      fetchLogs(1);
    }
  }, [currentPage, isAdmin]);

  const identifiedRequests = requests.filter(r => r.status === 'identified');
  const lastNotifications = identifiedRequests.slice(0, 20);
  const notificationCount = lastNotifications.filter(
    (r) => !readNotifications.includes(r.id)
  ).length;
  const totalNotifications = lastNotifications.length;

  useEffect(() => {
    if (currentPage === 'requests') {
      const ids = lastNotifications.map(r => r.id);
      setReadNotifications(prev => Array.from(new Set([...prev, ...ids])));
      setShowNotifications(false);
    }
  }, [currentPage, lastNotifications]);

  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      fetchRequests();
    }, 60000);
    return () => clearInterval(interval);
  }, [currentUser, fetchRequests]);

  const handleNotificationClick = () => {
    const nextState = !showNotifications;
    setShowNotifications(nextState);
    if (nextState) {
      const ids = lastNotifications.map(r => r.id);
      setReadNotifications(prev => Array.from(new Set([...prev, ...ids])));
    }
  };

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
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
                  <Database className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white">SORA</h2>
                <p className="text-blue-100 mt-1">Solution Opérationnelle de Recherche Avancée</p>
              </div>
            </div>
            
            <div className="px-8 py-6">
              <form onSubmit={handleLogin} className="space-y-6">
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
    const formContent = (
      <>
        <h3 className="text-lg font-semibold text-gray-700">Recherche</h3>
        <form onSubmit={handleCdrSearch} className="space-y-4">
        <div className="w-full px-4 py-2 border border-gray-300 rounded-md flex flex-wrap gap-2">
          {cdrIdentifiers.map((id, idx) => (
            <span
              key={idx}
              className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full flex items-center"
            >
              {id}
              <button
                type="button"
                onClick={() => removeCdrIdentifier(idx)}
                className="ml-1 text-blue-500 hover:text-blue-700"
              >
                <X size={14} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={cdrIdentifierInput}
            onChange={(e) => setCdrIdentifierInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCdrIdentifier();
              }
            }}
            placeholder="Ajouter un numéro"
            className="flex-1 min-w-[120px] border-none focus:outline-none focus:ring-0"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            type="date"
            value={cdrStart}
            onChange={(e) => setCdrStart(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={cdrEnd}
            onChange={(e) => setCdrEnd(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            type="time"
            value={cdrStartTime}
            onChange={(e) => setCdrStartTime(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="time"
            value={cdrEndTime}
            onChange={(e) => setCdrEndTime(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2">
          <ToggleSwitch
            label={
              <>
                <PhoneIncoming className="w-4 h-4 text-green-600" />
                <span>Appels entrants</span>
              </>
            }
            checked={cdrIncoming}
            onChange={setCdrIncoming}
            activeColor="peer-checked:bg-green-500 dark:peer-checked:bg-green-500"
          />
          <ToggleSwitch
            label={
              <>
                <PhoneOutgoing className="w-4 h-4 text-blue-600" />
                <span>Appels sortants</span>
              </>
            }
            checked={cdrOutgoing}
            onChange={setCdrOutgoing}
            activeColor="peer-checked:bg-blue-500 dark:peer-checked:bg-blue-500"
          />
          <ToggleSwitch
            label={
              <>
                <MessageSquare className="w-4 h-4 text-green-600" />
                <span>SMS</span>
              </>
            }
            checked={cdrSms}
            onChange={setCdrSms}
            activeColor="peer-checked:bg-green-500 dark:peer-checked:bg-green-500"
          />
          <ToggleSwitch
            label={
              <>
                <MapPin className="w-4 h-4 text-red-600" />
                <span>Position</span>
              </>
            }
            checked={cdrPosition}
            onChange={setCdrPosition}
            activeColor="peer-checked:bg-red-500 dark:peer-checked:bg-red-500"
          />
          <ToggleSwitch
            label={
              <>
                <Car className="w-4 h-4" />
                <span>Itinéraire</span>
              </>
            }
            checked={cdrItinerary}
            onChange={setCdrItinerary}
            activeColor="peer-checked:bg-indigo-500 dark:peer-checked:bg-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={cdrLoading}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-transform transform hover:scale-105 active:scale-95"
          >
            Rechercher
          </button>
          {caseFiles.filter((f) => f.cdr_number).length >= 2 && (
            <button
              type="button"
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform transform hover:scale-105 active:scale-95"
              onClick={handleLinkDiagram}
            >
              Diagramme des liens
            </button>
          )}
        </div>
        </form>
      </>
    );
    if (showCdrMap) {
      return (
        <div className="fixed bottom-4 left-4 z-[1000] w-80 max-h-[80vh] overflow-y-auto bg-white/90 backdrop-blur rounded-lg shadow-lg p-4 space-y-4">
          {formContent}
        </div>
      );
    }
    return (
      <div className="bg-white rounded-lg shadow p-6 space-y-4 max-h-[60vh] overflow-y-auto">
        {formContent}
      </div>
    );
  };

  return (
    <div
      className="min-h-screen flex bg-gray-50 dark:bg-gradient-to-br dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-gray-900 dark:text-gray-100"
    >
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-72' : 'w-20'
        } bg-white dark:bg-gray-800 shadow-xl transition-all duration-300 flex flex-col`}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${!sidebarOpen && 'justify-center'}`}>
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg">
                <Database className="h-6 w-6 text-white" />
              </div>
              {sidebarOpen && (
                <div className="ml-3">
                  <h1 className="text-xl font-extrabold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">SORA</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Solution Opérationnelle de Recherche Avancée</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setTheme(theme === 'dark' ? 'light' : 'dark')
                }
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white transition-colors"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Activity className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Dashboard</span>}
            </button>

            <button
              onClick={() => setCurrentPage('search')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'search'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Search className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Recherche</span>}
            </button>

            <button
              onClick={() => setCurrentPage('annuaire')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'annuaire'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Phone className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Annuaire Gendarmerie</span>}
            </button>

            <button
              onClick={() => setCurrentPage('ong')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'ong'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Globe className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">ONG</span>}
            </button>

            <button
              onClick={() => setCurrentPage('entreprises')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'entreprises'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Building2 className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Entreprises</span>}
            </button>

            <button
              onClick={() => setCurrentPage('vehicules')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'vehicules'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Car className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Véhicules</span>}
            </button>

            <button
              onClick={() => setCurrentPage('cdr')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'cdr'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Clock className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">CDR</span>}
            </button>

            <button
              onClick={() => setCurrentPage('requests')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'requests'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <ClipboardList className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Demandes</span>}
            </button>

            <button
              onClick={() => {
                setCurrentPage('profiles');
                setShowProfileForm(false);
              }}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'profiles'
                  ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <FileText className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Fiches de profil</span>}
            </button>

            {isAdmin && (
              <button
                onClick={() => setCurrentPage('blacklist')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'blacklist'
                    ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
                } ${!sidebarOpen && 'justify-center'}`}
              >
                <Ban className="h-5 w-5" />
                {sidebarOpen && <span className="ml-3">Black List</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setCurrentPage('logs')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'logs'
                    ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
                } ${!sidebarOpen && 'justify-center'}`}
              >
                <List className="h-5 w-5" />
                {sidebarOpen && <span className="ml-3">Logs</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setCurrentPage('users')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'users'
                    ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
                } ${!sidebarOpen && 'justify-center'}`}
              >
                <Users className="h-5 w-5" />
                {sidebarOpen && <span className="ml-3">Utilisateurs</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setCurrentPage('upload')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  currentPage === 'upload'
                    ? 'bg-blue-600 text-white shadow-lg dark:bg-blue-600 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white'
              } ${!sidebarOpen && 'justify-center'}`}
              >
                <Upload className="h-5 w-5" />
                {sidebarOpen && <span className="ml-3">Charger des données</span>}
              </button>
            )}
          </div>
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gray-200">
          <div className={`flex items-center ${!sidebarOpen && 'justify-center'}`}>
            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full">
              <User className="h-5 w-5 text-white" />
            </div>
            {sidebarOpen && (
              <div className="ml-3 flex-1">
                <p className="text-sm font-semibold text-gray-700">{currentUser?.login}</p>
                <div className="flex items-center mt-1">
                  {isAdmin ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <Shield className="w-3 h-3 mr-1" />
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      <UserCheck className="w-3 h-3 mr-1" />
                      Utilisateur
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {sidebarOpen && (
            <div className="mt-4 flex space-x-2">
              <button
                onClick={() => openPasswordModal()}
                className="flex-1 flex items-center justify-center px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                <Key className="w-3 h-3 mr-1" />
                Mot de passe
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center px-3 py-2 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
              >
                <LogOut className="w-3 h-3 mr-1" />
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
        <div className="flex-1 overflow-auto">
          <div className="p-8">
              <div className="flex justify-end mb-4 relative">
                <button
                  onClick={handleNotificationClick}
                  className="relative p-2 rounded-full hover:bg-blue-50 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <Bell className="h-6 w-6" />
                  {notificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center shadow">
                      {notificationCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
                    <div className="px-4 py-2 flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700">
                      <span>Notifications ({totalNotifications})</span>
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                      {totalNotifications === 0 ? (
                        <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Aucune notification</div>
                      ) : (
                        lastNotifications.map(r => {
                          const isUnread = !readNotifications.includes(r.id);
                          return (
                            <div
                              key={r.id}
                              className={`p-4 text-sm flex items-center hover:bg-gray-50 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-600 dark:active:text-white ${isUnread ? 'font-medium' : 'text-gray-500 dark:text-gray-400'}`}
                            >
                              <span className={`w-2 h-2 rounded-full mr-2 ${isUnread ? 'bg-blue-600' : 'bg-transparent'}`}></span>
                              <span>{r.phone} a été identifié par l'administrateur</span>
                            </div>
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
              <div className="overflow-x-auto bg-white shadow rounded-lg dark:bg-gray-800">
                {gendarmerieLoading ? (
                  <div className="loading-bar-container my-4">
                    <div className="loading-bar"></div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-blue-600">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Libellé</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Téléphone</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">SousCategorie</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Secteur</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Créé le</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                        {paginatedGendarmerie.map((entry) => {
                          const isTitle = !entry.Telephone || entry.Telephone.trim() === '';
                          return isTitle ? (
                            <tr key={entry.id} className="bg-gray-100 dark:bg-gray-700">
                              <td colSpan={6} className="px-6 py-4 font-semibold text-gray-900 dark:text-gray-100">
                                {entry.Libelle}
                              </td>
                            </tr>
                          ) : (
                            <tr key={entry.id}>
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
                    <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200">
                      <span className="text-sm text-gray-700">
                        Page {gendarmeriePage} sur {gendarmerieTotalPages}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setGendarmeriePage((p) => Math.max(p - 1, 1))}
                          disabled={gendarmeriePage === 1}
                          className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                          Précédent
                        </button>
                        {getPageNumbers(gendarmeriePage, gendarmerieTotalPages).map((page, idx) =>
                          typeof page === 'number' ? (
                            <button
                              key={page}
                              onClick={() => setGendarmeriePage(page)}
                              className={`px-3 py-1 rounded-md border text-sm font-medium ${
                                gendarmeriePage === page
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span key={`gend-ellipsis-${idx}`} className="px-3 py-1">
                              ...
                            </span>
                          )
                        )}
                        <button
                          onClick={() => setGendarmeriePage((p) => Math.min(p + 1, gendarmerieTotalPages))}
                          disabled={gendarmeriePage === gendarmerieTotalPages}
                          className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
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
              <div className="overflow-x-auto bg-white shadow rounded-lg">
                {ongLoading ? (
                  <div className="loading-bar-container my-4">
                    <div className="loading-bar"></div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-blue-600">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">OrganizationName</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Title</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">EmailAddress</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Telephone</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">SelectAreaofInterest</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">SelectSectorsofInterest</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">created_at</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedOng.map(entry => (
                          <tr key={entry.id}>
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
                    <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200">
                      <span className="text-sm text-gray-700">
                        Page {ongPage} sur {ongTotalPages}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setOngPage(p => Math.max(p - 1, 1))}
                          disabled={ongPage === 1}
                          className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                          Précédent
                        </button>
                        {getPageNumbers(ongPage, ongTotalPages).map((page, idx) =>
                          typeof page === 'number' ? (
                            <button
                              key={page}
                              onClick={() => setOngPage(page)}
                              className={`px-3 py-1 rounded-md border text-sm font-medium ${
                                ongPage === page
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span key={`ong-ellipsis-${idx}`} className="px-3 py-1">
                              ...
                            </span>
                          )
                        )}
                        <button
                          onClick={() => setOngPage(p => Math.min(p + 1, ongTotalPages))}
                          disabled={ongPage === ongTotalPages}
                          className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
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
              <div className="overflow-x-auto bg-white shadow rounded-lg">
                {entreprisesLoading ? (
                  <div className="loading-bar-container my-4">
                    <div className="loading-bar"></div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-blue-600">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">ninea_ninet</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">cuci</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">raison_social</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">ensemble_sigle</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">numrc</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">syscoa1</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">syscoa2</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">syscoa3</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">naemas</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">naemas_rev1</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">citi_rev4</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">adresse</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">telephone</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">telephone1</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">numero_telecopie</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">bp</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">region</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">departement</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">ville</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">commune</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">quartier</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">personne_contact</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">adresse_personne_contact</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">qualite_personne_contact</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">premiere_annee_exercice</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">forme_juridique</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">regime_fiscal</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">pays_du_siege_de_lentreprise</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">nombre_etablissement</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">controle</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">date_reception</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">libelle_activite_principale</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">observations</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">systeme</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedEntreprises.map((entry, index) => (
                          <tr key={index}>
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
                    <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200">
                      <span className="text-sm text-gray-700">
                        Page {entreprisesPage} sur {entreprisesTotalPages}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setEntreprisesPage((p) => Math.max(p - 1, 1))}
                          disabled={entreprisesPage === 1}
                          className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                          Précédent
                        </button>
                        {getPageNumbers(entreprisesPage, entreprisesTotalPages).map((page, idx) =>
                          typeof page === 'number' ? (
                            <button
                              key={page}
                              onClick={() => setEntreprisesPage(page)}
                              className={`px-3 py-1 rounded-md border text-sm font-medium ${
                                entreprisesPage === page
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span key={`ent-ellipsis-${idx}`} className="px-3 py-1">
                              ...
                            </span>
                          )
                        )}
                        <button
                          onClick={() => setEntreprisesPage((p) => Math.min(p + 1, entreprisesTotalPages))}
                          disabled={entreprisesPage === entreprisesTotalPages}
                          className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
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
              <div className="overflow-x-auto bg-white shadow rounded-lg">
                {vehiculesLoading ? (
                  <div className="loading-bar-container my-4">
                    <div className="loading-bar"></div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-blue-600">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">ID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Numero_Immatriculation</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Code_Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Numero_Serie</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Date_Immatriculation</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Serie_Immatriculation</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Categorie</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Marque</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Appelation_Com</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Genre</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Carrosserie</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Etat_Initial</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Immat_Etrangere</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Date_Etrangere</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Date_Mise_Circulation</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Date_Premiere_Immat</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Energie</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Puissance_Adm</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Cylindre</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Places_Assises</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">PTR</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">PTAC_Code</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Poids_Vide</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">CU</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Prenoms</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Nom</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Date_Naissance</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Exact</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Lieu_Naissance</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Adresse_Vehicule</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Code_Localite</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Tel_Fixe</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Tel_Portable</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">PrecImmat</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Date_PrecImmat</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedVehicules.map((entry) => (
                          <tr key={entry.ID}>
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
                    <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200">
                      <span className="text-sm text-gray-700">
                        Page {vehiculesPage} sur {vehiculesTotalPages}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setVehiculesPage((p) => Math.max(p - 1, 1))}
                          disabled={vehiculesPage === 1}
                          className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                          Précédent
                        </button>
                        {getPageNumbers(vehiculesPage, vehiculesTotalPages).map((page, idx) =>
                          typeof page === 'number' ? (
                            <button
                              key={page}
                              onClick={() => setVehiculesPage(page)}
                              className={`px-3 py-1 rounded-md border text-sm font-medium ${
                                vehiculesPage === page
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          ) : (
                            <span key={`veh-ellipsis-${idx}`} className="px-3 py-1">
                              ...
                            </span>
                          )
                        )}
                        <button
                          onClick={() => setVehiculesPage((p) => Math.min(p + 1, vehiculesTotalPages))}
                          disabled={vehiculesPage === vehiculesTotalPages}
                          className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
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
            <div className="space-y-6">
              <PageHeader icon={<Clock className="h-6 w-6" />} title="CDR" />

              <form onSubmit={handleCreateCase} className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Nom de l'opération"
                  value={cdrCaseName}
                  onChange={(e) => setCdrCaseName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-transform"
                >
                  Créer
                </button>
              </form>
              {cdrCaseMessage && <p className="text-green-600">{cdrCaseMessage}</p>}

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Liste des opérations</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                  {paginatedCases.map((c) => (
                    <div
                      key={c.id}
                      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-md overflow-hidden transition-transform transform hover:scale-105"
                    >
                      <div className="p-6 flex flex-col h-full">
                        {isAdmin && (
                          <p className="text-sm text-gray-500 mb-2">Utilisateur : {c.user_login}</p>
                        )}
                        <h4 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{c.name}</h4>
                        <div className="mt-auto flex space-x-2">
                          <button
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            onClick={() => {
                              setSelectedCase(c);
                              setCdrResult(null);
                              setShowCdrMap(false);
                              setCdrUploadMessage('');
                              setCdrUploadError('');
                              setCurrentPage('cdr-case');
                            }}
                          >
                            Traiter
                          </button>
                          <button
                            className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            onClick={() => handleDeleteCase(c.id)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {totalCasePages > 1 && (
                  <div className="flex justify-center items-center mt-6 space-x-4">
                    <button
                      className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                      onClick={() => setCasePage((p) => p - 1)}
                      disabled={casePage === 1}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Page {casePage} / {totalCasePages}
                    </span>
                    <button
                      className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                      onClick={() => setCasePage((p) => p + 1)}
                      disabled={casePage === totalCasePages}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
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
                  <div className="bg-white rounded-lg shadow p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-700">Importation CDR</h3>
                  <form onSubmit={handleCdrUpload} className="space-y-4">
                    <input
                      type="text"
                      value={cdrNumber}
                      onChange={(e) => setCdrNumber(e.target.value)}
                      placeholder="Numéro associé"
                      className="block w-full border rounded-md p-2"
                    />
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setCdrFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                      <button
                        type="submit"
                        disabled={cdrUploading || !cdrFile || !cdrNumber}
                        className="flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
                      >
                        {cdrUploading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          'Importer CDR'
                        )}
                      </button>
                    {cdrUploadMessage && <p className="text-green-600">{cdrUploadMessage}</p>}
                    {cdrUploadError && <p className="text-red-600">{cdrUploadError}</p>}
                  </form>
                  {caseFiles.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Fichiers importés</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-gray-700">
                          <thead>
                            <tr>
                              <th className="px-4 py-2 text-left">Nom du fichier</th>
                              <th className="px-4 py-2 text-left">Numéro</th>
                              <th className="px-4 py-2 text-left">Lignes</th>
                              <th className="px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {caseFiles.map((f) => (
                              <tr key={f.id}>
                                <td className="px-4 py-2 truncate">{f.filename}</td>
                                <td className="px-4 py-2">{f.cdr_number || '-'}</td>
                                <td className="px-4 py-2">{f.line_count}</td>
                                <td className="px-4 py-2 text-right">
                                  <button
                                    className="text-red-600 hover:underline"
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
                    {paginatedRequests.map(r => (
                      <div
                        key={r.id}
                        className="bg-white rounded-2xl shadow-md p-6 flex flex-col md:flex-row md:items-center md:justify-between hover:shadow-lg transition-shadow"
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
                    ))}
                  </div>
                  {totalRequestPages > 1 && (
                    <div className="flex justify-center items-center space-x-2 mt-4">
                      <button
                        onClick={() => setRequestPage(p => Math.max(p - 1, 1))}
                        disabled={requestPage === 1}
                        className="p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <span className="text-sm">
                        {requestPage} / {totalRequestPages}
                      </span>
                      <button
                        onClick={() => setRequestPage(p => Math.min(p + 1, totalRequestPages))}
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
                <p className="mb-6 text-center text-gray-500">Vegata</p>
                <ProfileForm
                  initialValues={profileDefaults}
                  profileId={editingProfileId || undefined}
                  onSaved={() => setShowProfileForm(false)}
                />
                <div className="mt-4">
                  <button
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                    onClick={() => setShowProfileForm(false)}
                  >
                    Retour à la liste
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white shadow rounded-lg p-6">
                <ProfileList onCreate={() => openCreateProfile({})} onEdit={openEditProfile} />
              </div>
            )}
          </div>
        )}

        {currentPage === 'blacklist' && isAdmin && (
          <div className="space-y-6">
            <PageHeader icon={<Ban className="h-6 w-6" />} title="Black List" />
            <div className="bg-white shadow rounded-lg p-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <form onSubmit={handleAddBlacklist} className="flex flex-1 gap-2">
                  <input
                    type="text"
                    placeholder="Numéro"
                    value={blacklistNumber}
                    onChange={(e) => setBlacklistNumber(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Ajouter
                  </button>
                </form>
                <form onSubmit={handleUploadBlacklist} className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept=".txt,.csv"
                    onChange={(e) => setBlacklistFile(e.target.files?.[0] || null)}
                    className="flex-1 text-sm"
                  />
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    Importer
                  </button>
                </form>
              </div>
              {blacklistError && <p className="text-red-600">{blacklistError}</p>}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Numéro</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {blacklist.map((b) => (
                      <tr key={b.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{b.number}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button
                            onClick={() => handleDeleteBlacklist(b.id)}
                            className="text-red-600 hover:text-red-900"
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
            <div className="bg-white shadow rounded-lg p-6">
              <div className="mb-4 flex">
                <input
                  type="text"
                  value={logUserFilter}
                  onChange={(e) => setLogUserFilter(e.target.value)}
                  placeholder="Filtrer par utilisateur"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => fetchLogs(1)}
                  className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Rechercher
                </button>
                <button
                  onClick={exportLogs}
                  className="ml-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Exporter
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utilisateur</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Détails</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Page</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profil</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durée (min)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logsData.map((log: any) => {
                      let details: any = {};
                      try {
                        details = log.details ? JSON.parse(log.details) : {};
                      } catch {}
                      return (
                        <tr key={log.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.username || 'Inconnu'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.action}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.details || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{details.page || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {details.profile_id ? (
                              <button
                                className="text-blue-600 hover:underline"
                                onClick={() => openEditProfile(details.profile_id)}
                              >
                                Voir
                              </button>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.duration_ms ? Math.round(log.duration_ms / 60000) : '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {log.created_at ? format(parseISO(log.created_at), 'Pp', { locale: fr }) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex justify-between items-center mt-4">
                  <button
                    onClick={() => fetchLogs(logPage - 1)}
                    disabled={logPage <= 1}
                    className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                  >
                    Précédent
                  </button>
                  <span className="text-sm text-gray-700">Page {logPage} / {Math.max(1, Math.ceil(logTotal / LOGS_LIMIT))}</span>
                  <button
                    onClick={() => fetchLogs(logPage + 1)}
                    disabled={logPage >= Math.ceil(logTotal / LOGS_LIMIT)}
                    className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
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
              {/* Header */}
              <div className="flex justify-between items-center">
                <PageHeader icon={<User className="h-6 w-6" />} title="Gestion des utilisateurs" subtitle="Créez et gérez les comptes utilisateurs" />
                <button
                  onClick={openCreateModal}
                  className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all shadow-lg"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Nouvel utilisateur
                </button>
              </div>

              {/* Table des utilisateurs */}
              <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
                {users.length === 0 ? (
                  <div className="text-center py-16">
                    <Users className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Aucun utilisateur</h3>
                    <p className="text-gray-500 mb-6">
                      Commencez par créer un nouvel utilisateur pour votre équipe.
                    </p>
                    <button
                      onClick={openCreateModal}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Créer le premier utilisateur
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Utilisateur
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Rôle
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Statut
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Créé le
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-700 rounded-full">
                                  <User className="h-5 w-5 text-white" />
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.login}</div>
                                  <div className="text-sm text-gray-500">ID: {user.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {(user.admin === 1 || user.admin === "1") ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  <Shield className="w-3 h-3 mr-1" />
                                  Administrateur
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  <UserCheck className="w-3 h-3 mr-1" />
                                  Utilisateur
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {user.active === 1 ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  Actif
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  Désactivé
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(user.created_at).toLocaleDateString('fr-FR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-3">
                                <button
                                  onClick={() => openEditModal(user)}
                                  className="text-blue-600 hover:text-blue-900 transition-colors"
                                  title="Modifier l'utilisateur"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openPasswordModal(user)}
                                  className="text-green-600 hover:text-green-900 transition-colors"
                                  title="Changer le mot de passe"
                                >
                                  <Key className="w-4 h-4" />
                                </button>
                                {user.id !== currentUser?.id && (
                                  <button
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="text-red-600 hover:text-red-900 transition-colors"
                                    title="Supprimer l'utilisateur"
                                  >
                                    <Trash2 className="w-4 h-4" />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm font-medium">Recherches totales</p>
                          <p className="text-3xl font-bold">{statsData?.total_searches || 0}</p>
                        </div>
                        <div className="bg-white/20 rounded-full p-3">
                          <Search className="h-8 w-8" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl p-6 text-white shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-teal-100 text-sm font-medium">Enregistrements indexés</p>
                          <p className="text-3xl font-bold">{totalRecords}</p>
                        </div>
                        <div className="bg-white/20 rounded-full p-3">
                          <Database className="h-8 w-8" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-100 text-sm font-medium">Utilisateurs actifs</p>
                          <p className="text-3xl font-bold">{statsData?.active_users || 0}</p>
                        </div>
                        <div className="bg-white/20 rounded-full p-3">
                          <Users className="h-8 w-8" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-100 text-sm font-medium">Temps de réponse moyen</p>
                          <p className="text-3xl font-bold">{statsData?.avg_execution_time || 0}ms</p>
                        </div>
                        <div className="bg-white/20 rounded-full p-3">
                          <Timer className="h-8 w-8" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-100 text-sm font-medium">Recherches aujourd'hui</p>
                          <p className="text-3xl font-bold">{statsData?.today_searches || 0}</p>
                        </div>
                        <div className="bg-white/20 rounded-full p-3">
                          <TrendingUp className="h-8 w-8" />
                        </div>
                      </div>
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

                  {/* Répartition des sources de données */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                      <div className="bg-white rounded-2xl shadow-xl p-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          <Database className="h-6 w-6 mr-2 text-green-600" />
                          Sources de données
                        </h3>
                        <div className="h-80">
                          <Doughnut
                            data={{
                              labels: tableDistribution.map(d => d.table),
                              datasets: [{
                                data: tableDistribution.map(d => d.count),
                                backgroundColor: tableDistribution.map((_, i) => [
                                  'rgba(59, 130, 246, 0.8)',
                                  'rgba(16, 185, 129, 0.8)',
                                  'rgba(245, 158, 11, 0.8)',
                                  'rgba(239, 68, 68, 0.8)',
                                  'rgba(147, 51, 234, 0.8)'
                                ][i % 5]),
                                borderWidth: 0
                              }]
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: {
                                  position: 'bottom',
                                  labels: {
                                    padding: 20,
                                    usePointStyle: true
                                  }
                                }
                              }
                            }}
                          />
                        </div>
                        <div className="mt-6 max-h-48 overflow-y-auto space-y-1">
                          {tableDistribution.map((d, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-gray-700">{d.table}</span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">{d.count}</span>
                            </div>
                          ))}
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
                            {searchLogs.length > 0 ? searchLogs.map((log, index) => (
                              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3">
                                    <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                                      <User className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div>
                                      <p className="font-medium text-gray-900 dark:text-gray-100">{log.username || 'Utilisateur inconnu'}</p>
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
                            )) : (
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
                      {statsData?.top_search_terms?.slice(0, 9).map((term, index) => (
                        <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl hover:from-blue-50 hover:to-blue-100 transition-all dark:from-gray-800 dark:to-gray-700 dark:hover:from-blue-900 dark:hover:to-blue-800">
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
                      )) || (
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
                    minLength={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  />
                  <p className="mt-1 text-sm text-gray-500">Minimum 6 caractères</p>
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
                    setUserFormData({ login: '', password: '', admin: 0, active: 1 });
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
                    minLength={6}
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
                <p className="mt-1 text-sm text-gray-500">Minimum 6 caractères</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirmer le nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    required
                    minLength={6}
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
  );
};

export default App;