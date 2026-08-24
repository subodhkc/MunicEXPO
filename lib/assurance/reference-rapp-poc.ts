/**
 * E1 Closure Sections 25-27 — Synthetic Reference rApp POC Fixture
 *
 * Section 25: Do NOT wait for Ericsson proprietary data to validate the architecture.
 *   Create a clearly labeled SYNTHETIC_REFERENCE_RAPP fixture using:
 *     - sample GitHub-style repository/source
 *     - public O-RAN reference interface semantics
 *     - sample Kubernetes/service-account data
 *     - synthetic IAM grants
 *     - synthetic Operating Envelope
 *     - mock/sandbox R1 action boundary
 *     - controlled Action Witnesses
 *
 * Section 26: Create deterministic fixture scenarios:
 *   A. ALIGNED
 *   B. OVER-GRANTED
 *   C. UNDECLARED CAPABILITY
 *   D. OBSERVED OUTSIDE ENVELOPE
 *   E. APPROVAL TRAJECTORY
 *   F. UNKNOWN PROPRIETARY OPERATION
 *
 * Section 27: Produce a machine-readable fixture result for U6.
 *
 * All synthetic authority must be labeled SYNTHETIC_REFERENCE_POLICY.
 */

import {
  SyntheticReferenceRAppFixture,
  POCFixtureOutput,
  POCScenarioResult,
  CapabilityFact,
  OperatingEnvelope,
  OperatingEnvelopeConstraints,
  ActionWitness,
  AssuranceDisposition,
  CapabilityKey,
} from './types';
import { PROFILE_IDS } from './profile-hierarchy';
import { createDraftEnvelope, approveEnvelope } from './operating-envelope';
import { compareCapabilitySets } from './capability-comparator';
import { comparisonToClaimState } from './capability-comparator';
import { normalizeCapabilityKey } from './types';
import { authoritativeActionAppliedWitness, actionConfirmedWitness } from './action-witness';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';

const PROFILE_ID = PROFILE_IDS.TELECOM_ORAN_BASELINE;
const PROFILE_VERSION = '0.1';
const ORG_ID = 'synthetic-org-rapp';
const AI_SYSTEM_ID = 'synthetic-ai-rapp';

/**
 * Section 25: Synthetic repository/source data.
 */
export function createSyntheticRAppRepository(): SyntheticReferenceRAppFixture['repository'] {
  return {
    repoId: 'synthetic-rapp-reference-repo',
    repoUrl: 'https://github.example.com/haiec/synthetic-rapp-reference',
    commitDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
    description: 'Synthetic reference rApp source for HAIEC POC. NOT Ericsson proprietary.',
  };
}

/**
 * Section 25: Synthetic IAM grants.
 */
export function createSyntheticIAMGrants(): SyntheticReferenceRAppFixture['iamGrants'] {
  return [
    {
      grantId: 'iam-grant-config-read',
      subject: 'rapp-service-account',
      action: 'read',
      resource: 'config',
      scope: 'Region-A',
      authorityLabel: 'SYNTHETIC_REFERENCE_POLICY',
    },
    {
      grantId: 'iam-grant-config-read-write',
      subject: 'rapp-service-account',
      action: 'write',
      resource: 'config',
      scope: 'Region-A',
      authorityLabel: 'SYNTHETIC_REFERENCE_POLICY',
    },
  ];
}

/**
 * Section 25: Synthetic approved Operating Envelope.
 */
export function createSyntheticOperatingEnvelope(): OperatingEnvelope {
  const constraints: OperatingEnvelopeConstraints = {
    allowedOperations: ['r1.configuration-management.read', 'r1.a1-policy.get'],
    resourceScopes: ['Region-A'],
    dataClasses: ['INTERNAL'],
    destinations: [],
    regions: ['Region-A'],
    r1Services: ['r1.configuration-management', 'r1.a1-policy'],
    maxTargetCount: 5,
    maxChangeMagnitude: 10,
    approvalRequirements: [
      { operation: 'r1.configuration-management.write', requiresApproval: true, approverRole: 'human-operator' },
    ],
    approvedModels: [],
    approvedTools: ['synthetic-rapp-adapter'],
    allowedEnvironments: ['sandbox', 'test'],
    prohibitedDataClasses: ['RESTRICTED'],
  };

  const draft = createDraftEnvelope({
    organizationId: ORG_ID,
    aiSystemId: AI_SYSTEM_ID,
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    constraints,
    authoritySourceLabel: 'SYNTHETIC_REFERENCE_POLICY',
  });

  return approveEnvelope(draft, 'synthetic-approver-1', new Date('2026-08-24T12:00:00Z'), 'synthetic-approval-ref-001');
}

