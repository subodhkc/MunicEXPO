/**
 * U6 — Positive Assurance Mark Eligibility.
 *
 * Pure policy function. Does not issue any visual artifact.
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
  evaluationStatus: 'COMPLETED' | string;
}

export function evaluateAssuranceMarkEligibility(ctx: MarkEligibilityContext): MarkEligibilityResult {
  const { pkg, packageVerification, anchorValid, publicationState, evaluationStatus } = ctx;
  const reasons: string[] = [];
  const add = (code: string) => reasons.push(code);

  if (pkg.receipt.assuranceMethodologyVersion !== '1.1') add('MARK_INELIGIBLE: methodology not 1.1');
  if (evaluationStatus !== 'COMPLETED') add('MARK_INELIGIBLE: evaluation not completed');
  if (pkg.receipt.disposition !== 'ALLOW') add(`MARK_INELIGIBLE: disposition is ${pkg.receipt.disposition}`);
  if (!pkg.receipt.profileId) add('MARK_INELIGIBLE: resolved profile missing');
  if (pkg.syntheticClassification !== 'NONE') add('MARK_INELIGIBLE: synthetic package');
  if (pkg.buildIdentity.source === 'NOT_PROVIDED') add('MARK_INELIGIBLE_BUILD_IDENTITY_NOT_ESTABLISHED');
  if (!packageVerification.valid) add('MARK_INELIGIBLE: package verification failed');
  if (!anchorValid) add('MARK_INELIGIBLE: persisted anchor mismatch');
  if (publicationState !== 'PUBLIC') add('MARK_INELIGIBLE: package is not publicly published');
  if (publicationState === 'REVOKED') add('MARK_INELIGIBLE: package is revoked');

  return { eligible: reasons.length === 0, reasonCodes: reasons };
}
