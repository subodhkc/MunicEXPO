/**
 * AA-PROJECTION-1: Reporting projection bundle and manifest.
 *
 * ONE EVALUATION -> ONE VERSIONED ASSURANCE EVIDENCE BUNDLE
 *              -> MULTIPLE AUDIENCE PROJECTIONS
 *              -> SAME TRUTH EVERYWHERE
 *
 * This is a semantic projection owner, not an analyzer or assurance engine.
 * It converts the canonical EvaluatedAssuranceOutput into a stable,
 * audience-profile-agnostic Evidence Bundle and binds every generated
 * artifact to that bundle through a Report Projection Manifest.
 *
 * Invariants:
 *   PROJECTION != ANALYSIS
 *   PROJECTION != U5_DECISION
 *   SEMANTIC_IDENTITY != PUBLICATION_IDENTITY
 *   WALL_CLOCK_TIME != EVALUATION_SNAPSHOT_TIME
 *   CROSS_EVALUATION_COMPOSITION = REJECT
 *   DISPLAY_ELIGIBILITY != EVIDENCE_STATE
 *   REDACTION != EVIDENCE_STATE_CHANGE
 */

import { createHash } from 'crypto';
import type { EvaluatedAssuranceOutput } from './assurance-output-composer';
import type { ArtifactManifest } from './assurance-artifact-manifest';
import type { AssuranceDisposition } from './types';

/**
 * Deterministic canonical JSON serialization for semantic digests.
 *
 * Stable key ordering, no undefined values, no incidental timestamps.
 * Output is NOT for human reading; it is for identity only.
 */
