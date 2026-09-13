/**
 * UX-2A — Constraint Evaluation Capability Matrix
 *
 * Truthful read-model description of which OperatingEnvelopeConstraints
 * HAIEC can currently:
 *   (a) validate against the selected Assurance Profile parameter schema
 *       (authoring-time validation); and
 *   (b) behaviorally evaluate against CODE_CAPABLE / OBSERVED capability
 *       facts (five-plane comparison / isWithinEnvelope).
 *
 * These two concepts are NOT the same:
 *   PROFILE_SCHEMA_VALIDATION != BEHAVIORAL_EVIDENCE_EVALUATION
 *   PROFILE_VALIDATED != CONTROL_ENFORCEMENT_PROVEN
 *
 * This is NOT a second evaluator. It is NOT a new decision engine.
 * It is a truthful metadata description derived from actual Main
 * implementation behavior.
 *
 * LOCK: STORED_POLICY_CONSTRAINT != MACHINE_EVALUABLE_CONSTRAINT
 * LOCK: POLICY_TEXT_PRESENT != CONTROL_ENFORCEMENT_PROVEN
 * LOCK: APPROVAL_REQUIREMENT_DECLARED != APPROVAL_CONTROL_OBSERVED
 * LOCK: CONSTRAINT_NOT_EVALUABLE != CONSTRAINT_SATISFIED
 * LOCK: NO_CONTRADICTION_EMITTED != CONSTRAINT_SATISFIED
 * LOCK: UNKNOWN_CONSTRAINT_EVALUATION != PASS
 * LOCK: CURRENT_IMPLEMENTATION_LIMITATION != FUTURE_DESIRED_SEMANTIC
 *
 * Inventory basis (exact Main behavior):
 *
 * - lib/assurance/operating-envelope.ts verifyEnvelopeAgainstProfileSchema()
 *   performs deterministic subset/bound checks against CustomerParameterSchema
 *   for: allowedOperations, r1Services, resourceScopes, regions, dataClasses,
 *   prohibitedDataClasses, destinations, approvedModels, approvedTools,
 *   allowedEnvironments, maxTargetCount, maxChangeMagnitude, approvalRequirements
 *   (count threshold only). This is PROFILE VALIDATION, not behavioral
 *   evaluation.
 *
 * - lib/assurance/capability-fact-projection.ts projectPolicyFacts()
 *   projects APPROVED envelope constraints into POLICY_AUTHORIZED facts
 *   for: allowedOperations (→action), resourceScopes (→scope),
 *   dataClasses[0] (→dataClass), allowedEnvironments[0] (→environment),
 *   maxTargetCount (→targetCount), maxChangeMagnitude (→changeMagnitude).
 *   It does NOT project: destinations, regions, r1Services,
 *   approvalRequirements, approvedModels, approvedTools, prohibitedDataClasses.
 *
 * - lib/assurance/capability-comparator.ts isWithinEnvelope()
 *   behaviorally checks OBSERVED facts against envelope constraints for:
 *   regions, maxTargetCount, maxChangeMagnitude, prohibitedDataClasses,
 *   allowedEnvironments. It is NOT called on CODE_CAPABLE facts.
 *
 * - lib/assurance/capability-comparator.ts compareCapabilitySets()
 *   compares POLICY_AUTHORIZED facts against CODE_CAPABLE / OBSERVED by
 *   action (allowedOperations) and scope (resourceScopes).
 *
 * - CRITICAL U5 LIMITATION: For maxTargetCount, maxChangeMagnitude,
 *   prohibitedDataClasses, and allowedEnvironments, when the required
 *   fact dimension is ABSENT from the observed fact, isWithinEnvelope()
 *   SKIPS the check and returns true. No contradiction is emitted.
 *   This means absence of a fact dimension does NOT prove the constraint
 *   was satisfied. The product UI must NOT render these as
 *   "Evaluated by HAIEC" in the behavioral sense.
 *
 * - approvalRequirements: No runtime observation of approval control
 *   enforcement exists. Profile validation checks only the count threshold.
 *
 * - destinations, r1Services, approvedModels, approvedTools: Profile
 *   validation only. No behavioral evaluation, no fact projection, no
 *   comparator check.
 */

