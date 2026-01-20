import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { GitBranch, Maximize2, Minimize2, Network, User, X } from 'lucide-react';
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
  data: { nodes: GraphNode[]; links: GraphLink[]; root?: string | null };
  rootId?: string | null;
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
  fx?: number;
  fy?: number;
}

interface NormalizedLink extends GraphLink {
  source: string;
  target: string;
  synthetic?: boolean;
}

const LinkDiagram: React.FC<LinkDiagramProps> = ({ data, rootId, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('network');
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const graphRef = useRef<ForceGraphMethods | null>(null);
  const nodeTypes = useMemo(() => Array.from(new Set(data.nodes.map((n) => n.type))), [data]);
  const preferredRoot = rootId ?? data.root ?? null;

  const colorByType = useMemo(() => {
    const map: Record<string, string> = {};
    nodeTypes.forEach((type, idx) => {
      map[type] = typePalette[idx % typePalette.length];
    });
    if (!map.root) {
      map.root = '#facc15';
    }
    return map;
  }, [nodeTypes]);

  const typeLabel = useMemo(
    () => ({
      root: 'Numéro cible',
      source: 'Numéro source',
      contact: 'Numéro lié'
    }),
    []
  );

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

  const graphNodes: NormalizedNode[] = useMemo(() => {
    const root = preferredRoot;
    return data.nodes.map((node) => {
      const degree = degreeByNode[node.id] || 0;
      const isRoot = root && node.id === root;
      return {
        ...node,
        color: colorByType[node.type] || (isRoot ? '#facc15' : '#3b82f6'),
        degree,
        val: Math.max(1, degree || 1) * (isRoot ? 1.6 : 1)
      };
    });
  }, [data.nodes, colorByType, degreeByNode, preferredRoot]);

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
    if (preferredRoot && graphNodes.some((node) => node.id === preferredRoot)) {
      setSelectedRoot(preferredRoot);
      return;
    }
    if (!selectedRoot || !graphNodes.some((node) => node.id === selectedRoot)) {
      setSelectedRoot(defaultRoot);
    }
  }, [defaultRoot, graphNodes, preferredRoot, selectedRoot]);

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

  const rootConnections = useMemo(() => {
    if (!effectiveRoot) return [];
    const summary = new Map<string, { callCount: number; smsCount: number }>();
    graphLinks.forEach((link) => {
      const source = link.source;
      const target = link.target;
      if (source !== effectiveRoot && target !== effectiveRoot) return;
      const neighbor = source === effectiveRoot ? target : source;
      const prev = summary.get(neighbor) || { callCount: 0, smsCount: 0 };
      summary.set(neighbor, {
        callCount: prev.callCount + (link.callCount || 0),
        smsCount: prev.smsCount + (link.smsCount || 0)
      });
    });
    return Array.from(summary.entries())
      .map(([number, stats]) => ({
        number,
        callCount: stats.callCount,
        smsCount: stats.smsCount,
        total: stats.callCount + stats.smsCount
      }))
      .sort((a, b) => b.total - a.total);
  }, [effectiveRoot, graphLinks]);

  const graphData = useMemo(
    () => ({
      nodes: graphNodes,
      links: graphLinks
    }),
    [graphLinks, graphNodes]
  );

  useEffect(() => {
    const graphInstance = graphRef.current;
    if (!graphInstance) return;

    const distance = () => (viewMode === 'network' ? 190 : 150);
    const chargeForce = forceManyBody().strength(viewMode === 'network' ? -260 : -160).distanceMax(650);
    graphInstance.d3Force('charge', chargeForce);

    const linkForce = graphInstance.d3Force('link') as ForceLink<NormalizedNode, NormalizedLink> | undefined;

    if (linkForce) {
      linkForce.distance(distance).strength(0.85);
    } else {
      graphInstance.d3Force('link', forceLink<NormalizedNode, NormalizedLink>().distance(distance).strength(0.85));
    }

    const velocityDecay = (graphInstance as ForceGraphMethods & { d3VelocityDecay?: (decay: number) => void }).d3VelocityDecay;
    if (typeof velocityDecay === 'function') {
      velocityDecay.call(graphInstance, 0.25);
    }
  }, [viewMode]);

  useEffect(() => {
    if (!graphRef.current || !preferredRoot) return;
    const rootNode = graphNodes.find((node) => node.id === preferredRoot);
    if (!rootNode) return;
    rootNode.fx = 0;
    rootNode.fy = 0;
    graphRef.current.zoomToFit(400, 120);
  }, [graphNodes, preferredRoot]);

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
        <div className="flex flex-col gap-4 px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Diagramme des liens</h2>
              <p className="text-sm text-white/80">Visualisation inspirée des graphes d'investigation type Maltego.</p>
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
            {effectiveRoot && (
              <div className="flex flex-col gap-1 text-sm text-white sm:flex-row sm:items-center sm:gap-2">
                <span className="text-white/80">Numéro racine :</span>
                <div className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold">
                  <User className="h-4 w-4" />
                  <span>{effectiveRoot}</span>
                </div>
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
            backgroundColor={document.documentElement.classList.contains('dark') ? '#05070d' : '#0b1120'}
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
              const isRoot = effectiveRoot && node.id === effectiveRoot;
              const baseRadius = (isRoot ? 20 : 14) + (node.degree || 0) * 2;
              const radius = Math.max(10, baseRadius / globalScale);
              const fontSize = Math.max(12 / globalScale, 10);
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
              ctx.fillStyle = node.color;
              ctx.fill();
              ctx.lineWidth = isRoot ? 2.4 : 1.2;
              ctx.strokeStyle = isRoot ? '#fef3c7' : isDarkMode ? '#111827' : '#e5e7eb';
              ctx.stroke();
              if (effectiveRoot && node.id === effectiveRoot) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
                ctx.strokeStyle = isDarkMode ? '#fde68a' : '#f59e0b';
                ctx.lineWidth = 2.2;
                ctx.stroke();
              }
              if (isRoot) {
                ctx.font = `${Math.max(16 / globalScale, 12)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isDarkMode ? '#111827' : '#0f172a';
                ctx.fillText('👤', node.x, node.y + 1);
              }
              ctx.font = `${fontSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = isDarkMode ? '#f8fafc' : '#e2e8f0';
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
              return document.documentElement.classList.contains('dark') ? '#38bdf8' : '#38bdf8';
            }}
            linkDirectionalArrowColor={(link: any) => {
              if (link.synthetic) {
                return document.documentElement.classList.contains('dark') ? '#4b5563' : '#d1d5db';
              }
              return document.documentElement.classList.contains('dark') ? '#38bdf8' : '#38bdf8';
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
              ctx.fillStyle = isDarkMode ? 'rgba(226,232,240,0.8)' : 'rgba(226,232,240,0.8)';
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
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {typeLabel[type as keyof typeof typeLabel] ?? type}
                    </span>
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
          <div className="absolute top-4 right-4 w-72 space-y-3">
            <div className="rounded-xl bg-slate-900/85 p-3 text-sm text-slate-100 shadow ring-1 ring-white/10 backdrop-blur">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Liens détectés</p>
              {rootConnections.length === 0 ? (
                <p className="text-xs text-slate-300">Aucun lien détecté pour ce numéro.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {rootConnections.slice(0, 8).map((entry) => (
                    <li key={entry.number} className="rounded-lg bg-slate-800/80 p-2">
                      <p className="font-semibold text-slate-100">{entry.number}</p>
                      <p className="text-slate-300">
                        {entry.callCount} appels · {entry.smsCount} SMS
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkDiagram;
