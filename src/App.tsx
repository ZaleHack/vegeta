import React, { useState, useEffect } from 'react';
import { Search, Database, Users, BarChart3, FileText, User, Phone, MapPin, Building, Car, CreditCard, Calendar, Mail, Hash, Shield, Award, Briefcase, Globe, Home, ChevronDown } from 'lucide-react';

interface SearchResult {
  [key: string]: any;
}

interface Stats {
  totalRecords: number;
  totalTables: number;
  recentSearches: number;
}

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({ totalRecords: 0, totalTables: 0, recentSearches: 0 });
  const [showGuide, setShowGuide] = useState(false);
  const [fieldSuggestions, setFieldSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Liste des champs disponibles pour l'autocomplétion
  const availableFields = [
    'nom', 'prenom', 'cni', 'sexe', 'datenaiss', 'lieunaiss', 'telephone', 'email', 'adresse',
    'ville', 'region', 'commune', 'departement', 'matricule', 'corps', 'grade', 'emploi',
    'direction', 'service', 'poste', 'statut', 'dateentree', 'datesortie', 'salaire',
    'Numero_Immatriculation', 'NumeroPermis', 'Marque', 'Modele', 'Couleur', 'TypeVehicule',
    'DateImmatriculation', 'ninea_ninet', 'raison_social', 'forme_juridique', 'secteur_activite',
    'adresse_entreprise', 'telephone_entreprise', 'email_entreprise', 'date_creation',
    'capital_social', 'numero_compte', 'banque', 'type_compte', 'solde', 'date_ouverture',
    'statut_compte', 'numero_passeport', 'date_delivrance', 'lieu_delivrance', 'date_expiration',
    'nationalite', 'profession', 'situation_matrimoniale', 'nombre_enfants'
  ];

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery }),
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      } else {
        console.error('Erreur de recherche');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;
    
    setSearchQuery(value);
    setCursorPosition(position);

    // Détecter si l'utilisateur tape un nom de champ
    const beforeCursor = value.substring(0, position);
    const words = beforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1];

    if (currentWord && !currentWord.includes(':') && currentWord.length > 0) {
      const suggestions = availableFields.filter(field => 
        field.toLowerCase().includes(currentWord.toLowerCase())
      );
      
      if (suggestions.length > 0) {
        setFieldSuggestions(suggestions);
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleFieldSelect = (field: string) => {
    const beforeCursor = searchQuery.substring(0, cursorPosition);
    const afterCursor = searchQuery.substring(cursorPosition);
    const words = beforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1];
    
    // Remplacer le mot actuel par le champ sélectionné
    const newBeforeCursor = beforeCursor.substring(0, beforeCursor.length - currentWord.length) + field + ':';
    const newQuery = newBeforeCursor + afterCursor;
    
    setSearchQuery(newQuery);
    setShowSuggestions(false);
    
    // Remettre le focus sur l'input
    setTimeout(() => {
      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.setSelectionRange(newBeforeCursor.length, newBeforeCursor.length);
      }
    }, 0);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const formatFieldName = (fieldName: string): string => {
    return fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const renderFieldValue = (key: string, value: any) => {
    if (!value || value === '' || value === null || value === undefined) return null;
    
    // Exclure l'ID technique
    if (key.toLowerCase() === 'id') return null;

    return (
      <div key={key} className="bg-gray-50 p-3 rounded-lg">
        <div className="text-sm font-medium text-gray-600 mb-1">
          {formatFieldName(key)}
        </div>
        <div className="text-gray-900 break-words">
          {value}
        </div>
      </div>
    );
  };

  const searchSuggestions = [
    { query: 'nom:Dupont AND prenom:Jean', tooltip: 'Recherche une personne spécifique' },
    { query: 'telephone:77 OR telephone:76', tooltip: 'Numéros commençant par 77 ou 76' },
    { query: 'corps:police AND grade:commissaire', tooltip: 'Commissaires de police' },
    { query: 'region:Dakar NOT commune:Pikine', tooltip: 'Dakar sauf Pikine' },
    { query: '"Ministère des Finances"', tooltip: 'Expression exacte' },
    { query: 'matricule:123 AND NOT sexe:F', tooltip: 'Matricule 123 mais pas femme' },
    { query: 'ville:Dakar OR ville:Thies', tooltip: 'Dakar ou Thiès' },
    { query: 'corps:gendarmerie AND grade:lieutenant', tooltip: 'Lieutenants de gendarmerie' },
    { query: 'Dupont NOT Marie', tooltip: 'Dupont mais pas Marie' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-2 rounded-lg">
                <Database className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">VEGETA</h1>
                <p className="text-sm text-gray-600">Plateforme de Recherche Avancée</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <Users className="h-4 w-4" />
                  <span>{stats.totalRecords.toLocaleString()} enregistrements</span>
                </div>
                <div className="flex items-center space-x-1">
                  <FileText className="h-4 w-4" />
                  <span>{stats.totalTables} tables</span>
                </div>
                <div className="flex items-center space-x-1">
                  <BarChart3 className="h-4 w-4" />
                  <span>{stats.recentSearches} recherches récentes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Recherche Intelligente</h2>
            <p className="text-gray-600">Utilisez des opérateurs logiques pour des recherches précises</p>
          </div>

          {/* Search Input */}
          <div className="relative max-w-4xl mx-auto mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Tapez votre recherche... (ex: nom:Dupont AND ville:Dakar)"
                className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              />
              
              {/* Suggestions d'autocomplétion */}
              {showSuggestions && fieldSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {fieldSuggestions.map((field, index) => (
                    <button
                      key={index}
                      onClick={() => handleFieldSelect(field)}
                      className="w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                    >
                      <span className="font-medium text-blue-600">{field}:</span>
                      <span className="text-gray-500 ml-2">{formatFieldName(field)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-center mt-4 space-x-4">
              <button
                onClick={handleSearch}
                disabled={isLoading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Recherche...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5" />
                    <span>Rechercher</span>
                  </>
                )}
              </button>
              
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 flex items-center space-x-2"
              >
                <FileText className="h-5 w-5" />
                <span>Guide</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Search Suggestions */}
          <div className="max-w-4xl mx-auto mb-6">
            <p className="text-sm text-gray-600 mb-3">Exemples de recherches :</p>
            <div className="flex flex-wrap gap-2">
              {searchSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setSearchQuery(suggestion.query)}
                  className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm hover:bg-blue-100 transition-colors duration-200"
                  title={suggestion.tooltip}
                >
                  {suggestion.query}
                </button>
              ))}
            </div>
          </div>

          {/* Guide Section */}
          {showGuide && (
            <div className="max-w-4xl mx-auto bg-gray-50 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Guide de Recherche Avancée</h3>
              <div className="grid md:grid-cols-2 gap-6 text-sm">
                <div>
                  <h4 className="font-medium text-gray-800 mb-2">Opérateurs Logiques</h4>
                  <div><strong>AND :</strong> <code>nom:Dupont AND prenom:Jean</code></div>
                  <div><strong>OR :</strong> <code>telephone:77 OR telephone:76</code></div>
                  <div><strong>NOT :</strong> <code>Dupont NOT Marie</code></div>
                </div>
                <div>
                  <h4 className="font-medium text-gray-800 mb-2">Types de Recherche</h4>
                  <div><strong>Expression exacte :</strong> <code>"Jean Pierre Dupont"</code></div>
                  <div><strong>Champ ciblé :</strong> <code>CNI:123456789</code></div>
                  <div><strong>Comparaisons :</strong> <code>age{'>'}=25</code>, <code>date{'>'} 2020</code></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        {searchResults.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">
                Résultats de recherche
              </h3>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-6">
              {searchResults.map((result, index) => (
                <div key={index} className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-900">
                      Enregistrement #{index + 1}
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Object.entries(result).map(([key, value]) => 
                      renderFieldValue(key, value)
                    ).filter(Boolean)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Results */}
        {searchResults.length === 0 && searchQuery && !isLoading && (
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-gray-400 mb-4">
              <Search className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Aucun résultat trouvé</h3>
            <p className="text-gray-600">Essayez de modifier vos critères de recherche ou utilisez des termes plus généraux.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;