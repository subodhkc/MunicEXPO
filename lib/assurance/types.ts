/**
 * U5 — Assurance State Type Definitions
 *
 * Canonical claim states, system disposition, evidence set roles,
 * reason codes, and three-dimension model.
 *
 * LOCKED vocabulary — do not add states without architectural approval.
 */

// ─── B6: Claim State Vocabulary (LOCKED) ─────────────────────────────────────

export type ClaimState =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONTRADICTED'
  | 'REVIEW_REQUIRED'
  | 'NOT_ASSESSED'
  | 'NOT_APPLICABLE';

/**
 * SUPPORTED = all deterministic requirements satisfied by qualifying evidence
 *   within the evaluated scope. Does NOT mean the system is globally safe.
 *
 * PARTIALLY_SUPPORTED = supportive evidence exists, but non-blocking requirements
 *   remain incomplete.
 *
 * INSUFFICIENT_EVIDENCE = evidence exists or was expected, but not sufficient.
 *
 * CONTRADICTED = qualifying evidence directly conflicts with the claim.
 *
 * REVIEW_REQUIRED = evidence is conflicting, ambiguous, stale, external-only
 *   where policy requires confirmation, or requires human judgment.
 *
 * NOT_ASSESSED = no qualifying evaluation occurred.
 *
 * NOT_APPLICABLE = deterministic system scope proves claim does not apply.
 */

// ─── B8: System Assurance Disposition ────────────────────────────────────────

export type AssuranceDisposition = 'ALLOW' | 'REVIEW' | 'BLOCK';

/**
 * ALLOW = all applicable mandatory claims SUPPORTED + no blocking contradiction.
 *   Always described as "ALLOW WITHIN EVALUATED SCOPE". Never "SAFE".
 *
 * REVIEW = mandatory claim is PARTIALLY_SUPPORTED / INSUFFICIENT_EVIDENCE /
 *   REVIEW_REQUIRED / NOT_ASSESSED, OR required evidence is stale,
 *   OR required technical evidence is self-reported only,
 *   OR producer conflict cannot be automatically resolved.
 *
 * BLOCK = applicable mandatory/critical claim is CONTRADICTED,
 *   OR explicitly configured blocking condition is satisfied.
 */

// ─── B14: Evidence Set Member Roles ──────────────────────────────────────────

export type EvidenceMemberRole =
  | 'SUPPORTING'
  | 'CONTRADICTING'
  | 'CONTEXT_ONLY'
  | 'EXCLUDED';

export type ExclusionReason =
  | 'WRONG_SCOPE'
  | 'STALE'
  | 'SELF_REPORTED_NOT_ALLOWED'
  | 'COVERAGE_INSUFFICIENT'
  | 'PRODUCER_FAILED'
  | 'EXTERNAL_ONLY'
  | 'AFTER_SNAPSHOT'
  | 'DUPLICATE'
  | 'NOT_RELEVANT_TO_CLAIM';

// ─── B10: Evidence Epistemic Classes ─────────────────────────────────────────

export type EpistemicClass =
  | 'HAIEC_NATIVE_TECHNICAL'
  | 'EXTERNAL_TECHNICAL'
  | 'OBSERVED_CONFIGURATION'
  | 'SELF_REPORTED'
  | 'DERIVED'
  | 'RUNTIME_EMPIRICAL';

// ─── B21: Claim Reason Codes ─────────────────────────────────────────────────

export type ClaimReasonCode =
  | 'SUPPORTED_BY_REQUIRED_TECHNICAL_EVIDENCE'
  | 'SUPPORTED_BY_RUNTIME_EVIDENCE'
  | 'SUPPORTED_BY_CONFIGURATION_EVIDENCE'
  | 'MISSING_REQUIRED_TECHNICAL_EVIDENCE'
  | 'MISSING_REQUIRED_DIMENSION'
  | 'SELF_REPORTED_ONLY'
  | 'COVERAGE_UNKNOWN'
  | 'COVERAGE_INSUFFICIENT'
  | 'PRODUCER_FAILED'
  | 'PRODUCER_TIMEOUT'
  | 'CONTRADICTING_FINDING'
  | 'CONFLICTING_PRODUCERS'
  | 'STALE_EVIDENCE'
  | 'EXTERNAL_SOURCE_ONLY'
  | 'NOT_EVALUATED'
  | 'NOT_APPLICABLE_TO_ARCHITECTURE'
  | 'ZERO_FINDINGS_WITH_KNOWN_COVERAGE'
  | 'PARTIAL_REQUIREMENTS_MET';

// ─── B22: Three-Dimension Result ─────────────────────────────────────────────

