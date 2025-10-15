export interface DirectoryEntry {
  id: string;
  name: string;
  phone: string;
  category: 'gendarmerie' | 'ong' | 'entreprise';
  city: string;
}

export const MOCK_DIRECTORY: DirectoryEntry[] = [
  {
    id: 'G-001',
    name: 'Brigade de Dakar Plateau',
    phone: '+221 33 822 24 12',
    category: 'gendarmerie',
    city: 'Dakar'
  },
  {
    id: 'G-002',
    name: 'Brigade de Saint-Louis',
    phone: '+221 33 961 11 22',
    category: 'gendarmerie',
    city: 'Saint-Louis'
  },
  {
    id: 'O-101',
    name: 'SOS Villages Enfants',
    phone: '+221 33 867 19 19',
    category: 'ong',
    city: 'Dakar'
  },
  {
    id: 'E-501',
    name: 'Sonatel',
    phone: '+221 33 839 13 13',
    category: 'entreprise',
    city: 'Dakar'
  }
];
