/**
 * Map Presentation Constants — Shared Module
 *
 * PRESENTATION-ONLY values for the AI Action & Access Map visualization.
 * These are NOT topology truth. They are display constants shared by:
 *   - ActionAccessMapView (interactive React Flow)
 *   - StaticActionAccessMap (static HTML backup)
 *
 * LOCK: PRESENTATION_MODULE != TOPOLOGY_TRUTH
 * LOCK: PRESENTATION_MODULE != JOIN_BASIS_TAXONOMY
 * LOCK: PRESENTATION_MODULE != GRAPH_SEMANTICS
 *
 * Do NOT move topology truth, JoinBasis, or graph semantics into this module.
 * This module only owns: domain display names, domain colors, relationship
 * colors, and safe legend labels.
 *
 * @version presentation-1.0.0
 */

// ─── Node domain color mapping (enterprise architecture grammar) ─────────────
// Color means DOMAIN first. Dark surfaces with subtle accent borders.

export const NODE_DOMAIN: Record<string, { accent: string; label: string }> = {
  identity: { accent: '#3b82f6', label: 'Identity' },
  application_access: { accent: '#fbbf24', label: 'Access' },
  entrypoint: { accent: '#5eead4', label: 'Request' },
  ai_execution: { accent: '#a78bfa', label: 'AI Agent' },
  action: { accent: '#a78bfa', label: 'Action' },
  consequence: { accent: '#fb7185', label: 'Consequence' },
  connected_asset: { accent: '#64748b', label: 'Infrastructure' },
  provider_iam: { accent: '#3b82f6', label: 'Credential' },
  evidence: { accent: '#34d399', label: 'Evidence' },
  policy: { accent: '#22d3ee', label: 'Policy' },
};

export function getNodeDomain(kind: string): { accent: string; label: string } {
  return NODE_DOMAIN[kind] || NODE_DOMAIN.identity;
}

// ─── Edge relationship colors ────────────────────────────────────────────────
// COLOR = relationship/domain meaning (what kind of connection)
// LINE STYLE = evidence basis (how strongly established — see EPISTEMIC_STYLES)

export const EDGE_COLORS: Record<string, string> = {
  reaches: '#3b82f6',
  guarded_by: '#f59e0b',
  routes_to: '#14b8a6',
  can_reach: '#8b5cf6',
  reachability_unknown: '#94a3b8',
  not_ai_reachable: '#94a3b8',
  produces: '#f43f5e',
  connected_to: '#6366f1',
  uses_credential: '#f97316',
  evidenced_by: '#64748b',
  scoped_by: '#3b82f6',
  governed_by: '#06b6d4',
};

export function getEdgeColor(kind: string): string {
  return EDGE_COLORS[kind] || '#94a3b8';
}

// ─── Edge style (epistemic basis) ────────────────────────────────────────────
// LINE STYLE = evidence basis (how strongly the relationship is established)
// This is DISTINCT from color (which = relationship meaning).
//
// LOCK: COLOR != CONFIDENCE
// LOCK: LINE_STYLE = EVIDENCE_BASIS
//
// Current mapping (from ActionAccessMapView):
//   solid  = source-established / deterministic
//   dashed = structural relation / inference
//   dotted = semantic / reference / potential

export type EdgeLineStyle = 'solid' | 'dashed' | 'dotted';

export function getEdgeLineStyle(style: string): EdgeLineStyle {
  switch (style) {
    case 'solid': return 'solid';
    case 'dashed': return 'dashed';
    case 'dotted': return 'dotted';
    default: return 'solid';
  }
}

export function getEdgeDashArray(style: string): string | undefined {
  const lineStyle = getEdgeLineStyle(style);
  if (lineStyle === 'solid') return undefined;
  if (lineStyle === 'dashed') return '8 4';
  return '2 4'; // dotted
}

// ─── Epistemic / evidence-basis legend ───────────────────────────────────────
// These labels describe HOW STRONGLY a relationship is established,
// NOT what kind of relationship it is.
//
// Uses current actual edge-style mapping. Does NOT invent a new JoinBasis
// taxonomy.

export const EPISTEMIC_LEGEND: { style: EdgeLineStyle; label: string; description: string }[] = [
  {
    style: 'solid',
    label: 'Source-established',
    description: 'Relationship established from deterministic source evidence.',
  },
  {
    style: 'dashed',
    label: 'Structural / inferred',
    description: 'Relationship inferred from structural analysis, not directly observed.',
  },
  {
    style: 'dotted',
    label: 'Potential / referential',
    description: 'Potential or referential relationship. Not established as fact.',
  },
];

// ─── Relationship meaning legend ─────────────────────────────────────────────
// These labels describe WHAT KIND of relationship exists,
// NOT how strongly it is established.

export const RELATIONSHIP_LEGEND: { color: string; label: string }[] = [
  { color: '#3b82f6', label: 'reaches' },
  { color: '#f59e0b', label: 'guarded by' },
  { color: '#14b8a6', label: 'routes to' },
  { color: '#8b5cf6', label: 'can reach' },
  { color: '#6366f1', label: 'connected to' },
  { color: '#f97316', label: 'uses credential' },
  { color: '#06b6d4', label: 'governed by' },
  { color: '#94a3b8', label: 'unknown / not AI-reachable' },
];
