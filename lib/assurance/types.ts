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
  | 'PARTIAL_REQUIREMENTS_MET'
  | 'CAPABILITY_CONTRADICTION'
  | 'REQUIRED_APPROVAL_STEP_MISSING'
  | 'OVER_PRIVILEGED_GRANT_DETECTED'
  | 'UNDECLARED_CAPABILITY_DETECTED'
  | 'OBSERVED_OUTSIDE_OPERATING_ENVELOPE'
  | 'CAPABILITY_OUTSIDE_POLICY'
  | 'EXCESS_GRANTED_AUTHORITY'
  | 'UNTESTED_CAPABILITY'
  | 'UNEXPLAINED_RUNTIME_BEHAVIOR'
  | 'REQUESTED_NOT_AUTHORIZED'
  | 'SCOPE_EXCEEDS_POLICY'
  | 'TARGET_COUNT_EXCEEDS_POLICY'
  | 'CHANGE_MAGNITUDE_EXCEEDS_POLICY'
  | 'UNKNOWN_OPERATION_REVIEW';

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
  | 'APPROVED_POLICY_RECORD'
  | 'POLICY_CONFIGURATION'
  | 'STATIC_PATH_ANALYSIS'
  | 'STATIC_STRUCTURAL_ANALYSIS'
  | 'RUNTIME_TRACE'
  | 'EXTERNAL_REPORT'
  | 'SELF_REPORT';

// ─── B6: Capability Declaration (Pre-U6: structured capability projection) ─────
// Moved to lib/evidence/capability-declaration-contract.ts to keep U4/U2 neutral.
// U5 imports EvidenceCapabilityDeclaration and casts semantic values to local Assurance types.

export type PlaneAvailabilityStatus =
  | 'PRESENT'
  | 'NOT_PROVIDED'
  | 'NOT_EVALUATED'
  | 'NOT_SUPPORTED_BY_CURRENT_PRODUCER'
  | 'SYNTHETIC_REFERENCE';

export interface PlaneAvailability {
  plane: AssurancePlane;
  status: PlaneAvailabilityStatus;
  sourceEvidenceIds: string[];
}

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
  /** Structured target count for policy comparison (Section 18) */
  targetCount?: number;
  /** Structured change magnitude for policy comparison (Section 18) */
  changeMagnitude?: number;
  /** E1 Closure Section 3: Evidence ID for traceability */
  evidenceId: string;
  /** E1 Closure Section 3: Producer run ID for traceability */
  producerRunId?: string;
  /** E1 Closure Section 3: Content hash for traceability */
  contentHash?: string;
  sourcePlane: AssurancePlane;
  authorityClass: AuthorityClass;
  evidenceMethod: EvidenceMethod;
  sourceEvidenceIds: string[];
  /** E1 Closure Section 8: Authority source label */
  authoritySourceLabel?: AuthoritySourceLabel;
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
  /** E1 Closure Section 8: Authority source label for these parameters */
  authoritySourceLabel?: AuthoritySourceLabel;
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
  /** E1 Closure Section 6: Approval reference — decision identity binds approval authority */
  approvalReference?: string;
  constraints: OperatingEnvelopeConstraints;
  envelopeDigest: string;
  createdAt: Date;
  /** E1 Closure Section 8: Authority source label for envelope parameters */
  authoritySourceLabel?: AuthoritySourceLabel;
}

export interface OperatingEnvelopeConstraints {
  allowedOperations: string[];
  resourceScopes: string[];
  dataClasses: string[];
  destinations: string[];
  regions?: string[];
  r1Services?: string[];
  maxTargetCount?: number;
  maxChangeMagnitude?: number;
  approvalRequirements: ApprovalRequirement[];
  approvedModels: string[];
  approvedTools: string[];
  allowedEnvironments: string[];
  prohibitedDataClasses?: string[];
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
  | 'AUTHORITY_NOT_REQUESTED'
  | 'REQUIRED_APPROVAL_STEP_MISSING'
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
  /** E1 Closure Section 17: Actual implementation status (source-truth) */
  implementationStatus?: TelecomRuleImplementationStatus;
  /** E1 Closure Section 18: Exact detector mapping (if STATIC_DETECTOR_ACTIVE) */
  detectorMapping?: RuleDetectorMapping;
  requiredGuards?: string[];
  expectedTrajectory?: string[];
  impactVector?: ImpactVector;
}

/**
 * E1 Closure Section 18: Exact detector mapping for rules with actual implementations.
 */
