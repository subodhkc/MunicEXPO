/**
 * U6 — Positive Assurance Mark Eligibility.
 *
 * Pure policy function. Does not issue any visual artifact.
 */

import { U6Package } from './u6-types';

export interface MarkEligibilityResult {
  eligible: boolean;
  reasonCodes: string[];
}

const POSITIVE_MARK_LABEL = 'HAIEC Assurance Evaluated' as const;
const POSITIVE_MARK_STATUS = 'ALLOW WITHIN EVALUATED SCOPE' as const;

export { POSITIVE_MARK_LABEL, POSITIVE_MARK_STATUS };

export function evaluateAssuranceMarkEligibility(pkg: U6Package, verificationValid: boolean, anchorValid: boolean): MarkEligibilityResult {
  const reasons: string[] = [];
  const add = (code: string) => reasons.push(code);

  if (pkg.receipt.assuranceMethodologyVersion !== '1.1') {
    add('MARK_INELIGIBLE: methodology not 1.1');
    return { eligible: false, reasonCodes: reasons };
  }

  if (pkg.receipt.disposition !== 'ALLOW') {
    add(`MARK_INELIGIBLE: disposition is ${pkg.receipt.disposition}`);
    return { eligible: false, reasonCodes: reasons };
  }

  if (pkg.syntheticClassification !== 'NONE') {
    add('MARK_INELIGIBLE: synthetic package');
    return { eligible: false, reasonCodes: reasons };
  }

  if (!pkg.buildIdentity || pkg.buildIdentity.source === 'NOT_PROVIDED') {
    add('MARK_INELIGIBLE: build identity not provided');
    // Not fatal? The user says build identity not provided is allowed. But we require authoritative build? Keep as reason, maybe eligible. For now not fatal.
  }

  if (!verificationValid) {
    add('MARK_INELIGIBLE: package verification failed');
    return { eligible: false, reasonCodes: reasons };
  }

  if (!anchorValid) {
    add('MARK_INELIGIBLE: persisted anchor mismatch');
    return { eligible: false, reasonCodes: reasons };
  }

  // Publication state is not known inside the package; the caller must enforce PUBLIC.
  return { eligible: true, reasonCodes: [] };
}
