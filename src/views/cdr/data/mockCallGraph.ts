export interface MockCallEdge {
  from: string;
  to: string;
  duration: number;
  count: number;
}

export interface MockCallNode {
  id: string;
  label: string;
  type: 'suspect' | 'contact' | 'antenna';
}

export const MOCK_CALL_NODES: MockCallNode[] = [
  { id: 'N-001', label: '77 123 45 67', type: 'suspect' },
  { id: 'N-002', label: '78 555 11 22', type: 'contact' },
  { id: 'N-003', label: '70 987 65 43', type: 'contact' },
  { id: 'N-004', label: 'Antenne Dakar Plateau', type: 'antenna' }
];

export const MOCK_CALL_EDGES: MockCallEdge[] = [
  { from: 'N-001', to: 'N-002', duration: 132, count: 14 },
  { from: 'N-001', to: 'N-003', duration: 45, count: 4 },
  { from: 'N-002', to: 'N-004', duration: 300, count: 2 }
];
