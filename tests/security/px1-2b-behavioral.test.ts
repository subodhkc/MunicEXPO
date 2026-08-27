/**
 * PX1.2B — Behavioral Invariant Tests (Section 46)
 *
 * Tests actual function behavior, not static text.
 *
 * Categories:
 *   A. System Type taxonomy — canonical values, legacy mapping, display-only
 *   B. Connection Choices — mapping to asset types, validation
 *   C. Next-Action Engine — deterministic rules, lifecycle order
 *   D. State Separation — CONNECTED != EVALUATED, IDENTITY != ASSURANCE
 *   E. Truth Invariants — no fabrication, explicit missing states
 */

import { describe, it, expect } from 'vitest';
import {
  SYSTEM_TYPES,
  isSystemType,
  resolveCanonicalSystemType,
  getSystemTypeLabel,
  getSystemTypeChoices,
} from '@/lib/ai-inventory/system-types';
import {
  CONNECTION_CHOICES,
  isConnectionChoice,
  resolveAssetTypeForConnection,
  getConnectionChoices,
  CONNECTION_TO_ASSET_TYPE,
} from '@/lib/ai-inventory/connection-choices';
import {
  computeNextAction,
  type SystemStateForNextAction,
} from '@/lib/ai-inventory/system-next-action';
import { ASSET_TYPES } from '@/lib/ai-inventory/connected-assets';

// ─── A. System Type Taxonomy ─────────────────────────────────────────────────

describe('[PX1.2B §5] System Type taxonomy', () => {
  it('has canonical system types', () => {
    expect(SYSTEM_TYPES.length).toBeGreaterThan(0);
    expect(SYSTEM_TYPES).toContain('AI_APPLICATION');
    expect(SYSTEM_TYPES).toContain('AI_AGENT');
    expect(SYSTEM_TYPES).toContain('CUSTOM_OTHER');
  });

  it('SYSTEM_TYPE != ASSET_TYPE — no overlap with asset types', () => {
    for (const st of SYSTEM_TYPES) {
      expect(ASSET_TYPES).not.toContain(st);
    }
  });

  it('validates canonical system types', () => {
    expect(isSystemType('AI_APPLICATION')).toBe(true);
    expect(isSystemType('SOURCE_REPOSITORY')).toBe(false); // asset type, not system type
    expect(isSystemType('')).toBe(false);
    expect(isSystemType(null)).toBe(false);
    expect(isSystemType(undefined)).toBe(false);
  });

  it('maps legacy systemType values to canonical (display-only)', () => {
    expect(resolveCanonicalSystemType('llm')).toBe('MODEL_INFERENCE_SERVICE');
    expect(resolveCanonicalSystemType('generative_ai')).toBe('AI_APPLICATION');
    expect(resolveCanonicalSystemType('agent')).toBe('AI_AGENT');
    expect(resolveCanonicalSystemType('github_repository')).toBe('AI_APPLICATION');
    expect(resolveCanonicalSystemType('ml_model')).toBe('MODEL_INFERENCE_SERVICE');
  });

  it('returns CUSTOM_OTHER for unknown/null values', () => {
    expect(resolveCanonicalSystemType(null)).toBe('CUSTOM_OTHER');
    expect(resolveCanonicalSystemType(undefined)).toBe('CUSTOM_OTHER');
    expect(resolveCanonicalSystemType('')).toBe('CUSTOM_OTHER');
    expect(resolveCanonicalSystemType('some_random_value')).toBe('CUSTOM_OTHER');
  });

  it('passes through already-canonical values', () => {
    expect(resolveCanonicalSystemType('AI_APPLICATION')).toBe('AI_APPLICATION');
    expect(resolveCanonicalSystemType('AI_AGENT')).toBe('AI_AGENT');
  });

  it('provides customer-facing labels', () => {
    expect(getSystemTypeLabel('AI_APPLICATION')).toBe('AI Application');
    expect(getSystemTypeLabel('llm')).toBe('Model / Inference Service'); // legacy mapped
    expect(getSystemTypeLabel(null)).toBe('Custom / Other');
  });

  it('provides choices for onboarding UI', () => {
    const choices = getSystemTypeChoices();
    expect(choices.length).toBe(SYSTEM_TYPES.length);
    expect(choices[0]).toHaveProperty('value');
    expect(choices[0]).toHaveProperty('label');
  });
});

// ─── B. Connection Choices ──────────────────────────────────────────────────