/**
 * Section 25: Mock/sandbox R1 action boundary.
 */
export function createSyntheticR1ActionBoundary(): SyntheticReferenceRAppFixture['r1ActionBoundary'] {
  return {
    boundaryId: 'mock-r1-sandbox-boundary',
    boundaryType: 'MOCK_R1_SANDBOX',
    authorityLabel: 'SYNTHETIC_REFERENCE_POLICY',
    supportedOperations: [
      'r1.configuration-management.read',
      'r1.configuration-management.write',
      'r1.a1-policy.get',
    ],
  };
}

/**
 * Section 25: Build the full synthetic fixture.
 */
export function createSyntheticRAppFixture(): SyntheticReferenceRAppFixture {
  const envelope = createSyntheticOperatingEnvelope();

  return {
    fixtureId: 'synthetic-reference-rapp-poc-v0.1',
    fixtureLabel: 'SYNTHETIC_REFERENCE_RAPP',
    authorityLabel: 'SYNTHETIC_REFERENCE_POLICY',
    repository: createSyntheticRAppRepository(),
    iamGrants: createSyntheticIAMGrants(),
    operatingEnvelope: envelope,
    r1ActionBoundary: createSyntheticR1ActionBoundary(),
    actionWitnesses: [],
    capabilityFacts: {
      requested: [],
      policyAuthorized: [],
      effectivelyGranted: [],
      codeCapable: [],
      observed: [],
    },
  };
}

// ─── Capability Fact Helpers ────────────────────────────────────────────────

function makeCapability(
  capabilityId: string,
  action: string,
  resource: string,
  scope: string,
  sourcePlane: CapabilityFact['sourcePlane'],
  authority: CapabilityFact['authorityClass'],
  evidenceIds: string[],
  options: Partial<CapabilityFact> = {},
): CapabilityFact {
  return {
    capabilityId,
    subject: 'rapp-service-account',
    action,
    resource,
    scope,
    dataClass: 'INTERNAL',
    channel: 'r1',
    environment: 'sandbox',
    sourcePlane,
    authorityClass: authority,
    evidenceMethod: sourcePlane === 'OBSERVED' ? 'RUNTIME_TRACE' : sourcePlane === 'EFFECTIVELY_GRANTED' ? 'IAM_OBSERVATION' : 'STATIC_PATH_ANALYSIS',
    sourceEvidenceIds: evidenceIds,
    authoritySourceLabel: 'SYNTHETIC_REFERENCE_POLICY',
    ...options,
  };
}

// ─── Section 26: POC Scenarios ──────────────────────────────────────────────

export const POC_SCENARIO_LABELS = {
  ALIGNED: 'A. ALIGNED',
  OVER_GRANTED: 'B. OVER-GRANTED',
  UNDECLARED_CAPABILITY: 'C. UNDECLARED CAPABILITY',
  OBSERVED_OUTSIDE_ENVELOPE: 'D. OBSERVED OUTSIDE ENVELOPE',
  APPROVAL_TRAJECTORY: 'E. APPROVAL TRAJECTORY',
  UNKNOWN_PROPRIETARY_OPERATION: 'F. UNKNOWN PROPRIETARY OPERATION',
} as const;

/**
 * Scenario A: ALIGNED
 * Policy: CONFIG.READ permitted
 * Grant: CONFIG.READ
 * Code: CONFIG.READ
 * Observed: CONFIG.READ
 * → ALLOW within evaluated reference scope.
 */
