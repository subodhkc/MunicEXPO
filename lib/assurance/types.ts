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
  // ─── E1 1.1 Extensions ──────────────────────────────────────────────────
  /** A9: Coverage policy — replaces ambiguous numeric thresholds */
  coveragePolicy?: CoveragePolicy;
  /** A9: Coverage ratio threshold (0-1) when policy is MIN_RATIO */
  coverageRatioThreshold?: number;
  /** A5/A6: Exact semantic relevance specification */
  relevanceSpec?: ClaimRelevanceSpec;
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

/**
 * A1: Methodology 1.0 is preserved for historical readability.
 * Do NOT recompute 1.0 evaluations automatically.
 * U6 must NOT issue new trust/attestation artifacts from methodology 1.0.
 */
export const ASSURANCE_METHODOLOGY_VERSION_1_0 = '1.0';

/**
 * A1: Methodology 1.1 is the corrected Enterprise Assurance methodology.
 * All new Enterprise Assurance evaluations use 1.1.
 */
export const ASSURANCE_METHODOLOGY_VERSION_1_1 = '1.1';

/**
 * Default methodology version for new evaluations.
 * Historical 1.0 evaluations remain readable at their original version.
 */
export const ASSURANCE_METHODOLOGY_VERSION = ASSURANCE_METHODOLOGY_VERSION_1_1;

// ─── B7: SUPPORTED Scope Limitation ──────────────────────────────────────────

export const SUPPORTED_SCOPE_LIMITATION =
  'SUPPORTED means the specific claim is supported within the exact evaluated scope by the exact recorded evidence set. It does NOT mean the entire AI system is safe, globally secure, compliant with every regulation, free of vulnerabilities, or that future behavior is guaranteed.';

export const ALLOW_SCOPE_LIMITATION =
  'ALLOW means ALLOW WITHIN EVALUATED SCOPE. Never described as SAFE.';

// ═══════════════════════════════════════════════════════════════════════════════
// E1 — METHODOLOGY 1.1 EXTENSIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── A9: Coverage Policy ─────────────────────────────────────────────────────

export type CoveragePolicy =
  | 'MIN_RATIO'          // requires coverageRatio >= threshold
  | 'COMPLETE_REQUIRED'  // requires coverageStatus === 'COMPLETE'
  | 'NO_COVERAGE_REQUIREMENT';

// ─── A5/A6: Claim Relevance — semantic capability requirements ───────────────

export interface ClaimRelevanceSpec {
  /** Canonical producer IDs that can evaluate this claim (A6) */
  acceptedProducerIds: string[];
  /** Evidence types accepted for this claim (A6) */
  acceptedEvidenceTypes: string[];
  /** Rule IDs that, if found, CONTRADICT this claim (A8 — exact match) */
  contradictingRuleIds: string[];
  /** Security Concern IDs that, if found, CONTRADICT this claim (A8) */
  contradictingConcernIds: string[];
  /** Capability invariants that, if violated, CONTRADICT this claim (A8) */
  contradictingCapabilityIds: string[];
  /** Rule IDs that, if absent with proven coverage, SUPPORT this claim */
  supportingRuleIds: string[];
  /** Capability IDs that this claim is about */
  claimCapabilityIds: string[];
}

// ─── A7: Rule → Concern → Capability → Claim mapping strength ────────────────

export type MappingStrength =
  | 'EXACT_RULE_MAPPING'
  | 'EXACT_CAPABILITY_MAPPING'
  | 'PROFILE_MAPPING'
  | 'MANUAL_APPROVED_MAPPING'
  | 'HEURISTIC_SUGGESTION';

export interface RuleClaimMapping {
  ruleId: string;
  claimKey: string;
  strength: MappingStrength;
  concernId?: string;
  capabilityId?: string;
}

// ─── B4: Five Semantic Planes (1.1) ──────────────────────────────────────────

