/**
 * U6 — Positive Assurance Mark Eligibility.
 *
 * Pure policy function. Does not issue any visual artifact.
 *
 * Defect 1: evaluationStatus must come from persisted assurance_evaluations, not hardcoded.
 * Defect 2: Mark requires APPROVED envelope + AUTHORITATIVE_POLICY authority.
 */

import { U6Package } from './u6-types';
import { PackageVerificationResult } from './u6-types';

export interface MarkEligibilityResult {
  eligible: boolean;
  reasonCodes: string[];
}

export const POSITIVE_MARK_LABEL = 'HAIEC Assurance Evaluated' as const;
export const POSITIVE_MARK_STATUS = 'ALLOW WITHIN EVALUATED SCOPE' as const;

export interface MarkEligibilityContext {
  pkg: U6Package;
  packageVerification: PackageVerificationResult;
  anchorValid: boolean;
  publicationState: 'PRIVATE' | 'PUBLIC' | 'REVOKED';
  /**
   * Defect 1: Persisted evaluationStatus from assurance_evaluations.
   * Must be loaded from DB, not assumed.
   */
  evaluationStatus: string;
  /**
   * Defect 2: Operating envelope state from persisted evaluation.
   */
  operatingEnvelopeState?: string;
  /**
   * Defect 2: Authority source label from persisted evaluation.
   */
  authoritySourceLabel?: string;
}

/**
 * Defect 2: Only AUTHORITATIVE_POLICY qualifies for positive mark.
 */
const AUTHORITATIVE_AUTHORITY_LABEL = 'AUTHORITATIVE_POLICY';

/**
 * Defect 2: Only APPROVED envelope qualifies.
 */
const APPROVED_ENVELOPE_STATE = 'APPROVED';

export function evaluateAssuranceMarkEligibility(ctx: MarkEligibilityContext): MarkEligibilityResult {
  const { pkg, packageVerification, anchorValid, publicationState, evaluationStatus, operatingEnvelopeState, authoritySourceLabel } = ctx;
  const reasons: string[] = [];
  const add = (code: string) => reasons.push(code);

  // Methodology
  if (pkg.receipt.assuranceMethodologyVersion !== '1.1') add('MARK_INELIGIBLE: methodology not 1.1');

  // Defect 1: Persisted evaluationStatus — not hardcoded
  if (evaluationStatus !== 'COMPLETED') add(`MARK_INELIGIBLE: evaluation status is ${evaluationStatus}`);

  // Disposition
  if (pkg.receipt.disposition !== 'ALLOW') add(`MARK_INELIGIBLE: disposition is ${pkg.receipt.disposition}`);

  // Profile identity
  if (!pkg.receipt.profileId) add('MARK_INELIGIBLE: resolved profile missing');

  // Synthetic
  if (pkg.syntheticClassification !== 'NONE') add(`MARK_INELIGIBLE: synthetic classification is ${pkg.syntheticClassification}`);

  // Build Identity
  if (pkg.buildIdentity.source === 'NOT_PROVIDED') add('MARK_INELIGIBLE_BUILD_IDENTITY_NOT_ESTABLISHED');

  // Package verification
  if (!packageVerification.valid) add('MARK_INELIGIBLE: package verification failed');

  // Persisted anchor
  if (!anchorValid) add('MARK_INELIGIBLE: persisted anchor mismatch');

  // Publication
  if (publicationState !== 'PUBLIC') add('MARK_INELIGIBLE: package is not publicly published');
  if (publicationState === 'REVOKED') add('MARK_INELIGIBLE: package is revoked');

  // Defect 2: Operating envelope must exist and be APPROVED
  if (!operatingEnvelopeState) {
    add('MARK_INELIGIBLE_OPERATING_ENVELOPE_NOT_ESTABLISHED');
  } else if (operatingEnvelopeState !== APPROVED_ENVELOPE_STATE) {
    add(`MARK_INELIGIBLE_OPERATING_ENVELOPE_NOT_APPROVED`);
  }

  // Defect 2: Authority source must be AUTHORITATIVE_POLICY
  if (!authoritySourceLabel) {
    add('MARK_INELIGIBLE_POLICY_AUTHORITY_NOT_AUTHORITATIVE');
  } else if (authoritySourceLabel !== AUTHORITATIVE_AUTHORITY_LABEL) {
    add('MARK_INELIGIBLE_POLICY_AUTHORITY_NOT_AUTHORITATIVE');
  }

  return { eligible: reasons.length === 0, reasonCodes: reasons };
}
