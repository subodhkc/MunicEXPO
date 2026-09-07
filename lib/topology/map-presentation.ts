/**
 * Map Presentation Constants — Approved HTML Visual Replica
 *
 * PRESENTATION-ONLY values for the AI Action & Access Map visualization.
 * These are NOT topology truth. They are display constants shared by:
 *   - ActionAccessMapView (interactive React Flow)
 *   - StaticActionAccessMap (static HTML backup)
 *
 * LOCK: PRESENTATION_MODULE != TOPOLOGY_TRUTH
 * LOCK: PRESENTATION_MODULE != JOIN_BASIS_TAXONOMY
 * LOCK: PRESENTATION_MODULE != GRAPH_SEMANTICS
 * LOCK: HTML_VISUAL_REFERENCE = CONTROLLING_PRESENTATION_SPEC
 * LOCK: DARK_SLATE_GRAPH_NODE != APPROVED_HTML_VISUAL
 * LOCK: COLOR = DOMAIN_FIRST
 * LOCK: COLOR != RISK_SCORE
 * LOCK: RED_EFFECT_NODE != VULNERABILITY
 *
 * @version presentation-2.0.0 — Approved HTML Visual Replica
 */

// ─── MAP THEME: Approved light enterprise visual system ─────────────────────
// These tokens match the approved HTML reference design.

export const MAP_THEME = {
  // Surfaces
  pageBackground: '#f5f5f7',
  canvasBackground: '#ffffff',
  canvasGrid: '#e5e6ea',
  cardSurface: '#ffffff',
  cardBorder: '#e5e6ea',
  // Ink
  primaryInk: '#16171a',
  mutedInk: '#72757d',
  hairline: '#e5e6ea',
  generalLine: '#cfd1d8',
  // Domain accents (from approved HTML)
  violet: '#7062d9',
  violetSecondary: '#9388ea',
  blue: '#3b71c8',
  teal: '#397f78',
  green: '#2f7757',
  amber: '#a86a19',
  red: '#b54040',
  slate: '#4f535b',
  unknown: '#91949b',
  // Canvas geometry
  cardRadius: 15,
  mapCardRadius: 28,
  inspectorRadius: 20,
  canvasHeight: 720,
  inspectorWidth: 360,
  // HTML reference shadows
  canvasShadow: '0 18px 56px rgba(15,18,24,.06), 0 2px 8px rgba(15,18,24,.035)',
  inspectorShadow: '0 22px 70px rgba(0,0,0,.15)',
  nodeShadow: '0 4px 14px rgba(12,14,18,.04)',
  nodeHoverShadow: '0 10px 24px rgba(12,14,18,.08)',
  // HTML reference canvas min width
  canvasMinWidth: 1760,
} as const;

// ─── NODE DOMAIN: domain-first color mapping (light enterprise grammar) ──────
// Color means DOMAIN first. Light tinted surfaces with domain accent borders.
// LOCK: COLOR = DOMAIN_FIRST
// LOCK: COLOR != RISK_SCORE
// LOCK: RED_EFFECT_NODE != VULNERABILITY

export const NODE_DOMAIN: Record<string, {
  accent: string;
  label: string;
  surface: string;
  border: string;
  eyebrow: string;
}> = {
  identity: {
    accent: '#3b71c8',
    label: 'Identity',
    surface: '#f0f4fc',
    border: '#c5d6f0',
    eyebrow: '#3b71c8',
  },
  application_access: {
    accent: '#3b71c8',
    label: 'Access',
    surface: '#f0f4fc',
    border: '#c5d6f0',
    eyebrow: '#3b71c8',
  },
  entrypoint: {
    accent: '#397f78',
    label: 'Request',
    surface: '#eef6f5',
    border: '#c0e0dc',
    eyebrow: '#397f78',
  },
  ai_execution: {
    accent: '#7062d9',
    label: 'AI Agent',
    surface: '#f3effc',
    border: '#d4c9f0',
    eyebrow: '#7062d9',
  },
  action: {
    accent: '#7062d9',
    label: 'Action',
    surface: '#f3effc',
    border: '#d4c9f0',
    eyebrow: '#7062d9',
  },
  consequence: {
    accent: '#b54040',
    label: 'Consequence',
    surface: '#fcf0f0',
    border: '#f0c5c5',
    eyebrow: '#b54040',
  },
  connected_asset: {
    accent: '#4f535b',
    label: 'Infrastructure',
    surface: '#f4f5f7',
    border: '#e5e6ea',
    eyebrow: '#4f535b',
  },
  provider_iam: {
    accent: '#3b71c8',
    label: 'Credential',
    surface: '#f0f4fc',
    border: '#c5d6f0',
    eyebrow: '#3b71c8',
  },
  evidence: {
    accent: '#2f7757',
    label: 'Evidence',
    surface: '#eef6f0',
    border: '#c0e0ca',
    eyebrow: '#2f7757',
  },
  policy: {
    accent: '#397f78',
    label: 'Policy',
    surface: '#eef6f5',
    border: '#c0e0dc',
    eyebrow: '#397f78',
  },
};

export function getNodeDomain(kind: string): { accent: string; label: string; surface: string; border: string; eyebrow: string } {
  return NODE_DOMAIN[kind] || NODE_DOMAIN.identity;
}

