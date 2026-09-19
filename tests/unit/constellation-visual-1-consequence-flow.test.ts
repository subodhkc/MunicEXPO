/**
 * CONSTELLATION-VISUAL-1 — Consequence Flow presentation locks.
 *
 * Locks the consequence-first presentation contract:
 *   - Overview groups by DISPLAY family (label + effect + resource from the
 *     existing deterministic presentation mapping) — a display group may
 *     contain multiple exact consequenceRelationIds.
 *     DISPLAY_GROUP != CANONICAL_CONSEQUENCE_IDENTITY;
 *     SAME_DISPLAY_LABEL != SAME_RELATION.
 *   - Every exact pathId / consequenceRelationId / sinkTargetId is preserved
 *     inside the display group — nothing is dropped, merged, or invented.
 *   - Deterministic ordering: state-changing effects first, then path
 *     count, then label — presentation ordering, not risk ranking.
 *   - Plane states are shown verbatim — PARTIAL != ESTABLISHED,
 *     NOT_ASSESSED != FAILURE.
 *   - Missing canonical bridges render frontier breaks, not fabricated
 *     connectors — MISSING_BRIDGE != ESTABLISHED_CONNECTION.
 *   - ONE canonical consequenceRelationId renders ONE established edge —
 *     target resource metadata does not become a second display edge.
 *   - No implied arrows in overview fact summaries —
 *     TYPOGRAPHIC_ARROW != RELATIONSHIP.
 *   - TOOL_CANDIDATE_ID != MODEL_VISIBLE_ESTABLISHED — capability stage
 *     must not claim model visibility the input does not carry.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { groupPathsByConsequence, type FlowActionPath } from '@/lib/topology/consequence-flow-presentation';

const SRC = readFileSync(
  join(__dirname, '../../components/ai-inventory/ConsequenceFlowView.tsx'),
  'utf8',
);

function path(over: Partial<FlowActionPath>): FlowActionPath {
  return {
    pathId: 'path:' + Math.random().toString(36).slice(2),
    handlerRef: 'handler.py:1',
    planes: {
      requested: 'ESTABLISHED',
      policyAuthorized: 'NOT_ASSESSED',
      effectivelyGranted: 'NOT_ASSESSED',
      codeCapable: 'ESTABLISHED',
      observed: 'NOT_ASSESSED',
    },
    ...over,
  };
}

describe('groupPathsByConsequence — two-level display grouping', () => {
  it('a display group may contain multiple exact consequenceRelationIds', () => {
    const p1 = path({ pathId: 'a1', consequenceRelationId: 'rel:1' });
    const p2 = path({ pathId: 'a2', consequenceRelationId: 'rel:2' });
    const groups = groupPathsByConsequence([p2, p1], () => ({ label: 'ORDER RECORD WRITE', effect: 'WRITE', resource: 'orders' }));
    expect(groups).toHaveLength(1);
    expect(groups[0].relationIds.sort()).toEqual(['rel:1', 'rel:2']);
    expect(groups[0].paths.map((p) => p.pathId).sort()).toEqual(['a1', 'a2']);
  });

  it('different display labels never merge — SAME_DISPLAY_LABEL != SAME_RELATION is not violated upward', () => {
    const p1 = path({ pathId: 'a1', consequenceRelationId: 'rel:1' });
    const p2 = path({ pathId: 'a2', consequenceRelationId: 'rel:2' });
    const groups = groupPathsByConsequence([p1, p2], (p) =>
      p.pathId === 'a1'
        ? { label: 'ORDER RECORD WRITE', effect: 'WRITE', resource: 'orders' }
        : { label: 'MENU ITEMS READ', effect: 'READ', resource: 'menu' },
    );
    expect(groups).toHaveLength(2);
  });

  it('no exact identity is lost — every pathId and relationId survives grouping', () => {
    const ps = Array.from({ length: 7 }, (_, i) =>
      path({ pathId: `p${i}`, consequenceRelationId: `rel:${i}`, sinkTargetIds: [`t:${i}`] }),
    );
    const groups = groupPathsByConsequence(ps, () => ({ label: 'X', effect: 'WRITE', resource: 'r' }));
    expect(groups).toHaveLength(1);
    expect(groups[0].paths).toHaveLength(7);
    expect(new Set(groups[0].paths.map((p) => p.pathId)).size).toBe(7);
    expect(groups[0].relationIds).toHaveLength(7);
  });

  it('paths without a relation id keep exact path identity (relationIds only counts real ids)', () => {
    const p1 = path({ pathId: 'a1', consequenceRelationId: 'rel:1' });
    const p2 = path({ pathId: 'a2' });
    const groups = groupPathsByConsequence([p1, p2], () => ({ label: 'Y' }));
    expect(groups[0].relationIds).toEqual(['rel:1']);
    expect(groups[0].paths).toHaveLength(2);
  });

  it('deduplicates shared relation ids — PATH_COUNT != UNIQUE_RELATION_COUNT', () => {
    const p1 = path({ pathId: 'a1', consequenceRelationId: 'rel:A' });
    const p2 = path({ pathId: 'a2', consequenceRelationId: 'rel:A' });
    const p3 = path({ pathId: 'a3', consequenceRelationId: 'rel:B' });
    const groups = groupPathsByConsequence([p3, p1, p2], () => ({ label: 'X', effect: 'WRITE', resource: 'r' }));
    expect(groups[0].paths).toHaveLength(3);
    expect(groups[0].relationIds).toEqual(['rel:A', 'rel:B']);
  });

  it('orders state-changing effects first — deterministic presentation order, not risk rank', () => {
    const read = path({ pathId: 'r1' });
    const write = path({ pathId: 'w1' });
    const groups = groupPathsByConsequence(
      [read, write],
      (p) => ({ label: p.pathId === 'w1' ? 'ORDER RECORD WRITE' : 'MENU READ', effect: p.pathId === 'w1' ? 'WRITE' : 'READ' }),
    );
    expect(groups[0].label).toBe('ORDER RECORD WRITE');
  });
});

describe('ConsequenceFlowView — presentation truth locks', () => {
  it('renders an explicit frontier break, never a fabricated bridge', () => {
    expect(SRC).toContain('data-testid="evidence-frontier-break"');
    expect(SRC).toContain('frontier — relation not established');
  });

  it('does not claim model visibility the input does not carry — TOOL_CANDIDATE_ID != MODEL_VISIBLE', () => {
    expect(SRC).not.toContain('model-visible');
    expect(SRC).toContain('evaluated capability');
  });

  it('one canonical relation renders one edge — no separate resource→consequence edge', () => {
    expect(SRC).not.toContain('"reaches"');
    expect(SRC).not.toContain("'reaches'");
    // The established connector label names the single canonical relation.
    expect(SRC).toContain('established consequence relation');
    // Target metadata folds into the consequence card, not a second node-edge pair.
    expect(SRC).toContain('target: ');
  });

  it('overview mini-chain uses a fact summary — no implied arrows', () => {
    const mini = SRC.slice(SRC.indexOf('function MiniChain'), SRC.indexOf('function PathChain'));
    expect(mini).not.toContain('→');
    expect(mini).toContain('Handler');
    expect(mini).toContain('Target');
  });

  it('shows plane states verbatim — no normalization to pass/fail', () => {
    expect(SRC).toContain('NOT_ASSESSED');
    expect(SRC).toContain("state.replace(/_/g, ' ')");
    expect(SRC).toContain('not that it was authorized or observed');
  });

  it('keeps canonical identity visible (relation id, handler, sink)', () => {
    expect(SRC).toContain('p.consequenceRelationId');
    expect(SRC).toContain('path.handlerRef');
    expect(SRC).toContain('path.sinkTargetIds');
  });

  it('empty path population renders the honest no-relations state', () => {
    expect(SRC).toContain('no established consequential paths');
  });

  it('does not invent a second graph engine — deterministic layout only', () => {
    expect(SRC).not.toContain('@antv/g6');
    expect(SRC).not.toContain('ReactFlow');
    expect(SRC).not.toContain('forceSimulation');
  });
});

describe('ActionAccessMapView — evaluation-bound loading honesty', () => {
  const VIEW = readFileSync(
    join(__dirname, '../../components/ai-inventory/ActionAccessMapView.tsx'),
    'utf8',
  );

  it('shows a loading state while exact paths are in flight — no graph flash', () => {
    expect(VIEW).toContain('Loading evaluated consequence paths');
    expect(VIEW).toContain('No analysis is being rerun');
    expect(VIEW).toContain('data-testid="evaluated-paths-loading"');
  });

  it('shows a bounded error state with retry — never substitutes current-source paths', () => {
    expect(VIEW).toContain('Evaluated consequence paths could not be loaded.');
    expect(VIEW).toContain('Open System Map');
    expect(VIEW).toContain('onRetryPaths');
  });
});

describe('ActionAccessMap — evaluated commit identity', () => {
  const MAP = readFileSync(
    join(__dirname, '../../components/ai-inventory/ActionAccessMap.tsx'),
    'utf8',
  );

  it('binds Proof commit to the canonical repositoryCommitSha only — no current-source fallback', () => {
    // REPORT_EVALUATION_COMMIT = repositoryCommitSha
    // CURRENT_SOURCE_COMMIT != EVALUATED_SOURCE_COMMIT
    expect(MAP).toContain('b.evaluationIdentity?.repositoryCommitSha');
    expect(MAP).not.toContain('b.evaluationIdentity?.sourceCommitSha');
    expect(MAP).not.toContain('b.evaluationIdentity?.commitSha ??');
  });
});
