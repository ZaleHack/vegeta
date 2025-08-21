import React, { useState, useEffect } from 'react';
import { 
  Search, Database, BarChart3, Upload, Users, Filter, Download, Eye, Shield, 
  Clock, TrendingUp, Menu, X, Globe, PieChart, Activity, FileText, Settings,
  ChevronRight, AlertCircle, CheckCircle, XCircle, Info, Home, LogOut
} from 'lucide-react';

// Configuration API
const API_BASE_URL = 'http://localhost:3000/api';

interface SearchResult {
  table: string;
  database: string;
  preview: Record<string, any>;
  primary_keys: Record<string, any>;
  score: number;
}

interface User {
  id: number;
  login: string;
  email: string;
  role: 'ADMIN' | 'USER';
  admin: number;
  created_at: string;
  updated_at?: string;
}

interface NewUser {
  login: string;
  password: string;
  role: 'ADMIN' | 'USER';
}

// Utilitaire pour les requêtes API
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  try {
    const token = localStorage.getItem('vegeta_token');
    
    console.log('🔍 API Request:', endpoint, options);
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erreur serveur' }));
      throw new Error(errorData.error || `Erreur ${response.status}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('❌ Erreur API:', error);
    throw error;
  }
};

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filters, setFilters] = useState({});
  const [users, setUsers] = useState<User[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState<NewUser>({
    login: '',
    password: '',
    role: 'USER'
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loginData, setLoginData] = useState({
    login: '',
    password: ''
  });
  const [loginError, setLoginError] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [newDatabaseName, setNewDatabaseName] = useState('');
  const [uploadMode, setUploadMode] = useState<'existing' | 'new'>('existing');
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total_searches: 0,
    avg_execution_time: 0,
    today_searches: 0,
    active_users: 0
  });
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Vérification du token au démarrage
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('vegeta_token');
      if (token) {
        try {
          const response = await apiRequest('/auth/verify');
          setUser(response.user);
        } catch (error) {
          localStorage.removeItem('vegeta_token');
        }
      }
      setIsInitializing(false);
    };
    
    checkAuth();
  }, []);

  // Charger les données selon le rôle
  useEffect(() => {
    if (user) {
      loadStats();
      if (user.role === 'ADMIN') {
        loadUsers();
        loadUploadHistory();
      }
    }
  }, [user]);

  const loadStats = async () => {
    try {
      const response = await apiRequest('/stats/overview');
      setStats(response);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await apiRequest('/users');
      setUsers(response.users);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const loadUploadHistory = async () => {
    try {
      const response = await apiRequest('/upload/history');
      setUploadHistory(response.history);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoading(true);

    console.log('🔐 Tentative de connexion avec:', { login: loginData.login, password: '***' });

    try {
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          login: loginData.login,
          password: loginData.password
        }),
      });

      console.log('✅ Connexion réussie:', response);
      localStorage.setItem('vegeta_token', response.token);
      setUser(response.user);
    } catch (error: any) {
      console.error('❌ Erreur de connexion:', error);
      setLoginError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    } finally {
      localStorage.removeItem('vegeta_token');
      setUser(null);
      setCurrentPage('home');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setUploadFile(file);
      // Simuler la prévisualisation du CSV
      setTimeout(() => {
        setCsvPreview([
          { nom: 'Dupont', prenom: 'Jean', cni: '1234567890123', telephone: '77 123 45 67' },
          { nom: 'Martin', prenom: 'Marie', cni: '9876543210987', telephone: '76 987 65 43' },
          { nom: 'Diallo', prenom: 'Amadou', cni: '5555666677778', telephone: '78 555 66 77' }
        ]);
      }, 500);
    } else {
      alert('Veuillez sélectionner un fichier CSV valide');
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      alert('Veuillez sélectionner un fichier');
      return;
    }

    if (uploadMode === 'existing' && !selectedDatabase) {
      alert('Veuillez sélectionner une base de données');
      return;
    }

    if (uploadMode === 'new' && !newDatabaseName.trim()) {
      alert('Veuillez entrer un nom pour la nouvelle base');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    // Simulation de l'upload avec progression
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          
          // Ajouter à l'historique
          const newUpload = {
            id: uploadHistory.length + 1,
            filename: uploadFile.name,
            database: uploadMode === 'existing' ? selectedDatabase : newDatabaseName,
            rows: csvPreview.length * 100, // Simulation
            success: csvPreview.length * 98,
            errors: csvPreview.length * 2,
            date: new Date().toISOString(),
            status: 'completed'
          };
          
          setUploadHistory([newUpload, ...uploadHistory]);
          
          // Reset du formulaire
          setUploadFile(null);
          setSelectedDatabase('');
          setNewDatabaseName('');
          setCsvPreview([]);
          
          alert('Upload terminé avec succès !');
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    console.log('🔍 Début de la recherche:', searchQuery);
    setIsLoading(true);
    
    try {
      console.log('📡 Envoi de la requête de recherche...');
      const response = await apiRequest('/search', {
        method: 'POST',
        body: JSON.stringify({
          query: searchQuery,
          filters: filters,
          page: 1,
          limit: 20
        }),
      });
      
      console.log('✅ Réponse reçue:', response);
      setSearchResults(response.hits || []);
    } catch (error: any) {
      console.error('❌ Erreur de recherche:', error);
      alert('Erreur lors de la recherche: ' + error.message);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = async (result: SearchResult) => {
    try {
      setIsLoading(true);
      const tableName = `${result.database}_${result.table}`;
      const response = await apiRequest(`/search/details/${tableName}/${result.primary_keys.id}`);
      setSelectedRecord(response);
      setShowDetailsModal(true);
    } catch (error: any) {
      alert('Erreur lors de la récupération des détails: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.login || !newUser.password) {
      alert('Tous les champs sont requis');
      return;
    }
    
    if (newUser.password.length < 8) {
      alert('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });

      await loadUsers();
      setNewUser({ login: '', password: '', role: 'USER' });
      setShowUserModal(false);
      alert('Utilisateur créé avec succès');
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      alert('Tous les champs sont requis');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('Les mots de passe ne correspondent pas');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      alert('Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }

    try {
      await apiRequest(`/users/${editingUser?.id}/change-password`, {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        }),
      });

      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordModal(false);
      setEditingUser(null);
      alert('Mot de passe modifié avec succès');
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const canAccess = (requiredRole: string[]) => {
    return user && requiredRole.includes(user.role);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Chargement de VEGETA...</p>
        </div>
      </div>
    );
  }

  const LoginForm = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Database className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">VEGETA</h1>
          <p className="text-slate-600">Plateforme de recherche professionnelle multi-bases</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Login
            </label>
            <input
              type="text"
              value={loginData.login}
              onChange={(e) => setLoginData({ ...loginData, login: e.target.value })}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-slate-50 focus:bg-white"
              placeholder="Entrez votre login"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={loginData.password}
              onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-slate-50 focus:bg-white"
              placeholder="Entrez votre mot de passe"
              required
            />
          </div>
          
          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
              {loginError}
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Se connecter
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );

  const Sidebar = () => (
    <div className={`bg-gradient-to-b from-slate-800 to-slate-900 text-white transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-64'} min-h-screen flex flex-col fixed left-0 top-0 z-50 shadow-2xl`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-500 w-8 h-8 rounded-lg flex items-center justify-center shadow-md">
                <Database className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg">VEGETA</span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
          >
            {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          <SidebarItem
            icon={Home}
            label="Recherche"
            active={currentPage === 'home'}
            onClick={() => setCurrentPage('home')}
            collapsed={sidebarCollapsed}
          />
          <SidebarItem
            icon={BarChart3}
            label="Statistiques"
            active={currentPage === 'stats'}
            onClick={() => setCurrentPage('stats')}
            collapsed={sidebarCollapsed}
          />
          {canAccess(['ADMIN']) && (
            <SidebarItem
              icon={Upload}
              label="Upload"
              active={currentPage === 'upload'}
              onClick={() => setCurrentPage('upload')}
              collapsed={sidebarCollapsed}
            />
          )}
          {canAccess(['ADMIN']) && (
            <SidebarItem
              icon={Users}
              label="Utilisateurs"
              active={currentPage === 'users'}
              onClick={() => setCurrentPage('users')}
              collapsed={sidebarCollapsed}
            />
          )}
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-slate-700/50">
        {!sidebarCollapsed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-sm font-bold shadow-md">
                {user?.login?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.login}</p>
                <p className="text-xs text-slate-400">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full p-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );

  const SidebarItem = ({ icon: Icon, label, active, onClick, collapsed }: any) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
        active ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
      {!collapsed && active && <ChevronRight className="w-4 h-4 ml-auto" />}
    </button>
  );

  const TopBar = () => (
    <div className={`bg-white/80 backdrop-blur-sm border-b border-slate-200 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} shadow-sm`}>
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">
            {currentPage === 'home' && 'Recherche Unifiée'}
            {currentPage === 'stats' && 'Tableau de bord statistiques'}
            {currentPage === 'upload' && 'Gestion des données'}
            {currentPage === 'users' && 'Gestion des utilisateurs'}
          </h1>
          
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-600">
              {user?.login}
            </div>
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md">
              {user?.login?.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const StatsCard = ({ title, value, icon: Icon, color = 'emerald' }: any) => (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-200 hover:scale-[1.02]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
          <p className={`text-3xl font-bold text-${color}-600`}>{value}</p>
        </div>
        <div className={`bg-${color}-100 p-3 rounded-xl`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
      </div>
    </div>
  );

  const HomePage = () => (
    <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} p-6 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen`}>
      {/* Barre de recherche principale */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-slate-200 p-8 mb-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              <Search className="inline-block w-8 h-8 mr-3 text-blue-600" />
              Recherche Unifiée VEGETA
            </h2>
            <p className="text-slate-600">Recherchez dans toutes les bases de données simultanément</p>
          </div>
          
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-12 pr-4 py-4 text-lg border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-slate-50 focus:bg-white shadow-sm"
              placeholder="Entrez votre recherche (CNI, nom, téléphone, immatriculation...)"
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 shadow-md"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Rechercher'
              )}
            </button>
          </div>
          
          {/* Suggestions */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              { label: 'CNI:123456789', icon: 'id-card' },
              { label: 'DK 1234 AB', icon: 'car' },
              { label: 'NINEA:123456', icon: 'building' },
              { label: '77 123 45 67', icon: 'phone' },
              { label: 'matricule:12345', icon: 'user' },
              { label: 'Dupont', icon: 'search' }
            ].map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setSearchQuery(suggestion.label)}
                className="bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 px-4 py-2 rounded-lg text-sm transition-colors shadow-sm hover:shadow-md"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Résultats de recherche */}
      {searchResults.length > 0 && (
        <div className="grid gap-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-slate-900">
              Résultats de recherche ({searchResults.length} trouvés)
            </h3>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-md">
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-colors shadow-md">
                <Download className="w-4 h-4" />
                Export Excel
              </button>
            </div>
          </div>

          {searchResults.map((result, index) => (
            <div key={index} className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-all duration-200 hover:scale-[1.01]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                      {result.table}
                    </span>
                    <span className="text-slate-500 text-sm">
                      Base: {result.database}
                    </span>
                    {result.score > 0 && (
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                        Score: {result.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(result.preview).map(([key, value]) => (
                      <div key={key} className="flex flex-col">
                        <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                          {key}
                        </span>
                        <span className="text-sm font-medium text-slate-900 truncate mt-1">
                          {value || 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <button 
                  onClick={() => handleViewDetails(result)}
                  className="ml-4 flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-md"
                >
                  <Eye className="w-4 h-4" />
                  Détails
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const StatsPage = () => (
    <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} p-6 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen`}>
      {/* Métriques principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Recherches totales"
          value={stats.total_searches.toLocaleString()}
          icon={Search}
          color="blue"
        />
        <StatsCard
          title="Recherches aujourd'hui"
          value={stats.today_searches.toLocaleString()}
          icon={Database}
          color="indigo"
        />
        <StatsCard
          title="Utilisateurs actifs"
          value={stats.active_users.toLocaleString()}
          icon={Users}
          color="emerald"
        />
        <StatsCard
          title="Temps de réponse moyen"
          value={`${stats.avg_execution_time}ms`}
          icon={Clock}
          color="amber"
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Top 10 des tables consultées</h3>
          <div className="h-64 flex items-center justify-center bg-slate-50 rounded-lg">
            <div className="text-center">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">Graphique en barres</p>
              <p className="text-sm text-slate-400">Chart.js sera intégré ici</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Répartition des résultats par source</h3>
          <div className="h-64 flex items-center justify-center bg-slate-50 rounded-lg">
            <div className="text-center">
              <PieChart className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">Graphique en camembert</p>
              <p className="text-sm text-slate-400">Distribution des sources</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const UploadPage = () => (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          <Upload className="inline-block w-6 h-6 mr-2 text-blue-600" />
          Gestion des données
        </h2>
        <p className="text-gray-600">Importez vos données CSV dans les bases existantes ou créez de nouvelles bases.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire d'upload */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload de fichier CSV</h3>
            
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mode d'upload
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="uploadMode" value="existing" className="mr-3" defaultChecked />
                    <div>
                      <div className="font-medium text-gray-900">Base existante</div>
                      <div className="text-sm text-gray-500">Ajouter à une table existante</div>
                    </div>
                  </label>
                  <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="uploadMode" value="new" className="mr-3" />
                    <div>
                      <div className="font-medium text-gray-900">Nouvelle base</div>
                      <div className="text-sm text-gray-500">Créer une nouvelle table</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base de destination
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">Choisir une base...</option>
                  <option value="esolde.mytable">esolde - mytable</option>
                  <option value="rhpolice.personne_concours">rhpolice - personne_concours</option>
                  <option value="renseignement.agentfinance">renseignement - agentfinance</option>
                  <option value="autres.vehicules">autres - vehicules</option>
                  <option value="autres.entreprises">autres - entreprises</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fichier CSV
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <label className="cursor-pointer">
                      <span className="mt-2 block text-sm font-medium text-gray-900">
                        Cliquez pour sélectionner un fichier
                      </span>
                      <input type="file" className="hidden" accept=".csv" />
                    </label>
                    <p className="mt-1 text-sm text-gray-500">CSV jusqu'à 50MB</p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 px-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium"
              >
                <Upload className="inline-block w-4 h-4 mr-2" />
                Commencer l'upload
              </button>
            </form>
          </div>
        </div>

        {/* Informations et historique */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Guide d'upload</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start">
                <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                <span>Format CSV avec en-têtes</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                <span>Encodage UTF-8 recommandé</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                <span>Taille maximum : 50MB</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Historique récent</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">esolde_data.csv</div>
                  <div className="text-sm text-gray-500">Il y a 2 heures</div>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  Terminé
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const UsersPage = () => {
    const availableUsers = [
      { id: 'esolde.mytable', name: 'esolde - mytable', description: 'Données employés esolde' },
      { id: 'rhpolice.personne_concours', name: 'rhpolice - personne_concours', description: 'Concours police nationale' },
      { id: 'renseignement.agentfinance', name: 'renseignement - agentfinance', description: 'Agents finances publiques' },
      { id: 'rhgendarmerie.personne', name: 'rhgendarmerie - personne', description: 'Personnel gendarmerie' },
      { id: 'permis.tables', name: 'permis - tables', description: 'Permis de conduire' },
      { id: 'expresso.expresso', name: 'expresso - expresso', description: 'Données Expresso Money' },
      { id: 'elections.dakar', name: 'elections - dakar', description: 'Électeurs région Dakar' },
      { id: 'autres.Vehicules', name: 'autres - vehicules', description: 'Immatriculations véhicules' },
      { id: 'autres.entreprises', name: 'autres - entreprises', description: 'Registre des entreprises' }
    ];

    return (
    <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} p-6 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Gestion des utilisateurs</h2>
        <button
          onClick={() => setShowUserModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-md"
        >
          <Users className="w-4 h-4" />
          Nouvel utilisateur
        </button>
      </div>

      <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-900">Utilisateur</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-900">Rôle</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {user.login.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-900">{user.login}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.role === 'ADMIN' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingUser(user);
                          setShowPasswordModal(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Changer le mot de passe"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    );
  };

  const UserModal = () => (
    showUserModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900">Nouvel utilisateur</h3>
            <button
              onClick={() => setShowUserModal(false)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Login
              </label>
              <input
                type="text"
                value={newUser.login}
                onChange={(e) => setNewUser({ ...newUser, login: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Entrez le login"
              />
            </div>


            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Entrez le mot de passe (min. 8 caractères)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Rôle
              </label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'ADMIN' | 'USER' })}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="USER">Utilisateur simple</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowUserModal(false)}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleCreateUser}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-colors"
            >
              Créer
            </button>
          </div>
        </div>
      </div>
    )
  );

  const PasswordModal = () => (
    showPasswordModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900">
              Changer le mot de passe - {editingUser?.login}
            </h3>
            <button
              onClick={() => {
                setShowPasswordModal(false);
                setEditingUser(null);
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
              }}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Mot de passe actuel
              </label>
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Entrez le mot de passe actuel"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Entrez le nouveau mot de passe (min. 8 caractères)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Confirmez le nouveau mot de passe"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => {
                setShowPasswordModal(false);
                setEditingUser(null);
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
              }}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleChangePassword}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-colors"
            >
              Modifier
            </button>
          </div>
        </div>
      </div>
    )
  );

  const PlaceholderPage = ({ title, icon: Icon }: { title: string; icon: any }) => (
    <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} p-6 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen`}>
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Icon className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{title}</h2>
          <p className="text-slate-500">Cette section sera implémentée prochainement</p>
        </div>
      </div>
    </div>
  );

  if (!user) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Sidebar />
      <TopBar />
      
      <main>
        {currentPage === 'home' && <HomePage />}
        {currentPage === 'stats' && <StatsPage />}
        {currentPage === 'upload' && <UploadPage />}
        {currentPage === 'users' && <UsersPage />}
      </main>
      
      <UserModal />
      <PasswordModal />
    </div>
  );
}

export default App;