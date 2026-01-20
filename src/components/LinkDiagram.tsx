import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import {
  FileDown,
  Maximize2,
  MessageSquare,
  Minimize2,
  PhoneIncoming,
  PhoneOutgoing,
  User,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { forceCollide, forceLink, forceManyBody, forceRadial } from 'd3-force';
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
  rootIds?: string[];
  filters?: { number?: string; start?: string; end?: string };
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

type ViewMode = 'network' | 'hierarchical' | 'radial' | 'cluster';

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

const LinkDiagram: React.FC<LinkDiagramProps> = ({
  data,
  rootId,
  rootIds,
  filters,
  onClose,
  startFullscreen = false
}) => {
  const [isFullscreen, setIsFullscreen] = useState(startFullscreen);
  const [viewMode, setViewMode] = useState<ViewMode>('network');
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showReportOptions, setShowReportOptions] = useState(false);
  const [selectedReportSections, setSelectedReportSections] = useState<string[]>([
    'summary',
    'nodes',
    'links',
    'rootConnections'
  ]);
  const [reportError, setReportError] = useState('');
  const [isExportingReport, setIsExportingReport] = useState(false);
  const graphRef = useRef<ForceGraphMethods | null>(null);
  const nodeTypes = useMemo(() => Array.from(new Set(data.nodes.map((n) => n.type))), [data]);
  const rootNumbers = useMemo(() => {
    const rawRoots = rootIds?.length ? rootIds : rootId ? [rootId] : data.root ? [data.root] : [];
    return Array.from(new Set(rawRoots.filter((root): root is string => Boolean(root))));
  }, [data.root, rootId, rootIds]);
  const preferredRoot = rootNumbers[0] ?? null;
  const viewModeOptions = useMemo(
    () => [
      {
        id: 'network' as const,
        label: 'Organique',
        description: 'Disposition libre avec flux animés.',
        icon: '🌐'
      },
      {
        id: 'hierarchical' as const,
        label: 'Hiérarchique',
        description: 'Niveaux centrés sur la racine.',
        icon: '🧭'
      },
      {
        id: 'radial' as const,
        label: 'Radial',
        description: 'Orbits concentrés autour du nœud central.',
        icon: '🌀'
      },
      {
        id: 'cluster' as const,
        label: 'Cluster',
        description: 'Regroupe les nœuds par densité.',
        icon: '🔶'
      }
    ],
    []
  );

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

  const typeIcon = useMemo(
    () => ({
      root: PhoneIncoming,
      source: PhoneOutgoing,
      contact: User
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
    if (preferredRoot) {
      setSelectedRoot(preferredRoot);
      return;
    }
    if (!selectedRoot || !graphNodes.some((node) => node.id === selectedRoot)) {
      setSelectedRoot(defaultRoot);
    }
  }, [defaultRoot, graphNodes, preferredRoot, selectedRoot]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!graphNodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [graphNodes, selectedNodeId]);

  const nodeStats = useMemo(() => {
    const map = new Map<
      string,
      {
        incomingCalls: number;
        outgoingCalls: number;
        smsCount: number;
      }
    >();
    graphNodes.forEach((node) => {
      map.set(node.id, { incomingCalls: 0, outgoingCalls: 0, smsCount: 0 });
    });
    graphLinks.forEach((link) => {
      const sourceStats = map.get(link.source);
      const targetStats = map.get(link.target);
      const callCount = link.callCount || 0;
      const smsCount = link.smsCount || 0;
      if (sourceStats) {
        sourceStats.outgoingCalls += callCount;
        sourceStats.smsCount += smsCount;
      }
      if (targetStats) {
        targetStats.incomingCalls += callCount;
        targetStats.smsCount += smsCount;
      }
    });
    return map;
  }, [graphLinks, graphNodes]);

  const selectedNodeStats = selectedNodeId ? nodeStats.get(selectedNodeId) : null;

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

  const depthByNode = useMemo(() => {
    const root = effectiveRoot ?? preferredRoot ?? defaultRoot;
    const depthMap = new Map<string, number>();
    if (!root) return depthMap;
    const queue: string[] = [root];
    depthMap.set(root, 0);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      neighbors.forEach((neighbor) => {
        if (!depthMap.has(neighbor)) {
          depthMap.set(neighbor, (depthMap.get(current) ?? 0) + 1);
          queue.push(neighbor);
        }
      });
    }
    return depthMap;
  }, [adjacency, defaultRoot, effectiveRoot, preferredRoot]);

  const rootConnectionsByNumber = useMemo(() => {
    const roots = rootNumbers.length > 0 ? rootNumbers : effectiveRoot ? [effectiveRoot] : [];
    if (roots.length === 0) return [];
    const rootSet = new Set(roots);
    const summaryByRoot = new Map<string, Map<string, { callCount: number; smsCount: number }>>();
    roots.forEach((root) => summaryByRoot.set(root, new Map()));

    graphLinks.forEach((link) => {
      const source = link.source;
      const target = link.target;
      const sourceIsRoot = rootSet.has(source);
      const targetIsRoot = rootSet.has(target);
      if (!sourceIsRoot && !targetIsRoot) return;
      if (sourceIsRoot) {
        const summary = summaryByRoot.get(source)!;
        const prev = summary.get(target) || { callCount: 0, smsCount: 0 };
        summary.set(target, {
          callCount: prev.callCount + (link.callCount || 0),
          smsCount: prev.smsCount + (link.smsCount || 0)
        });
      }
      if (targetIsRoot) {
        const summary = summaryByRoot.get(target)!;
        const prev = summary.get(source) || { callCount: 0, smsCount: 0 };
        summary.set(source, {
          callCount: prev.callCount + (link.callCount || 0),
          smsCount: prev.smsCount + (link.smsCount || 0)
        });
      }
    });

    return roots.map((root) => {
      const summary = summaryByRoot.get(root) ?? new Map();
      const connections = Array.from(summary.entries())
        .map(([number, stats]) => ({
          number,
          callCount: stats.callCount,
          smsCount: stats.smsCount,
          total: stats.callCount + stats.smsCount
        }))
        .sort((a, b) => b.total - a.total);
      return { root, connections };
    });
  }, [effectiveRoot, graphLinks, rootNumbers]);

  const graphData = useMemo(
    () => ({
      nodes: graphNodes,
      links: graphLinks
    }),
    [graphLinks, graphNodes]
  );

  const reportSections = useMemo(
    () => [
      {
        id: 'summary',
        label: 'Synthèse générale',
        description: 'Indicateurs clés et aperçu global.'
      },
      {
        id: 'nodes',
        label: 'Noeuds principaux',
        description: 'Liste des numéros classés par importance.'
      },
      {
        id: 'links',
        label: 'Relations observées',
        description: 'Détails des interactions entre numéros.'
      },
      {
        id: 'rootConnections',
        label: 'Connexions directes',
        description: 'Contacts les plus liés au numéro racine.'
      }
    ],
    []
  );

  const toggleReportSection = (sectionId: string) => {
    setSelectedReportSections((prev) => {
      if (prev.includes(sectionId)) {
        return prev.filter((id) => id !== sectionId);
      }
      return [...prev, sectionId];
    });
    setReportError('');
  };

  const handleExportReport = async () => {
    if (selectedReportSections.length === 0) {
      setReportError('Sélectionnez au moins une section.');
      return;
    }

    try {
      setIsExportingReport(true);
      setReportError('');
      const reportRoot = effectiveRoot ?? selectedRoot ?? preferredRoot ?? '';
      const token = localStorage.getItem('token');
      const res = await fetch('/api/cdr/realtime/link-diagram/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          nodes: data.nodes,
          links: data.links,
          root: reportRoot,
          filters: {
            number: filters?.number || reportRoot,
            start: filters?.start,
            end: filters?.end
          },
          sections: selectedReportSections
        })
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const errorMessage = payload?.error || "Impossible d'exporter le rapport.";
        setReportError(errorMessage);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const sanitizedName = (filters?.number || reportRoot || 'diagramme')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_');
      link.href = url;
      link.download = `${sanitizedName || 'diagramme'}_rapport-liens.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setShowReportOptions(false);
    } catch (error) {
      console.error('Erreur export rapport diagramme:', error);
      setReportError("Impossible d'exporter le rapport.");
    } finally {
      setIsExportingReport(false);
    }
  };

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

    const distanceByMode: Record<ViewMode, number> = {
      network: 190,
      hierarchical: 150,
      radial: 140,
      cluster: 110
    };
    const chargeStrengthByMode: Record<ViewMode, number> = {
      network: -260,
      hierarchical: -160,
      radial: -180,
      cluster: -140
    };
    const distance = () => distanceByMode[viewMode];
    const chargeForce = forceManyBody().strength(chargeStrengthByMode[viewMode]).distanceMax(650);
    graphInstance.d3Force('charge', chargeForce);

    const linkForce = graphInstance.d3Force('link') as ForceLink<NormalizedNode, NormalizedLink> | undefined;

    if (linkForce) {
      linkForce.distance(distance).strength(0.85);
    } else {
      graphInstance.d3Force('link', forceLink<NormalizedNode, NormalizedLink>().distance(distance).strength(0.85));
    }

    if (viewMode === 'radial') {
      const radialForce = forceRadial((node: NormalizedNode) => {
        const depth = depthByNode.get(node.id) ?? 1;
        return 120 + depth * 90;
      }).strength(0.95);
      graphInstance.d3Force('radial', radialForce);
    } else {
      graphInstance.d3Force('radial', null);
    }

    if (viewMode === 'cluster') {
      const collideForce = forceCollide((node: NormalizedNode) => {
        const sizeBoost = Math.min((node.degree || 0) * 1.8, 18);
        return 24 + sizeBoost;
      }).strength(0.8);
      graphInstance.d3Force('collide', collideForce);
    } else {
      graphInstance.d3Force('collide', null);
    }

    const velocityDecay = (graphInstance as ForceGraphMethods & { d3VelocityDecay?: (decay: number) => void }).d3VelocityDecay;
    if (typeof velocityDecay === 'function') {
      velocityDecay.call(graphInstance, 0.25);
    }
  }, [depthByNode, viewMode]);

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
  const handleZoom = (direction: 'in' | 'out') => {
    if (!graphRef.current) return;
    const currentZoom = graphRef.current.zoom() ?? 1;
    const factor = direction === 'in' ? 1.2 : 1 / 1.2;
    const nextZoom = Math.min(Math.max(currentZoom * factor, 0.2), 6);
    graphRef.current.zoom(nextZoom, 200);
  };

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
            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => handleZoom('in')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                aria-label="Zoomer sur le diagramme"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => handleZoom('out')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                aria-label="Dézoomer le diagramme"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowReportOptions((value) => !value)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-semibold text-slate-700 transition hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  <FileDown className="h-4 w-4" />
                  Exporter rapport
                </button>
                {showReportOptions && (
                  <div className="absolute right-0 top-full z-20 mt-3 w-80 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/90">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Contenu du PDF</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">
                        Sélectionnez les sections à inclure dans le rapport.
                      </p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {reportSections.map((section) => (
                        <label
                          key={section.id}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-left text-xs text-slate-700 shadow-sm transition hover:border-indigo-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedReportSections.includes(section.id)}
                            onChange={() => toggleReportSection(section.id)}
                          />
                          <span>
                            <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                              {section.label}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-300">
                              {section.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {reportError && (
                      <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-300">
                        {reportError}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowReportOptions(false)}
                        className="rounded-full border border-slate-200/70 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-white/10 dark:text-slate-200"
                      >
                        Fermer
                      </button>
                      <button
                        type="button"
                        onClick={handleExportReport}
                        disabled={isExportingReport}
                        className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isExportingReport ? 'Export...' : 'Générer PDF'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                Type d&apos;affichage
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {viewModeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setViewMode(option.id)}
                    title={option.description}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      viewMode === option.id
                        ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/10'
                    }`}
                  >
                    <span className="text-sm" aria-hidden="true">
                      {option.icon}
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {(rootNumbers.length > 0 || effectiveRoot) && (
              <div className="flex flex-col gap-1 text-sm text-slate-700 sm:flex-row sm:items-center sm:gap-2 dark:text-white">
                <span className="text-slate-500 dark:text-white/80">
                  {rootNumbers.length > 1 ? 'Numéros racines :' : 'Numéro racine :'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(rootNumbers.length > 0 ? rootNumbers : effectiveRoot ? [effectiveRoot] : []).map(
                    (root) => (
                      <div
                        key={root}
                        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-white"
                      >
                        <User className="h-4 w-4" />
                        <span>{root}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative flex-1">
          <ForceGraph2D
            ref={graphRef}
            graphData={viewMode === 'hierarchical' ? hierarchicalGraph : graphData}
            enableNodeDrag={viewMode !== 'hierarchical'}
            dagMode={viewMode === 'hierarchical' ? 'radialinout' : undefined}
            dagLevelDistance={viewMode === 'hierarchical' ? 200 : undefined}
            backgroundColor={document.documentElement.classList.contains('dark') ? '#040611' : '#ffffff'}
            warmupTicks={viewMode === 'network' ? 80 : 40}
            cooldownTicks={viewMode === 'network' ? 140 : 90}
            minZoom={0.35}
            maxZoom={3}
            onNodeDragStart={(node: any) => {
              if (viewMode === 'hierarchical') return;
              node.fx = node.x;
              node.fy = node.y;
            }}
            onNodeDrag={(node: any) => {
              if (viewMode === 'hierarchical') return;
              node.fx = node.x;
              node.fy = node.y;
            }}
            onNodeDragEnd={(node: any) => {
              if (viewMode === 'hierarchical') return;
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
              const isSelected = selectedNodeId && node.id === selectedNodeId;
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
              if (isSelected) {
                ctx.shadowColor = '#22d3ee';
                ctx.shadowBlur = 14 / globalScale;
                ctx.lineWidth = 2.6 / globalScale;
                drawRoundedRect(
                  ctx,
                  x - 6 / globalScale,
                  y - 6 / globalScale,
                  boxWidth + 12 / globalScale,
                  boxHeight + 12 / globalScale,
                  12 / globalScale
                );
                ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
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
              const globalScale = graphRef.current?.zoom() ?? 1;
              const isRoot = effectiveRoot && node.id === effectiveRoot;
              const degreeBoost = Math.min((node.degree || 0) * 2, 20);
              const baseSize = (isRoot ? 42 : 34) + degreeBoost;
              const size = baseSize / globalScale;
              const boxWidth = size * 1.8;
              const boxHeight = size * 1.25;
              const boxX = node.x - boxWidth / 2;
              const boxY = node.y - boxHeight / 2;
              const labelFont = Math.max(12 / globalScale, 9);
              ctx.font = `${labelFont}px "Inter", sans-serif`;
              const labelWidth = ctx.measureText(node.id).width + 18 / globalScale;
              const labelHeight = 16 / globalScale;
              const labelX = node.x - labelWidth / 2;
              const labelY = node.y + boxHeight / 2 + 8 / globalScale;
              const minX = Math.min(boxX, labelX);
              const minY = Math.min(boxY, labelY);
              const maxX = Math.max(boxX + boxWidth, labelX + labelWidth);
              const maxY = Math.max(boxY + boxHeight, labelY + labelHeight);
              ctx.fillStyle = color;
              drawRoundedRect(ctx, minX, minY, maxX - minX, maxY - minY, 8 / globalScale);
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
            linkDirectionalParticles={viewMode === 'network' ? 2 : viewMode === 'radial' ? 1 : 0}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalArrowLength={8}
            linkDirectionalArrowRelPos={0.9}
            linkCanvasObjectMode={() => 'after'}
            onNodeClick={(node: any) => {
              setSelectedNodeId(node?.id ?? null);
            }}
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
                      className="flex h-7 w-7 items-center justify-center rounded-lg shadow"
                      style={{ backgroundColor: colorByType[type] }}
                    >
                      {React.createElement(typeIcon[type as keyof typeof typeIcon] ?? User, {
                        className: 'h-4 w-4 text-white'
                      })}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {typeLabel[type as keyof typeof typeLabel] ?? type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute top-4 right-4 w-72 space-y-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 text-sm text-slate-700 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Personnes en contact</p>
              {rootConnectionsByNumber.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-300">Aucun lien détecté pour ce numéro.</p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto pr-1 text-xs">
                  {rootConnectionsByNumber.map((group) => (
                    <div key={group.root} className="space-y-2">
                      {rootConnectionsByNumber.length > 1 && (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-300">
                          {group.root}
                        </p>
                      )}
                      {group.connections.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-300">
                          Aucun lien détecté pour ce numéro.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {group.connections.map((entry) => (
                            <li
                              key={`${group.root}-${entry.number}`}
                              className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-800/60"
                            >
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{entry.number}</p>
                              <p className="text-slate-500 dark:text-slate-300">
                                {entry.callCount} appels · {entry.smsCount} SMS
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {selectedNodeStats && (
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-6">
              <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-slate-900/90">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      Détails de l'appel
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{selectedNodeId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label="Fermer le détail"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-3 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                      <PhoneIncoming className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-300">Appels entrants</p>
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {selectedNodeStats.incomingCalls}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-3 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200">
                      <PhoneOutgoing className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-300">Appels sortants</p>
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {selectedNodeStats.outgoingCalls}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-3 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                      <MessageSquare className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-300">SMS</p>
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {selectedNodeStats.smsCount}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-300">
                  Cliquez sur un autre numéro pour afficher ses métriques.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LinkDiagram;
