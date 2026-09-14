/**
 * AA-RENDERER-2/R: Report profile projection.
 *
 * A thin pure layer between the canonical Assurance Evidence Bundle and
 * audience-specific renderers. Profiles choose what to show and how to
 * word it; they never reinterpret evidence or compute assurance.
 *
 * Invariants:
 *   PROFILE = WHAT_TO_SHOW
 *   BUNDLE = WHAT_IS_TRUE
 *   PROFILE != INTERPRETATION_ENGINE
 *   RENDERER != TRUTH_ENGINE
 *   DISPLAY_ELIGIBILITY != EVIDENCE_STATE
 *   ASSURANCE_DISPOSITION != EVIDENCE_AUTHORITY_STATE
 *   DECISION_BASIS = CANONICAL_U5_FACTS
 *   DECISION_BASIS != REPORTER_INFERENCE
 *   NOT_DISPLAYED != NOT_PRESENT
 */

import type { AssuranceEvidenceBundleV1, EvidenceAuthorityState, EvidenceActionPath, EvidenceReference } from './reporting-projection-bundle';
import type { ArtifactManifest } from './assurance-artifact-manifest';
import type { ClaimEvaluationResult, ClaimReasonCode, ClaimState } from './types';

export type AssuranceReportProfile = 'executive' | 'technical' | 'auditor' | 'machine';

export interface AssuranceReportSection {
  key: string;
  title: string;
  summary: string;
  items?: string[];
  limitations?: string[];
  evidenceRefs?: string[];
  actionPathRefs?: string[];
  /** Bounded counts when presentation selection truncates a canonical set. */
  totalCount?: number;
  displayedCount?: number;
}

export interface AssuranceReportProfileProjection {
  profile: AssuranceReportProfile;
  evaluationIdentity: AssuranceEvidenceBundleV1['evaluationIdentity'];
  bundleDigest: string;
  /** Canonical U5 disposition — a different vocabulary from evidence state. */
  disposition: AssuranceEvidenceBundleV1['disposition'];
  dispositionSource: AssuranceEvidenceBundleV1['dispositionSource'];
  dispositionAvailability: AssuranceEvidenceBundleV1['dispositionAvailability'];
  methodologyVersion?: string;
  /** Canonical U5 decision basis (BOUND facts or NOT_BOUND marker). */
  u5DecisionBasis: AssuranceEvidenceBundleV1['u5DecisionBasis'];
  /** Presentation selection accounting — NOT_DISPLAYED != NOT_PRESENT. */
  totalPathCount: number;
  displayedPathCount: number;
  sections: AssuranceReportSection[];
  limitations: string[];
}

/** Deterministic customer-facing labels for bounded states. */
const STATE_LABEL: Record<EvidenceAuthorityState, string> = {
  ESTABLISHED: 'Established',
  PARTIAL: 'Partially established',
  UNKNOWN: 'Unknown',
  NOT_ASSESSED: 'Not assessed',
  UNSUPPORTED: 'Unsupported',
  NOT_APPLICABLE: 'Not applicable',
};

/** States in which an authority plane is not established. NOT_APPLICABLE is not a failure. */
const AUTHORITY_GAP_STATES: ReadonlySet<EvidenceAuthorityState> = new Set([
  'PARTIAL',
  'UNKNOWN',
  'NOT_ASSESSED',
  'UNSUPPORTED',
]);

const AUTHORITY_GAP_PHRASE: Partial<Record<EvidenceAuthorityState, string>> = {
  PARTIAL: 'is only partially established in the evaluated evidence',
  UNKNOWN: 'remains unknown in the evaluated evidence',
  NOT_ASSESSED: 'has not been established from the evaluated evidence',
  UNSUPPORTED: 'could not be assessed by the evaluated evidence (unsupported)',
};

/** Deterministic executive prioritization — NOT a risk ranking. */
const CLAIM_STATE_PRIORITY: Record<ClaimState, number> = {
  CONTRADICTED: 0,
  REVIEW_REQUIRED: 1,
  INSUFFICIENT_EVIDENCE: 2,
  PARTIALLY_SUPPORTED: 3,
  NOT_ASSESSED: 4,
  SUPPORTED: 5,
  NOT_APPLICABLE: 6,
};

