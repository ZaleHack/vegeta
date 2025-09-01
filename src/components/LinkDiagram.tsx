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
          nodeLabel={(node: any) => node.id}
          nodeAutoColorBy="type"
          linkWidth={(link: any) => 1 + Math.log(link.callCount + link.smsCount)}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.005}
        />
      </div>
    </div>
  );
};

export default LinkDiagram;
