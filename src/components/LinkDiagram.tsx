import React, { useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { X } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-11/12 h-5/6 relative flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-blue-500 text-white">
          <h2 className="text-lg font-semibold">Diagramme des liens</h2>
          <button
            className="text-black hover:text-gray-800 dark:text-white dark:hover:text-gray-200"
            onClick={onClose}
          >
            <X className="w-6 h-6" />
          </button>
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
              const fontSize = 12 / globalScale;
              const radius = 8;
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
            linkWidth={(link: any) => 1 + Math.log(link.callCount + link.smsCount)}
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
              const fontSize = 10 / globalScale;
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
          <div className="absolute top-4 left-4 bg-white/80 dark:bg-gray-800/80 rounded-md shadow p-2 text-xs space-y-1">
            {nodeTypes.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: colorByType[type] }}
                ></span>
                <span className="capitalize text-gray-800 dark:text-gray-200">{type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkDiagram;
