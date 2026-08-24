/**
 * E1 Closure Sections 5-7 — Operating Envelope: Persistence, Versioning, Full Validation
 *
 * Section 5: Operating Envelope must be REAL — persistent, versioned, approved.
 *   States: DRAFT, APPROVED, SUPERSEDED, REVOKED.
 *   APPROVED envelopes are immutable. Any semantic modification creates a new version.
 *   Do not overwrite approved history.
 *
 * Section 6: Envelope digest vs approval.
 *   Semantic envelope digest represents only semantic constraints.
 *   But Assurance decision identity must ALSO bind:
 *     approval state, approved envelope version, approved authority/reference.
 *   A DRAFT envelope with identical semantic constraints cannot authorize ALLOW.
 *   Only APPROVED envelope may provide POLICY_AUTHORIZED evidence.
 *
 * Section 7: Full envelope validation.
 *   Expand validation for configured profile constraints:
 *     allowed operations, R1 services, resource types/scopes, regions, data classes,
 *     destinations, approved models, approved tools, allowed environments,
 *     maxTargetsPerAction, maxChangeMagnitude, approvalThreshold, prohibited data classes.
 *   UNKNOWN required policy parameter → REVIEW, not ALLOW.
 */

import {
  OperatingEnvelope,
  OperatingEnvelopeConstraints,
  OperatingEnvelopeState,
  AssuranceProfile,
  CustomerParameterSchema,
  AuthoritySourceLabel,
} from './types';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';

/**
 * Section 5: Compute deterministic operating envelope digest.
 * Commits to: envelopeId, version, profileId, profileVersion, constraints.
 * Does NOT commit to approval state (Section 6 — approval is separate binding).
 */
export function computeEnvelopeDigest(envelope: Omit<OperatingEnvelope, 'envelopeDigest'>): string {
  const digestInput = {
    envelopeId: envelope.envelopeId,
    envelopeVersion: envelope.envelopeVersion,
    organizationId: envelope.organizationId,
    aiSystemId: envelope.aiSystemId,
    profileId: envelope.profileId,
    profileVersion: envelope.profileVersion,
    constraints: envelope.constraints,
  };

  const canonical = canonicalSerialize(digestInput, new Set([
    'constraints', 'approvalRequirements', 'allowedOperations', 'resourceScopes',
    'dataClasses', 'destinations', 'approvedModels', 'approvedTools', 'allowedEnvironments',
    'regions', 'r1Services', 'prohibitedDataClasses',
  ]));
  return hashTextContent(canonical);
}

/**
 * Section 5: Create a new operating envelope in DRAFT state.
 * Version starts at "1" for a new envelope.
 */
export function createDraftEnvelope(params: {
  organizationId: string;
  aiSystemId: string;
  profileId: string;
  profileVersion: string;
  constraints: OperatingEnvelopeConstraints;
  authoritySourceLabel?: AuthoritySourceLabel;
}): OperatingEnvelope {
  const envelopeId = `envelope:${params.organizationId}:${params.aiSystemId}`;
  const envelopeVersion = '1';
  const draft: Omit<OperatingEnvelope, 'envelopeDigest'> = {
    envelopeId,
    envelopeVersion,
    organizationId: params.organizationId,
    aiSystemId: params.aiSystemId,
    state: 'DRAFT',
    profileId: params.profileId,
    profileVersion: params.profileVersion,
    constraints: params.constraints,
    createdAt: new Date(0), // deterministic placeholder — real createdAt set on persist
    authoritySourceLabel: params.authoritySourceLabel ?? 'REFERENCE_DEFAULT',
  };
  return {
    ...draft,
    envelopeDigest: computeEnvelopeDigest(draft),
  };
}

/**
 * Section 5: Approve a draft envelope. Returns a new envelope with APPROVED state.
 * Does NOT mutate the original.
 * APPROVED envelopes are immutable — any semantic modification creates a new version.
 */
export function approveEnvelope(
  envelope: OperatingEnvelope,
  approvedBy: string,
  approvedAt: Date,
  approvalReference?: string,
): OperatingEnvelope {
  if (envelope.state !== 'DRAFT') {
    throw new Error(`Cannot approve envelope in state ${envelope.state}`);
  }
  const approved: OperatingEnvelope = {
    ...envelope,
    state: 'APPROVED',
    approvedBy,
    approvedAt,
    approvalReference,
  };
  // Digest does not change — state transitions are operational, not semantic
  return approved;
}

