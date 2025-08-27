import React from 'react';

interface SearchResult {
  table: string;
  database: string;
  preview: Record<string, any>;
  score: number;
}

interface GraphProps {
  hits: SearchResult[];
  query: string;
}

const SearchResultGraph: React.FC<GraphProps> = ({ hits, query }) => {
  const width = 600;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;

  const nodes = hits.map((hit, index) => {
    const angle = (2 * Math.PI * index) / hits.length;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    return { x, y, hit };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} className="mx-auto">
        <circle cx={centerX} cy={centerY} r={30} fill="#4f46e5" />
        <text
          x={centerX}
          y={centerY + 5}
          textAnchor="middle"
          className="text-white text-sm"
        >
          {query || 'Recherche'}
        </text>
        {nodes.map((n, i) => (
          <g key={i}>
            <line x1={centerX} y1={centerY} x2={n.x} y2={n.y} stroke="#94a3b8" />
            <circle cx={n.x} cy={n.y} r={20} fill="#6366f1" />
            <text
              x={n.x}
              y={n.y + 5}
              textAnchor="middle"
              className="text-white text-xs"
            >
              {n.hit.table}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export default SearchResultGraph;

