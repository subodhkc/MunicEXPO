/**
 * U5 B10 — Evidence Epistemic Classifier
 *
 * Classifies canonical Evidence into epistemic classes based on producer
 * and evidence metadata. Does NOT create a new DB enum — uses metadata.
 */

import { EpistemicClass } from './types';
import { resolveCanonicalProducerId } from '@/lib/engine-registry/producer-id-compatibility';

/**
 * Classify a piece of evidence into its epistemic class.
 *
 * Rules:
 * - SaaS Static / CI-CD / SARIF → HAIEC_NATIVE_TECHNICAL or EXTERNAL_TECHNICAL
 * - Runtime → RUNTIME_EMPIRICAL
 * - Inventory → OBSERVED_CONFIGURATION
 * - Wizard → SELF_REPORTED
 * - Regulatory → DERIVED
 */
export function classifyEvidence(params: {
  sourceType: string;
  evidenceType?: string;
  metadata?: Record<string, unknown> | null;
}): EpistemicClass {
  const canonicalProducer = resolveCanonicalProducerId(params.sourceType);

  // External SARIF imports are external technical
  if (params.sourceType === 'sarif-import' || params.metadata?.importedExternally === true) {
    return 'EXTERNAL_TECHNICAL';
  }

  switch (canonicalProducer) {
    case 'saas-static':
    case 'ci-cd-scanner':
      return 'HAIEC_NATIVE_TECHNICAL';

    case 'saas-runtime':
      return 'RUNTIME_EMPIRICAL';

    case 'saas-inventory':
      return 'OBSERVED_CONFIGURATION';

    case 'saas-wizard':
      return 'SELF_REPORTED';

    case 'saas-regulatory':
    case 'nyc-ll144':
      return 'DERIVED';

    case 'sarif-import':
      return 'EXTERNAL_TECHNICAL';

    case 'compliance-twin':
      return 'DERIVED';

    default:
      // Unknown producers default to DERIVED (least authoritative)
      return 'DERIVED';
  }
}

/**
 * Check if an epistemic class is "technical" (not self-reported, not derived).
 */
export function isTechnicalClass(cls: EpistemicClass): boolean {
  return cls === 'HAIEC_NATIVE_TECHNICAL' || cls === 'EXTERNAL_TECHNICAL' || cls === 'RUNTIME_EMPIRICAL';
}

/**
 * Check if an epistemic class is self-reported.
 */
export function isSelfReportedClass(cls: EpistemicClass): boolean {
  return cls === 'SELF_REPORTED';
}

/**
 * Check if an epistemic class is external (not HAIEC-native).
 */
export function isExternalClass(cls: EpistemicClass): boolean {
  return cls === 'EXTERNAL_TECHNICAL';
}