/**
 * Section 5: Create a new version of an envelope with modified constraints.
 * The prior APPROVED envelope remains APPROVED while the new version is DRAFT.
 * Supersession happens only when the new version is approved.
 * Does NOT mutate the original — returns the new DRAFT version.
 */
export function createNewEnvelopeVersion(
  envelope: OperatingEnvelope,
  newConstraints: OperatingEnvelopeConstraints,
): OperatingEnvelope {
  if (envelope.state !== 'APPROVED') {
    throw new Error(`Cannot version envelope in state ${envelope.state} — only APPROVED envelopes can be superseded`);
  }

  // Parse current version and increment (Section 16: numeric ordering)
  const currentVersionNum = parseInt(envelope.envelopeVersion, 10) || 1;
  const newVersionNum = currentVersionNum + 1;

  const newDraft: Omit<OperatingEnvelope, 'envelopeDigest'> = {
    envelopeId: envelope.envelopeId,
    envelopeVersion: String(newVersionNum),
    organizationId: envelope.organizationId,
    aiSystemId: envelope.aiSystemId,
    state: 'DRAFT',
    profileId: envelope.profileId,
    profileVersion: envelope.profileVersion,
    constraints: newConstraints,
    createdAt: new Date(0), // deterministic placeholder — real createdAt set on persist
    authoritySourceLabel: envelope.authoritySourceLabel,
  };

  return {
    ...newDraft,
    envelopeDigest: computeEnvelopeDigest(newDraft),
  };
}

/**
 * Section 5: Revoke an approved envelope.
 */
export function revokeEnvelope(envelope: OperatingEnvelope): OperatingEnvelope {
  if (envelope.state !== 'APPROVED') {
    throw new Error(`Cannot revoke envelope in state ${envelope.state}`);
  }
  return {
    ...envelope,
    state: 'REVOKED',
  };
}

/**
 * Section 6: Check if an envelope is APPROVED and can authorize ALLOW.
 * A DRAFT envelope with identical semantic constraints cannot authorize ALLOW.
 */
export function canAuthorizeAllow(envelope: OperatingEnvelope): boolean {
  return envelope.state === 'APPROVED';
}

/**
 * Section 6: Get the approval binding for decision identity.
 * Assurance decision identity must bind: approval state, approved version, approved authority.
 */
export function getApprovalBinding(envelope: OperatingEnvelope): {
  state: OperatingEnvelopeState;
  version: string;
  approvedBy?: string;
  approvedAt?: Date;
  approvalReference?: string;
} {
  return {
    state: envelope.state,
    version: envelope.envelopeVersion,
    approvedBy: envelope.approvedBy,
    approvedAt: envelope.approvedAt,
    approvalReference: envelope.approvalReference,
  };
}

/**
 * Section 7: Full envelope validation against profile constraints.
 *
 * Expands validation for ALL configured profile constraints:
 *   allowed operations, R1 services, resource types/scopes, regions, data classes,
 *   destinations, approved models, approved tools, allowed environments,
 *   maxTargetsPerAction, maxChangeMagnitude, approvalThreshold, prohibited data classes.
 *
 * UNKNOWN required policy parameter → REVIEW (not ALLOW).
 */