// ─── EDGE relationship colors ────────────────────────────────────────────────
// COLOR = relationship/domain meaning (what kind of connection)
// LINE STYLE = evidence basis (how strongly established — see EPISTEMIC_STYLES)

export const EDGE_COLORS: Record<string, string> = {
  reaches: '#3b71c8',
  guarded_by: '#a86a19',
  routes_to: '#397f78',
  can_reach: '#7062d9',
  reachability_unknown: '#91949b',
  not_ai_reachable: '#91949b',
  produces: '#b54040',
  connected_to: '#4f535b',
  uses_credential: '#3b71c8',
  evidenced_by: '#2f7757',
  scoped_by: '#3b71c8',
  governed_by: '#397f78',
};

export function getEdgeColor(kind: string): string {
  return EDGE_COLORS[kind] || '#91949b';
}

// ─── Edge style (epistemic basis) ────────────────────────────────────────────
// LINE STYLE = evidence basis (how strongly the relationship is established)
// This is DISTINCT from color (which = relationship meaning).
//
// LOCK: COLOR != CONFIDENCE
// LOCK: LINE_STYLE = EVIDENCE_BASIS
// LOCK: PRESENTATION MUST_NOT UPGRADE_EDGE_STRENGTH
//
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

export const RELATIONSHIP_LEGEND: { color: string; label: string }[] = [
  { color: '#3b71c8', label: 'reaches' },
  { color: '#a86a19', label: 'guarded by' },
  { color: '#397f78', label: 'routes to' },
  { color: '#7062d9', label: 'can reach' },
  { color: '#4f535b', label: 'connected to' },
  { color: '#3b71c8', label: 'uses credential' },
  { color: '#397f78', label: 'governed by' },
  { color: '#91949b', label: 'unknown / not AI-reachable' },
];

// ─── Architecture regions (presentation-only, not graph nodes) ───────────────
// Regions group nodes by domain for visual clarity. They do NOT create
// relationships, evidence producers, or new graph truth.
// LOCK: REGION != NODE
// LOCK: REGION != EVIDENCE
// LOCK: VISUAL_GROUPING != SEMANTIC_JOIN

export const ARCHITECTURE_REGIONS: Record<string, { label: string; kinds: string[]; tint: string }> = {
  'source-deployment': {
    label: 'Source / Build / Deployment',
    kinds: ['connected_asset'],
    tint: '#f4f5f7',
  },
  'access-authority': {
    label: 'Identity / Access / Authority',
    kinds: ['identity', 'application_access', 'policy', 'provider_iam'],
    tint: '#f0f4fc',
  },
  'ai-execution': {
    label: 'AI / Model / Agent / Tool',
    kinds: ['ai_execution'],
    tint: '#f3effc',
  },
  'action-surface': {
    label: 'Application / API / Worker / Queue',
    kinds: ['entrypoint', 'action'],
    tint: '#eef6f5',
  },
  'state-consequence': {
    label: 'State / Data / External Effect',
    kinds: ['consequence'],
    tint: '#fcf0f0',
  },
  'evidence-assurance': {
    label: 'Evidence / Assurance',
    kinds: ['evidence'],
    tint: '#eef6f0',
  },
  'unclassified-infrastructure': {
    label: 'Connected Infrastructure',
    kinds: [],
    tint: '#f4f5f7',
  },
};

export function getRegionForKind(kind: string): string | null {
  for (const [regionId, region] of Object.entries(ARCHITECTURE_REGIONS)) {
    if (region.kinds.includes(kind)) return regionId;
  }
  return null;
}

// ─── Status presentation (epistemic state → visual treatment) ────────────────
// LOCK: CANDIDATE != ESTABLISHED
// LOCK: UNKNOWN != SAFE
// LOCK: NOT_ANALYZED != CLEAN

export const STATUS_PRESENTATION: Record<string, { label: string; color: string; bg: string }> = {
  AVAILABLE: { label: 'Source established', color: '#2f7757', bg: '#eef6f0' },
  UNKNOWN: { label: 'Not yet established', color: '#91949b', bg: '#f4f5f7' },
  PARTIAL: { label: 'Limited evidence', color: '#a86a19', bg: '#fdf6ec' },
  UNAVAILABLE: { label: 'Unavailable', color: '#91949b', bg: '#f4f5f7' },
  SOURCE_GAP: { label: 'Evidence not available', color: '#91949b', bg: '#f4f5f7' },
};

export function getStatusPresentation(availability: string): { label: string; color: string; bg: string } {
  return STATUS_PRESENTATION[availability] || STATUS_PRESENTATION.UNKNOWN;
}

// ─── Canvas geometry ─────────────────────────────────────────────────────────

export const CANVAS_GEOMETRY = {
  height: MAP_THEME.canvasHeight,
  gridGap: 20,
  gridColor: MAP_THEME.canvasGrid,
  padding: 0.15, // fitView padding
} as const;

// ─── Inspector geometry ──────────────────────────────────────────────────────

export const INSPECTOR_GEOMETRY = {
  width: MAP_THEME.inspectorWidth,
  radius: MAP_THEME.inspectorRadius,
} as const;
