import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { Maximize2, Minimize2, Network, User, X } from 'lucide-react';
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
  startFullscreen?: boolean;
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

const LinkDiagram: React.FC<LinkDiagramProps> = ({ data, rootId, onClose, startFullscreen = false }) => {
  const [isFullscreen, setIsFullscreen] = useState(startFullscreen);
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

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    const clampedRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + clampedRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, clampedRadius);
    ctx.arcTo(x + width, y + height, x, y + height, clampedRadius);
    ctx.arcTo(x, y + height, x, y, clampedRadius);
    ctx.arcTo(x, y, x + width, y, clampedRadius);
    ctx.closePath();
  };

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

  const overlayClasses = `fixed inset-0 bg-slate-100/90 backdrop-blur-xl dark:bg-slate-950/80 flex items-center justify-center z-50 ${
    isFullscreen ? '' : 'p-4'
  }`;
  const containerClasses = `relative overflow-hidden border border-slate-200/80 bg-white/95 ${
    isFullscreen ? 'rounded-none' : 'rounded-3xl'
  } shadow-[0_35px_120px_-60px_rgba(15,23,42,0.35)] w-[94vw] max-w-6xl ${
    isFullscreen ? 'h-full w-full max-w-none' : 'h-[84vh]'
  } flex flex-col dark:border-white/10 dark:bg-gradient-to-br dark:from-[#0b1020] dark:via-[#0f172a] dark:to-[#1a1339] dark:shadow-[0_35px_120px_-60px_rgba(59,130,246,0.75)]`;

  return (
    <div className={overlayClasses}>
      <div className={containerClasses}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.12),transparent_35%),radial-gradient(circle_at_70%_30%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(14,165,233,0.1),transparent_40%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_70%_30%,rgba(168,85,247,0.18),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(14,165,233,0.16),transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.25)_1px,transparent_1px)] bg-[size:42px_42px] opacity-20 dark:bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] dark:opacity-30" />
        <div className="relative flex flex-col gap-4 px-6 py-5 text-slate-900 dark:text-white">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Diagramme des liens</h2>
              <p className="text-sm text-slate-600 dark:text-white/80">
                Visualisation immersive inspirée des graphes d'investigation type Maltego.
              </p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setIsFullscreen((value) => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                aria-label={isFullscreen ? 'Réduire le diagramme' : 'Agrandir le diagramme'}
              >
                {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
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
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-inner backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white p-1 text-sm font-medium shadow-sm dark:border-white/10 dark:bg-white/10">
              <button
                type="button"
                onClick={() => setViewMode('network')}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 transition ${
                  viewMode === 'network'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10'
                }`}
              >
                <Network className="h-4 w-4" />
                Vue réseau
              </button>
            </div>
            {effectiveRoot && (
              <div className="flex flex-col gap-1 text-sm text-slate-700 sm:flex-row sm:items-center sm:gap-2 dark:text-white">
                <span className="text-slate-500 dark:text-white/80">Numéro racine :</span>
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-white">
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
            backgroundColor={document.documentElement.classList.contains('dark') ? '#040611' : '#ffffff'}
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
              if (
                !Number.isFinite(node.x) ||
                !Number.isFinite(node.y) ||
                !Number.isFinite(globalScale) ||
                globalScale === 0
              ) {
                return;
              }
              const label = node.id;
              const isDarkMode = document.documentElement.classList.contains('dark');
              const isRoot = effectiveRoot && node.id === effectiveRoot;
              const degreeBoost = Math.min((node.degree || 0) * 2, 20);
              const baseSize = (isRoot ? 42 : 34) + degreeBoost;
              const size = baseSize / globalScale;
              const boxWidth = size * 1.8;
              const boxHeight = size * 1.25;
              const x = node.x - boxWidth / 2;
              const y = node.y - boxHeight / 2;
              ctx.save();
              ctx.shadowColor = node.color;
              ctx.shadowBlur = 22 / globalScale;
              ctx.fillStyle = isDarkMode ? 'rgba(7, 13, 26, 0.9)' : 'rgba(255, 255, 255, 0.98)';
              drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 10 / globalScale);
              ctx.fill();
              ctx.restore();
              ctx.save();
              const gradient = ctx.createLinearGradient(x, y, x + boxWidth, y + boxHeight);
              gradient.addColorStop(0, node.color);
              gradient.addColorStop(1, isRoot ? '#f59e0b' : '#22d3ee');
              ctx.strokeStyle = gradient;
              ctx.lineWidth = 2.2 / globalScale;
              drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 10 / globalScale);
              ctx.stroke();
              if (isRoot) {
                ctx.shadowColor = '#facc15';
                ctx.shadowBlur = 18 / globalScale;
                ctx.lineWidth = 2.4 / globalScale;
                drawRoundedRect(
                  ctx,
                  x - 4 / globalScale,
                  y - 4 / globalScale,
                  boxWidth + 8 / globalScale,
                  boxHeight + 8 / globalScale,
                  12 / globalScale
                );
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
                ctx.stroke();
              }
              ctx.restore();
              ctx.font = `${Math.max(18 / globalScale, 12)}px "Inter", sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#e2e8f0';
              ctx.fillText('📞', node.x, node.y + 1);
              const labelFont = Math.max(12 / globalScale, 9);
              ctx.font = `${labelFont}px "Inter", sans-serif`;
              const labelWidth = ctx.measureText(label).width + 18 / globalScale;
              const labelHeight = 16 / globalScale;
              const labelX = node.x - labelWidth / 2;
              const labelY = node.y + boxHeight / 2 + 8 / globalScale;
              ctx.fillStyle = isDarkMode ? 'rgba(15, 23, 42, 0.85)' : 'rgba(226, 232, 240, 0.95)';
              drawRoundedRect(ctx, labelX, labelY, labelWidth, labelHeight, 8 / globalScale);
              ctx.fill();
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
              ctx.lineWidth = 1 / globalScale;
              drawRoundedRect(ctx, labelX, labelY, labelWidth, labelHeight, 8 / globalScale);
              ctx.stroke();
              ctx.fillStyle = isDarkMode ? '#f8fafc' : '#0f172a';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, node.x, labelY + labelHeight / 2);
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
              const size = 36 + (node.degree || 0) * 2;
              const width = size;
              const height = size * 0.7;
              const x = node.x - width / 2;
              const y = node.y - height / 2;
              ctx.fillStyle = color;
              drawRoundedRect(ctx, x, y, width, height, 8);
              ctx.fill();
            }}
            linkColor={(link: any) => {
              if (link.synthetic) {
                return document.documentElement.classList.contains('dark') ? '#475569' : '#94a3b8';
              }
              return document.documentElement.classList.contains('dark') ? '#38bdf8' : '#38bdf8';
            }}
            linkDirectionalArrowColor={(link: any) => {
              if (link.synthetic) {
                return document.documentElement.classList.contains('dark') ? '#475569' : '#94a3b8';
              }
              return document.documentElement.classList.contains('dark') ? '#38bdf8' : '#38bdf8';
            }}
            linkWidth={(link: any) => 1 + Math.log((link.callCount || 0) + (link.smsCount || 0) + 1)}
            linkDirectionalParticles={viewMode === 'network' ? 2 : 0}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalArrowLength={8}
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
              ctx.fillStyle = isDarkMode ? 'rgba(226,232,240,0.8)' : 'rgba(15,23,42,0.7)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, textX, textY);
            }}
          />
          <div className="absolute top-4 left-4 space-y-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-700 shadow-lg backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                Légende des types
              </p>
              <div className="space-y-1.5">
                {nodeTypes.map((type) => (
                  <div key={type} className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-sm shadow"
                      style={{ backgroundColor: colorByType[type] }}
                    >
                      📞
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {typeLabel[type as keyof typeof typeLabel] ?? type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 text-xs text-slate-600 shadow-lg backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Interactions</p>
              <p>Flux et taille des cartes proportionnels aux relations observées.</p>
              {viewMode === 'hierarchical' && effectiveRoot && (
                <p className="mt-2 font-medium text-sky-300">
                  Racine actuelle : {effectiveRoot}
                </p>
              )}
            </div>
          </div>
          <div className="absolute top-4 right-4 w-72 space-y-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-700 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Liens détectés</p>
              {rootConnections.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-300">Aucun lien détecté pour ce numéro.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {rootConnections.slice(0, 8).map((entry) => (
                    <li key={entry.number} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{entry.number}</p>
                      <p className="text-slate-500 dark:text-slate-300">
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
