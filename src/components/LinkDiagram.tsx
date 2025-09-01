import React from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { X, Link2 } from 'lucide-react';
import LinkDiagramLegend from './LinkDiagramLegend';

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

const LinkDiagram: React.FC<LinkDiagramProps> = ({ data, onClose }) => {
  const nodeTypes = Array.from(new Set(data.nodes.map((n) => n.type)));
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  const typeColorMap = Object.fromEntries(
    nodeTypes.map((type, i) => [type, palette[i % palette.length]])
  );

  const nodeAggregates: Record<string, { callCount: number; smsCount: number }> = {};
  data.links.forEach((l) => {
    const add = (id: string) => {
      if (!nodeAggregates[id]) nodeAggregates[id] = { callCount: 0, smsCount: 0 };
      nodeAggregates[id].callCount += l.callCount;
      nodeAggregates[id].smsCount += l.smsCount;
    };
    add(typeof l.source === 'object' ? l.source.id : l.source);
    add(typeof l.target === 'object' ? l.target.id : l.target);
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white/30 backdrop-blur-md rounded-2xl shadow-xl w-11/12 h-5/6 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-t-2xl shadow">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Diagramme des liens</h2>
          </div>
          <button
            className="text-white/80 hover:text-white"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 relative">
          <ForceGraph2D
            graphData={data}
            enableNodeDrag={true}
            onNodeDragEnd={(node: any) => {
              node.fx = node.x;
              node.fy = node.y;
            }}
            nodeLabel={(node: any) => {
              const agg = nodeAggregates[node.id] || { callCount: 0, smsCount: 0 };
              return `${node.id}\nType: ${node.type}\nAppels: ${agg.callCount}\nSMS: ${agg.smsCount}`;
            }}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const radius = 10;
              const color = typeColorMap[node.type] || '#888';
              const gradient = ctx.createRadialGradient(
                node.x,
                node.y,
                0,
                node.x,
                node.y,
                radius
              );
              gradient.addColorStop(0, '#ffffff');
              gradient.addColorStop(1, color);
              ctx.fillStyle = gradient;
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
              ctx.fill();
              ctx.shadowColor = color;
              ctx.shadowBlur = 10;
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.shadowBlur = 0;
              const icon =
                node.type === 'sms'
                  ? '💬'
                  : node.type === 'call'
                  ? '📞'
                  : '👤';
              ctx.font = `${10 / globalScale}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#000';
              ctx.fillText(icon, node.x, node.y);
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              const radius = 10;
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={(link: any) =>
              link.callCount >= link.smsCount ? '#3b82f6' : '#10b981'
            }
            linkDirectionalParticleColor={(link: any) =>
              link.callCount >= link.smsCount ? '#3b82f6' : '#10b981'
            }
            linkWidth={(link: any) => 1 + Math.log(link.callCount + link.smsCount)}
            linkDirectionalParticles={2}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={0.5}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link: any, ctx, globalScale) => {
              const start = link.source;
              const end = link.target;
              if (typeof start !== 'object' || typeof end !== 'object') return;
              const label = `${link.callCount} appels / ${link.smsCount} SMS`;
              const fontSize = 10 / globalScale;
              const textX = (start.x + end.x) / 2;
              const textY = (start.y + end.y) / 2;
              ctx.font = `${fontSize}px sans-serif`;
              ctx.fillStyle = 'rgba(0,0,0,0.6)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, textX, textY);
            }}
          />
          <LinkDiagramLegend
            className="absolute bottom-4 left-4"
            typeColorMap={typeColorMap}
          />
        </div>
      </div>
    </div>
  );
};

export default LinkDiagram;