export type AssurancePlane =
  | 'REQUESTED'           // vendor/application declares it needs capability
  | 'POLICY_AUTHORIZED'   // customer/operator policy approves capability
  | 'EFFECTIVELY_GRANTED' // IAM/platform/credentials actually grant capability
  | 'CODE_CAPABLE'        // code/configuration can perform capability
  | 'OBSERVED';           // controlled runtime evidence demonstrates behavior

export type PlaneResult = 'SUPPORTED' | 'MISSING' | 'CONTRADICTED' | 'NOT_REQUIRED';

export interface FivePlaneResult {
  requested: PlaneResult;
  policyAuthorized: PlaneResult;
  effectivelyGranted: PlaneResult;
  codeCapable: PlaneResult;
  observed: PlaneResult;
}

// ─── B5: Authority class (separate from evidence method) ─────────────────────

export type AuthorityClass =
  | 'AUTHORITATIVE_POLICY'
  | 'EFFECTIVE_GRANT'
  | 'VENDOR_DECLARATION'
  | 'NON_AUTHORITATIVE'
  | 'UNKNOWN';

export type EvidenceMethod =
  | 'IAM_OBSERVATION'
  | 'SIGNED_MANIFEST'
  | 'STATIC_PATH_ANALYSIS'
  | 'STATIC_STRUCTURAL_ANALYSIS'
  | 'RUNTIME_TRACE'
  | 'EXTERNAL_REPORT'
  | 'SELF_REPORT';

// ─── B6: Capability Fact ─────────────────────────────────────────────────────

export interface CapabilityFact {
  capabilityId: string;
  subject: string;
  action: string;
  resource: string;
  scope: string;
  dataClass?: string;
  channel?: string;
  guardRequirements?: string[];
  impact?: string;
  environment?: string;
  constraints?: string[];
  sourcePlane: AssurancePlane;
  authorityClass: AuthorityClass;
  evidenceMethod: EvidenceMethod;
  sourceEvidenceIds: string[];
}

// ─── B7: Universal Capability Ontology ───────────────────────────────────────

export type CapabilityFamily =
  | 'IDENTITY_PRIVILEGE'
  | 'DATA_ACCESS'
  | 'RESOURCE_SCOPE'
  | 'TOOL_ACTION_EXECUTION'
  | 'CONFIGURATION_ACTUATION'
  | 'MODEL_LIFECYCLE'
  | 'RAG_CONTEXT_MEMORY'
  | 'INTER_AGENT_COMMUNICATION'
  | 'EXTERNAL_EGRESS'
  | 'PERSISTENCE'
  | 'SUPPLY_CHAIN'
  | 'HUMAN_AUTHORITY'
  | 'RESILIENCE'
  | 'OBSERVABILITY'
  | 'PRIVACY_RESIDENCY'
  | 'CHANGE_RELEASE';

// ─── B3: Assurance Profile Contract ──────────────────────────────────────────

export interface AssuranceProfile {
  profileId: string;
  profileVersion: string;
  displayName: string;
  parentProfileIds: string[];
  claimPackVersions: Record<string, string>;  // claimKey → version
  rulePackVersions: Record<string, string>;   // rulePackId → version
  capabilityVocabularyVersion: string;
  applicabilityRules: ApplicabilityRule[];
  coveragePolicy: CoveragePolicy;
  freshnessPolicy: Record<string, number | null>;  // claimKey → maxAgeDays
  blockingPolicy: BlockingPolicy;
  customerParameterSchema: CustomerParameterSchema;
  nonOverridableRuleIds: string[];
  sourceReferences: SourceReference[];
  profileDigest: string;
}

export interface ApplicabilityRule {
  claimKey: string;
  /** Predicate evaluated against system architecture / capability facts / envelope */
  predicate: string;
  /** If true, claim is NOT_APPLICABLE when predicate matches */
  negated?: boolean;
}

export interface BlockingPolicy {
  /** Claim keys whose CONTRADICTED state always produces BLOCK */
  criticalClaims: string[];
  /** Profile rule IDs whose violation produces BLOCK */
  blockingRuleIds: string[];
}

