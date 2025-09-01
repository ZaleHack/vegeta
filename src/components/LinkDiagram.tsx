import React from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { X } from 'lucide-react';

interface GraphNode {
  id: string;
  type: string;
}

interface GraphLink {
  source: string;
  target: string;
  callCount: number;
  smsCount: number;
}

interface LinkDiagramProps {
  data: { nodes: GraphNode[]; links: GraphLink[] };
  onClose: () => void;
}

const LinkDiagram: React.FC<LinkDiagramProps> = ({ data, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-11/12 h-5/6 relative">
        <button
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
          onClick={onClose}
        >
          <X className="w-6 h-6" />
        </button>
        <ForceGraph2D
          graphData={data}
          nodeAutoColorBy="type"
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.id;
            const fontSize = 12 / globalScale;
            const radius = 8;
            ctx.beginPath();
            ctx.fillStyle = node.color || '#3b82f6';
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
            ctx.fill();
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#000';
            ctx.fillText(label, node.x, node.y + radius + 2);
          }}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            const radius = 8;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = color;
            ctx.fill();
          }}
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
      </div>
    </div>
  );
};

export default LinkDiagram;
