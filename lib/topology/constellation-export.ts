/**
 * Constellation deterministic SVG export (OUTPUT-4).
 *
 * This module is a pure rendering adapter for the canonical
 * `ConstellationProjection` produced by `lib/topology/constellation-presentation-projection.ts`.
 *
 * It does not discover nodes, edges, roles, domains, or evidence states.
 * All semantic identity comes from the canonical projection.
 *
 * LOCKS:
 *   EXPORT != GRAPH_PROJECTION
 *   EXPORT != NODE_DISCOVERY
 *   EXPORT != EDGE_DISCOVERY
 *   EXPORT_NODE_IDS == CONSTELLATION_PROJECTION_NODE_IDS
 *   EXPORT_EDGE_IDS == CONSTELLATION_PROJECTION_EDGE_IDS
 */

import type {
  ConstellationProjection,
  ConstellationNode,
  ConstellationEdge,
  ConstellationCombo,
  ConstellationFrontier,
  NodeAvailability,
} from './types';

export interface ConstellationExportNode {
  id: string;
  canonicalNodeId: string;
  kind: string;
  role: string;
  label: string;
  x: number;
  y: number;
  availability: string;
  isFrontier?: boolean;
  combo?: string | null;
}

export interface ConstellationExportEdge {
  id: string;
  canonicalEdgeId: string;
  from: string;
  to: string;
  kind: string;
  style: string;
  state: string;
}

export interface ConstellationExport {
  availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
  format: 'svg';
  svg: string;
  nodes: ConstellationExportNode[];
  edges: ConstellationExportEdge[];
  combos: ConstellationCombo[];
  frontiers: ConstellationFrontier[];
  viewBox: string;
  limitations: string[];
}

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 800;
const NODE_SPACING_X = 180;
const NODE_SPACING_Y = 120;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function availabilityColor(availability?: NodeAvailability): string {
  switch (availability) {
    case 'AVAILABLE':
      return '#059669';
    case 'PARTIAL':
      return '#d97706';
    case 'UNKNOWN':
      return '#6b7280';
    case 'SOURCE_GAP':
      // SOURCE_GAP != RISK; purple marks a frontier, not severity red.
      return '#a855f7';
    case 'UNAVAILABLE':
      return '#f59e0b';
    default:
      return '#6b7280';
  }
}

function availabilityFill(role: string): string {
  if (role === 'agent') return '#e0e7ff';
  if (role === 'tool') return '#dcfce7';
  if (role === 'shared_resource_hub') return '#fef3c7';
  if (role === 'consequence') return '#fee2e2';
  if (role === 'policy_authority') return '#f3e8ff';
  return '#f3f4f6';
}

export function buildConstellationExport(
  projection: ConstellationProjection,
  options?: {
    evaluationId?: string;
  },
): ConstellationExport {
  // Deterministic ordering by canonical identity; layout is a deterministic
  // function of that order. Semantic graph identity must not depend on layout.
  const sortedNodes = [...projection.nodes].sort((a, b) => a.canonicalNodeId.localeCompare(b.canonicalNodeId));
  const nodePositionById = new Map<string, { x: number; y: number }>();

  const exportNodes: ConstellationExportNode[] = sortedNodes.map((n, index) => {
    const col = index % 5;
    const row = Math.floor(index / 5);
    const x = 120 + col * NODE_SPACING_X;
    const y = 120 + row * NODE_SPACING_Y;
    nodePositionById.set(n.canonicalNodeId, { x, y });
    return {
      id: n.canonicalNodeId,
      canonicalNodeId: n.canonicalNodeId,
      kind: n.kind,
      role: n.role,
      label: n.label,
      x,
      y,
      availability: n.availability,
      isFrontier: n.isFrontier,
      combo: n.combo,
    };
  });

  const sortedEdges = [...projection.edges].sort((a, b) => a.canonicalEdgeId.localeCompare(b.canonicalEdgeId));
  const exportEdges: ConstellationExportEdge[] = sortedEdges.map((e) => ({
    id: e.canonicalEdgeId,
    canonicalEdgeId: e.canonicalEdgeId,
    from: e.source,
    to: e.target,
    kind: e.kind,
    style: e.style,
    state: e.weakestAvailability ?? 'UNKNOWN',
  }));

  const svg = renderConstellationSvg(sortedNodes, sortedEdges, nodePositionById, projection, options?.evaluationId);

  return {
    availability: projection.nodes.some((n) => n.availability !== 'AVAILABLE')
      ? 'PARTIAL'
      : 'ESTABLISHED',
    format: 'svg',
    svg,
    nodes: exportNodes,
    edges: exportEdges,
    combos: projection.combos,
    frontiers: projection.frontiers,
    viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`,
    limitations: [
      ...projection.limitations,
      'SVG export is a deterministic rendering of the canonical ConstellationProjection.',
      'EXPORT != GRAPH PROJECTION; all semantic identity is owned by lib/topology/constellation-presentation-projection.ts.',
    ],
  };
}

function renderConstellationSvg(
  nodes: ConstellationNode[],
  edges: ConstellationEdge[],
  positions: Map<string, { x: number; y: number }>,
  projection: ConstellationProjection,
  evaluationId?: string,
): string {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" style="background:#ffffff">`,
    `<rect width="${VIEWBOX_WIDTH}" height="${VIEWBOX_HEIGHT}" fill="#ffffff"/>`,
    `<text x="20" y="30" font-family="sans-serif" font-size="16" fill="#1f2937">HAIEC Constellation${evaluationId ? ` — ${escapeXml(evaluationId)}` : ''}</text>`,
  ];

  if (projection.aiSystemName) {
    lines.push(`<text x="20" y="55" font-family="sans-serif" font-size="12" fill="#6b7280">${escapeXml(projection.aiSystemName)}</text>`);
  }

  lines.push('<g>');

  for (const e of edges) {
    const s = positions.get(e.source);
    const t = positions.get(e.target);
    if (s && t) {
      const color = availabilityColor(e.weakestAvailability);
      const dash = e.style === 'dashed' ? '4,4' : e.style === 'dotted' ? '2,2' : '0';
      lines.push(`<line x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>`);
    }
  }

  for (const n of nodes) {
    const pos = positions.get(n.canonicalNodeId);
    if (!pos) continue;
    const fill = availabilityFill(n.role);
    const stroke = availabilityColor(n.availability);
    const radius = n.role === 'ai_system' ? 35 : n.role === 'agent' ? 30 : 22;
    const shape = n.role === 'shared_resource_hub'
      ? `<rect x="${pos.x - radius}" y="${pos.y - radius}" width="${radius * 2}" height="${radius * 2}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
      : `<circle cx="${pos.x}" cy="${pos.y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    lines.push(shape);
    lines.push(`<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#1f2937">${escapeXml(n.label)}</text>`);
    if (n.isFrontier) {
      // Frontier label is neutral/evidence, not severity red.
      lines.push(`<text x="${pos.x}" y="${pos.y + radius + 14}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#a855f7">frontier</text>`);
    }
  }

  lines.push('</g>');
  lines.push(`<text x="20" y="${VIEWBOX_HEIGHT - 20}" font-family="sans-serif" font-size="12" fill="#6b7280">Static evidence-bound projection. Unknown != observed.</text>`);
  lines.push('</svg>');

  return lines.join('\n');
}
