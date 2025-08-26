import React, { useState, useEffect } from 'react';
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
  Eye,
  EyeOff,
  Download,
  Menu,
  X,
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
  Phone
} from 'lucide-react';
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
import jsPDF from 'jspdf';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend);

interface User {
  id: number;
  login: string;
  admin: number;
  created_at: string;
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
    admin: 0
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
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);

  // États annuaire gendarmerie
  const [gendarmerieData, setGendarmerieData] = useState<GendarmerieEntry[]>([]);
  const [gendarmerieSearch, setGendarmerieSearch] = useState('');
  const [gendarmeriePage, setGendarmeriePage] = useState(1);
  const gendarmeriePerPage = 10;

  // États des statistiques
  const [statsData, setStatsData] = useState(null);
  const [searchLogs, setSearchLogs] = useState([]);
  const [logUserFilter, setLogUserFilter] = useState('');
  const [loadingStats, setLoadingStats] = useState(false);
  const [timeSeries, setTimeSeries] = useState<any[]>([]);
  const [tableDistribution, setTableDistribution] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);

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
        setCurrentPage('search');
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
        setCurrentPage('search');
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

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
          query: searchQuery,
          page: 1,
          limit: 50
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSearchResults(data);
      } else {
        setSearchError(data.error || 'Erreur lors de la recherche');
      }
    } catch (error) {
      setSearchError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
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

      const fields = ['Source', 'Base', 'Score', ...Array.from(allFields)];
      
      let csvContent = fields.map(field => `"${field}"`).join(',') + '\n';
      
      searchResults.hits.forEach(hit => {
        const row = [
          `"${hit.table || ''}"`,
          `"${hit.database || ''}"`,
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
      link.setAttribute('download', `vegeta-export-${searchTerm}-${timestamp}.csv`);
      
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

  const exportToPDF = () => {
    if (!searchResults || searchResults.hits.length === 0) {
      alert('Aucun résultat à exporter');
      return;
    }

    try {
      const allFields = new Set<string>();
      searchResults.hits.forEach(hit => {
        Object.keys(hit.preview).forEach(field => allFields.add(field));
      });

      const fields = ['Source', 'Base', 'Score', ...Array.from(allFields)];
      const body = searchResults.hits.map(hit => [
        hit.table || '',
        hit.database || '',
        String(hit.score || 0),
        ...Array.from(allFields).map(field => String(hit.preview[field] ?? ''))
      ]);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth() - 20;
      const colWidth = pageWidth / fields.length;
      let y = 20;

      const drawHeader = () => {
        doc.setFillColor(41, 128, 185);
        doc.setTextColor(255);
        fields.forEach((h, i) => {
          const x = 10 + i * colWidth;
          doc.rect(x, y, colWidth, 8, 'FD');
          doc.text(h, x + 2, y + 5);
        });
        y += 8;
        doc.setTextColor(0);
      };
      drawHeader();

      body.forEach((row, idx) => {
        doc.setFillColor(idx % 2 === 0 ? 255 : 245);
        row.forEach((cell, i) => {
          const x = 10 + i * colWidth;
          doc.rect(x, y, colWidth, 8, 'FD');
          doc.text(cell.slice(0, 30), x + 2, y + 5);
        });
        y += 8;
        if (y > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 20;
          drawHeader();
        }
      });

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const searchTerm = searchQuery.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
      doc.save('vegeta-export-' + searchTerm + '-' + timestamp + '.pdf');

      alert('Export PDF réussi ! ' + searchResults.hits.length + ' résultats exportés.');
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert('Erreur lors de l\'export PDF');
    }
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
    if (!currentUser || (currentUser.admin !== 1 && currentUser.admin !== "1")) return;

    try {
      setLoadingStats(true);
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

      const logQuery = logUserFilter ? `?username=${encodeURIComponent(logUserFilter)}` : '';

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

  const exportStats = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Statistiques VEGETA', 14, 15);
    let y = 25;

    const drawTable = (headers: string[], rows: string[][]) => {
      const pageWidth = doc.internal.pageSize.getWidth() - 20;
      const colWidth = pageWidth / headers.length;

      const drawHeaderRow = () => {
        doc.setFillColor(41, 128, 185);
        doc.setTextColor(255);
        headers.forEach((h, i) => {
          const x = 10 + i * colWidth;
          doc.rect(x, y, colWidth, 8, 'FD');
          doc.text(h, x + 2, y + 5);
        });
        y += 8;
        doc.setTextColor(0);
      };

      drawHeaderRow();

      rows.forEach((row, idx) => {
        doc.setFillColor(idx % 2 === 0 ? 255 : 245);
        row.forEach((cell, i) => {
          const x = 10 + i * colWidth;
          doc.rect(x, y, colWidth, 8, 'FD');
          doc.text(String(cell).slice(0, 30), x + 2, y + 5);
        });
        y += 8;
        if (y > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 20;
          drawHeaderRow();
        }
      });
      y += 10;
    };

    const addSection = (title: string) => {
      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text(title, 14, y);
      y += 8;
    };

    if (statsData) {
      addSection('Aperçu');
      const overview = Object.entries(statsData)
        .filter(([key, value]) => !Array.isArray(value))
        .map(([key, value]) => [key, String(value)]);
      drawTable(['Indicateur', 'Valeur'], overview);

      if ((statsData as any).top_search_terms?.length) {
        addSection('Top termes recherchés');
        const rows = (statsData as any).top_search_terms.map((t: any) => [t.search_term, String(t.search_count)]);
        drawTable(['Terme', 'Nombre'], rows);
      }

      if ((statsData as any).searches_by_type?.length) {
        addSection('Recherches par type');
        const rows = (statsData as any).searches_by_type.map((t: any) => [t.search_type, String(t.search_count)]);
        drawTable(['Type', 'Nombre'], rows);
      }
    }

    if (timeSeries.length) {
      addSection('Séries temporelles');
      const rows = timeSeries.map((item: any) => [item.date, String(item.searches), String(item.unique_users), String(item.avg_time)]);
      drawTable(['Date', 'Recherches', 'Utilisateurs uniques', 'Temps moyen (ms)'], rows);
    }

    if (tableDistribution.length) {
      addSection('Distribution des tables');
      const rows = tableDistribution.map((item: any) => [item.table, String(item.count)]);
      drawTable(['Table', 'Enregistrements'], rows);
    }

    if (searchLogs.length) {
      addSection('Journaux de recherche');
      const rows = searchLogs.map((log: any) => [log.username || '', log.search_term || '', log.search_date || '', String(log.results_count ?? '')]);
      drawTable(['Utilisateur', 'Terme', 'Date', 'Résultats'], rows);
    }

    doc.save('statistics.pdf');
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
          role: userFormData.admin === 1 ? 'ADMIN' : 'USER'
        })
      });

      const data = await response.json();
      console.log('🔍 Réponse serveur:', { status: response.status, data });

      if (response.ok) {
        alert('Utilisateur créé avec succès');
        setShowUserModal(false);
        setUserFormData({ login: '', password: '', admin: 0 });
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
          admin: userFormData.admin
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Utilisateur modifié avec succès');
        setShowUserModal(false);
        setUserFormData({ login: '', password: '', admin: 0 });
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
      admin: user.admin
    });
    setShowUserModal(true);
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setUserFormData({ login: '', password: '', admin: 0 });
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

  const fetchAnnuaire = async () => {
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
    }
  };

  // Charger les utilisateurs quand on accède à la page
  useEffect(() => {
    if (currentPage === 'users' && currentUser && (currentUser.admin === 1 || currentUser.admin === "1")) {
      loadUsers();
    }
    if (currentPage === 'statistics' && currentUser) {
      loadStatistics();
    }
    if (currentPage === 'upload' && currentUser && (currentUser.admin === 1 || currentUser.admin === "1")) {
      fetchUploadHistory();
    }
    if (currentPage === 'annuaire' && currentUser) {
      fetchAnnuaire();
    }
  }, [currentPage, currentUser]);

  // Vérifier si l'utilisateur est admin
  const isAdmin = currentUser && (currentUser.admin === 1 || currentUser.admin === "1");

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

  useEffect(() => {
    setGendarmeriePage(1);
  }, [gendarmerieSearch]);

  // Page de connexion
  if (!isAuthenticated) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-4 ${
          theme === 'dark'
            ? 'bg-gray-900 text-white'
            : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50'
        }`}
      >
        <div className="max-w-md w-full">
          <div className="bg-white shadow-2xl rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
                  <Database className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white">VEGETA</h2>
                <p className="text-blue-100 mt-1">Plateforme de recherche professionnelle</p>
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
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all"
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

  return (
    <div
      className="min-h-screen flex bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
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
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
                <Database className="h-6 w-6 text-white" />
              </div>
              {sidebarOpen && (
                <div className="ml-3">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">VEGETA</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Recherche Pro</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setTheme(theme === 'dark' ? 'light' : 'dark')
                }
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {theme === 'dark' ? 'Light' : 'Black'}
              </button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
              onClick={() => setCurrentPage('search')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'search'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Search className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Recherche</span>}
            </button>

            <button
              onClick={() => setCurrentPage('annuaire')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                currentPage === 'annuaire'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              } ${!sidebarOpen && 'justify-center'}`}
            >
              <Phone className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Annuaire Gendarmerie</span>}
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setCurrentPage('users')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                    currentPage === 'users'
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  } ${!sidebarOpen && 'justify-center'}`}
                >
                  <Users className="h-5 w-5" />
                  {sidebarOpen && <span className="ml-3">Utilisateurs</span>}
                </button>

                <button
                  onClick={() => setCurrentPage('statistics')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                    currentPage === 'statistics'
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  } ${!sidebarOpen && 'justify-center'}`}
                >
                  <Activity className="h-5 w-5" />
                  {sidebarOpen && <span className="ml-3">Statistiques</span>}
                </button>

                <button
                  onClick={() => setCurrentPage('upload')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                    currentPage === 'upload'
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  } ${!sidebarOpen && 'justify-center'}`}
                >
                  <Upload className="h-5 w-5" />
                  {sidebarOpen && <span className="ml-3">Charger des données</span>}
                </button>
              </>
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
          {currentPage === 'search' && (
            <div className="space-y-8">
              {/* Header */}
              <div className="text-center">
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  Recherche Unifiée
                </h1>
                <p className="text-lg text-gray-600">
                  Explorez toutes les bases de données en une seule recherche
                </p>
              </div>

              {/* Barre de recherche */}
              <div className="bg-white shadow-xl rounded-2xl p-8">
                <form onSubmit={handleSearch} className="space-y-6">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Entrez votre recherche (CNI, nom, téléphone, immatriculation...)"
                      className="w-full px-6 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="absolute right-2 top-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all flex items-center"
                    >
                      {loading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <>
                          <Search className="w-5 h-5 mr-2" />
                          Rechercher
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* Suggestions */}
                <div className="mt-6">
                  <p className="text-sm font-medium text-gray-700 mb-3">Suggestions :</p>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { label: 'CNI', example: 'CNI: 123456789', icon: '🆔' },
                      { label: 'Immatriculation', example: 'DK 1234 AB', icon: '🚗' },
                      { label: 'NINEA', example: 'NINEA: 123456', icon: '🏢' },
                      { label: 'Téléphone', example: '77 123 45 67', icon: '📞' }
                    ].map((suggestion) => (
                      <button
                        key={suggestion.label}
                        onClick={() => setSearchQuery(suggestion.example)}
                        className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-sm font-medium transition-colors"
                      >
                        <span className="mr-2">{suggestion.icon}</span>
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </div>
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

              {/* Résultats */}
              {searchResults && (
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg shadow-2xl rounded-3xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
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

                      {searchResults.hits.length > 0 && (
                        <div className="flex space-x-2">
                          <button
                            onClick={exportToCSV}
                            className="flex items-center px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 transition-colors"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                          </button>
                          <button
                            onClick={exportToPDF}
                            className="flex items-center px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 transition-colors"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Export PDF
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                    {searchResults.hits.length === 0 ? (
                      <div className="text-center py-16">
                        <Search className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun résultat trouvé</h3>
                        <p className="text-gray-500">
                          Essayez avec d'autres termes de recherche ou vérifiez l'orthographe.
                        </p>
                      </div>
                    ) : (
                      <div className="p-8 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700">
                        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                          {searchResults.hits.map((result, index) => (
                            <div
                              key={index}
                              className="group relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-2xl p-6 hover:shadow-xl hover:border-indigo-300 dark:hover:border-indigo-500 transform transition-all duration-300 hover:-translate-y-1"
                            >
                              {/* Header de la carte */}
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center space-x-3">
                                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-xl text-white shadow-md">
                                    <Database className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-semibold text-gray-900">{result.table}</h3>
                                    <p className="text-sm text-gray-500">Base: {result.database}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                    <Activity className="w-3 h-3 mr-1" />
                                    Score: {result.score.toFixed(1)}
                                  </span>
                                </div>
                              </div>

                              {/* Contenu des données */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.entries(result.preview).map(([key, value]) => {
                                  if (!value || value === '' || value === null || value === undefined) return null;

                                  return (
                                    <div
                                      key={key}
                                      className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg p-3 border border-transparent group-hover:border-indigo-200 dark:group-hover:border-indigo-500 transition-colors"
                                    >
                                      <div className="flex flex-col">
                                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                                          {key.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-sm font-medium text-gray-900 break-words">
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
                                  className="inline-flex items-center px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors"
                                >
                                  <User className="w-3 h-3 mr-1" />
                                  Copier
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {currentPage === 'annuaire' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold text-gray-900">Annuaire Gendarmerie</h1>
              <input
                type="text"
                placeholder="Rechercher..."
                value={gendarmerieSearch}
                onChange={(e) => setGendarmerieSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="overflow-x-auto bg-white shadow rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Libellé</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Téléphone</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedGendarmerie.map((entry) => {
                      const isTitle = !entry.Telephone || entry.Telephone.trim() === '';
                      return isTitle ? (
                        <tr key={entry.id} className="bg-gray-100">
                          <td colSpan={3} className="px-6 py-4 font-semibold">
                            {entry.Libelle}
                          </td>
                        </tr>
                      ) : (
                        <tr key={entry.id}>
                          <td className="px-6 py-4 whitespace-nowrap">{entry.id}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{entry.Libelle}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{entry.Telephone}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200">
                  <span className="text-sm text-gray-700">
                    Page {gendarmeriePage} sur {gendarmerieTotalPages}
                  </span>
                  <div className="space-x-2">
                    <button
                      onClick={() => setGendarmeriePage((p) => Math.max(p - 1, 1))}
                      disabled={gendarmeriePage === 1}
                      className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Précédent
                    </button>
                    <button
                      onClick={() => setGendarmeriePage((p) => Math.min(p + 1, gendarmerieTotalPages))}
                      disabled={gendarmeriePage === gendarmerieTotalPages}
                      className="px-3 py-1 rounded-md border text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
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
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Gestion des utilisateurs</h1>
                  <p className="text-gray-600 mt-1">Créez et gérez les comptes utilisateurs</p>
                </div>
                <button
                  onClick={openCreateModal}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all shadow-lg"
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
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun utilisateur</h3>
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
                                <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full">
                                  <User className="h-5 w-5 text-white" />
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">{user.login}</div>
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

          {currentPage === 'statistics' && isAdmin && (
            <div className="space-y-8">
              {/* Header */}
              <div className="text-center">
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  Tableau de Bord Statistiques
                </h1>
                <p className="text-lg text-gray-600">
                  Analyse complète de l'utilisation de la plateforme VEGETA
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={exportStats}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Download className="h-4 w-4 mr-2" /> Exporter PDF
                </button>
              </div>

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
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
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
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
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
                        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
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
                              <span className="font-medium text-gray-900">{d.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Logs de recherche récents */}
                    <div className="lg:col-span-2">
                      <div className="bg-white rounded-2xl shadow-xl p-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                          <FileText className="h-6 w-6 mr-2 text-indigo-600" />
                          Logs de recherche
                        </h3>
                        <div className="mb-4 flex">
                          <input
                            type="text"
                            value={logUserFilter}
                            onChange={(e) => setLogUserFilter(e.target.value)}
                            placeholder="Filtrer par utilisateur"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={loadStatistics}
                            className="ml-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                          >
                            Rechercher
                          </button>
                        </div>
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
                                      <p className="font-medium text-gray-900">{log.username || 'Utilisateur inconnu'}</p>
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
                  <div className="bg-white rounded-2xl shadow-xl p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                      <TrendingUp className="h-6 w-6 mr-2 text-orange-600" />
                      Termes de recherche populaires
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {statsData?.top_search_terms?.slice(0, 9).map((term, index) => (
                        <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl hover:from-blue-50 hover:to-indigo-50 transition-all">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full text-blue-600 font-bold text-sm">
                              {index + 1}
                            </div>
                            <span className="font-medium text-gray-900 truncate max-w-xs">"{term.search_term}"</span>
                          </div>
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            {term.search_count} fois
                          </span>
                        </div>
                      )) || (
                        <div className="col-span-full text-center py-8">
                          <Search className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                          <p className="text-gray-500">Aucun terme de recherche populaire</p>
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
                    <h1 className="mt-4 text-3xl font-bold text-gray-900">Charger des données</h1>
                    <p className="mt-2 text-gray-600">Importez un fichier CSV ou SQL dans la table de votre choix.</p>
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
                        accept=".csv,.sql"
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
                      {loading ? 'Chargement...' : 'Importer'}
                    </button>
                  </form>
                </div>

                <div className="mt-8">
                  <h2 className="text-xl font-semibold text-center text-gray-900 mb-4">Bases importées</h2>
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
                            <p className="font-medium text-gray-900">{item.table_name}</p>
                            <p className="text-sm text-gray-500">{item.file_name}</p>
                          </div>
                          {item.created_at && (
                            <span className="text-xs text-gray-400">{format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm')}</span>
                          )}
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
              <h3 className="text-lg font-semibold text-gray-900">
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

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false);
                    setEditingUser(null);
                    setUserFormData({ login: '', password: '', admin: 0 });
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
              <h3 className="text-lg font-semibold text-gray-900">
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
                      {showPasswords.current ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
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
                    {showPasswords.new ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
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
                    {showPasswords.confirm ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
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