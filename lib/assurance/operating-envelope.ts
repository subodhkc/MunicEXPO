/**
 * E1 B8/B9 — Operating Envelope
 *
 * B8: Versioned, approved, digestible, governed.
 * B9: Customer parameters refine scope but cannot replace baseline security rules.
 *     Governed exceptions are explicit, time-bound, and approved.
 */

import { OperatingEnvelope, OperatingEnvelopeConstraints } from './types';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';

/**
 * B8: Compute deterministic operating envelope digest.
 * Commits to: envelopeId, version, profileId, profileVersion, constraints.
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
  ]));
  return hashTextContent(canonical);
}

/**
 * B8: Create a new operating envelope in DRAFT state.
 */
export function createDraftEnvelope(params: {
  organizationId: string;
  aiSystemId: string;
  profileId: string;
  profileVersion: string;
  constraints: OperatingEnvelopeConstraints;
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
  };
  return {
    ...draft,
    envelopeDigest: computeEnvelopeDigest(draft),
  };
}

/**
 * B8: Approve a draft envelope. Returns a new envelope with APPROVED state.
 * Does NOT mutate the original.
 */
export function approveEnvelope(
  envelope: OperatingEnvelope,
  approvedBy: string,
  approvedAt: Date
): OperatingEnvelope {
  if (envelope.state !== 'DRAFT') {
    throw new Error(`Cannot approve envelope in state ${envelope.state}`);
  }
  const approved: OperatingEnvelope = {
    ...envelope,
    state: 'APPROVED',
    approvedBy,
    approvedAt,
  };
  // Digest does not change — state transitions are operational, not semantic
  return approved;
}

/**
 * B9: Verify that an operating envelope does not exceed profile constraints.
 * Customer parameters may refine scope but cannot replace baseline security rules.
 */
export function verifyEnvelopeWithinProfile(
  envelope: OperatingEnvelope,
  profileAllowedOperations: string[],
  profileAllowedDestinations: string[]
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