export function scenarioAligned(): {
  facts: {
    requested: CapabilityFact[];
    policy: CapabilityFact[];
    granted: CapabilityFact[];
    capable: CapabilityFact[];
    observed: CapabilityFact[];
  };
  witnesses: ActionWitness[];
} {
  const requested = makeCapability('config-read-requested', 'read', 'config', 'Region-A', 'REQUESTED', 'VENDOR_DECLARATION', ['ev-request-1']);
  const policy = makeCapability('config-read-policy', 'read', 'config', 'Region-A', 'POLICY_AUTHORIZED', 'AUTHORITATIVE_POLICY', ['ev-policy-1']);
  const granted = makeCapability('config-read-granted', 'read', 'config', 'Region-A', 'EFFECTIVELY_GRANTED', 'EFFECTIVE_GRANT', ['ev-iam-1']);
  const capable = makeCapability('config-read-capable', 'read', 'config', 'Region-A', 'CODE_CAPABLE', 'NON_AUTHORITATIVE', ['ev-static-1']);
  const observed = makeCapability('config-read-observed', 'read', 'config', 'Region-A', 'OBSERVED', 'EFFECTIVE_GRANT', ['ev-witness-1']);

  const witnesses = [
    makeWitness('A', 'ACTION_REQUESTED', 'rapp-service-account', 'read', 'config', 'Region-A', 'ev-witness-1'),
    makeWitness('A', 'ACTION_AUTHORIZED', 'rapp-service-account', 'read', 'config', 'Region-A', 'ev-witness-2'),
    makeWitness('A', 'ACTION_ACCEPTED', 'rapp-service-account', 'read', 'config', 'Region-A', 'ev-witness-3'),
    makeAuthoritativeAppliedWitness('A', 'rapp-service-account', 'read', 'config', 'Region-A', 'ev-witness-4'),
    actionConfirmedWitness({
      confirmationId: 'A',
      actionCorrelationId: 'scenario-A',
      actorIdentity: 'rapp-service-account',
      operation: 'read',
      sideEffectWitness: 'config-read-confirm-1',
      observedAt: new Date('2026-08-24T12:01:00Z'),
      authoritySourceLabel: 'SYNTHETIC_REFERENCE_POLICY',
    }),
  ];

  return { facts: { requested: [requested], policy: [policy], granted: [granted], capable: [capable], observed: [observed] }, witnesses };
}

/**
 * Scenario B: OVER-GRANTED
 * Policy: CONFIG.READ
 * Grant: CONFIG.READ + CONFIG.WRITE
 * Code: CONFIG.READ
 * → REVIEW/BLOCK, OVER_PRIVILEGED_GRANT.
 */
export function scenarioOverGranted(): {
  facts: {
    requested: CapabilityFact[];
    policy: CapabilityFact[];
    granted: CapabilityFact[];
    capable: CapabilityFact[];
    observed: CapabilityFact[];
  };
  witnesses: ActionWitness[];
} {
  const requested = makeCapability('config-read-requested', 'read', 'config', 'Region-A', 'REQUESTED', 'VENDOR_DECLARATION', ['ev-request-1']);
  const policy = makeCapability('config-read-policy', 'read', 'config', 'Region-A', 'POLICY_AUTHORIZED', 'AUTHORITATIVE_POLICY', ['ev-policy-1']);
  const grantedRead = makeCapability('config-read-granted', 'read', 'config', 'Region-A', 'EFFECTIVELY_GRANTED', 'EFFECTIVE_GRANT', ['ev-iam-1']);
  const grantedWrite = makeCapability('config-write-granted', 'write', 'config', 'Region-A', 'EFFECTIVELY_GRANTED', 'EFFECTIVE_GRANT', ['ev-iam-2']);
  const capable = makeCapability('config-read-capable', 'read', 'config', 'Region-A', 'CODE_CAPABLE', 'NON_AUTHORITATIVE', ['ev-static-1']);

  return { facts: { requested: [requested], policy: [policy], granted: [grantedRead, grantedWrite], capable: [capable], observed: [] }, witnesses: [] };
}

/**
 * Scenario C: UNDECLARED CAPABILITY
 * Policy: CONFIG.READ
 * Code: CONFIG.READ + CONFIG.WRITE
 * → high-impact undeclared capability.
 */
