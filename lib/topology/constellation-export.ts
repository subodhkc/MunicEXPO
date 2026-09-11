/**
 * Constellation deterministic export (OUTPUT-4).
 *
 * Builds SVG/JSON exports over the canonical Agent Reachability section.
 * This is NOT a second graph builder; it is an export renderer.
 */

import type { AgentReachabilityReportSection } from '@/lib/assurance/u6-types';

export interface ConstellationExportNode {
  id: string;
  kind: 'agent' | 'tool' | 'resource' | 'unknown';
  label: string;
  x: number;
  y: number;
  availability: string;
}

export interface ConstellationExportEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  state: string;
}

export interface ConstellationExport {
  availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
  format: 'svg';
  svg: string;
  nodes: ConstellationExportNode[];
  edges: ConstellationExportEdge[];
  viewBox: string;
  limitations: string[];
}

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 600;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildConstellationExport(
  reachability: AgentReachabilityReportSection,
  options?: {
    evaluationId?: string;
  },
): ConstellationExport {
  if (reachability.availability === 'NOT_AVAILABLE') {
    return {
      availability: 'NOT_AVAILABLE',
      format: 'svg',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}"><text x="20" y="30">Constellation unavailable: ${escapeXml(reachability.unavailableReason ?? 'unknown')}</text></svg>`,
      nodes: [],
      edges: [],
      viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`,
      limitations: ['Reachability section not available; export is not a second graph builder.'],
    };
  }

  const agents = reachability.agents ?? [];
  const relationships = reachability.relationships ?? [];

  const nodes: ConstellationExportNode[] = [];
  const nodeById = new Map<string, ConstellationExportNode>();

  let y = 80;
  for (const [i, a] of agents.entries()) {
    const x = 120 + i * 180;
    const node: ConstellationExportNode = {
      id: a.agentId,
      kind: 'agent',
      label: a.displayName,
      x,
      y,
      availability: a.candidateState,
    };
    nodes.push(node);
    nodeById.set(a.agentId, node);
  }

  const tools = new Set<string>();
  for (const r of relationships) {
    if (r.toToolId) tools.add(r.toToolId);
  }

  y = 300;
  for (const [i, toolId] of Array.from(tools).entries()) {
    const x = 120 + i * 180;
    const node: ConstellationExportNode = {
      id: toolId,
      kind: 'tool',
      label: toolId.split(':').pop() ?? toolId,
      x,
      y,
      availability: 'CANDIDATE',
    };
    nodes.push(node);
    nodeById.set(toolId, node);
  }

  const edges: ConstellationExportEdge[] = [];
  for (const [i, r] of relationships.entries()) {
    const target = r.toAgentId ?? r.toToolId ?? r.toExternalRef ?? 'unknown';
    const source = nodeById.get(r.fromAgentId);
    const dest = nodeById.get(target);
    if (source && dest) {
      edges.push({
        id: `edge-${i}`,
        from: r.fromAgentId,
        to: target,
        kind: r.kind,
        state: r.state,
      });
    }
  }

  const svg = renderConstellationSvg(nodes, edges, options?.evaluationId);

  return {
    availability: reachability.availability,
    format: 'svg',
    svg,
    nodes,
    edges,
    viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`,
    limitations: [
      'Constellation export is a deterministic rendering of the canonical reachability projection.',
      'Unknown/frontier nodes are preserved.',
    ],
  };
}

function renderConstellationSvg(nodes: ConstellationExportNode[], edges: ConstellationExportEdge[], evaluationId?: string): string {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" style="background:#ffffff">`,
    `<rect width="${VIEWBOX_WIDTH}" height="${VIEWBOX_HEIGHT}" fill="#ffffff"/>`,
    `<text x="20" y="30" font-family="sans-serif" font-size="16" fill="#1f2937">HAIEC Constellation${evaluationId ? ` — ${escapeXml(evaluationId)}` : ''}</text>`,
    '<g>',
  ];

  for (const e of edges) {
    const s = nodes.find((n) => n.id === e.from);
    const t = nodes.find((n) => n.id === e.to);
    if (s && t) {
      const color = e.state === 'ESTABLISHED' ? '#059669' : e.state === 'PARTIAL' ? '#d97706' : '#6b7280';
      lines.push(`<line x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}" stroke="${color}" stroke-width="2" stroke-dasharray="${e.state === 'ESTABLISHED' ? '0' : '4,4'}"/>`);
    }
  }

  for (const n of nodes) {
    const fill = n.kind === 'agent' ? '#e0e7ff' : '#dcfce7';
    const stroke = n.availability === 'ESTABLISHED' ? '#059669' : n.availability === 'PARTIAL' ? '#d97706' : '#6b7280';
    const radius = n.kind === 'agent' ? 30 : 20;
    lines.push(`<circle cx="${n.x}" cy="${n.y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
    lines.push(`<text x="${n.x}" y="${n.y + 5}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#1f2937">${escapeXml(n.label)}</text>`);
  }

  lines.push('</g>');
  lines.push(`<text x="20" y="${VIEWBOX_HEIGHT - 20}" font-family="sans-serif" font-size="12" fill="#6b7280">Static evidence-bound projection. Unknown != observed.</text>`);
  lines.push('</svg>');

  return lines.join('\n');
}
