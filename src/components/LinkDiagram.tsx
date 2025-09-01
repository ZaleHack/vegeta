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
      <div className="bg-white rounded-lg shadow-lg w-11/12 h-5/6 relative flex flex-col pt-10">
        <h2 className="absolute top-3 left-1/2 -translate-x-1/2 text-xl font-semibold">Diagramme des liens</h2>
        <button
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 z-10"
          onClick={onClose}
        >
          <X className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <ForceGraph2D
            graphData={data}
            nodeAutoColorBy="type"
            enableNodeDrag={true}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.id;
              const fontSize = 12 / globalScale;
              const radius = 8;
              const isDarkMode = document.documentElement.classList.contains('dark');
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
              ctx.fillStyle = node.color || (isDarkMode ? '#60a5fa' : '#3b82f6');
              ctx.fill();
              ctx.strokeStyle = isDarkMode ? '#fff' : '#000';
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
              const isDarkMode = document.documentElement.classList.contains('dark');
              ctx.font = `${fontSize}px sans-serif`;
              ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, textX, textY);
            }}
          />
        </div>
        <div className="h-1/3 overflow-y-auto p-4">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Source</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Cible</th>
                <th className="px-4 py-2 text-sm font-semibold text-gray-700">Appels</th>
                <th className="px-4 py-2 text-sm font-semibold text-gray-700">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.links.map((link, idx) => (
                <tr key={idx} className="hover:bg-gray-100">
                  <td className="px-4 py-2">
                    {typeof link.source === 'object' ? link.source.id : link.source}
                  </td>
                  <td className="px-4 py-2">
                    {typeof link.target === 'object' ? link.target.id : link.target}
                  </td>
                  <td className="px-4 py-2 text-center">{link.callCount}</td>
                  <td className="px-4 py-2 text-center">{link.smsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LinkDiagram;