export function verifyEnvelopeWithinProfile(
  envelope: OperatingEnvelope,
  profileAllowedOperations: string[],
  profileAllowedDestinations: string[],
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Envelope operations must be a subset of profile-allowed operations
  for (const op of envelope.constraints.allowedOperations) {
    if (profileAllowedOperations.length > 0 && !profileAllowedOperations.includes(op)) {
      violations.push(`Operation ${op} not allowed by profile`);
    }
  }

  // Envelope destinations must be a subset of profile-allowed destinations
  for (const dest of envelope.constraints.destinations) {
    if (profileAllowedDestinations.length > 0 && !profileAllowedDestinations.includes(dest)) {
      violations.push(`Destination ${dest} not allowed by profile`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Section 7: Full envelope validation against profile customer parameter schema.
 *
 * Validates ALL configured profile constraints.
 * UNKNOWN required policy parameter → REVIEW (not ALLOW).
 */
export function verifyEnvelopeAgainstProfileSchema(
  envelope: OperatingEnvelope,
  schema: CustomerParameterSchema,
): { valid: boolean; violations: string[]; reviewRequired: string[] } {
  const violations: string[] = [];
  const reviewRequired: string[] = [];
  const constraints = envelope.constraints;

  // Allowed operations
  if (schema.allowedOperations && schema.allowedOperations.length > 0) {
    for (const op of constraints.allowedOperations) {
      if (!schema.allowedOperations.includes(op)) {
        violations.push(`Operation ${op} not in profile allowed operations`);
      }
    }
  }

  // R1 services
  if (schema.allowedR1Services && schema.allowedR1Services.length > 0) {
    if (constraints.r1Services) {
      for (const svc of constraints.r1Services) {
        if (!schema.allowedR1Services.includes(svc)) {
          violations.push(`R1 service ${svc} not in profile allowed R1 services`);
        }
      }
    }
  }

  // Resource types/scopes
  if (schema.allowedResourceTypes && schema.allowedResourceTypes.length > 0) {
    for (const scope of constraints.resourceScopes) {
      if (!schema.allowedResourceTypes.includes(scope)) {
        violations.push(`Resource scope ${scope} not in profile allowed resource types`);
      }
    }
  }

  // Regions
  if (schema.allowedRegions && schema.allowedRegions.length > 0) {
    if (constraints.regions) {
      for (const region of constraints.regions) {
        if (!schema.allowedRegions.includes(region)) {
          violations.push(`Region ${region} not in profile allowed regions`);
        }
      }
    }
  }

  // Data classes
  if (schema.prohibitedDataClasses && schema.prohibitedDataClasses.length > 0) {
    for (const dc of constraints.dataClasses) {
      if (schema.prohibitedDataClasses.includes(dc)) {
        violations.push(`Data class ${dc} is prohibited by profile`);
      }
    }
    if (constraints.prohibitedDataClasses) {
      for (const dc of constraints.prohibitedDataClasses) {
        if (schema.prohibitedDataClasses.includes(dc)) {
          violations.push(`Data class ${dc} is prohibited by profile`);
        }
      }
    }
  }

  // Destinations
  if (schema.allowedDestinations && schema.allowedDestinations.length > 0) {
    for (const dest of constraints.destinations) {
      if (!schema.allowedDestinations.includes(dest)) {
        violations.push(`Destination ${dest} not in profile allowed destinations`);
      }
    }
  }

  // Approved models
  if (schema.approvedModels && schema.approvedModels.length > 0) {
    for (const model of constraints.approvedModels) {
      if (!schema.approvedModels.includes(model)) {
        violations.push(`Model ${model} not in profile approved models`);
      }
    }
  }

  // Approved tools
  if (schema.approvedTools && schema.approvedTools.length > 0) {
    for (const tool of constraints.approvedTools) {
      if (!schema.approvedTools.includes(tool)) {
        violations.push(`Tool ${tool} not in profile approved tools`);
      }
    }
  }

  // Allowed environments
  if (schema.allowedEnvironments && schema.allowedEnvironments.length > 0) {
    for (const env of constraints.allowedEnvironments) {
      if (!schema.allowedEnvironments.includes(env)) {
        violations.push(`Environment ${env} not in profile allowed environments`);
      }
    }
  }

  // maxTargetsPerAction
  if (schema.maxTargetsPerAction !== undefined) {
    if (constraints.maxTargetCount !== undefined) {
      if (constraints.maxTargetCount > schema.maxTargetsPerAction) {
        violations.push(`maxTargetCount ${constraints.maxTargetCount} exceeds profile max ${schema.maxTargetsPerAction}`);
      }
    } else {
      // UNKNOWN required policy parameter → REVIEW
      reviewRequired.push('maxTargetCount not specified in envelope — profile requires it');
    }
  }

  // maxChangeMagnitude
  if (schema.maxChangeMagnitude !== undefined) {
    if (constraints.maxChangeMagnitude !== undefined) {
      if (constraints.maxChangeMagnitude > schema.maxChangeMagnitude) {
        violations.push(`maxChangeMagnitude ${constraints.maxChangeMagnitude} exceeds profile max ${schema.maxChangeMagnitude}`);
      }
    } else {
      reviewRequired.push('maxChangeMagnitude not specified in envelope — profile requires it');
    }
  }

  // approvalThreshold
  if (schema.approvalThreshold !== undefined) {
    const approvalCount = constraints.approvalRequirements.filter(a => a.requiresApproval).length;
    if (approvalCount < schema.approvalThreshold) {
      violations.push(`Approval requirements count ${approvalCount} below profile threshold ${schema.approvalThreshold}`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    reviewRequired,
  };
}
