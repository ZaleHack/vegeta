import React, { useState, useEffect } from 'react';
import { Search, Database, Users, Settings, LogOut, User, Plus, Edit, Trash2, Key, Eye, EyeOff, Download, Menu, X, Shield, UserCheck, Clock, Activity } from 'lucide-react';

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

const App: React.FC = () => {
  // États principaux
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('login');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  // États des statistiques
  const [statsData, setStatsData] = useState(null);
  const [searchLogs, setSearchLogs] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);

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
    
    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      alert('Les nouveaux mots de passe ne correspondent pas');
      return;
    }

    if (passwordFormData.newPassword.length < 6) {
      alert('Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${currentUser?.id}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwordFormData.currentPassword,
          newPassword: passwordFormData.newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Mot de passe modifié avec succès');
        setShowPasswordModal(false);
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

  // Charger les utilisateurs quand on accède à la page
  useEffect(() => {
    if (currentPage === 'users' && currentUser && (currentUser.admin === 1 || currentUser.admin === "1")) {
      loadUsers();
    }
  }, [currentPage, currentUser]);

  // Vérifier si l'utilisateur est admin
  const isAdmin = currentUser && (currentUser.admin === 1 || currentUser.admin === "1");

  // Page de connexion
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-72' : 'w-20'} bg-white shadow-xl transition-all duration-300 flex flex-col`}>
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${!sidebarOpen && 'justify-center'}`}>
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg">
                <Database className="h-6 w-6 text-white" />
              </div>
              {sidebarOpen && (
                <div className="ml-3">
                  <h1 className="text-xl font-bold text-gray-900">VEGETA</h1>
                  <p className="text-xs text-gray-500">Recherche Pro</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
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
            
            {isAdmin && (
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
                onClick={() => setShowPasswordModal(true)}
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
                <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          Résultats de recherche
                        </h2>
                        <div className="flex items-center mt-2 space-x-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            <Activity className="w-4 h-4 mr-1" />
                            {searchResults.total} résultat(s)
                          </span>
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                            <Clock className="w-4 h-4 mr-1" />
                            {searchResults.elapsed_ms}ms
                          </span>
                        </div>
                      </div>
                      
                      {searchResults.hits.length > 0 && (
                        <button
                          onClick={exportToCSV}
                          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export Excel
                        </button>
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
                      <div className="p-6">
                        <div className="grid gap-6">
                          {searchResults.hits.map((result, index) => (
                            <div key={index} className="bg-gradient-to-r from-white to-gray-50 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-300 hover:border-blue-300">
                              {/* Header de la carte */}
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center space-x-3">
                                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg">
                                    <Database className="w-5 h-5 text-white" />
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-semibold text-gray-900">{result.table}</h3>
                                    <p className="text-sm text-gray-500">Base: {result.database}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
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
                                    <div key={key} className="bg-white rounded-lg p-3 border border-gray-100 hover:border-blue-200 transition-colors">
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
                              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                                <div className="text-xs text-gray-500">
                                  {Object.keys(result.preview).filter(key => 
                                    result.preview[key] && result.preview[key] !== '' && 
                                    result.preview[key] !== null && result.preview[key] !== undefined
                                  ).length} champs disponibles
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
                                  className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
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