describe('[PX1.2B §7] Connection choices → asset type mapping', () => {
  it('has connection choices', () => {
    expect(CONNECTION_CHOICES.length).toBeGreaterThan(0);
    expect(CONNECTION_CHOICES).toContain('CODE_REPOSITORY');
    expect(CONNECTION_CHOICES).toContain('LIVE_API_ENDPOINT');
    expect(CONNECTION_CHOICES).toContain('MANUAL_OTHER');
  });

  it('CONNECTION_CHOICE != SYSTEM_TYPE — no overlap', () => {
    for (const cc of CONNECTION_CHOICES) {
      expect(SYSTEM_TYPES).not.toContain(cc);
    }
  });

  it('validates connection choices', () => {
    expect(isConnectionChoice('CODE_REPOSITORY')).toBe(true);
    expect(isConnectionChoice('AI_APPLICATION')).toBe(false); // system type, not connection
    expect(isConnectionChoice('')).toBe(false);
    expect(isConnectionChoice(null)).toBe(false);
  });

  it('maps each connection choice to valid asset types', () => {
    for (const choice of CONNECTION_CHOICES) {
      const assetTypes = CONNECTION_TO_ASSET_TYPE[choice];
      expect(assetTypes).toBeDefined();
      expect(assetTypes.length).toBeGreaterThan(0);
      for (const at of assetTypes) {
        expect(ASSET_TYPES).toContain(at);
      }
    }
  });

  it('CODE_REPOSITORY maps to SOURCE_REPOSITORY', () => {
    expect(CONNECTION_TO_ASSET_TYPE.CODE_REPOSITORY).toContain('SOURCE_REPOSITORY');
  });

  it('resolves asset type for connection choice', () => {
    expect(resolveAssetTypeForConnection('CODE_REPOSITORY')).toBe('SOURCE_REPOSITORY');
    expect(resolveAssetTypeForConnection('CODE_REPOSITORY', 'SOURCE_REPOSITORY')).toBe('SOURCE_REPOSITORY');
  });

  it('rejects invalid specific asset type for connection choice', () => {
    // LIVE_API_ENDPOINT allows RUNTIME_ENDPOINT and MODEL_ENDPOINT, not SOURCE_REPOSITORY
    expect(resolveAssetTypeForConnection('LIVE_API_ENDPOINT', 'SOURCE_REPOSITORY')).toBe('RUNTIME_ENDPOINT');
  });

  it('returns null for invalid connection choice', () => {
    expect(resolveAssetTypeForConnection('INVALID' as any)).toBe(null);
  });
});

// ─── C. Next-Action Engine — Deterministic Rules ────────────────────────────

