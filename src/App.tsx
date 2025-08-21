import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Phone, MapPin, Briefcase, Calendar, Filter, X, ChevronDown } from 'lucide-react';

const AVAILABLE_FIELDS = [
  'nom', 'prenom', 'cni', 'sexe', 'datenaiss', 'lieunaissance', 'nationalite',
  'telephone', 'email', 'adresse', 'ville', 'region', 'commune', 'quartier',
  'matricule', 'corps', 'grade', 'emploi', 'direction', 'service', 'poste',
  'Numero_Immatriculation', 'NumeroPermis', 'Marque', 'Modele', 'Couleur',
  'ninea_ninet', 'raison_social', 'forme_juridique', 'secteur_activite',
  'age', 'date', 'salaire', 'anciennete', 'statut'
];

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef(null);

  const searchSuggestions = [
    { query: 'nom:Dupont AND prenom:Jean', description: 'Recherche Jean Dupont' },
    { query: 'telephone:77 OR telephone:76', description: 'Numéros 77xxx ou 76xxx' },
    { query: 'corps:police AND grade:commissaire', description: 'Commissaires de police' },
    { query: 'region:Dakar NOT commune:Pikine', description: 'Dakar sauf Pikine' },
    { query: '"Ministère des Finances"', description: 'Expression exacte' },
    { query: 'matricule:123 AND NOT sexe:F', description: 'Matricule 123 mais pas femme' },
    { query: 'ville:Dakar OR ville:Thies', description: 'Dakar ou Thiès' },
    { query: 'corps:gendarmerie AND grade:lieutenant', description: 'Lieutenants de gendarmerie' },
    { query: 'CNI:123456789', description: 'Recherche par CNI spécifique' }
  ];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputRef.current && !inputRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const detectFieldInput = (query, position) => {
    const beforeCursor = query.substring(0, position);
    const words = beforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1];
    
    // Check if we're typing a field name (no colon yet)
    if (currentWord && !currentWord.includes(':') && currentWord.length > 0) {
      const matchingFields = AVAILABLE_FIELDS.filter(field => 
        field.toLowerCase().startsWith(currentWord.toLowerCase())
      );
      
      if (matchingFields.length > 0) {
        return {
          isFieldInput: true,
          currentWord,
          matchingFields,
          startPosition: beforeCursor.lastIndexOf(currentWord)
        };
      }
    }
    
    return { isFieldInput: false };
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    const position = e.target.selectionStart;
    
    setSearchQuery(value);
    setCursorPosition(position);
    
    const fieldDetection = detectFieldInput(value, position);
    
    if (fieldDetection.isFieldInput) {
      setSuggestions(fieldDetection.matchingFields);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleFieldSelect = (field) => {
    const fieldDetection = detectFieldInput(searchQuery, cursorPosition);
    
    if (fieldDetection.isFieldInput) {
      const beforeField = searchQuery.substring(0, fieldDetection.startPosition);
      const afterField = searchQuery.substring(fieldDetection.startPosition + fieldDetection.currentWord.length);
      const newQuery = beforeField + field + ':' + afterField;
      
      setSearchQuery(newQuery);
      setShowSuggestions(false);
      
      // Focus back to input and position cursor after the colon
      setTimeout(() => {
        if (inputRef.current) {
          const newPosition = fieldDetection.startPosition + field.length + 1;
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 0);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/search', {
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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !showSuggestions) {
      handleSearch();
    }
  };

  const useSuggestion = (suggestion) => {
    setSearchQuery(suggestion.query);
    setShowSuggestions(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Recherche Avancée
          </h1>
          <p className="text-gray-600">
            Système de recherche avec combinaison de critères
          </p>
        </div>

        {/* Search Section */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            {/* Search Input */}
            <div className="relative mb-4" ref={inputRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder="Tapez votre recherche... (ex: nom:Dupont AND prenom:Jean)"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                />
              </div>
              
              {/* Field Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map((field, index) => (
                    <div
                      key={index}
                      onClick={() => handleFieldSelect(field)}
                      className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <span className="font-medium text-blue-600">{field}:</span>
                      <span className="text-gray-500 ml-2 text-sm">Champ de recherche</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={handleSearch}
                disabled={isLoading || !searchQuery.trim()}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Search className="w-4 h-4" />
                {isLoading ? 'Recherche...' : 'Rechercher'}
              </button>
              
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Filter className="w-4 h-4" />
                Guide
                <ChevronDown className={`w-4 h-4 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Quick Suggestions */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Suggestions rapides :</h3>
              <div className="flex flex-wrap gap-2">
                {searchSuggestions.slice(0, 6).map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => useSuggestion(suggestion)}
                    className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors"
                    title={suggestion.description}
                  >
                    {suggestion.query}
                  </button>
                ))}
              </div>
            </div>

            {/* Guide Section */}
            {showGuide && (
              <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-500">
                <h3 className="font-semibold text-gray-800 mb-3">Guide de recherche avancée</h3>
                
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Opérateurs logiques :</h4>
                    <div><strong>ET :</strong> <code>nom:Dupont AND prenom:Jean</code></div>
                    <div><strong>OU :</strong> <code>telephone:77 OR telephone:76</code></div>
                    <div><strong>NON :</strong> <code>Dupont NOT Marie</code></div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Types de recherche :</h4>
                    <div><strong>Expression exacte :</strong> <code>"Jean Pierre Dupont"</code></div>
                    <div><strong>Champ ciblé :</strong> <code>CNI:123456789</code></div>
                    <div><strong>Comparaisons :</strong> <code>age{'>'}=25</code>, <code>date{'>'}2020</code></div>
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="font-medium text-gray-700 mb-2">Exemples complets :</h4>
                  <div className="space-y-1 text-xs">
                    {searchSuggestions.slice(6).map((suggestion, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <code className="bg-white px-2 py-1 rounded text-blue-600">{suggestion.query}</code>
                        <span className="text-gray-600">→ {suggestion.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        {searchResults.length > 0 && (
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b">
                <h2 className="text-xl font-semibold text-gray-800">
                  Résultats de recherche ({searchResults.length})
                </h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <User className="w-4 h-4 inline mr-2" />
                        Identité
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Phone className="w-4 h-4 inline mr-2" />
                        Contact
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <MapPin className="w-4 h-4 inline mr-2" />
                        Localisation
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Briefcase className="w-4 h-4 inline mr-2" />
                        Profession
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {searchResults.map((result, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {result.nom} {result.prenom}
                          </div>
                          <div className="text-sm text-gray-500">
                            CNI: {result.cni || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {result.telephone || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {result.email || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {result.ville || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {result.region || 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {result.corps || result.emploi || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {result.grade || result.poste || 'N/A'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* No Results */}
        {searchResults.length === 0 && searchQuery && !isLoading && (
          <div className="max-w-4xl mx-auto text-center">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Aucun résultat trouvé
              </h3>
              <p className="text-gray-600">
                Essayez de modifier vos critères de recherche ou utilisez les suggestions.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;