export function scenarioUndeclaredCapability(): {
  facts: {
    requested: CapabilityFact[];
    policy: CapabilityFact[];
    granted: CapabilityFact[];
    capable: CapabilityFact[];
    observed: CapabilityFact[];
  };
  witnesses: ActionWitness[];
} {
  const requested = makeCapability('config-read-requested', 'read', 'config', 'Region-A', 'REQUESTED', 'VENDOR_DECLARATION', ['ev-request-1']);
  const policy = makeCapability('config-read-policy', 'read', 'config', 'Region-A', 'POLICY_AUTHORIZED', 'AUTHORITATIVE_POLICY', ['ev-policy-1']);
  const granted = makeCapability('config-read-granted', 'read', 'config', 'Region-A', 'EFFECTIVELY_GRANTED', 'EFFECTIVE_GRANT', ['ev-iam-1']);
  const capableRead = makeCapability('config-read-capable', 'read', 'config', 'Region-A', 'CODE_CAPABLE', 'NON_AUTHORITATIVE', ['ev-static-1']);
  const capableWrite = makeCapability('config-write-capable', 'write', 'config', 'Region-A', 'CODE_CAPABLE', 'NON_AUTHORITATIVE', ['ev-static-2']);

  return { facts: { requested: [requested], policy: [policy], granted: [granted], capable: [capableRead, capableWrite], observed: [] }, witnesses: [] };
}

/**
 * Scenario D: OBSERVED OUTSIDE ENVELOPE
 * Policy: CONFIG.WRITE Region-A maxTargets=5
 * Observed: CONFIG.WRITE Region-B or 25 targets
 * → BLOCK.
 */
export function scenarioObservedOutsideEnvelope(): {
  facts: {
    requested: CapabilityFact[];
    policy: CapabilityFact[];
    granted: CapabilityFact[];
    capable: CapabilityFact[];
    observed: CapabilityFact[];
  };
  witnesses: ActionWitness[];
} {
  const requested = makeCapability('config-write-requested', 'write', 'config', 'Region-A', 'REQUESTED', 'VENDOR_DECLARATION', ['ev-request-1']);
  const policy = makeCapability('config-write-policy', 'write', 'config', 'Region-A', 'POLICY_AUTHORIZED', 'AUTHORITATIVE_POLICY', ['ev-policy-1']);
  const granted = makeCapability('config-write-granted', 'write', 'config', 'Region-A', 'EFFECTIVELY_GRANTED', 'EFFECTIVE_GRANT', ['ev-iam-1']);
  const capable = makeCapability('config-write-capable', 'write', 'config', 'Region-A', 'CODE_CAPABLE', 'NON_AUTHORITATIVE', ['ev-static-1']);
  // Observed outside Region-A (Region-B)
  const observed = makeCapability('config-write-observed', 'write', 'config', 'Region-B', 'OBSERVED', 'EFFECTIVE_GRANT', ['ev-witness-1']);

  const witnesses = [
    makeWitness('D', 'ACTION_REQUESTED', 'rapp-service-account', 'write', 'config', 'Region-A', 'ev-witness-1'),
    makeWitness('D', 'ACTION_AUTHORIZED', 'rapp-service-account', 'write', 'config', 'Region-A', 'ev-witness-2'),
    makeWitness('D', 'ACTION_ACCEPTED', 'rapp-service-account', 'write', 'config', 'Region-A', 'ev-witness-3'),
    makeAuthoritativeAppliedWitness('D', 'rapp-service-account', 'write', 'config', 'Region-B', 'ev-witness-4'),
  ];

  return { facts: { requested: [requested], policy: [policy], granted: [granted], capable: [capable], observed: [observed] }, witnesses };
}

/**
 * Scenario E: APPROVAL TRAJECTORY
 * Expected: READ → ANALYZE → RECOMMEND → APPROVAL → WRITE
 * Observed: READ → ANALYZE → WRITE
 * → REQUIRED_APPROVAL_STEP_MISSING → BLOCK.
 */