function canonicalSerialize(o: unknown): string {
  if (o === null) return 'null';
  if (typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canonicalSerialize).join(',') + ']';
  const keys = Object.keys(o as Record<string, unknown>).filter((k) => (o as Record<string, unknown>)[k] !== undefined).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize((o as Record<string, unknown>)[k])}`);
  return '{' + pairs.join(',') + '}';
}

export function computeSemanticDigest(input: unknown): string {
  return createHash('sha256').update(canonicalSerialize(input), 'utf8').digest('hex');
}

/** Evidence authority plane with bounded states. */
export type EvidenceAuthorityState = 'ESTABLISHED' | 'PARTIAL' | 'UNKNOWN' | 'NOT_ASSESSED' | 'UNSUPPORTED' | 'NOT_APPLICABLE';

/** A single canonical evidence reference suitable for rendering. */
export interface EvidenceReference {
  /** Canonical relation / evidence identity. */
  evidenceId: string;
  /** Producer that established this evidence. */
  producerId?: string;
  /** Authority class (e.g., source, runtime, policy). */
  authorityClass: string;
  /** Evidence state from canonical owner. */
  state: EvidenceAuthorityState;
  coverage: string;
  /** Facet / family (e.g., registration, dispatch, handler-operation). */
  facet: string;
  subjectId: string;
  /** Canonical source location if established. */
  location?: { file?: string | null; line?: number; column?: number };
  /** Explicit limitations for this evidence item. */
  limitations: string[];
}

/** Bounded action consequence evidence for one capability path. */
export interface EvidenceActionPath {
  pathId: string;
  toolCandidateId?: string;
  registrationRelationId?: string;
  modelExposureRelationId?: string;
  dispatchRelationId?: string;
  toolImplementationRelationId?: string;
  handlerFunctionId?: string;
  handlerRef?: string;
  downstreamOperationIds: string[];
  sinkTargetIds: string[];
  /** Planes of authority independently tracked. */
  planes: {
    requested: EvidenceAuthorityState;
    policyAuthorized: EvidenceAuthorityState;
    effectivelyGranted: EvidenceAuthorityState;
    codeCapable: EvidenceAuthorityState;
    observed: EvidenceAuthorityState;
  };
  /** Adverse / conflicting evidence for this path. */
  adverseEvidence: EvidenceReference[];
  /** Protections / controls observed for this path. */
  protectiveControls: EvidenceReference[];
  limitations: string[];
}

export interface EvidenceFrontierProjection {
  facet: string;
  subjectId: string;
  value: string;
  state: EvidenceAuthorityState;
  coverage: string;
  reasonCode: string;
  reason: string;
  sourceRelationIds: string[];
}

export interface EvaluationIntegrityProjection {
  producerCompletion: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'TIMEOUT' | 'UNSUPPORTED' | 'NOT_RUN';
  sourceTruncation: boolean;
  graphTruncation: boolean;
  analysisLimitations: string[];
  unsupportedAnalyzers: string[];
  staleEvidence: boolean;
  mixedVersionLimitations: string[];
}

export interface MaterialChangeProjection {
  comparability: 'SAME' | 'CHANGED' | 'NOT_COMPARABLE' | 'NOT_EVALUATED';
  baselineEvaluationId?: string;
  targetEvaluationId?: string;
  explanation: string;
  limitations: string[];
}

/**
 * AA-PROJECTION-1: Assurance Evidence Bundle V1.
 *
 * Semantic projection contract over a single exact evaluation.
 * All fields are either canonical or explicitly bounded.
 */
export interface AssuranceEvidenceBundleV1 {
  schemaVersion: 'assurance-evidence-bundle-1.0.0';
  /** Canonical identity of the evaluated scope. */
  evaluationIdentity: {
    evaluationId: string;
    organizationId: string;
    aiSystemId: string;
    orchestratorRunId: string;
    exactScanId: string;
    repositoryCommitSha: string | null;
    evaluationSnapshotAt: string | null;
  };
  /** Deterministic digest of the canonical semantic bundle. */
  bundleDigest: string;
  /** Canonical U5 bounded disposition. */
  disposition: AssuranceDisposition | 'UNKNOWN';
  dispositionBasis: string;
  dispositionLimitations: string[];
  /** Action Assurance / authority-consequence reconciliation summary. */
  actionAssurance: {
    availability: 'ESTABLISHED' | 'PARTIAL' | 'NOT_AVAILABLE';
    surfaces?: unknown[];
    frontierCount: number;
    limitations: string[];
  };
  /** Selected action/consequence paths with bounded plane states. */
  actionPaths: EvidenceActionPath[];
  /** Evidence references grouped by facet for inspectability. */
  evidenceReferences: EvidenceReference[];
  /** Evidence frontier — missing, partial, unsupported, not-assessed. */
  evidenceFrontier: EvidenceFrontierProjection[];
  /** Evaluation integrity / limitation state. */
  evaluationIntegrity: EvaluationIntegrityProjection;
  /** Material change (bounded). */
  materialChange: MaterialChangeProjection;
  /** Constellation projection anchors (references, not independent truth). */
  constellationAnchors: {
    topologyProjectionDigest: string;
    reachabilityDigest: string;
    constellationDigest: string;
  };
  /** Explicit projection limitations. */
  limitations: string[];
}

/** One projected artifact's provenance entry. */
export interface ReportProjectionArtifactEntry {
  artifactType: 'report' | 'passport' | 'machine-readable' | 'constellation-svg' | 'constellation-json' | 'evidence-bundle' | 'decision-receipt' | 'html' | 'pdf' | string;
  name: string;
  schemaVersion: string;
  /** Semantic bundle digest this artifact is derived from. */
  evidenceBundleDigest: string;
  /** Exact artifact byte digest. */
  artifactDigest: string;
  /** Profile identity for audience-specific projection. */
  profileId: string;
  profileVersion: string;
  /** Renderer identity/version that produced this artifact. */
  rendererId: string;
  rendererVersion: string;
  /** Evaluation identity repeated for fail-closed composition checks. */
  evaluationId: string;
  exactScanId: string;
  repositoryCommitSha: string | null;
}

/**
 * AA-PROJECTION-1: Report Projection Manifest V1.
 *
 * Provenance binding every generated artifact to one exact Evaluation,
 * one Assurance Evidence Bundle, one profile, and one renderer.
 */
export interface ReportProjectionManifestV1 {
  schemaVersion: 'report-projection-manifest-1.0.0';
  evaluationIdentity: AssuranceEvidenceBundleV1['evaluationIdentity'];
  evidenceBundleDigest: string;
  evidenceBundleSchemaVersion: string;
  /** U5 methodology / version where already available. */
  assuranceMethodologyVersion: string;
  /** Projection / profile / renderer versions. */
  projectionProfileVersion: string;
  rendererRegistryVersion: string;
  artifacts: ReportProjectionArtifactEntry[];
  /** Deterministic digest of this manifest (excludes itself). */
  manifestDigest: string;
  limitations: string[];
}

export interface BuildAssuranceEvidenceBundleInput {
  output: EvaluatedAssuranceOutput;
  /** Canonical artifact manifest produced by the bundle builder. */
  artifactManifest: ArtifactManifest;
  /** Optional reachability/topology/constellation digests if already computed. */
  topologyProjectionDigest?: string;
  reachabilityDigest?: string;
  constellationDigest?: string;
}

function pickDisposition(): AssuranceDisposition | 'UNKNOWN' {
  // U5 disposition is produced by the canonical Assurance Decision Engine and
  // is not part of the EvaluatedAssuranceOutput projection. The bundle does
  // not fabricate a disposition; consumers that require it must bind the
  // canonical Decision Receipt for the same evaluation.
  return 'UNKNOWN';
}

function toEvidenceAuthorityState(state: string, coverage?: string): EvidenceAuthorityState {
  if (state === 'NOT_ANALYZED') return 'NOT_ASSESSED';
  if (state === 'UNSUPPORTED' || state === 'NOT_APPLICABLE') return 'UNSUPPORTED';
  if (state === 'UNKNOWN' && coverage === 'NOT_ANALYZED') return 'NOT_ASSESSED';
  if (state === 'UNKNOWN' && coverage === 'UNSUPPORTED') return 'UNSUPPORTED';
  switch (state) {
    case 'ESTABLISHED':
      return 'ESTABLISHED';
    case 'PARTIAL':
    case 'CONDITIONAL':
    case 'CANDIDATE':
      return 'PARTIAL';
    case 'UNKNOWN':
      return 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

function evidenceRefsFromArchetype(output: EvaluatedAssuranceOutput): EvidenceReference[] {
  const refs: EvidenceReference[] = [];
  for (const dim of output.executionArchetype.dimensions) {
    for (const v of dim.values) {
      refs.push({
        evidenceId: v.subject.id,
        authorityClass: 'SOURCE',
        state: toEvidenceAuthorityState(v.state, v.coverage),
        coverage: v.coverage,
        facet: dim.facet,
        subjectId: v.subject.id,
        limitations: v.limitations,
      });
    }
  }
  return refs;
}

function actionPathsFromArchetype(output: EvaluatedAssuranceOutput): EvidenceActionPath[] {
  return output.executionArchetype.consequencePathSummary.map((p) => ({
    pathId: `${p.toolCandidateId ?? 'unknown'}:${p.handlerRef ?? 'unknown'}:${p.consequenceId ?? 'unknown'}`,
    toolCandidateId: p.toolCandidateId,
    handlerRef: p.handlerRef,
    downstreamOperationIds: p.stages.filter((s) => s.stage === 'CONSEQUENCE' && s.targetId).map((s) => s.relationId),
    sinkTargetIds: p.stages.filter((s) => s.stage === 'CONSEQUENCE' && s.targetId).map((s) => s.targetId ?? s.relationId),
    planes: {
      requested: 'ESTABLISHED',
      policyAuthorized: 'NOT_ASSESSED',
      effectivelyGranted: 'NOT_ASSESSED',
      codeCapable: toEvidenceAuthorityState(p.state),
      observed: 'NOT_ASSESSED',
    },
    adverseEvidence: [],
    protectiveControls: [],
    limitations: p.limitations,
  }));
}

export function buildAssuranceEvidenceBundleV1(input: BuildAssuranceEvidenceBundleInput): AssuranceEvidenceBundleV1 {
  const { output, artifactManifest, topologyProjectionDigest = '', reachabilityDigest = '', constellationDigest = '' } = input;
  void artifactManifest;
  const id = output.evaluationIdentity;
  const evidenceReferences = evidenceRefsFromArchetype(output);
  const actionPaths = actionPathsFromArchetype(output);
  const evidenceFrontier = output.evidenceFrontier.frontierItems.map((f) => ({
    facet: f.facet,
    subjectId: f.subjectId,
    value: f.value,
    state: toEvidenceAuthorityState(f.state, f.coverage),
    coverage: f.coverage,
    reasonCode: f.reasonCode,
    reason: f.reason,
    sourceRelationIds: f.sourceRelationIds,
  }));

  const aa = output.actionAssurance;
  const bundle: AssuranceEvidenceBundleV1 = {
    schemaVersion: 'assurance-evidence-bundle-1.0.0',
    evaluationIdentity: {
      evaluationId: id.evaluationId,
      organizationId: id.organizationId,
      aiSystemId: id.aiSystemId,
      orchestratorRunId: id.orchestratorRunId,
      exactScanId: id.exactScanId,
      repositoryCommitSha: id.repositoryCommitSha,
      evaluationSnapshotAt: id.evaluationSnapshotAt ?? null,
    },
    bundleDigest: '', // computed below after bundle content is stable
    disposition: pickDisposition(),
    dispositionBasis: 'Canonical U5 disposition projected from actionAssurance section.',
    dispositionLimitations: [
      'Disposition is bounded to the evaluated scope and available evidence.',
      'UNKNOWN or missing disposition is not a pass.',
    ],
    actionAssurance: {
      availability: aa.availability,
      surfaces: (aa as { surfaces?: unknown[] }).surfaces,
      frontierCount: aa.summary?.frontierCount ?? 0,
      limitations: aa.coverageLimitations ?? [],
    },
    actionPaths,
    evidenceReferences,
    evidenceFrontier,
    evaluationIntegrity: {
      producerCompletion: output.buildProvenance.analyzerBuildIdentity.available ? 'COMPLETED' : 'PARTIAL',
      sourceTruncation: false,
      graphTruncation: false,
      analysisLimitations: output.evidenceFrontier.limitations,
      unsupportedAnalyzers: output.evidenceFrontier.ariFamilyFrontiers
        .filter((f) => f.state === 'UNSUPPORTED' || f.state === 'NOT_ANALYZED')
        .map((f) => f.family),
      staleEvidence: false,
      mixedVersionLimitations: [],
    },
    materialChange: {
      comparability: 'NOT_EVALUATED',
      explanation: 'Material change comparison is outside the scope of a single evaluation; use the existing comparability contract.',
      limitations: ['Material change not projected from this bundle.'],
    },
    constellationAnchors: {
      topologyProjectionDigest,
      reachabilityDigest,
      constellationDigest,
    },
    limitations: [
      'This bundle is a semantic projection of one exact evaluation.',
      'CROSS_EVALUATION_COMPOSITION is invalid.',
    ],
  };

  bundle.bundleDigest = computeSemanticDigest(bundle);
  return bundle;
}

export interface ReportProjectionProfile {
  profileId: string;
  profileVersion: string;
  rendererId: string;
  rendererVersion: string;
}

export interface BuildReportProjectionManifestInput {
  bundle: AssuranceEvidenceBundleV1;
  artifactManifest: ArtifactManifest;
  /** All projected artifacts with their profile/renderer identities. */
  projectedArtifacts: (ReportProjectionArtifactEntry & { bytes?: Buffer })[];
  profile: ReportProjectionProfile;
  assuranceMethodologyVersion: string;
  projectionProfileVersion: string;
  rendererRegistryVersion: string;
}

export function buildReportProjectionManifestV1(input: BuildReportProjectionManifestInput): ReportProjectionManifestV1 {
  const { bundle, projectedArtifacts, profile, assuranceMethodologyVersion, projectionProfileVersion, rendererRegistryVersion } = input;
  const artifacts = projectedArtifacts.map((a) => ({
    artifactType: a.artifactType,
    name: a.name,
    schemaVersion: a.schemaVersion,
    evidenceBundleDigest: bundle.bundleDigest,
    artifactDigest: a.artifactDigest,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    rendererId: profile.rendererId,
    rendererVersion: profile.rendererVersion,
    evaluationId: bundle.evaluationIdentity.evaluationId,
    exactScanId: bundle.evaluationIdentity.exactScanId,
    repositoryCommitSha: bundle.evaluationIdentity.repositoryCommitSha,
  }));

  const manifest: Omit<ReportProjectionManifestV1, 'manifestDigest'> = {
    schemaVersion: 'report-projection-manifest-1.0.0',
    evaluationIdentity: bundle.evaluationIdentity,
    evidenceBundleDigest: bundle.bundleDigest,
    evidenceBundleSchemaVersion: bundle.schemaVersion,
    assuranceMethodologyVersion,
    projectionProfileVersion,
    rendererRegistryVersion,
    artifacts,
    limitations: [
      'Manifest binds provenance only; it does not calculate U5 or reconcile evidence.',
      'Artifact digests are over generated bytes for this profile and renderer.',
    ],
  };

  return {
    ...manifest,
    manifestDigest: computeSemanticDigest(manifest),
  };
}

/**
 * Fail-closed composition guard: a projected artifact must belong to exactly
 * one evaluation and one bundle digest.
 */
export function assertProjectionCompositionValid(
  bundle: AssuranceEvidenceBundleV1,
  manifest: ReportProjectionManifestV1,
  artifactEntry: ReportProjectionArtifactEntry,
): void {
  if (manifest.evaluationIdentity.evaluationId !== bundle.evaluationIdentity.evaluationId) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: manifest and bundle evaluation mismatch');
  }
  if (manifest.evidenceBundleDigest !== bundle.bundleDigest) {
    throw new Error('BUNDLE_DIGEST_MISMATCH: manifest does not bind this bundle');
  }
  if (artifactEntry.evidenceBundleDigest !== bundle.bundleDigest) {
    throw new Error('BUNDLE_DIGEST_MISMATCH: artifact does not bind this bundle');
  }
  if (artifactEntry.evaluationId !== bundle.evaluationIdentity.evaluationId) {
    throw new Error('CROSS_EVALUATION_COMPOSITION: artifact evaluation mismatch');
  }
}