export interface CustomerParameterSchema {
  allowedRegions?: string[];
  allowedResourceTypes?: string[];
  allowedOperations?: string[];
  allowedR1Services?: string[];
  approvedModels?: string[];
  approvedTools?: string[];
  allowedDestinations?: string[];
  maxTargetsPerAction?: number;
  maxChangeMagnitude?: number;
  approvalThreshold?: number;
  prohibitedDataClasses?: string[];
  allowedEnvironments?: string[];
}

export interface SourceReference {
  type: string;
  identifier: string;
  version: string;
  digest?: string;
}

// ─── B8/B9: Operating Envelope ───────────────────────────────────────────────

export type OperatingEnvelopeState = 'DRAFT' | 'APPROVED' | 'SUPERSEDED' | 'REVOKED';

export interface OperatingEnvelope {
  envelopeId: string;
  envelopeVersion: string;
  organizationId: string;
  aiSystemId: string;
  state: OperatingEnvelopeState;
  profileId: string;
  profileVersion: string;
  approvedBy?: string;
  approvedAt?: Date;
  constraints: OperatingEnvelopeConstraints;
  envelopeDigest: string;
  createdAt: Date;
}

export interface OperatingEnvelopeConstraints {
  allowedOperations: string[];
  resourceScopes: string[];
  dataClasses: string[];
  destinations: string[];
  maxTargetCount?: number;
  maxChangeMagnitude?: number;
  approvalRequirements: ApprovalRequirement[];
  approvedModels: string[];
  approvedTools: string[];
  allowedEnvironments: string[];
}

export interface ApprovalRequirement {
  operation: string;
  requiresApproval: boolean;
  approverRole?: string;
}

// ─── B11: Interface Profile Compiler output ──────────────────────────────────

export type OperationClassification =
  | 'EXACT_PROFILE_MAPPING'
  | 'PROFILE_RULE_MAPPING'
  | 'GENERATED_CLASSIFICATION'
  | 'UNKNOWN_OPERATION';

export interface CompiledOperation {
  operationId: string;
  method: string;
  routeTemplate: string;
  schemaIdentities?: string[];
  securityDeclarations?: string[];
  callbacks?: string[];
  semanticClassification: OperationClassification;
  capabilityFamily?: CapabilityFamily;
  sourceProfileId: string;
  sourceProfileVersion: string;
}

export interface CompiledProfile {
  profileId: string;
  profileVersion: string;
  sourceSpecificationId: string;
  sourceSpecificationVersion: string;
  sourceSpecDigest: string;
  compilerVersion: string;
  semanticMappingVersion: string;
  operations: CompiledOperation[];
  profileDigest: string;
}

// ─── B17: Impact Vector ──────────────────────────────────────────────────────

export interface ImpactVector {
  authority: AuthorityClass;
  resourceScope: string;
  blastRadius: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dataSensitivity: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  propagation: 'NONE' | 'LOCAL' | 'SYSTEM' | 'NETWORK';
  reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE';
  humanApproval: boolean;
  externality: 'NONE' | 'INTERNAL_EGRESS' | 'EXTERNAL_EGRESS';
  observability: 'FULL' | 'PARTIAL' | 'NONE';
  autonomy: 'HUMAN_ONLY' | 'HUMAN_IN_LOOP' | 'AUTONOMOUS';
  environment: string;
}

// ─── B18: Capability Comparator results ──────────────────────────────────────

export type CapabilityComparisonResult =
  | 'OVER_PRIVILEGED_GRANT'
  | 'UNDECLARED_CAPABILITY'
  | 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE'
  | 'EXCESS_GRANTED_AUTHORITY'
  | 'UNTESTED_CAPABILITY'
  | 'UNEXPLAINED_RUNTIME_BEHAVIOR'
  | 'REQUESTED_NOT_AUTHORIZED'
  | 'ALIGNED';

// ─── B19: Verdict precedence ─────────────────────────────────────────────────

export type ProfileVerdict = 'INVALID_EVIDENCE' | 'BLOCK' | 'REVIEW' | 'ALLOW';

// ─── B20/B22: State/Path/Sequence rules ──────────────────────────────────────