export function scenarioApprovalTrajectory(): {
  facts: {
    requested: CapabilityFact[];
    policy: CapabilityFact[];
    granted: CapabilityFact[];
    capable: CapabilityFact[];
    observed: CapabilityFact[];
  };
  witnesses: ActionWitness[];
  missingPhases: string[];
} {
  const requested = makeCapability('config-write-requested', 'write', 'config', 'Region-A', 'REQUESTED', 'VENDOR_DECLARATION', ['ev-request-1']);
  const policy = makeCapability('config-write-policy', 'write', 'config', 'Region-A', 'POLICY_AUTHORIZED', 'AUTHORITATIVE_POLICY', ['ev-policy-1']);
  const granted = makeCapability('config-write-granted', 'write', 'config', 'Region-A', 'EFFECTIVELY_GRANTED', 'EFFECTIVE_GRANT', ['ev-iam-1']);
  const capable = makeCapability('config-write-capable', 'write', 'config', 'Region-A', 'CODE_CAPABLE', 'NON_AUTHORITATIVE', ['ev-static-1']);
  const observed = makeCapability('config-write-observed', 'write', 'config', 'Region-A', 'OBSERVED', 'EFFECTIVE_GRANT', ['ev-witness-1']);

  // Observed trajectory: READ → ANALYZE → WRITE (missing RECOMMEND and APPROVAL)
  const witnesses = [
    makeWitness('E', 'ACTION_REQUESTED', 'rapp-service-account', 'read', 'config', 'Region-A', 'ev-witness-1'),
    makeWitness('E', 'ACTION_AUTHORIZED', 'rapp-service-account', 'read', 'config', 'Region-A', 'ev-witness-2'),
    makeWitness('E', 'ACTION_ACCEPTED', 'rapp-service-account', 'read', 'config', 'Region-A', 'ev-witness-3'),
    makeAuthoritativeAppliedWitness('E', 'rapp-service-account', 'write', 'config', 'Region-A', 'ev-witness-4'),
    actionConfirmedWitness({
      confirmationId: 'E',
      actionCorrelationId: 'scenario-E',
      actorIdentity: 'rapp-service-account',
      operation: 'write',
      sideEffectWitness: 'config-write-confirm-1',
      observedAt: new Date('2026-08-24T12:02:00Z'),
      authoritySourceLabel: 'SYNTHETIC_REFERENCE_POLICY',
    }),
  ];

  return { facts: { requested: [requested], policy: [policy], granted: [granted], capable: [capable], observed: [observed] }, witnesses, missingPhases: ['RECOMMEND', 'APPROVAL'] };
}

/**
 * Scenario F: UNKNOWN PROPRIETARY OPERATION
 * → REVIEW, never ALLOW.
 */