import { OperatingEnvelopeConstraints } from './types';

/**
 * Immutable version of the constraint evaluation capability matrix.
 * Changing this version requires a deliberate semantic update.
 */
export const CONSTRAINT_EVALUATION_CAPABILITY_VERSION = 'ux2a-1.0.0' as const;

/**
 * Profile validation support — does HAIEC validate this constraint
 * against the selected Assurance Profile parameter schema at authoring
 * time?
 *
 * SUPPORTED = verifyEnvelopeAgainstProfileSchema checks this field.
 * NOT_APPLICABLE = no profile-schema validation exists for this field.
 */
export type ProfileValidationSupport = 'SUPPORTED' | 'NOT_APPLICABLE';

/**
 * Behavioral / evidence evaluation support — does HAIEC behaviorally
 * evaluate this constraint against CODE_CAPABLE / OBSERVED capability
 * facts via the five-plane comparator or isWithinEnvelope?
 *
 * CONDITIONAL = comparison exists when required structured fact
 *   dimensions exist; missing dimension may not produce a contradiction
 *   (see missingFactBehavior).
 *
 * LIMITED = comparison exists but only for OBSERVED facts (not
 *   CODE_CAPABLE), and missing fact dimensions silently pass without
 *   emitting a contradiction.
 *
 * NOT_EVALUATED = no behavioral evaluation exists for this constraint.
 */
export type EvidenceEvaluationSupport = 'CONDITIONAL' | 'LIMITED' | 'NOT_EVALUATED';

/**
 * What happens when the required fact dimension is absent?
 *
 * EXPLICIT_UNKNOWN = the evaluator emits an explicit UNKNOWN/MISSING
 *   result (contradiction or NOT_ASSESSED claim state).
 *
 * PLANE_DEPENDENT = the outcome depends on which five-plane the fact
 *   belongs to. For example, a missing/unknown scope on CODE_CAPABLE
 *   may produce CAPABILITY_SCOPE_NOT_ESTABLISHED, while a nonmatching
 *   scope on OBSERVED may produce OBSERVED_OUTSIDE_OPERATING_ENVELOPE.
 *   There is no single universal "explicit unknown" or "no contradiction"
 *   classification — the behavior is plane-specific.
 *
 * NO_CONTRADICTION_EMITTED = the evaluator skips the check and returns
 *   no violation. Absence must NOT be interpreted as satisfaction.
 *
 * NOT_APPLICABLE = no behavioral evaluation exists, so missing-fact
 *   behavior is not relevant.
 */
export type MissingFactBehavior = 'EXPLICIT_UNKNOWN' | 'PLANE_DEPENDENT' | 'NO_CONTRADICTION_EMITTED' | 'NOT_APPLICABLE';

/**
 * Per-constraint evaluability metadata.
 */
export interface ConstraintEvaluationCapability {
  /** The constraint key from OperatingEnvelopeConstraints */
  constraintKey: keyof OperatingEnvelopeConstraints;
  /** Profile validation support (authoring-time) */
  profileValidation: ProfileValidationSupport;
  /** Behavioral / evidence evaluation support (runtime) */
  evidenceEvaluation: EvidenceEvaluationSupport;
  /** What happens when the required fact dimension is absent */
  missingFactBehavior: MissingFactBehavior;
  /** Relevant five-plane dimensions for this constraint family */
  relevantPlanes: Array<'REQUESTED' | 'POLICY_AUTHORIZED' | 'EFFECTIVELY_GRANTED' | 'CODE_CAPABLE' | 'OBSERVED'>;
  /** Required fact dimensions for behavioral evaluation, if any */
  requiredFactDimensions?: string[];
  /** Current implementation owner (function/file) */
  implementationOwner: string;
  /** Limitation or reason for the current classification */
  limitation: string;
}

