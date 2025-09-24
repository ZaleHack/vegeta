import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { GitBranch, Maximize2, Minimize2, Network, X } from 'lucide-react';
import { forceLink, forceManyBody } from 'd3-force';
import type { ForceLink } from 'd3-force';

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

type ViewMode = 'network' | 'hierarchical';

interface NormalizedNode extends GraphNode {
  color: string;
  degree: number;
  val: number;
}

interface NormalizedLink extends GraphLink {
  source: string;
  target: string;
  synthetic?: boolean;
}

const LinkDiagram: React.FC<LinkDiagramProps> = ({ data, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('network');
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const graphRef = useRef<ForceGraphMethods | null>(null);
  const nodeTypes = useMemo(() => Array.from(new Set(data.nodes.map((n) => n.type))), [data]);

  const colorByType = useMemo(() => {
    const map: Record<string, string> = {};
    nodeTypes.forEach((type, idx) => {
      map[type] = typePalette[idx % typePalette.length];
    });
    return map;
  }, [nodeTypes]);

  const degreeByNode = useMemo(() => {
    const map: Record<string, number> = {};
    const normalize = (value: string | GraphNode) => (typeof value === 'string' ? value : value.id);
    data.links.forEach((link) => {
      const source = normalize(link.source);
      const target = normalize(link.target);
      map[source] = (map[source] || 0) + 1;
      map[target] = (map[target] || 0) + 1;
    });
    return map;
  }, [data.links]);

  const graphNodes: NormalizedNode[] = useMemo(
    () =>
      data.nodes.map((node) => ({
        ...node,
        color: colorByType[node.type],
        degree: degreeByNode[node.id] || 0,
        val: Math.max(1, degreeByNode[node.id] || 1)
      })),
    [data.nodes, colorByType, degreeByNode]
  );

  const graphLinks: NormalizedLink[] = useMemo(() => {
    const normalize = (value: string | GraphNode) => (typeof value === 'string' ? value : value.id);
    return data.links.map((link) => ({
      ...link,
      source: normalize(link.source),
      target: normalize(link.target)
    }));
  }, [data.links]);

  const defaultRoot = useMemo(() => {
    if (graphNodes.length === 0) return null;
    const sorted = [...graphNodes].sort((a, b) => b.degree - a.degree);
    return sorted[0]?.id ?? null;
  }, [graphNodes]);

  useEffect(() => {
    if (!selectedRoot || !graphNodes.some((node) => node.id === selectedRoot)) {
      setSelectedRoot(defaultRoot);
    }
  }, [defaultRoot, graphNodes, selectedRoot]);

  const metricsByPair = useMemo(() => {
    const map = new Map<string, { callCount: number; smsCount: number }>();
    const makeKey = (a: string, b: string) =>
      [a, b].sort((first, second) => (first > second ? 1 : first < second ? -1 : 0)).join('--');
    graphLinks.forEach((link) => {
      const key = makeKey(link.source, link.target);
      const previous = map.get(key) || { callCount: 0, smsCount: 0 };
      map.set(key, {
        callCount: previous.callCount + link.callCount,
        smsCount: previous.smsCount + link.smsCount
      });
    });
    return map;
  }, [graphLinks]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    graphLinks.forEach((link) => {
      if (!map.has(link.source)) map.set(link.source, new Set());
      if (!map.has(link.target)) map.set(link.target, new Set());
      map.get(link.source)!.add(link.target);
      map.get(link.target)!.add(link.source);
    });
    return map;
  }, [graphLinks]);

  const { hierarchicalGraph, effectiveRoot } = useMemo(() => {
    const root = selectedRoot ?? defaultRoot;
    if (!root) {
      return { hierarchicalGraph: { nodes: graphNodes, links: graphLinks }, effectiveRoot: null };
    }

    const visited = new Set<string>();
    const parent = new Map<string, string | null>();
    const queue: string[] = [];

    visited.add(root);
    parent.set(root, null);
    queue.push(root);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      neighbors.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parent.set(neighbor, current);
          queue.push(neighbor);
        }
      });
    }

    const makeKey = (a: string, b: string) =>
      [a, b].sort((first, second) => (first > second ? 1 : first < second ? -1 : 0)).join('--');

    const treeLinks: NormalizedLink[] = [];

    graphNodes.forEach((node) => {
      if (node.id === root) return;
      if (!visited.has(node.id)) {
        parent.set(node.id, root);
      }
    });

    parent.forEach((parentId, nodeId) => {
      if (!parentId) return;
      const metrics = metricsByPair.get(makeKey(parentId, nodeId)) || { callCount: 0, smsCount: 0 };
      treeLinks.push({
        source: parentId,
        target: nodeId,
        callCount: metrics.callCount,
        smsCount: metrics.smsCount,
        synthetic: metrics.callCount === 0 && metrics.smsCount === 0
      });
    });

    return {
      hierarchicalGraph: {
        nodes: graphNodes,
        links: treeLinks
      },
      effectiveRoot: root
    };
  }, [adjacency, defaultRoot, graphLinks, graphNodes, metricsByPair, selectedRoot]);

  const graphData = useMemo(
    () => ({
      nodes: graphNodes,
      links: graphLinks
    }),
    [graphLinks, graphNodes]
  );

  useEffect(() => {
    if (!graphRef.current) return;

    const chargeForce = forceManyBody()
      .strength(viewMode === 'network' ? -260 : -160)
      .distanceMax(650);
    graphRef.current.d3Force('charge', chargeForce);

    const linkForce = graphRef.current.d3Force('link') as ForceLink<NormalizedNode, NormalizedLink> | undefined;

    if (linkForce) {
      linkForce.distance(() => (viewMode === 'network' ? 190 : 150)).strength(0.85);
    } else {
      graphRef.current.d3Force(
        'link',
        forceLink<NormalizedNode, NormalizedLink>()
          .distance(() => (viewMode === 'network' ? 190 : 150))
          .strength(0.85)
      );
    }
    graphRef.current.d3VelocityDecay(0.25);
  }, [viewMode]);

  useEffect(() => {
    if (!graphRef.current) return;
    const timeout = setTimeout(() => {
      graphRef.current?.zoomToFit(600, 80);
    }, 400);
    return () => clearTimeout(timeout);
  }, [graphData, hierarchicalGraph, viewMode]);

  const overlayClasses = `fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 ${
    isFullscreen ? '' : 'p-4'
  }`;
  const containerClasses = `bg-white dark:bg-gray-900 ${
    isFullscreen ? 'rounded-none' : 'rounded-2xl'
  } shadow-2xl w-[92vw] max-w-6xl ${isFullscreen ? 'h-full w-full max-w-none' : 'h-[82vh]'} relative flex flex-col overflow-hidden`;

  return (
    <div className={overlayClasses}>
      <div className={containerClasses}>
        <div className="flex flex-col gap-4 px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Diagramme des liens</h2>
              <p className="text-sm text-white/80">Comparez la vue réseau et la vue hiérarchique des entités liées.</p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
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
          <div className="flex flex-col gap-3 rounded-2xl bg-white/10 p-3 shadow-inner backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 rounded-full bg-white/20 p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setViewMode('network')}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 transition ${
                  viewMode === 'network' ? 'bg-white text-blue-700' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <Network className="h-4 w-4" />
                Vue réseau
              </button>
              <button
                type="button"
                onClick={() => setViewMode('hierarchical')}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 transition ${
                  viewMode === 'hierarchical' ? 'bg-white text-blue-700' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <GitBranch className="h-4 w-4" />
                Vue hiérarchique
              </button>
            </div>
            {viewMode === 'hierarchical' && effectiveRoot && (
              <div className="flex flex-col gap-1 text-sm text-white sm:flex-row sm:items-center sm:gap-2">
                <span className="text-white/80">Entité racine :</span>
                <select
                  className="rounded-xl border-0 bg-white/90 px-3 py-1.5 text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedRoot ?? effectiveRoot}
                  onChange={(event) => setSelectedRoot(event.target.value)}
                >
                  {graphNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="relative flex-1">
          <ForceGraph2D
            ref={graphRef}
            graphData={viewMode === 'network' ? graphData : hierarchicalGraph}
            enableNodeDrag={viewMode === 'network'}
            dagMode={viewMode === 'hierarchical' ? 'radialinout' : undefined}
            dagLevelDistance={viewMode === 'hierarchical' ? 200 : undefined}
            backgroundColor={document.documentElement.classList.contains('dark') ? '#0f172a' : '#f8fafc'}
            warmupTicks={viewMode === 'network' ? 80 : 40}
            cooldownTicks={viewMode === 'network' ? 140 : 90}
            minZoom={0.35}
            maxZoom={3}
            onNodeDragStart={(node: any) => {
              if (viewMode !== 'network') return;
              node.fx = node.x;
              node.fy = node.y;
            }}
            onNodeDrag={(node: any) => {
              if (viewMode !== 'network') return;
              node.fx = node.x;
              node.fy = node.y;
            }}
            onNodeDragEnd={(node: any) => {
              if (viewMode !== 'network') return;
              node.fx = node.x;
              node.fy = node.y;
            }}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.id;
              const isDarkMode = document.documentElement.classList.contains('dark');
              const baseRadius = 14 + (node.degree || 0) * 2;
              const radius = Math.max(10, baseRadius / globalScale);
              const fontSize = Math.max(12 / globalScale, 10);
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
              ctx.fillStyle = node.color;
              ctx.fill();
              ctx.lineWidth = 1.2;
              ctx.strokeStyle = isDarkMode ? '#1f2937' : '#e5e7eb';
              ctx.stroke();
              if (viewMode === 'hierarchical' && effectiveRoot && node.id === effectiveRoot) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
                ctx.strokeStyle = isDarkMode ? '#facc15' : '#f97316';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
              ctx.font = `${fontSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = isDarkMode ? '#f9fafb' : '#111827';
              ctx.fillText(label, node.x, node.y + radius + 4);
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              const radius = 12 + (node.degree || 0);
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={(link: any) => {
              if (link.synthetic) {
                return document.documentElement.classList.contains('dark') ? '#4b5563' : '#d1d5db';
              }
              return document.documentElement.classList.contains('dark') ? '#93c5fd' : '#2563eb';
            }}
            linkDirectionalArrowColor={(link: any) => {
              if (link.synthetic) {
                return document.documentElement.classList.contains('dark') ? '#4b5563' : '#d1d5db';
              }
              return document.documentElement.classList.contains('dark') ? '#93c5fd' : '#2563eb';
            }}
            linkWidth={(link: any) => 1 + Math.log((link.callCount || 0) + (link.smsCount || 0) + 1)}
            linkDirectionalParticles={viewMode === 'network' ? 2 : 0}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={0.9}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link: any, ctx, globalScale) => {
              const start = link.source;
              const end = link.target;
              if (typeof start !== 'object' || typeof end !== 'object') return;
              const label =
                viewMode === 'hierarchical' && link.synthetic
                  ? 'Lien ajouté (aucune interaction)'
                  : `${link.callCount} appels / ${link.smsCount} SMS`;
              const fontSize = Math.max(11 / globalScale, 9);
              const textX = (start.x + end.x) / 2;
              const textY = (start.y + end.y) / 2;
              const isDarkMode = document.documentElement.classList.contains('dark');
              ctx.font = `${fontSize}px sans-serif`;
              ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, textX, textY);
            }}
          />
          <div className="absolute top-4 left-4 space-y-3">
            <div className="rounded-xl bg-white/85 p-3 text-sm shadow dark:bg-gray-800/85">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Légende des types
              </p>
              <div className="space-y-1.5">
                {nodeTypes.map((type) => (
                  <div key={type} className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: colorByType[type] }}
                    ></span>
                    <span className="capitalize font-medium text-gray-800 dark:text-gray-200">{type}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-white/85 p-3 text-xs shadow text-gray-600 dark:bg-gray-800/85 dark:text-gray-300">
              <p className="font-semibold text-gray-700 dark:text-gray-200">Interactions</p>
              <p>Largeur et taille des nœuds proportionnelles au nombre de connexions.</p>
              {viewMode === 'hierarchical' && effectiveRoot && (
                <p className="mt-2 font-medium text-blue-600 dark:text-blue-300">
                  Racine actuelle : {effectiveRoot}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkDiagram;
