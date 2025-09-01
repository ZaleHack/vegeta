import React from 'react';

interface LegendProps {
  typeColorMap: Record<string, string>;
  className?: string;
}

const LinkDiagramLegend: React.FC<LegendProps> = ({ typeColorMap, className = '' }) => {
  return (
    <div className={`bg-white/80 p-3 rounded-lg shadow text-xs ${className}`}>
      <div className="mb-2 font-semibold">Types de nœuds</div>
      <div className="space-y-1">
        {Object.entries(typeColorMap).map(([type, color]) => (
          <div key={type} className="flex items-center space-x-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            ></span>
            <span>{type}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 mb-2 font-semibold">Liens</div>
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
          <span>Appels</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-green-500"></span>
          <span>SMS</span>
        </div>
      </div>
    </div>
  );
};

export default LinkDiagramLegend;
