/**
 * UX-2A — Constraint Evaluation Capability Matrix
 *
 * Truth/read-model description of which OperatingEnvelopeConstraints HAIEC
 * can currently evaluate deterministically, which are conditional on
 * required fact dimensions, which are policy-context-only, and which are
 * not currently machine-evaluated.
 *
 * This is NOT a second evaluator. It is NOT a new decision engine.
 * It is a truthful metadata description derived from actual Main
 * implementation behavior.
 *
 * LOCK: STORED_POLICY_CONSTRAINT != MACHINE_EVALUABLE_CONSTRAINT
 * LOCK: POLICY_TEXT_PRESENT != CONTROL_ENFORCEMENT_PROVEN
 * LOCK: APPROVAL_REQUIREMENT_DECLARED != APPROVAL_CONTROL_OBSERVED
 * LOCK: CONSTRAINT_NOT_EVALUABLE != CONSTRAINT_SATISFIED
 * LOCK: UNKNOWN_CONSTRAINT_EVALUATION != PASS
 *
 * Inventory basis:
 * - lib/assurance/operating-envelope.ts verifyEnvelopeAgainstProfileSchema()
 *   performs deterministic subset/bound checks for: allowedOperations,
 *   r1Services, resourceScopes, regions, dataClasses, prohibitedDataClasses,
 *   destinations, approvedModels, approvedTools, allowedEnvironments,
 *   maxTargetCount, maxChangeMagnitude, approvalRequirements (count only).
 * - lib/assurance/types.ts FivePlaneResult / CapabilityComparisonRecord
 *   performs five-plane set comparison using CapabilityFacts.
 * - No runtime observation of approval control enforcement exists.
 * - No IAM/effective-grant observation exists (EFFECTIVELY_GRANTED hold).
 */

import { OperatingEnvelopeConstraints } from './types';

/**
 * Immutable version of the constraint evaluation capability matrix.
 * Changing this version requires a deliberate semantic update.
 */
export const CONSTRAINT_EVALUATION_CAPABILITY_VERSION = 'ux2a-1.0.0' as const;

/**
 * Truthful evaluability vocabulary.
 *
 * EVALUATED = current production logic actually performs the deterministic
 *   comparison (e.g. verifyEnvelopeAgainstProfileSchema or five-plane
 *   comparator).
 *
 * CONDITIONAL = comparison exists only when required structured fact
 *   dimensions/evidence exist; missing dimension remains unknown/not
 *   assessed, never pass.
 *
 * POLICY_CONTEXT_ONLY = HAIEC stores/uses it as policy context but does
 *   not currently establish behavioral enforcement.
 *
 * NOT_EVALUATED = no current production evaluator establishes it.
 */
export type ConstraintEvaluationMode =
  | 'EVALUATED'
  | 'CONDITIONAL'
  | 'POLICY_CONTEXT_ONLY'
  | 'NOT_EVALUATED';

/**
 * Relevant five-plane dimensions for a constraint family.
 */
export type RelevantPlane =
  | 'REQUESTED'
  | 'POLICY_AUTHORIZED'
  | 'EFFECTIVELY_GRANTED'
  | 'CODE_CAPABLE'
  | 'OBSERVED';

/**
 * Per-constraint evaluability metadata.
 */
export interface ConstraintEvaluationCapability {
  /** The constraint key from OperatingEnvelopeConstraints */
  constraintKey: keyof OperatingEnvelopeConstraints;
  /** Current evaluability mode */
  mode: ConstraintEvaluationMode;
  /** Relevant five-plane dimensions for this constraint family */
  relevantPlanes: RelevantPlane[];
  /** Required fact dimensions for evaluation, if any */
  requiredFactDimensions?: string[];
  /** Current implementation owner (function/file) */
  implementationOwner: string;
  /** Limitation or reason for the current mode */
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
    mode: 'EVALUATED',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE'],
    requiredFactDimensions: ['capabilityFacts.capable', 'capabilityFacts.policy'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() + five-plane comparator',
    limitation: 'Subset check against profile schema and five-plane policy-vs-capable comparison. Does not prove runtime enforcement.',
  },

  resourceScopes: {
    constraintKey: 'resourceScopes',
    mode: 'CONDITIONAL',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.capable.scope', 'capabilityFacts.policy.scope'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() + five-plane comparator (scope dimension)',
    limitation: 'Scope comparison is conditional on structured scope facts being present in capability facts. Missing scope dimension remains unknown, never pass.',
  },