export interface RuleDetectorMapping {
  /** Scanner module or runtime test that implements this rule */
  scannerModule?: string;
  /** Source/sink/guard semantics */
  semantics?: string;
  /** Finding identity used by the detector */
  findingIdentity?: string;
  /** Coverage limitations */
  coverageLimitations?: string;
  /** Runtime attack/property implementation (if RUNTIME_TEST_ACTIVE) */
  runtimeImplementation?: string;
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
  /** E1 Closure Section 15: Correlation identity — all phases in one set must share this */
  actionCorrelationId?: string;
  /** E1 Closure Section 16: Authority source for OTel/classification */
  authoritySourceLabel?: AuthoritySourceLabel;
  /** E1 Closure Section 16: OTel source authority classification */
  oTelSourceAuthority?: OTelSourceAuthority;
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
  /** Base profile digest from profile-hierarchy */
  profileDigest: string;
  /** Resolved profile digest committing to effective packs and applicability (Section 11) */
  profileDigestResolved: string;
  operatingEnvelopeId?: string;
  operatingEnvelopeVersion?: string;
  operatingEnvelopeDigest?: string;
  operatingEnvelopeState?: OperatingEnvelopeState;
  operatingEnvelopeApprovedBy?: string;
  operatingEnvelopeApprovalReference?: string;
  claimPackVersions: Record<string, string>;
  rulePackVersions: Record<string, string>;
  applicableClaimKeys?: string[];
  /** Deterministic overall five-plane comparator verdict (Section 10) */
  fivePlaneOverallVerdict?: ProfileVerdict;
  planeResults?: FivePlaneResult[];
  fivePlaneComparisons?: CapabilityComparisonRecord[];
  buildBinding?: BuildProfileBinding;
}

// ═══════════════════════════════════════════════════════════════════════════════
// E1 CLOSURE — Profile Resolver, Capability Identity, Envelope Persistence,
// Action Witness Correlation, OTel Authority, Telecom Rule Status,
// Compliance Mapping, Reference POC Fixture
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Section 3: Profile Resolver ─────────────────────────────────────────────

/**
 * Resolved profile — the output of the deterministic Profile Resolver.
 * Contains the resolved profile, inherited parents, and effective packs.
 */
export interface ResolvedProfile {
  profileId: string;
  profileVersion: string;
  profileDigest: string;
  displayName: string;
  /** All profiles in inheritance chain (root → leaf), including the resolved profile */
  inheritedProfileIds: string[];
  /** Effective claim pack versions after inheritance merge */
  effectiveClaimPackVersions: Record<string, string>;
  /** Effective rule pack versions after inheritance merge */
  effectiveRulePackVersions: Record<string, string>;
  /** Effective non-overridable rule IDs from all ancestors */
  effectiveNonOverridableRuleIds: string[];
  /** Effective customer parameters (merged from profile chain) */
  effectiveCustomerParameters: CustomerParameterSchema;
  /** Claim keys applicable to this profile + system architecture */
  applicableClaimKeys: string[];
  /** Digest of the effective resolved profile (commits to all effective fields) */
  profileDigestResolved: string;
}

export type ProfileResolutionStatus = 'RESOLVED' | 'REVIEW' | 'UNAVAILABLE';

export interface ProfileResolutionResult {
  status: ProfileResolutionStatus;
  resolvedProfile?: ResolvedProfile;
  /** Operating envelope bound to this resolution (if any) */
  operatingEnvelope?: OperatingEnvelope;
  /** Reason for REVIEW/UNAVAILABLE status */
  reason?: string;
}

// ─── Section 8: Default Authority Labels ──────────────────────────────────────

/**
 * Authority source label — distinguishes authoritative policy from reference defaults.
 * No synthetic/default value may be labeled AUTHORITATIVE_POLICY.
 */
export type AuthoritySourceLabel =
  | 'AUTHORITATIVE_POLICY'      // sourced from customer/CSP/Ericsson authoritative policy
  | 'REFERENCE_DEFAULT'         // generic reference default — NOT authoritative
  | 'SYNTHETIC_REFERENCE_POLICY' // synthetic POC fixture — NOT authoritative
  | 'PROFILE_DEFINED'           // defined by profile but not yet backed by detector
  | 'UNKNOWN';

// ─── Section 9: Normalized Capability Identity ────────────────────────────────

/**
 * Normalized capability key — deterministic identity for a capability.
 * Accounts for: subject, action, resource, scope, data class, channel, environment.
 */
export interface CapabilityKey {
  subject: string;
  action: string;
  resource: string;
  scope: string;
  dataClass: string;
  channel: string;
  environment: string;
}

/**
 * Normalize a CapabilityFact into a deterministic CapabilityKey.
 */
export function normalizeCapabilityKey(fact: {
  subject: string;
  action: string;
  resource: string;
  scope: string;
  dataClass?: string;
  channel?: string;
  environment?: string;
}): CapabilityKey {
  return {
    subject: (fact.subject ?? '').toLowerCase().trim(),
    action: (fact.action ?? '').toLowerCase().trim(),
    resource: (fact.resource ?? '').toLowerCase().trim(),
    scope: (fact.scope ?? '').toLowerCase().trim(),
    dataClass: (fact.dataClass ?? '').toLowerCase().trim(),
    channel: (fact.channel ?? '').toLowerCase().trim(),
    environment: (fact.environment ?? '').toLowerCase().trim(),
  };
}