export type DimensionResult =
  | 'SUPPORTED'
  | 'MISSING'
  | 'CONTRADICTED'
  | 'NOT_REQUIRED';

export interface ThreeDimensionResult {
  authorizedScope: DimensionResult;
  codeCapability: DimensionResult;
  observedRuntime: DimensionResult;
}

// ─── B33: Operational Evaluation Status ──────────────────────────────────────

export type AssuranceEvaluationStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

// ─── B4: Control Claim Definition ────────────────────────────────────────────

export type AssuranceDimension = 'AUTHORIZED_SCOPE' | 'CODE_CAPABILITY' | 'OBSERVED_RUNTIME';

export interface ControlClaimDefinition {
  /** Stable machine-readable key, e.g. 'privileged-action-authorization' */
  claimKey: string;
  /** Human-readable assertion statement */
  statement: string;
  /** Claim definition version — changes require new version */
  version: string;
  /** critical | high | medium | low — BLOCK requires critical/mandatory contradiction */
  criticality: 'critical' | 'high' | 'medium' | 'low';
  /** Which dimensions this claim requires (subset of three) */
  requiredDimensions: AssuranceDimension[];
  /** Which epistemic classes can support this claim */
  acceptableEvidenceClasses: EpistemicClass[];
  /** Required producer capabilities (canonical producer IDs) */
  requiredProducerCapabilities: string[];
  /** Minimum coverage required (null = not required, 0-100 = percentage) */
  coverageRequirement: number | null;
  /** Max evidence age in days (null = no freshness requirement) */
  maxEvidenceAgeDays: number | null;
  /** Whether self-reported evidence alone can support this claim (always false for technical) */
  selfReportedCanSupport: boolean;
  /** Whether external evidence alone can support this claim */
  externalCanSupportAlone: boolean;
  /** Whether zero findings can support this claim (only with proven coverage) */
  zeroFindingsCanSupport: boolean;
  /** Conditions that produce CONTRADICTED state */
  contradictionConditions: string[];
  /** Conditions that produce REVIEW_REQUIRED state */
  manualReviewConditions: string[];
  /** Framework/control mappings (supplemental, not authoritative) */
  frameworkMappings: FrameworkMapping[];
  /** Whether this claim is mandatory for ALLOW disposition */
  mandatory: boolean;
}

export interface FrameworkMapping {
  framework: string;
  controlIds: string[];
}

// ─── B14: Control Evidence Set ───────────────────────────────────────────────

export interface ControlEvidenceSetMember {
  evidenceId: string;
  role: EvidenceMemberRole;
  epistemicClass: EpistemicClass;
  producerId: string;
  exclusionReason?: ExclusionReason;
  contentHash?: string;
}

export interface ControlEvidenceSet {
  claimKey: string;
  claimVersion: string;
  members: ControlEvidenceSetMember[];
  /** Deterministic digest of the evidence set */
  setDigest: string;
}

// ─── B17: Assurance Evaluation ───────────────────────────────────────────────

export interface ClaimEvaluationResult {
  claimKey: string;
  claimVersion: string;
  claimState: ClaimState;
  reasonCodes: ClaimReasonCode[];
  dimensionResult: ThreeDimensionResult;
  evidenceSet: ControlEvidenceSet;
  supportingCount: number;
  contradictingCount: number;
  excludedCount: number;
  explanation: string;
}

export interface AssuranceEvaluation {
  id: string;
  organizationId: string;
  aiSystemId: string;
  orchestratorRunId: string;
  pipelineAggregationId: string | null;
  assuranceMethodologyVersion: string;
  evaluationSnapshotAt: Date;
  disposition: AssuranceDisposition;
  evaluationStatus: AssuranceEvaluationStatus;
  claimResults: ClaimEvaluationResult[];
  claimCounts: Record<ClaimState, number>;
  reasonCodes: ClaimReasonCode[];
  evidenceSetDigest: string;
  inputHash: string;
  outputHash: string;
  createdAt: Date;
}

// ─── B18: Assurance Methodology Version ──────────────────────────────────────

export const ASSURANCE_METHODOLOGY_VERSION = '1.0';

// ─── B7: SUPPORTED Scope Limitation ──────────────────────────────────────────

export const SUPPORTED_SCOPE_LIMITATION =
  'SUPPORTED means the specific claim is supported within the exact evaluated scope by the exact recorded evidence set. It does NOT mean the entire AI system is safe, globally secure, compliant with every regulation, free of vulnerabilities, or that future behavior is guaranteed.';

export const ALLOW_SCOPE_LIMITATION =
  'ALLOW means ALLOW WITHIN EVALUATED SCOPE. Never described as SAFE.';