/**
 * The canonical matrix — satisfies Record<keyof OperatingEnvelopeConstraints,
 * ConstraintEvaluationCapability> for compile-time completeness.
 *
 * If a new constraint field is added to OperatingEnvelopeConstraints,
 * TypeScript will fail to compile this record until an entry is added.
 * This prevents a future constraint from silently appearing as evaluable.
 */
export const CONSTRAINT_EVALUATION_CAPABILITY_MATRIX: Record<
  keyof OperatingEnvelopeConstraints,
  ConstraintEvaluationCapability
> = {
  allowedOperations: {
    constraintKey: 'allowedOperations',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'CONDITIONAL',
    missingFactBehavior: 'PLANE_DEPENDENT',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.capable.action', 'capabilityFacts.observed.action', 'capabilityFacts.policy.action'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() + projectPolicyFacts() + compareCapabilitySets()',
    limitation: 'Policy operations are projected into POLICY_AUTHORIZED facts only for APPROVED envelopes. Comparator matches by action. Action is a required CapabilityFact dimension — plane absence is represented separately by five-plane availability. An unmatched capable/observed action becomes a comparator finding (UNDECLARED_CAPABILITY or OBSERVED_OUTSIDE_OPERATING_ENVELOPE) rather than an explicit UNKNOWN for a missing dimension. Behavioral evaluation is conditional on qualifying facts.',
  },

  resourceScopes: {
    constraintKey: 'resourceScopes',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'CONDITIONAL',
    missingFactBehavior: 'PLANE_DEPENDENT',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.capable.scope', 'capabilityFacts.observed.scope', 'capabilityFacts.policy.scope'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() + projectPolicyFacts() + scopeContains() in compareCapabilitySets()',
    limitation: 'Policy scopes are projected into POLICY_AUTHORIZED facts. scopeContains() compares policy vs capable/observed scope. Behavior is plane-dependent: a missing/unknown CODE_CAPABLE scope can produce CAPABILITY_SCOPE_NOT_ESTABLISHED, while a nonmatching OBSERVED scope can produce OBSERVED_OUTSIDE_OPERATING_ENVELOPE. There is no single universal "explicit unknown" classification — the outcome depends on the plane and the specific comparison path. Behavioral evaluation is conditional on scope-bearing facts.',
  },

  dataClasses: {
    constraintKey: 'dataClasses',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'CONDITIONAL',
    missingFactBehavior: 'NO_CONTRADICTION_EMITTED',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.capable.dataClass', 'capabilityFacts.observed.dataClass', 'capabilityFacts.policy.dataClass'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (prohibited check) + projectPolicyFacts() (dataClasses[0] → dataClass)',
    limitation: 'Only dataClasses[0] is projected onto policy facts. Comparator enforces dataClass equality only when BOTH sides provide a dataClass. Missing fact.dataClass causes the comparison to be skipped — no contradiction is emitted. Absence must not be interpreted as satisfaction.',
  },

  destinations: {
    constraintKey: 'destinations',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'NOT_EVALUATED',
    missingFactBehavior: 'NOT_APPLICABLE',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: [],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile subset check only)',
    limitation: 'Profile validation only. Destinations are not represented in CapabilityFact, not projected into POLICY_AUTHORIZED facts, and not checked by the comparator or isWithinEnvelope. No behavioral evaluation exists.',
  },

  regions: {
    constraintKey: 'regions',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'LIMITED',
    missingFactBehavior: 'PLANE_DEPENDENT',
    relevantPlanes: ['POLICY_AUTHORIZED', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.observed.scope'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() + isWithinEnvelope() (OBSERVED only)',
    limitation: 'isWithinEnvelope() uses observed fact.scope as the current region surrogate — there is no dedicated structured region fact dimension yet (OPERATIONAL_SCOPE != DEDICATED_REGION_FACT). Only called on OBSERVED facts, not CODE_CAPABLE. A nonmatching/unknown scope can cause the region check to fail and produce an outside-envelope result. If constraints.regions is absent, the check is skipped. This is a current implementation limitation, not an Assurance Engine fix.',
  },

  r1Services: {
    constraintKey: 'r1Services',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'NOT_EVALUATED',
    missingFactBehavior: 'NOT_APPLICABLE',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: [],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile subset check only)',
    limitation: 'Profile validation only. r1Services are not represented in CapabilityFact, not projected into POLICY_AUTHORIZED facts, and not checked by the comparator or isWithinEnvelope. No behavioral evaluation exists.',
  },

  maxTargetCount: {
    constraintKey: 'maxTargetCount',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'LIMITED',
    missingFactBehavior: 'NO_CONTRADICTION_EMITTED',
    relevantPlanes: ['POLICY_AUTHORIZED', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.observed.targetCount'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile max) + projectPolicyFacts() (targetCount) + isWithinEnvelope() (OBSERVED only)',
    limitation: 'CRITICAL LIMITATION (Assurance Engine): isWithinEnvelope() checks observed fact.targetCount against maxTargetCount. If fact.targetCount is absent, it falls back to regex-parsing fact.scope. If no match, the check is SKIPPED and isWithinEnvelope returns true — no contradiction is emitted. Absence of targetCount must NOT be interpreted as the constraint being satisfied. Only called on OBSERVED facts.',
  },

  maxChangeMagnitude: {
    constraintKey: 'maxChangeMagnitude',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'LIMITED',
    missingFactBehavior: 'NO_CONTRADICTION_EMITTED',
    relevantPlanes: ['POLICY_AUTHORIZED', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.observed.changeMagnitude'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile max) + projectPolicyFacts() (changeMagnitude) + isWithinEnvelope() (OBSERVED only)',
    limitation: 'CRITICAL LIMITATION (Assurance Engine): isWithinEnvelope() checks observed fact.changeMagnitude against maxChangeMagnitude. If fact.changeMagnitude is absent, it falls back to regex-parsing fact.scope. If no match, the check is SKIPPED and isWithinEnvelope returns true — no contradiction is emitted. Absence of changeMagnitude must NOT be interpreted as the constraint being satisfied. Only called on OBSERVED facts.',
  },

  approvalRequirements: {
    constraintKey: 'approvalRequirements',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'NOT_EVALUATED',
    missingFactBehavior: 'NOT_APPLICABLE',
    relevantPlanes: ['POLICY_AUTHORIZED', 'OBSERVED'],
    requiredFactDimensions: ['observedApprovalControl'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (count threshold only)',
    limitation: 'Profile validation checks only the count of requiresApproval entries against schema.approvalThreshold. No runtime observation of approval control enforcement exists. APPROVAL_REQUIREMENT_DECLARED != APPROVAL_CONTROL_OBSERVED. No behavioral evaluation exists.',
  },

  approvedModels: {
    constraintKey: 'approvedModels',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'NOT_EVALUATED',
    missingFactBehavior: 'NOT_APPLICABLE',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: [],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile subset check only)',
    limitation: 'Profile validation only. approvedModels are not represented in CapabilityFact, not projected into POLICY_AUTHORIZED facts, and not checked by the comparator or isWithinEnvelope. No behavioral evaluation exists.',
  },

  approvedTools: {
    constraintKey: 'approvedTools',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'NOT_EVALUATED',
    missingFactBehavior: 'NOT_APPLICABLE',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: [],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile subset check only)',
    limitation: 'Profile validation only. approvedTools are not represented in CapabilityFact, not projected into POLICY_AUTHORIZED facts, and not checked by the comparator or isWithinEnvelope. No behavioral evaluation exists.',
  },

  allowedEnvironments: {
    constraintKey: 'allowedEnvironments',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'LIMITED',
    missingFactBehavior: 'NO_CONTRADICTION_EMITTED',
    relevantPlanes: ['POLICY_AUTHORIZED', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.observed.environment'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile subset) + projectPolicyFacts() (allowedEnvironments[0] → environment) + isWithinEnvelope() (OBSERVED only)',
    limitation: 'CRITICAL LIMITATION (Assurance Engine): isWithinEnvelope() checks observed fact.environment against allowedEnvironments. If fact.environment is absent, the check is SKIPPED and isWithinEnvelope returns true — no contradiction is emitted. Absence of environment must NOT be interpreted as the constraint being satisfied. Only called on OBSERVED facts.',
  },

  prohibitedDataClasses: {
    constraintKey: 'prohibitedDataClasses',
    profileValidation: 'SUPPORTED',
    evidenceEvaluation: 'LIMITED',
    missingFactBehavior: 'NO_CONTRADICTION_EMITTED',
    relevantPlanes: ['POLICY_AUTHORIZED', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.observed.dataClass'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (prohibited check) + isWithinEnvelope() (OBSERVED only)',
    limitation: 'CRITICAL LIMITATION (Assurance Engine): isWithinEnvelope() checks if observed fact.dataClass is in prohibitedDataClasses. If fact.dataClass is absent, the check is SKIPPED and isWithinEnvelope returns true — no contradiction is emitted. Absence of dataClass must NOT be interpreted as the constraint being satisfied. Only called on OBSERVED facts.',
  },
};

/**
 * Get the constraint evaluation capability matrix with its version.
 *
 * LOCK: MATRIX_VERSION is immutable/deterministic.
 */
export function getConstraintEvaluationCapabilityMatrix(): {
  version: typeof CONSTRAINT_EVALUATION_CAPABILITY_VERSION;
  matrix: typeof CONSTRAINT_EVALUATION_CAPABILITY_MATRIX;
  entries: ConstraintEvaluationCapability[];
} {
  return {
    version: CONSTRAINT_EVALUATION_CAPABILITY_VERSION,
    matrix: CONSTRAINT_EVALUATION_CAPABILITY_MATRIX,
    entries: Object.values(CONSTRAINT_EVALUATION_CAPABILITY_MATRIX),
  };
}

/**
 * Human-readable label for profile validation support.
 */
export function formatProfileValidationSupport(support: ProfileValidationSupport): string {
  switch (support) {
    case 'SUPPORTED':
      return 'Profile-validated';
    case 'NOT_APPLICABLE':
      return 'No profile validation';
    default:
      return support;
  }
}

/**
 * Human-readable label for evidence evaluation support.
 * Used by the UI/read model to explain evaluability in simple language.
 *
 * The UI must NOT render LIMITED or NOT_EVALUATED cases as
 * "Evaluated by HAIEC" in the behavioral sense.
 */
export function formatEvidenceEvaluationSupport(support: EvidenceEvaluationSupport): string {
  switch (support) {
    case 'CONDITIONAL':
      return 'Evidence comparison available when facts exist';
    case 'LIMITED':
      return 'Limited: missing fact may not produce a contradiction';
    case 'NOT_EVALUATED':
      return 'Not currently evidence-evaluated';
    default:
      return support;
  }
}

/**
 * Human-readable label for missing fact behavior.
 */
export function formatMissingFactBehavior(behavior: MissingFactBehavior): string {
  switch (behavior) {
    case 'EXPLICIT_UNKNOWN':
      return 'Missing fact produces explicit unknown';
    case 'PLANE_DEPENDENT':
      return 'Outcome depends on the five-plane — no single universal classification';
    case 'NO_CONTRADICTION_EMITTED':
      return 'Missing fact may not produce a contradiction — absence is not satisfaction';
    case 'NOT_APPLICABLE':
      return 'No behavioral evaluation';
    default:
      return behavior;
  }
}
