export interface MockSearchResult {
  id: string;
  name: string;
  phone: string;
  division: string;
  lastSeen: string;
  tags: string[];
}

export const MOCK_SEARCH_RESULTS: MockSearchResult[] = [
  {
    id: 'SR-2024-001',
    name: 'Awa Diop',
    phone: '+221 77 123 45 67',
    division: 'Cybercriminalité',
    lastSeen: '2024-04-14T09:45:00Z',
    tags: ['appels', 'fraude', 'western union']
  },
  {
    id: 'SR-2024-002',
    name: 'Mamadou Ndiaye',
    phone: '+221 70 987 65 43',
    division: 'Analyse financière',
    lastSeen: '2024-04-13T17:21:00Z',
    tags: ['transferts', 'banque']
  },
  {
    id: 'SR-2024-003',
    name: 'Fatou Sarr',
    phone: '+221 78 555 11 22',
    division: 'Renseignement',
    lastSeen: '2024-04-12T21:07:00Z',
    tags: ['messagerie', 'whatsapp']
  }
];