  dataClasses: {
    constraintKey: 'dataClasses',
    mode: 'CONDITIONAL',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE'],
    requiredFactDimensions: ['capabilityFacts.capable.dataClass', 'capabilityFacts.policy.dataClass'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (prohibited data class check)',
    limitation: 'Data class comparison is conditional on structured dataClass facts. Profile-level prohibited data class check is evaluated; per-operation data class enforcement is not.',
  },

  destinations: {
    constraintKey: 'destinations',
    mode: 'EVALUATED',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: ['capabilityFacts.policy'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema()',
    limitation: 'Subset check against profile-allowed destinations. Does not prove actual network egress enforcement.',
  },

  regions: {
    constraintKey: 'regions',
    mode: 'EVALUATED',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: ['capabilityFacts.policy'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema()',
    limitation: 'Subset check against profile-allowed regions. Does not prove actual data residency enforcement.',
  },

  r1Services: {
    constraintKey: 'r1Services',
    mode: 'EVALUATED',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: ['capabilityFacts.policy'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema()',
    limitation: 'Subset check against profile-allowed R1 services. Does not prove actual R1 service access enforcement.',
  },

  maxTargetCount: {
    constraintKey: 'maxTargetCount',
    mode: 'CONDITIONAL',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.capable.targetCount', 'capabilityFacts.observed.targetCount'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile max check) + five-plane comparator (targetCount dimension)',
    limitation: 'Profile max bound is evaluated. Per-action target count comparison is conditional on structured targetCount facts being present. Missing targetCount dimension remains unknown, never pass.',
  },

  maxChangeMagnitude: {
    constraintKey: 'maxChangeMagnitude',
    mode: 'CONDITIONAL',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE', 'OBSERVED'],
    requiredFactDimensions: ['capabilityFacts.capable.changeMagnitude', 'capabilityFacts.observed.changeMagnitude'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (profile max check) + five-plane comparator (changeMagnitude dimension)',
    limitation: 'Profile max bound is evaluated. Per-action change magnitude comparison is conditional on structured changeMagnitude facts being present. Missing changeMagnitude dimension remains unknown, never pass.',
  },

  approvalRequirements: {
    constraintKey: 'approvalRequirements',
    mode: 'POLICY_CONTEXT_ONLY',
    relevantPlanes: ['POLICY_AUTHORIZED', 'OBSERVED'],
    requiredFactDimensions: ['observedApprovalControl'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (count threshold only)',
    limitation: 'Profile approval threshold count is checked. However, HAIEC does not currently observe or prove that an approval control was actually enforced at runtime. APPROVAL_REQUIREMENT_DECLARED != APPROVAL_CONTROL_OBSERVED.',
  },

  approvedModels: {
    constraintKey: 'approvedModels',
    mode: 'EVALUATED',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: ['capabilityFacts.policy'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema()',
    limitation: 'Subset check against profile-approved models. Does not prove actual model deployment enforcement.',
  },

  approvedTools: {
    constraintKey: 'approvedTools',
    mode: 'EVALUATED',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: ['capabilityFacts.policy'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema()',
    limitation: 'Subset check against profile-approved tools. Does not prove actual tool access enforcement.',
  },

  allowedEnvironments: {
    constraintKey: 'allowedEnvironments',
    mode: 'EVALUATED',
    relevantPlanes: ['POLICY_AUTHORIZED'],
    requiredFactDimensions: ['capabilityFacts.policy'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema()',
    limitation: 'Subset check against profile-allowed environments. Does not prove actual deployment environment enforcement.',
  },

  prohibitedDataClasses: {
    constraintKey: 'prohibitedDataClasses',
    mode: 'CONDITIONAL',
    relevantPlanes: ['POLICY_AUTHORIZED', 'CODE_CAPABLE'],
    requiredFactDimensions: ['capabilityFacts.capable.dataClass', 'capabilityFacts.policy.dataClass'],
    implementationOwner: 'verifyEnvelopeAgainstProfileSchema() (prohibited data class check)',
    limitation: 'Prohibited data class check is evaluated against profile schema. Per-operation data class enforcement is conditional on structured dataClass facts being present.',
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
 * Human-readable label for a constraint evaluation mode.
 * Used by the UI/read model to explain evaluability in simple language.
 */
export function formatConstraintEvaluationMode(mode: ConstraintEvaluationMode): string {
  switch (mode) {
    case 'EVALUATED':
      return 'Evaluated by HAIEC when required evidence is present';
    case 'CONDITIONAL':
      return 'Evaluated when required fact dimensions exist; missing dimension remains unknown';
    case 'POLICY_CONTEXT_ONLY':
      return 'Policy context only';
    case 'NOT_EVALUATED':
      return 'Not currently machine-evaluable';
    default:
      return mode;
  }
}