describe('[PX1.2B §34] Next-action deterministic rules', () => {
  const baseState: SystemStateForNextAction = {
    hasAssets: false,
    unresolvedIdentityCount: 0,
    hasEvidence: false,
    evidenceCoveragePartial: false,
    hasAssurance: false,
    latestDisposition: null,
    hasReceipt: false,
    systemId: 'test-system-id',
  };

  it('returns CONNECT when no assets', () => {
    const action = computeNextAction({ ...baseState, hasAssets: false });
    expect(action.stage).toBe('CONNECT');
    expect(action.label).toContain('Connect');
  });

  it('returns VERIFY_IDENTITY when assets have unverified identity', () => {
    const action = computeNextAction({
      ...baseState,
      hasAssets: true,
      unresolvedIdentityCount: 2,
    });
    expect(action.stage).toBe('VERIFY_IDENTITY');
    expect(action.description).toContain('2');
  });

  it('returns COLLECT_EVIDENCE when assets verified but no evidence', () => {
    const action = computeNextAction({
      ...baseState,
      hasAssets: true,
      unresolvedIdentityCount: 0,
      hasEvidence: false,
    });
    expect(action.stage).toBe('COLLECT_EVIDENCE');
  });

  it('returns REVIEW_EVIDENCE when evidence is partial', () => {
    const action = computeNextAction({
      ...baseState,
      hasAssets: true,
      unresolvedIdentityCount: 0,
      hasEvidence: true,
      evidenceCoveragePartial: true,
    });
    expect(action.stage).toBe('REVIEW_EVIDENCE');
  });

  it('returns RUN_ASSURANCE when evidence exists but no assurance', () => {
    const action = computeNextAction({
      ...baseState,
      hasAssets: true,
      unresolvedIdentityCount: 0,
      hasEvidence: true,
      evidenceCoveragePartial: false,
      hasAssurance: false,
    });
    expect(action.stage).toBe('RUN_ASSURANCE');
  });

  it('returns REVIEW_ASSURANCE when disposition is REVIEW', () => {
    const action = computeNextAction({
      ...baseState,
      hasAssets: true,
      unresolvedIdentityCount: 0,
      hasEvidence: true,
      evidenceCoveragePartial: false,
      hasAssurance: true,
      latestDisposition: 'REVIEW',
    });
    expect(action.stage).toBe('REVIEW_ASSURANCE');
  });

  it('returns VERIFY_RECEIPT when assurance exists but no receipt', () => {
    const action = computeNextAction({
      ...baseState,
      hasAssets: true,
      unresolvedIdentityCount: 0,
      hasEvidence: true,
      evidenceCoveragePartial: false,
      hasAssurance: true,
      latestDisposition: 'ALLOW',
      hasReceipt: false,
    });
    expect(action.stage).toBe('VERIFY_RECEIPT');
  });

  it('returns COMPLETE when all stages satisfied', () => {
    const action = computeNextAction({
      ...baseState,
      hasAssets: true,
      unresolvedIdentityCount: 0,
      hasEvidence: true,
      evidenceCoveragePartial: false,
      hasAssurance: true,
      latestDisposition: 'ALLOW',
      hasReceipt: true,
    });
    expect(action.stage).toBe('COMPLETE');
  });

  it('is deterministic — same input always produces same output', () => {
    const state: SystemStateForNextAction = {
      ...baseState,
      hasAssets: true,
      unresolvedIdentityCount: 1,
    };
    const action1 = computeNextAction(state);
    const action2 = computeNextAction(state);
    expect(action1).toEqual(action2);
  });

  it('evaluates rules in lifecycle order — CONNECT before COLLECT_EVIDENCE', () => {
    // Even if evidence is missing AND assets are missing, CONNECT wins
    const action = computeNextAction({
      ...baseState,
      hasAssets: false,
      hasEvidence: false,
    });
    expect(action.stage).toBe('CONNECT');
  });
});

// ─── D. State Separation ────────────────────────────────────────────────────

describe('[PX1.2B §17] State separation invariants', () => {
  it('CONNECTION_CHOICES does not contain EVALUATED state', () => {
    // CONNECTED is a connection state, but EVALUATED is not a connection choice
    expect(CONNECTION_CHOICES).not.toContain('EVALUATED');
  });

  it('SYSTEM_TYPES does not contain asset type names', () => {
    for (const st of SYSTEM_TYPES) {
      // System types describe the KIND of system, not where it lives
      expect(ASSET_TYPES).not.toContain(st);
    }
  });

  it('connection choice maps to asset types, not system types', () => {
    for (const choice of CONNECTION_CHOICES) {
      const assetTypes = CONNECTION_TO_ASSET_TYPE[choice];
      for (const at of assetTypes) {
        expect(ASSET_TYPES).toContain(at);
        expect(SYSTEM_TYPES).not.toContain(at);
      }
    }
  });
});

// ─── E. Truth Invariants — No Fabrication ───────────────────────────────────

describe('[PX1.2B §21] Truth invariants', () => {
  it('next-action does not claim completion when stages are missing', () => {
    const action = computeNextAction({
      hasAssets: false,
      unresolvedIdentityCount: 0,
      hasEvidence: false,
      evidenceCoveragePartial: false,
      hasAssurance: false,
      latestDisposition: null,
      hasReceipt: false,
      systemId: 'test',
    });
    expect(action.stage).not.toBe('COMPLETE');
  });

  it('next-action CTA href is null only for informational stages', () => {
    // COMPLETE stage should still have a href (to the system page)
    const action = computeNextAction({
      hasAssets: true,
      unresolvedIdentityCount: 0,
      hasEvidence: true,
      evidenceCoveragePartial: false,
      hasAssurance: true,
      latestDisposition: 'ALLOW',
      hasReceipt: true,
      systemId: 'test-id',
    });
    expect(action.stage).toBe('COMPLETE');
    expect(action.ctaHref).not.toBeNull();
  });

  it('system type labels are human-readable, not enum names', () => {
    const label = getSystemTypeLabel('AI_APPLICATION');
    expect(label).not.toBe('AI_APPLICATION'); // should be human-readable
    expect(label).toBe('AI Application');
  });
});
