import React from 'react';
import { MockCallEdge, MockCallNode } from '../data/mockCallGraph';
import { PhoneCall, Signal, Users } from 'lucide-react';

interface CallGraphSummaryProps {
  nodes: MockCallNode[];
  edges: MockCallEdge[];
}

const TYPE_STYLES: Record<MockCallNode['type'], string> = {
  suspect: 'bg-rose-500/20 text-rose-600 dark:bg-rose-500/10 dark:text-rose-200',
  contact: 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200',
  antenna: 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-200'
};

const CallGraphSummary: React.FC<CallGraphSummaryProps> = ({ nodes, edges }) => {
  const totalDuration = edges.reduce((sum, edge) => sum + edge.duration, 0);
  const totalCalls = edges.reduce((sum, edge) => sum + edge.count, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <header className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <Users className="h-4 w-4" /> Réseau de communication
        </header>
        <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          {nodes.map((node) => (
            <li key={node.id} className="flex items-center justify-between">
              <span className="font-medium">{node.label}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_STYLES[node.type]}`}>
                {node.type === 'suspect' ? 'Cible principale' : node.type === 'antenna' ? 'Antenne' : 'Contact'}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <header className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <PhoneCall className="h-4 w-4" /> Flux d’appels analysés
        </header>
        <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          {edges.map((edge) => (
            <li key={`${edge.from}-${edge.to}`} className="space-y-1">
              <div className="flex items-center justify-between">
                <span>
                  {edge.from} → {edge.to}
                </span>
                <span className="font-medium">{edge.count} appel{edge.count > 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Signal className="h-3 w-3" /> {Math.round(edge.duration / edge.count)} min en moyenne
              </div>
            </li>
          ))}
        </ul>
        <footer className="mt-4 flex items-center justify-between border-t border-dashed border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>{nodes.length} numéros connectés</span>
          <span>
            {totalCalls} appel{totalCalls > 1 ? 's' : ''} · {Math.round(totalDuration / 60)} minutes analysées
          </span>
        </footer>
      </div>
    </div>
  );
};

export default CallGraphSummary;
