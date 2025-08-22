import React, { useState, useEffect } from 'react';
import { Search, Database, Users, Settings, LogOut, User, Plus, Edit, Trash2, Key, Eye, EyeOff, Download } from 'lucide-react';

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
      // Collecter tous les champs uniques
      const allFields = new Set<string>();
      searchResults.hits.forEach(hit => {
        Object.keys(hit.preview).forEach(field => allFields.add(field));
      });

      const fields = ['Source', 'Base', 'Score', ...Array.from(allFields)];
      
      // Créer le contenu CSV
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

      // Télécharger le fichier
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

      if (response.ok) {
        alert('Utilisateur créé avec succès');
        setShowUserModal(false);
        setUserFormData({ login: '', password: '', admin: 0 });
        setEditingUser(null);
        loadUsers();
      } else {
        alert(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
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
    if (currentPage === 'users' && currentUser?.admin === 1) {
      loadUsers();
    }
  }, [currentPage, currentUser]);

  // Page de connexion
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <Database className="mx-auto h-12 w-12 text-blue-600" />
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">VEGETA</h2>
            <p className="mt-2 text-sm text-gray-600">Plateforme de recherche professionnelle</p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="space-y-4">
              <div>
                <label htmlFor="login" className="block text-sm font-medium text-gray-700">
                  Nom d'utilisateur
                </label>
                <input
                  id="login"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={loginData.login}
                  onChange={(e) => setLoginData({ ...loginData, login: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6">
          <div className="flex items-center">
            <Database className="h-8 w-8 text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">VEGETA</span>
          </div>
        </div>
        
        <nav className="mt-6">
          <div className="px-3">
            <button
              onClick={() => setCurrentPage('search')}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                currentPage === 'search'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Search className="mr-3 h-5 w-5" />
              Recherche
            </button>
            
            {currentUser && currentUser.admin === 1 && (
              <button
                onClick={() => setCurrentPage('users')}
                className={`w-full flex items-center px-3 py-2 mt-1 text-sm font-medium rounded-md ${
                  currentPage === 'users'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Users className="mr-3 h-5 w-5" />
                Utilisateurs
              </button>
            )}
          </div>
        </nav>

        {/* User info */}
        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200">
          <div className="flex items-center">
            <User className="h-8 w-8 text-gray-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700">{currentUser?.login}</p>
              <p className="text-xs text-gray-500">
                {currentUser && currentUser.admin === 1 ? 'Administrateur' : 'Utilisateur'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex space-x-2">
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
            >
              <Key className="w-3 h-3 inline mr-1" />
              Mot de passe
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded"
            >
              <LogOut className="w-3 h-3 inline mr-1" />
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {currentPage === 'search' && (
            <div className="space-y-6">
              {/* Barre de recherche */}
              <div className="bg-white shadow rounded-lg p-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                  Recherche Unifiée VEGETA
                </h1>
                
                <form onSubmit={handleSearch} className="space-y-4">
                  <div className="flex space-x-4">
                    <input
                      type="text"
                      placeholder="Entrez votre recherche (CNI, nom, téléphone, immatriculation...)"
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 flex items-center"
                    >
                      <Search className="w-5 h-5 mr-2" />
                      {loading ? 'Recherche...' : 'Rechercher'}
                    </button>
                  </div>
                </form>

                {/* Suggestions */}
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">Suggestions :</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'CNI', example: 'CNI: 123456789' },
                      { label: 'Immatriculation', example: 'DK 1234 AB' },
                      { label: 'NINEA', example: 'NINEA: 123456' },
                      { label: 'Téléphone', example: '77 123 45 67' }
                    ].map((suggestion) => (
                      <button
                        key={suggestion.label}
                        onClick={() => setSearchQuery(suggestion.example)}
                        className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Erreur de recherche */}
              {searchError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {searchError}
                </div>
              )}

              {/* Résultats */}
              {searchResults && (
                <div className="bg-white shadow rounded-lg">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">
                        Résultats de recherche
                      </h2>
                      <p className="text-sm text-gray-500">
                        {searchResults.total} résultat(s) trouvé(s) en {searchResults.elapsed_ms}ms
                      </p>
                    </div>
                    
                    {searchResults.hits.length > 0 && (
                      <button
                        onClick={exportToCSV}
                        className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export Excel
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Source
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Base
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Score
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Aperçu
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {searchResults.hits.map((result, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {result.table}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {result.database}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {result.score.toFixed(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="space-y-1">
                                {Object.entries(result.preview).slice(0, 3).map(([key, value]) => (
                                  <div key={key} className="flex">
                                    <span className="font-medium text-gray-600 mr-2">{key}:</span>
                                    <span className="text-gray-900">{String(value)}</span>
                                  </div>
                                ))}
                                {Object.keys(result.preview).length > 3 && (
                                  <div className="text-xs text-gray-500">
                                    +{Object.keys(result.preview).length - 3} autres champs
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {searchResults.hits.length === 0 && (
                    <div className="text-center py-12">
                      <Search className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun résultat</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Essayez avec d'autres termes de recherche.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentPage === 'users' && currentUser?.admin === 1 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Gestion des utilisateurs</h1>
                <button
                  onClick={openCreateModal}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nouvel utilisateur
                </button>
              </div>

              <div className="bg-white shadow rounded-lg overflow-hidden">
                {users.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun utilisateur</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Commencez par créer un nouvel utilisateur.
                    </p>
                  </div>
                ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Login
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rôle
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Créé le
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {user.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {user.login}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.admin === 1 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {user.admin === 1 ? 'Administrateur' : 'Utilisateur'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(user.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {user.id !== currentUser?.id && (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal utilisateur */}
      {showUserModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
              </h3>
              
              <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Login</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={userFormData.login}
                    onChange={(e) => setUserFormData({ ...userFormData, login: e.target.value })}
                  />
                </div>

                {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={userFormData.password}
                      onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    />
                    <p className="mt-1 text-sm text-gray-500">Minimum 6 caractères</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">Rôle</label>
                  <select
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                  >
                    {loading ? 'Enregistrement...' : (editingUser ? 'Modifier' : 'Créer')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal changement de mot de passe */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Changer le mot de passe
              </h3>
              
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Mot de passe actuel</label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      required
                      className="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={passwordFormData.currentPassword}
                      onChange={(e) => setPasswordFormData({ ...passwordFormData, currentPassword: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                    >
                      {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Nouveau mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      required
                      minLength={6}
                      className="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={passwordFormData.newPassword}
                      onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                    >
                      {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">Minimum 6 caractères</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirmer le nouveau mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      required
                      minLength={6}
                      className="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={passwordFormData.confirmPassword}
                      onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                    >
                      {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                  >
                    {loading ? 'Modification...' : 'Changer le mot de passe'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;