/**
 * Serialize a CapabilityKey to a deterministic string for comparison.
 */
export function capabilityKeyToString(key: CapabilityKey): string {
  return [key.subject, key.action, key.resource, key.scope, key.dataClass, key.channel, key.environment]
    .join('|');
}

// ─── Section 10: Five-Plane Set Comparison ────────────────────────────────────

/**
 * A capability comparison record — one comparison between planes for a capability set.
 */
export interface CapabilityComparisonRecord {
  capabilityKey: string;
  requested: boolean;
  policyAuthorized: boolean;
  effectivelyGranted: boolean;
  codeCapable: boolean;
  observed: boolean;
  comparisons: CapabilityComparisonResult[];
  /** Mapped claim key (Section 12 — comparator → U5 claim) */
  mappedClaimKey?: string;
  /** Evidence IDs associated with this capability comparison */
  evidenceIds: string[];
  /** Profile verdict for this comparison */
  verdict: ProfileVerdict;
}

/**
 * Five-plane set comparison result — the full output of comparing sets of facts.
 */
export interface FivePlaneSetComparisonResult {
  comparisons: CapabilityComparisonRecord[];
  overallVerdict: ProfileVerdict;
  /** Summary counts */
  summary: {
    aligned: number;
    overPrivilegedGrant: number;
    undeclaredCapability: number;
    observedOutsideEnvelope: number;
    excessGrantedAuthority: number;
    untestedCapability: number;
    unexplainedRuntimeBehavior: number;
    requestedNotAuthorized: number;
    authorityNotRequested: number;
  };
}

// ─── Section 11: Verdict Policy ───────────────────────────────────────────────

/**
 * Profile verdict policy — determines severity from comparison result + impact.
 * Profile policy determines whether a mismatch is BLOCK or REVIEW.
 */
export interface VerdictPolicy {
  /** Observed unauthorized privileged/high-impact action → BLOCK */
  observedUnauthorizedPrivileged: 'BLOCK' | 'REVIEW';
  /** Capable unauthorized privileged capability → BLOCK or REVIEW per profile */
  capableUnauthorizedPrivileged: 'BLOCK' | 'REVIEW';
  /** Granted beyond policy → BLOCK/REVIEW per authority/impact */
  grantedBeyondPolicy: 'BLOCK' | 'REVIEW';
  /** Unused excess permission → normally REVIEW */
  unusedExcessPermission: 'BLOCK' | 'REVIEW';
  /** Untested capability → REVIEW */
  untestedCapability: 'BLOCK' | 'REVIEW';
  /** Unknown operation → REVIEW */
  unknownOperation: 'BLOCK' | 'REVIEW';
}

// ─── Section 14/15: Action Witness Correlation ────────────────────────────────

/**
 * Action witness correlation identity — all phases in one witness set must
 * refer to the SAME logical action.
 */
export interface ActionWitnessCorrelation {
  actionCorrelationId: string;
  buildDigest?: string;
  actorIdentity: string;
  operation: string;
  resourceScope?: string;
}

/**
 * OTel source authority classification (Section 16).
 * Generic application span → OBSERVATION/REQUESTED only.
 * Trusted sandbox/platform instrumentation → may qualify for APPLIED/CONFIRMED.
 */
export type OTelSourceAuthority =
  | 'GENERIC_APPLICATION'    // → OBSERVATION / REQUESTED only
  | 'TRUSTED_SANDBOX'        // → may qualify for ACCEPTED / APPLIED
  | 'PLATFORM_INSTRUMENTATION' // → may qualify for APPLIED / CONFIRMED
  | 'UNKNOWN_OTEL_SOURCE';

/**
 * Action witness phase authority — what a given source can prove.
 */
export type WitnessPhaseAuthority =
  | 'ACTION_REQUESTED'
  | 'ACTION_ATTEMPTED'
  | 'TARGET_REACHED'
  | 'ACTION_ACCEPTED'
  | 'ACTION_APPLIED'
  | 'ACTION_CONFIRMED'
  | 'OBSERVATION_ONLY';

// ─── Section 17: Telecom Rule Status Truth ────────────────────────────────────

/**
 * Telecom rule implementation status — reflects ACTUAL implementation,
 * not just profile definition.
 * A profile rule definition alone must never be called an ACTIVE detector.
 */