const CLAIM_STATE_LABEL: Record<ClaimState, string> = {
  SUPPORTED: 'Supported',
  PARTIALLY_SUPPORTED: 'Partially supported',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
  CONTRADICTED: 'Contradicted',
  REVIEW_REQUIRED: 'Review required',
  NOT_ASSESSED: 'Not assessed',
  NOT_APPLICABLE: 'Not applicable',
};

/** Deterministic presentation mapping for canonical U5 reason codes. */
const REASON_SENTENCE: Record<ClaimReasonCode, string> = {
  SUPPORTED_BY_REQUIRED_TECHNICAL_EVIDENCE: 'The claim was supported by the required technical evidence.',
  SUPPORTED_BY_RUNTIME_EVIDENCE: 'The claim was supported by runtime evidence.',
  SUPPORTED_BY_CONFIGURATION_EVIDENCE: 'The claim was supported by configuration evidence.',
  MISSING_REQUIRED_TECHNICAL_EVIDENCE: 'Required technical evidence was not available for one or more evaluated claims.',
  MISSING_REQUIRED_DIMENSION: 'A required evaluation dimension had no qualifying evidence.',
  SELF_REPORTED_ONLY: 'A claim relied only on self-reported evidence where stronger evidence was required.',
  COVERAGE_UNKNOWN: 'Evidence coverage was unknown for an evaluated claim.',
  COVERAGE_INSUFFICIENT: 'Available evidence did not meet the required coverage for an evaluated claim.',
  PRODUCER_FAILED: 'A required evidence producer failed during evaluation.',
  PRODUCER_TIMEOUT: 'A required evidence producer timed out during evaluation.',
  CONTRADICTING_FINDING: 'Qualifying evidence contradicted an evaluated assurance claim.',
  CONFLICTING_PRODUCERS: 'Evidence producers disagreed in a way that could not be resolved automatically.',
  STALE_EVIDENCE: 'Required evidence did not satisfy the evaluation freshness requirement.',
  EXTERNAL_SOURCE_ONLY: 'An evaluated claim relied only on external evidence where stronger evidence was required.',
  NOT_EVALUATED: 'A claim was not evaluated.',
  NOT_APPLICABLE_TO_ARCHITECTURE: 'A claim did not apply to the evaluated architecture.',
  ZERO_FINDINGS_WITH_KNOWN_COVERAGE: 'No findings were detected within known evidence coverage.',
  PARTIAL_REQUIREMENTS_MET: 'A claim was partially supported by the evaluated evidence.',
  CAPABILITY_CONTRADICTION: 'Capability evidence contradicted an evaluated assurance claim.',
  REQUIRED_APPROVAL_STEP_MISSING: 'A required approval step had no supporting evidence.',
  OVER_PRIVILEGED_GRANT_DETECTED: 'A grant exceeded the evaluated authority for a claim.',
  UNDECLARED_CAPABILITY_DETECTED: 'A capability was detected that was not declared for the evaluated scope.',
  OBSERVED_OUTSIDE_OPERATING_ENVELOPE: 'Observed behavior fell outside the evaluated operating envelope.',
  CAPABILITY_OUTSIDE_POLICY: 'A capability fell outside evaluated policy.',
  EXCESS_GRANTED_AUTHORITY: 'Granted authority exceeded what the evaluated scope requires.',
  UNTESTED_CAPABILITY: 'A capability was not exercised or verified by the evaluated evidence.',
  UNEXPLAINED_RUNTIME_BEHAVIOR: 'Runtime behavior was observed that the evaluated evidence does not explain.',
  REQUESTED_NOT_AUTHORIZED: 'A requested action was not established as authorized by policy evidence.',
  EFFECTIVE_GRANT_NOT_PROVIDED: 'Effective grant evidence was not provided for an evaluated claim.',
  SCOPE_EXCEEDS_POLICY: 'The evaluated scope exceeded policy.',
  TARGET_COUNT_EXCEEDS_POLICY: 'Action target count exceeded evaluated policy.',
  CHANGE_MAGNITUDE_EXCEEDS_POLICY: 'Change magnitude exceeded evaluated policy.',
  UNKNOWN_OPERATION_REVIEW: 'An operation could not be classified and requires review.',
};

