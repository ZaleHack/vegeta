import React, { useMemo, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Maximize2, Minimize2, X } from 'lucide-react';

interface GraphNode {
  id: string;
  type: string;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  callCount: number;
  smsCount: number;
}

interface LinkDiagramProps {
  data: { nodes: GraphNode[]; links: GraphLink[] };
  onClose: () => void;
}

const typePalette = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6'
];

const LinkDiagram: React.FC<LinkDiagramProps> = ({ data, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const nodeTypes = useMemo(() => Array.from(new Set(data.nodes.map((n) => n.type))), [data]);

  const colorByType = useMemo(() => {
    const map: Record<string, string> = {};
    nodeTypes.forEach((type, idx) => {
      map[type] = typePalette[idx % typePalette.length];
    });
    return map;
  }, [nodeTypes]);

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n, color: colorByType[n.type] })),
      links: data.links
    }),
    [data, colorByType]
  );

  const overlayClasses = `fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 ${
    isFullscreen ? '' : 'p-4'
  }`;
  const containerClasses = `bg-white dark:bg-gray-900 ${
    isFullscreen ? 'rounded-none' : 'rounded-2xl'
  } shadow-2xl w-[92vw] max-w-6xl ${isFullscreen ? 'h-full w-full max-w-none' : 'h-[82vh]'} relative flex flex-col overflow-hidden`;

  return (
    <div className={overlayClasses}>
      <div className={containerClasses}>
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
          <div>
            <h2 className="text-xl font-semibold">Diagramme des liens</h2>
            <p className="text-sm text-white/80">Visualisez les interactions entre les correspondants sélectionnés.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFullscreen((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/50 bg-white/20 text-white transition hover:bg-white/30"
              aria-label={isFullscreen ? 'Réduire le diagramme' : 'Agrandir le diagramme'}
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/50 bg-white/20 text-white transition hover:bg-white/30"
              onClick={() => {
                setIsFullscreen(false);
                onClose();
              }}
              aria-label="Fermer le diagramme"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 relative">
          <ForceGraph2D
            graphData={graphData}
            enableNodeDrag={true}
            onNodeDragStart={(node: any) => {
              node.fx = node.x;
              node.fy = node.y;
            }}
            onNodeDrag={(node: any) => {
              node.fx = node.x;
              node.fy = node.y;
            }}
            onNodeDragEnd={(node: any) => {
              node.fx = node.x;
              node.fy = node.y;
            }}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.id;
              const fontSize = Math.max(12 / globalScale, 10);
              const radius = Math.max(10, 18 / globalScale);
              const isDarkMode = document.documentElement.classList.contains('dark');
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
              ctx.fillStyle = node.color;
              ctx.fill();
              ctx.strokeStyle = isDarkMode ? '#374151' : '#e5e7eb';
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.font = `${fontSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = isDarkMode ? '#fff' : '#000';
              ctx.fillText(label, node.x, node.y + radius + 4);
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              const radius = 8;
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={() =>
              document.documentElement.classList.contains('dark')
                ? '#93c5fd'
                : '#2563eb'
            }
            linkDirectionalArrowColor={() =>
              document.documentElement.classList.contains('dark')
                ? '#93c5fd'
                : '#2563eb'
            }
            linkWidth={(link: any) => 1.5 + Math.log(link.callCount + link.smsCount)}
            linkDirectionalParticles={2}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalArrowLength={6}
            // Position arrows near targets so call/SMS labels remain unobstructed
            linkDirectionalArrowRelPos={0.9}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link: any, ctx, globalScale) => {
              const start = link.source;
              const end = link.target;
              if (typeof start !== 'object' || typeof end !== 'object') return;
              const label = `${link.callCount} appels / ${link.smsCount} SMS`;
              const fontSize = Math.max(11 / globalScale, 9);
              const textX = (start.x + end.x) / 2;
              const textY = (start.y + end.y) / 2;
              const isDarkMode = document.documentElement.classList.contains('dark');
              ctx.font = `${fontSize}px sans-serif`;
              ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, textX, textY);
            }}
          />
          <div className="absolute top-4 left-4 bg-white/85 dark:bg-gray-800/85 rounded-xl shadow p-3 text-sm space-y-2">
            {nodeTypes.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: colorByType[type] }}
                ></span>
                <span className="capitalize font-medium text-gray-800 dark:text-gray-200">{type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkDiagram;