export type TelecomRuleImplementationStatus =
  | 'PROFILE_DEFINED'           // defined in profile but no detector
  | 'STATIC_DETECTOR_ACTIVE'    // has actual static scanner implementation
  | 'RUNTIME_TEST_ACTIVE'       // has actual runtime test implementation
  | 'ACTION_WITNESS_ACTIVE'     // has action witness boundary implementation
  | 'PARTIAL_ENGINE_SUPPORT'    // partially implemented by engine
  | 'REFERENCE_ONLY'            // reference/placeholder only
  | 'FUTURE';                   // planned but not implemented

// ─── Section 24: Compliance/Framework Mapping ─────────────────────────────────

/**
 * Framework mapping entry for U6 rendering.
 * Mapping strength is explicit — HEURISTIC is informational only.
 */
export interface FrameworkMappingEntry {
  framework: string;
  controlIds: string[];
  mappingStrength: MappingStrength;
  sourceReference?: SourceReference;
}

/**
 * Profile-backed compliance mapping metadata.
 * Supports exact/source-backed mappings without claiming certification.
 */
export interface ComplianceMappingSet {
  profileId: string;
  profileVersion: string;
  mappings: FrameworkMappingEntry[];
}

// ─── Section 25-27: Reference POC Fixture ─────────────────────────────────────

/**
 * Synthetic reference rAPP fixture — clearly labeled, NOT Ericsson authority.
 */
export interface SyntheticReferenceRAppFixture {
  fixtureId: string;
  fixtureLabel: 'SYNTHETIC_REFERENCE_RAPP';
  authorityLabel: 'SYNTHETIC_REFERENCE_POLICY';
  /** Sample repository/source */
  repository: {
    repoId: string;
    repoUrl: string;
    commitDigest: string;
    description: string;
  };
  /** Synthetic IAM grants */
  iamGrants: SyntheticIAMGrant[];
  /** Synthetic operating envelope */
  operatingEnvelope: OperatingEnvelope;
  /** Mock R1 action boundary */
  r1ActionBoundary: SyntheticR1ActionBoundary;
  /** Controlled action witnesses */
  actionWitnesses: ActionWitness[];
  /** Capability facts per plane */
  capabilityFacts: {
    requested: CapabilityFact[];
    policyAuthorized: CapabilityFact[];
    effectivelyGranted: CapabilityFact[];
    codeCapable: CapabilityFact[];
    observed: CapabilityFact[];
  };
}

export interface SyntheticIAMGrant {
  grantId: string;
  subject: string;
  action: string;
  resource: string;
  scope: string;
  authorityLabel: 'SYNTHETIC_REFERENCE_POLICY';
}

export interface SyntheticR1ActionBoundary {
  boundaryId: string;
  boundaryType: 'MOCK_R1_SANDBOX';
  authorityLabel: 'SYNTHETIC_REFERENCE_POLICY';
  supportedOperations: string[];
}

/**
 * POC scenario result — machine-readable fixture output for U6.
 */
export interface POCScenarioResult {
  scenarioId: string;
  scenarioLabel: string;
  profileId: string;
  profileVersion: string;
  profileDigest: string;
  envelopeId: string;
  envelopeVersion: string;
  envelopeDigest: string;
  envelopeState: OperatingEnvelopeState;
  buildDigest: string;
  requestedCapabilities: CapabilityKey[];
  authorizedCapabilities: CapabilityKey[];
  grantedCapabilities: CapabilityKey[];
  codeCapabilities: CapabilityKey[];
  observedCapabilities: CapabilityKey[];
  comparisons: CapabilityComparisonRecord[];
  claimResults: Array<{
    claimKey: string;
    claimState: ClaimState;
    reasonCodes: ClaimReasonCode[];
  }>;
  disposition: AssuranceDisposition;
  evidenceIds: string[];
}

/**
 * Full POC fixture output — proves U6 will have all required data.
 */
export interface POCFixtureOutput {
  fixtureId: string;
  fixtureLabel: 'SYNTHETIC_REFERENCE_RAPP';
  authorityLabel: 'SYNTHETIC_REFERENCE_POLICY';
  profileId: string;
  profileVersion: string;
  profileDigest: string;
  envelopeId: string;
  envelopeVersion: string;
  envelopeDigest: string;
  buildDigest: string;
  scenarios: POCScenarioResult[];
  generatedAt: string;
}

// ─── Section 13: Five-Plane Result Persistence (JSON shape) ───────────────────

/**
 * Persisted five-plane result — concise JSON stored on evaluation/claim.
 * U6 must be able to report all planes, delta, reason, evidence IDs.
 */
export interface PersistedFivePlaneResult {
  comparisons: Array<{
    capabilityKey: string;
    comparisons: CapabilityComparisonResult[];
    mappedClaimKey?: string;
    verdict: ProfileVerdict;
    evidenceIds: string[];
    planes: {
      requested: boolean;
      policyAuthorized: boolean;
      effectivelyGranted: boolean;
      codeCapable: boolean;
      observed: boolean;
    };
  }>;
  overallVerdict: ProfileVerdict;
}