export type RuleType = 'STATE_RULE' | 'PATH_RULE' | 'SEQUENCE_RULE';

export interface ProfileRule {
  ruleId: string;
  ruleType: RuleType;
  description: string;
  capabilityFamily: CapabilityFamily;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'ACTIVE' | 'PARTIAL_CAPABILITY' | 'PROFILE_ONLY' | 'NOT_YET_DETECTABLE';
  requiredGuards?: string[];
  expectedTrajectory?: string[];
  impactVector?: ImpactVector;
}

// ─── B21: Cross-actor rule support ───────────────────────────────────────────

export type ActorScope = 'singleActorRule' | 'crossActorRule' | 'resourceConflictRule' | 'sequenceRule';

// ─── B25: Governed exceptions ────────────────────────────────────────────────

export interface GovernedException {
  ruleId: string;
  scope: string;
  reason: string;
  approvedBy: string;
  approvedAt: Date;
  expiresAt: Date;
  ticketReference?: string;
  profileVersion: string;
}

// ─── B27: Action Witness contract ────────────────────────────────────────────

export type ActionWitnessPhase =
  | 'ACTION_REQUESTED'
  | 'ACTION_AUTHORIZED'
  | 'ACTION_ACCEPTED'
  | 'ACTION_APPLIED'
  | 'ACTION_CONFIRMED';

export interface ActionWitness {
  witnessId: string;
  phase: ActionWitnessPhase;
  actorIdentity: string;
  tool?: string;
  operation: string;
  serviceFamily?: string;
  operationId?: string;
  resourceScope?: string;
  authorizationContext?: string;
  approvalReference?: string;
  result?: string;
  sideEffectWitness?: string;
  buildDigest?: string;
  profileReference?: string;
  envelopeReference?: string;
  observedAt: Date;
}

// ─── B26: Build/Profile binding ──────────────────────────────────────────────

export interface BuildProfileBinding {
  aiSystemId: string;
  applicationVersion?: string;
  gitCommit?: string;
  containerDigest?: string;
  packageDigest?: string;
  profileId: string;
  profileVersion: string;
  profileDigest: string;
  operatingEnvelopeId?: string;
  operatingEnvelopeVersion?: string;
  operatingEnvelopeDigest?: string;
  rulePackVersions: Record<string, string>;
  claimPackVersions: Record<string, string>;
  evaluationSnapshotAt: Date;
}

// ─── B31: Static proof strength ──────────────────────────────────────────────

export type StaticProofStrength =
  | 'STATIC_PATH_PROVEN'
  | 'STATIC_STRUCTURAL';

// ─── B34: Drift reason codes (for U7) ────────────────────────────────────────

export type DriftReasonCode =
  | 'APPLICATION_CHANGED'
  | 'AUTHORITY_CHANGED'
  | 'OPERATING_ENVELOPE_CHANGED'
  | 'PROFILE_CHANGED'
  | 'RULEPACK_CHANGED'
  | 'RUNTIME_BEHAVIOR_CHANGED'
  | 'EVIDENCE_STALE';

// ─── A13: Persistence result ─────────────────────────────────────────────────

export type PersistenceResult =
  | { status: 'CREATED'; id: string }
  | { status: 'IDEMPOTENT'; id: string }
  | { status: 'CONFLICT'; id: string; conflictReason: 'ASSURANCE_EVALUATION_INPUT_CONFLICT' };

// ─── 1.1 Extended Assurance Evaluation ───────────────────────────────────────

export interface AssuranceEvaluationV1_1 extends AssuranceEvaluation {
  assuranceMethodologyVersion: '1.1';
  profileId: string;
  profileVersion: string;
  profileDigest: string;
  operatingEnvelopeId?: string;
  operatingEnvelopeVersion?: string;
  operatingEnvelopeDigest?: string;
  claimPackVersions: Record<string, string>;
  rulePackVersions: Record<string, string>;
  planeResults?: FivePlaneResult[];
  buildBinding?: BuildProfileBinding;
}