export function scenarioUnknownProprietaryOperation(): {
  facts: {
    requested: CapabilityFact[];
    policy: CapabilityFact[];
    granted: CapabilityFact[];
    capable: CapabilityFact[];
    observed: CapabilityFact[];
  };
  witnesses: ActionWitness[];
  operationId: string;
} {
  // Generic placeholder for unknown EIAP proprietary operation
  const unknown = makeCapability(
    'ericsson.eiap.unknown.unknown-optimization',
    'execute',
    'unknown',
    'Region-A',
    'REQUESTED',
    'UNKNOWN',
    ['ev-request-1'],
  );

  return {
    facts: { requested: [unknown], policy: [], granted: [], capable: [], observed: [] },
    witnesses: [],
    operationId: 'ericsson.eiap.unknown.unknown-optimization',
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeWitness(
  scenario: string,
  phase: ActionWitness['phase'],
  actor: string,
  operation: string,
  resource: string,
  scope: string,
  witnessId: string,
): ActionWitness {
  return {
    witnessId,
    phase,
    actorIdentity: actor,
    operation,
    resourceScope: `${resource}/${scope}`,
    observedAt: new Date('2026-08-24T12:00:00Z'),
    actionCorrelationId: `scenario-${scenario}`,
    authoritySourceLabel: 'SYNTHETIC_REFERENCE_POLICY',
  };
}

function makeAuthoritativeAppliedWitness(
  scenario: string,
  actor: string,
  operation: string,
  resource: string,
  scope: string,
  witnessId: string,
): ActionWitness {
  return authoritativeActionAppliedWitness({
    boundaryId: 'mock-r1-sandbox-boundary',
    actionCorrelationId: `scenario-${scenario}`,
    actorIdentity: actor,
    operation,
    resourceScope: `${resource}/${scope}`,
    buildDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
    sideEffectWitness: `${operation}-side-effect-1`,
    observedAt: new Date('2026-08-24T12:01:00Z'),
    authoritySourceLabel: 'SYNTHETIC_REFERENCE_POLICY',
  });
}

function factToKey(fact: CapabilityFact): CapabilityKey {
  return normalizeCapabilityKey(fact);
}

// ─── Section 27: Run all scenarios and produce machine-readable output ───────

export function runAllPOCScenarios(): POCFixtureOutput {
  const fixture = createSyntheticRAppFixture();
  const envelope = fixture.operatingEnvelope;

  const scenarios = [
    { id: 'A', label: POC_SCENARIO_LABELS.ALIGNED, ...scenarioAligned() },
    { id: 'B', label: POC_SCENARIO_LABELS.OVER_GRANTED, ...scenarioOverGranted() },
    { id: 'C', label: POC_SCENARIO_LABELS.UNDECLARED_CAPABILITY, ...scenarioUndeclaredCapability() },
    { id: 'D', label: POC_SCENARIO_LABELS.OBSERVED_OUTSIDE_ENVELOPE, ...scenarioObservedOutsideEnvelope() },
    { id: 'E', label: POC_SCENARIO_LABELS.APPROVAL_TRAJECTORY, ...scenarioApprovalTrajectory() },
    { id: 'F', label: POC_SCENARIO_LABELS.UNKNOWN_PROPRIETARY_OPERATION, ...scenarioUnknownProprietaryOperation() },
  ];

  const scenarioResults: POCScenarioResult[] = scenarios.map((s, index) => {
    const comparison = compareCapabilitySets({
      requested: s.facts.requested,
      policy: s.facts.policy,
      granted: s.facts.granted,
      capable: s.facts.capable,
      observed: s.facts.observed,
      envelope,
    });

    const mappedClaimResults = comparison.comparisons.map(comp => {
      const claimState = comparisonToClaimState(comp.comparisons);
      return {
        claimKey: comp.mappedClaimKey ?? 'privileged-action-authorization',
        claimState: claimState.claimState,
        reasonCodes: [...claimState.reasonCodes, ...comp.comparisons as any],
      };
    });

    const disposition: AssuranceDisposition =
      comparison.overallVerdict === 'BLOCK' ? 'BLOCK' :
      comparison.overallVerdict === 'REVIEW' ? 'REVIEW' : 'ALLOW';

    return {
      scenarioId: `synthetic-rapp-poc-scenario-${s.id}`,
      scenarioLabel: s.label,
      profileId: PROFILE_ID,
      profileVersion: PROFILE_VERSION,
      profileDigest: 'synthetic-profile-digest',
      envelopeId: envelope.envelopeId,
      envelopeVersion: envelope.envelopeVersion,
      envelopeDigest: envelope.envelopeDigest,
      envelopeState: envelope.state,
      buildDigest: fixture.repository.commitDigest,
      requestedCapabilities: s.facts.requested.map(factToKey),
      authorizedCapabilities: s.facts.policy.map(factToKey),
      grantedCapabilities: s.facts.granted.map(factToKey),
      codeCapabilities: s.facts.capable.map(factToKey),
      observedCapabilities: s.facts.observed.map(factToKey),
      comparisons: comparison.comparisons,
      claimResults: mappedClaimResults,
      disposition,
      evidenceIds: [
        ...s.facts.requested.flatMap(f => f.sourceEvidenceIds),
        ...s.facts.policy.flatMap(f => f.sourceEvidenceIds),
        ...s.facts.granted.flatMap(f => f.sourceEvidenceIds),
        ...s.facts.capable.flatMap(f => f.sourceEvidenceIds),
        ...s.facts.observed.flatMap(f => f.sourceEvidenceIds),
      ],
    };
  });

  const digestInput = {
    fixtureId: fixture.fixtureId,
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    envelopeDigest: envelope.envelopeDigest,
    buildDigest: fixture.repository.commitDigest,
    scenarios: scenarioResults.map(s => s.scenarioId),
  };

  return {
    fixtureId: fixture.fixtureId,
    fixtureLabel: 'SYNTHETIC_REFERENCE_RAPP',
    authorityLabel: 'SYNTHETIC_REFERENCE_POLICY',
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    profileDigest: 'synthetic-profile-digest',
    envelopeId: envelope.envelopeId,
    envelopeVersion: envelope.envelopeVersion,
    envelopeDigest: envelope.envelopeDigest,
    buildDigest: fixture.repository.commitDigest,
    scenarios: scenarioResults,
    generatedAt: new Date('2026-08-24T12:00:00Z').toISOString(),
  };
}