function humanizeClaimKey(claimKey: string): string {
  const label = claimKey.replace(/[-_]/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dispositionBasisSummary(bundle: AssuranceEvidenceBundleV1): string {
  if (bundle.u5DecisionBasis.availability === 'BOUND') {
    return 'Why the canonical assurance engine reached this disposition, from the evaluated claims bound to this exact evaluation.';
  }
  return 'No completed canonical U5 evaluation is bound to this bundle, so no decision basis is available. That is not a pass.';
}

/** Ordered canonical claim results — deterministic, not a risk ranking. */
function orderedClaimResults(bundle: AssuranceEvidenceBundleV1): ClaimEvaluationResult[] {
  const results = bundle.u5DecisionBasis.claimResults ?? [];
  return [...results].sort(
    (a, b) =>
      CLAIM_STATE_PRIORITY[a.claimState] - CLAIM_STATE_PRIORITY[b.claimState] ||
      a.claimKey.localeCompare(b.claimKey),
  );
}

function decisionBasisItems(bundle: AssuranceEvidenceBundleV1, profile: AssuranceReportProfile): string[] {
  const basis = bundle.u5DecisionBasis;
  if (basis.availability !== 'BOUND') {
    return ['No canonical decision basis is bound to this bundle.'];
  }
  const claims = orderedClaimResults(bundle);
  if (profile === 'executive') {
    const items: string[] = [];
    for (const c of claims) {
      const detail = c.explanation?.trim()
        ? c.explanation
        : `Evaluated as ${CLAIM_STATE_LABEL[c.claimState].toLowerCase()} (${c.supportingCount} supporting, ${c.contradictingCount} contradicting, ${c.excludedCount} excluded evidence items).`;
      items.push(`${humanizeClaimKey(c.claimKey)} — ${CLAIM_STATE_LABEL[c.claimState]}. ${detail}`);
    }
    const reasonSentences = [...new Set((basis.reasonCodes ?? []).map((r) => REASON_SENTENCE[r]))];
    items.push(...reasonSentences);
    if (items.length === 0) {
      items.push(`Evaluation status: ${basis.evaluationStatus ?? 'unknown'}. No evaluated claims are bound to this bundle.`);
    }
    return items;
  }
  // technical / auditor / machine: raw canonical facts
  return claims.map(
    (c) =>
      `${c.claimKey} v${c.claimVersion} — ${c.claimState} [${c.reasonCodes.join(', ') || 'no reason codes'}] ` +
      `dimensions {authorizedScope:${c.dimensionResult.authorizedScope}, codeCapability:${c.dimensionResult.codeCapability}, observedRuntime:${c.dimensionResult.observedRuntime}} ` +
      `evidence {supporting:${c.supportingCount}, contradicting:${c.contradictingCount}, excluded:${c.excludedCount}} — ${c.explanation}`,
  );
}

function summarizePlanes(paths: EvidenceActionPath[]): string {
  if (paths.length === 0) return 'No action paths were evaluated in this bundle.';
  const counts = paths.reduce<Record<string, number>>((acc, p) => {
    for (const [plane, state] of Object.entries(p.planes)) {
      acc[`${plane}:${state}`] = (acc[`${plane}:${state}`] ?? 0) + 1;
    }
    return acc;
  }, {});
  return Object.entries(counts).map(([k, n]) => `${n} path(s) ${k.split(':')[1].toLowerCase().replace(/_/g, ' ')} on ${k.split(':')[0]}`).join('; ');
}

function frontierSummary(bundle: AssuranceEvidenceBundleV1): string {
  const total = bundle.evidenceFrontier.length;
  const byState = bundle.evidenceFrontier.reduce<Record<string, number>>((acc, f) => {
    acc[f.state] = (acc[f.state] ?? 0) + 1;
    return acc;
  }, {});
  return `${total} frontier item(s): ${Object.entries(byState).map(([s, n]) => `${n} ${s.toLowerCase().replace(/_/g, ' ')}`).join(', ') || 'none'}.`;
}

function authorityGaps(p: EvidenceActionPath): string[] {
  const gaps: string[] = [];
  if (AUTHORITY_GAP_STATES.has(p.planes.effectivelyGranted)) {
    gaps.push(`effective permission ${AUTHORITY_GAP_PHRASE[p.planes.effectivelyGranted]}`);
  }
  if (AUTHORITY_GAP_STATES.has(p.planes.policyAuthorized)) {
    gaps.push(`policy authorization ${AUTHORITY_GAP_PHRASE[p.planes.policyAuthorized]}`);
  }
  return gaps;
}

function mismatchPaths(bundle: AssuranceEvidenceBundleV1): EvidenceActionPath[] {
  return bundle.actionPaths
    .filter((p) => p.planes.codeCapable === 'ESTABLISHED' && authorityGaps(p).length > 0)
    .sort((a, b) => a.pathId.localeCompare(b.pathId));
}

/**
 * Deterministic evidence-closure recommendations — deduplicated and stable.
 * These are report-derived recommendations, not canonical policy obligations.
 */
function requiredActions(bundle: AssuranceEvidenceBundleV1): string[] {
  const actions = new Set<string>();
  for (const f of bundle.evidenceFrontier) {
    if (f.state === 'NOT_ASSESSED' || f.state === 'UNKNOWN') {
      actions.add(`Provide or capture evidence for ${f.facet}:${f.subjectId} before relying on this surface.`);
    } else if (f.state === 'UNSUPPORTED') {
      actions.add(`Resolve unsupported analyzer/language coverage for ${f.facet}:${f.subjectId}.`);
    }
  }
  for (const p of bundle.actionPaths) {
    if (p.planes.codeCapable !== 'ESTABLISHED') continue;
    if (AUTHORITY_GAP_STATES.has(p.planes.effectivelyGranted)) {
      actions.add(`Provide effective-provider evidence for action path ${p.pathId.slice(0, 16)}… before treating execution as authorized.`);
    }
    if (AUTHORITY_GAP_STATES.has(p.planes.policyAuthorized)) {
      actions.add(`Provide policy-authorization evidence for action path ${p.pathId.slice(0, 16)}… before treating the action as policy-authorized.`);
    }
    if (p.planes.observed === 'NOT_ASSESSED') {
      actions.add(`Capture runtime evidence for action path ${p.pathId.slice(0, 16)}… before claiming observation.`);
    }
  }
  return [...actions].sort();
}

const EXECUTIVE_ACTION_LIMIT = 5;
const EXECUTIVE_PATH_LIMIT = 5;

function pathSummary(p: EvidenceActionPath): string {
  const parts = [p.toolCandidateId, p.handlerRef].filter(Boolean).join(' → ');
  return `${parts || `Path ${p.pathId.slice(0, 16)}…`} — code capable ${p.planes.codeCapable.toLowerCase().replace(/_/g, ' ')}, requested ${p.planes.requested.toLowerCase().replace(/_/g, ' ')}, observed ${p.planes.observed.toLowerCase().replace(/_/g, ' ')}.`;
}

/**
 * Deterministic presentation selection.
 *   1. established code capability + authority evidence gap
 *   2. established code capability
 *   3. remaining bounded paths
 * Tie-break: canonical pathId. NOT_DISPLAYED != NOT_PRESENT.
 */
export function selectActionPathsForProfile(
  paths: EvidenceActionPath[],
  profile: AssuranceReportProfile,
): EvidenceActionPath[] {
  const rank = (p: EvidenceActionPath): number => {
    if (p.planes.codeCapable !== 'ESTABLISHED') return 2;
    return authorityGaps(p).length > 0 ? 0 : 1;
  };
  const ranked = [...paths].sort((a, b) => rank(a) - rank(b) || a.pathId.localeCompare(b.pathId));
  return profile === 'executive' ? ranked.slice(0, EXECUTIVE_PATH_LIMIT) : ranked;
}

export function projectAssuranceReportProfile(
  bundle: AssuranceEvidenceBundleV1,
  profile: AssuranceReportProfile,
): AssuranceReportProfileProjection {
  const selectedPaths = selectActionPathsForProfile(bundle.actionPaths, profile);
  const mismatches = mismatchPaths(bundle);
  const allActions = requiredActions(bundle);
  const displayedActions = profile === 'executive' ? allActions.slice(0, EXECUTIVE_ACTION_LIMIT) : allActions;
  const overflowActions = allActions.length - displayedActions.length;

  const sections: AssuranceReportSection[] = [
    {
      key: 'decision',
      title: 'Assurance Decision',
      // Disposition is carried as its own canonical value — never mapped to
      // an evidence-authority state.
      summary: `${bundle.disposition}${bundle.dispositionAvailability === 'BOUND' ? ' — bounded to the evaluated scope and available evidence.' : ' — no bound disposition is available.'}`,
      limitations: bundle.dispositionLimitations,
    },
    {
      key: 'decisionBasis',
      title: 'Decision Basis',
      summary: dispositionBasisSummary(bundle),
      items: decisionBasisItems(bundle, profile),
    },
    {
      key: 'actionAssurance',
      title: 'Action Assurance',
      summary: `Availability: ${bundle.actionAssurance.availability.toLowerCase().replace(/_/g, ' ')}. ${bundle.actionAssurance.frontierCount} frontier surface(s).`,
      limitations: bundle.actionAssurance.limitations,
    },
    {
      key: 'fivePlanes',
      title: 'Five Authority / Action Planes',
      summary: summarizePlanes(bundle.actionPaths),
      items: bundle.actionPaths.map((p) => `Path ${p.pathId.slice(0, 16)}…: requested ${STATE_LABEL[p.planes.requested]}, authorized ${STATE_LABEL[p.planes.policyAuthorized]}, granted ${STATE_LABEL[p.planes.effectivelyGranted]}, capable ${STATE_LABEL[p.planes.codeCapable]}, observed ${STATE_LABEL[p.planes.observed]}`),
      actionPathRefs: bundle.actionPaths.map((p) => p.pathId),
    },
    {
      key: 'materialMismatch',
      title: 'Material Mismatch / Consequence',
      summary: mismatches.length > 0
        ? `${mismatches.length} evaluated path(s) have established code capability without established authority evidence.`
        : 'No authority-evidence mismatch meeting this report rule was identified among the evaluated paths.',
      items: mismatches.map(
        (p) => `Path ${p.pathId.slice(0, 16)}…: code capability is established, while ${authorityGaps(p).join(' and ')}.`,
      ),
      actionPathRefs: mismatches.map((p) => p.pathId),
    },
    {
      key: 'requiredAction',
      title: 'Required Evidence Actions',
      summary: 'Evidence-closure recommendations derived deterministically from missing or unsupported evidence states. These are report-derived recommendations, not canonical policy obligations.',
      items: allActions.length > 0
        ? [...displayedActions, ...(overflowActions > 0 ? [`+ ${overflowActions} additional evidence-closure action(s) not shown in this profile.`] : [])]
        : ['No deterministic evidence-closure actions are established by this bundle.'],
      totalCount: allActions.length,
      displayedCount: displayedActions.length,
    },
    {
      key: 'evidenceCoverage',
      title: 'Evidence Coverage & Frontier',
      summary: frontierSummary(bundle),
      items: bundle.evidenceFrontier.map((f) => `${f.facet}:${f.subjectId} — ${STATE_LABEL[f.state]} (${f.reasonCode})`),
      evidenceRefs: bundle.evidenceReferences.flatMap((r) => r.evidenceRefs),
      limitations: bundle.evaluationIntegrity.analysisLimitations,
    },
    {
      key: 'selectedPaths',
      title: 'Selected Consequential Paths',
      summary: `${selectedPaths.length} of ${bundle.actionPaths.length} evaluated action path(s) shown. Selected for presentation; not an exhaustive absence claim.`,
      items: selectedPaths.map(pathSummary),
      actionPathRefs: selectedPaths.map((p) => p.pathId),
      totalCount: bundle.actionPaths.length,
      displayedCount: selectedPaths.length,
    },
    {
      key: 'constellation',
      title: 'System Constellation',
      summary: `Projection anchors: topology ${bundle.constellationAnchors.topologyProjectionDigest ? 'bound' : 'not bound'}, reachability ${bundle.constellationAnchors.reachabilityDigest ? 'bound' : 'not bound'}, constellation ${bundle.constellationAnchors.constellationDigest ? 'bound' : 'not bound'}.`,
    },
  ];

  if (profile === 'technical' || profile === 'auditor' || profile === 'machine') {
    sections.push({
      key: 'technicalAnnex',
      title: 'Technical / Standards Annex',
      summary: 'Canonical evidence references, evaluation integrity, and projection provenance.',
      items: [
        `Producer completion: ${bundle.evaluationIntegrity.producerCompletion}`,
        `Source truncation: ${bundle.evaluationIntegrity.sourceTruncationState}`,
        `Graph truncation: ${bundle.evaluationIntegrity.graphTruncationState}`,
        `Freshness: ${bundle.evaluationIntegrity.freshnessState}`,
        `Unsupported analyzers: ${bundle.evaluationIntegrity.unsupportedAnalyzers.join(', ') || 'none'}`,
        `Not-assessed analyzers: ${bundle.evaluationIntegrity.notAssessedAnalyzers.join(', ') || 'none'}`,
        `U5 evaluation status: ${bundle.u5DecisionBasis.evaluationStatus ?? 'not bound'}`,
        `U5 reason codes: ${bundle.u5DecisionBasis.reasonCodes?.join(', ') || 'not bound'}`,
        `Bundle digest: ${bundle.bundleDigest}`,
      ],
      evidenceRefs: bundle.evidenceReferences.flatMap((r) => r.evidenceRefs),
      limitations: bundle.limitations,
    });
  }

  return {
    profile,
    evaluationIdentity: bundle.evaluationIdentity,
    bundleDigest: bundle.bundleDigest,
    disposition: bundle.disposition,
    dispositionSource: bundle.dispositionSource,
    dispositionAvailability: bundle.dispositionAvailability,
    methodologyVersion: bundle.dispositionMethodologyVersion,
    u5DecisionBasis: bundle.u5DecisionBasis,
    totalPathCount: bundle.actionPaths.length,
    displayedPathCount: selectedPaths.length,
    sections,
    limitations: bundle.limitations,
  };
}

/** Resolve an exact evidence/action-path reference for Inspect Proof. */
export interface ProofReferenceResolution {
  ref: string;
  kind: 'EVIDENCE' | 'ACTION_PATH' | 'UNRESOLVED';
  evidence?: EvidenceReference;
  path?: EvidenceActionPath;
}

export function resolveProofReference(bundle: AssuranceEvidenceBundleV1, ref: string): ProofReferenceResolution {
  const path = bundle.actionPaths.find((p) => p.pathId === ref);
  if (path) return { ref, kind: 'ACTION_PATH', path };
  const evidence = bundle.evidenceReferences.find(
    (r) => r.evidenceRefs.includes(ref) || r.relationIds.includes(ref) || r.subjectId === ref,
  );
  if (evidence) return { ref, kind: 'EVIDENCE', evidence };
  return { ref, kind: 'UNRESOLVED' };
}

/**
 * Machine-readable bundle projection.
 *
 * This artifact is DERIVED_FROM_EVIDENCE_BUNDLE: its bytes are a deterministic
 * projection of AssuranceEvidenceBundleV1 plus the artifact manifest identity.
 * It is emitted as assurance-machine.json — the legacy machine-readable-0.1.1
 * machine.json contract remains a SAME_EVALUATION_SIBLING artifact.
 */
export interface MachineBundleProjection {
  schemaVersion: 'assurance-machine-projection-1.0.0';
  evaluationIdentity: AssuranceEvidenceBundleV1['evaluationIdentity'];
  evaluationSnapshotAt: string | null;
  buildProvenance: {
    outputGeneratorBuildIdentity: { commitSha: string; commitRef: string; packageVersion: string };
    analyzerBuildIdentity: { available: boolean; reason: string; captureState: string };
  };
  disposition: AssuranceEvidenceBundleV1['disposition'];
  dispositionSource: AssuranceEvidenceBundleV1['dispositionSource'];
  dispositionAvailability: AssuranceEvidenceBundleV1['dispositionAvailability'];
  dispositionMethodologyVersion?: string;
  u5DecisionBasis: AssuranceEvidenceBundleV1['u5DecisionBasis'];
  actionAssurance: AssuranceEvidenceBundleV1['actionAssurance'];
  actionProof: AssuranceEvidenceBundleV1['actionProof'];
  reachability: AssuranceEvidenceBundleV1['reachability'];
  actionPaths: AssuranceEvidenceBundleV1['actionPaths'];
  evidenceReferences: AssuranceEvidenceBundleV1['evidenceReferences'];
  evidenceFrontier: AssuranceEvidenceBundleV1['evidenceFrontier'];
  evaluationIntegrity: AssuranceEvidenceBundleV1['evaluationIntegrity'];
  materialChange: AssuranceEvidenceBundleV1['materialChange'];
  constellationAnchors: AssuranceEvidenceBundleV1['constellationAnchors'];
  limitations: string[];
  bundleDigest: string;
  artifactManifest: Pick<ArtifactManifest, 'evaluationId' | 'scanId' | 'repositoryCommit' | 'evaluationSnapshotAt'>;
}

export function buildMachineBundleProjection(bundle: AssuranceEvidenceBundleV1, artifactManifest: Pick<ArtifactManifest, 'evaluationId' | 'scanId' | 'repositoryCommit' | 'evaluationSnapshotAt'>): MachineBundleProjection {
  return {
    schemaVersion: 'assurance-machine-projection-1.0.0',
    evaluationIdentity: bundle.evaluationIdentity,
    evaluationSnapshotAt: bundle.evaluationIdentity.evaluationSnapshotAt ?? null,
    buildProvenance: bundle.buildProvenance,
    disposition: bundle.disposition,
    dispositionSource: bundle.dispositionSource,
    dispositionAvailability: bundle.dispositionAvailability,
    dispositionMethodologyVersion: bundle.dispositionMethodologyVersion,
    u5DecisionBasis: bundle.u5DecisionBasis,
    actionAssurance: bundle.actionAssurance,
    actionProof: bundle.actionProof,
    reachability: bundle.reachability,
    actionPaths: bundle.actionPaths,
    evidenceReferences: bundle.evidenceReferences,
    evidenceFrontier: bundle.evidenceFrontier,
    evaluationIntegrity: bundle.evaluationIntegrity,
    materialChange: bundle.materialChange,
    constellationAnchors: bundle.constellationAnchors,
    limitations: bundle.limitations,
    bundleDigest: bundle.bundleDigest,
    artifactManifest,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sectionHtml(section: AssuranceReportSection): string {
  const items = section.items?.length ? `<ul>${section.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';
  const limitations = section.limitations?.length ? `<p class="limitations">Limitations: ${section.limitations.map(escapeHtml).join('; ')}</p>` : '';
  return `<section class="section"><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.summary)}</p>${items}${limitations}</section>`;
}

/**
 * Build the flagship Assurance PDF HTML from a profile projection.
 * This is the HTML that the PDF renderer consumes; it is a pure projection.
 */
export function buildAssurancePdfHtml(bundle: AssuranceEvidenceBundleV1, profile: AssuranceReportProfile = 'executive'): string {
  const projection = projectAssuranceReportProfile(bundle, profile);
  const decisionClass = projection.disposition === 'ALLOW' ? 'allow' : projection.disposition === 'BLOCK' ? 'block' : 'review';
  return `<!doctype html><html><head><meta charset="utf-8"><title>HAIEC Assurance Report</title><style>
    body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;margin:0;padding:24px}
    .banner{border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:24px}
    .decision{font-size:28px;font-weight:700;text-transform:uppercase}
    .decision.allow{color:#065f46}.decision.block{color:#991b1b}.decision.review{color:#92400e}
    .section{margin-bottom:20px;page-break-inside:avoid;break-inside:avoid}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #cbd5e1;padding-bottom:6px}
    ul{margin:8px 0;padding-left:20px}
    li{overflow-wrap:break-word;word-break:break-word}
    .limitations{font-size:11px;color:#475569;font-style:italic}
    .mono{font-family:monospace;font-size:10px;overflow-wrap:break-word;word-break:break-all}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top;overflow-wrap:break-word;word-break:break-word}
    th{background:#f8fafc}
    .footer{margin-top:32px;border-top:1px solid #cbd5e1;padding-top:12px;font-size:10px;color:#475569}
  </style></head><body>
    <div class="banner">
      <div class="mono">HAIEC · ${escapeHtml(projection.profile.toUpperCase())} PROFILE</div>
      <h1 style="font-size:20px;margin:8px 0 4px">Assurance Report</h1>
      <p style="font-size:12px;margin:0 0 12px">HAIEC traces consequential AI action paths and compares code capability with the authority and evidence available for the same evaluated scope.</p>
      <div class="decision ${decisionClass}">${escapeHtml(projection.disposition)}</div>
      <p>${escapeHtml(projection.evaluationIdentity.aiSystemId)} · Evaluation ${escapeHtml(projection.evaluationIdentity.evaluationId)} · ${escapeHtml(projection.evaluationIdentity.evaluationSnapshotAt ?? 'snapshot not bound')}</p>
      <p class="mono">Bundle: ${escapeHtml(projection.bundleDigest.slice(0, 16))}… · Methodology: ${escapeHtml(projection.methodologyVersion ?? 'not bound')}</p>
    </div>
    ${projection.sections.map(sectionHtml).join('')}
    <div class="footer">This report is projected from the exact Assurance Evidence Bundle. It does not recompute the U5 disposition, mutate canonical evidence states, or rerun analyzers.</div>
  </body></html>`;
}
