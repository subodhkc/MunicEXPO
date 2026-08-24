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
 * Method-first rules:
 * - SELF_REPORT, SIGNED_MANIFEST → SELF_REPORTED
 * - APPROVED_POLICY_RECORD, POLICY_CONFIGURATION, IAM_OBSERVATION → OBSERVED_CONFIGURATION
 * - STATIC_PATH_ANALYSIS, STATIC_STRUCTURAL_ANALYSIS from HAIEC native static source → HAIEC_NATIVE_TECHNICAL
 * - EXTERNAL_REPORT from external/SARIF source → EXTERNAL_TECHNICAL
 * - RUNTIME_TRACE, ACTION_WITNESS → RUNTIME_EMPIRICAL
 * - Unknown/ambiguous → DERIVED
 *
 * Producer identity is provenance only; it does not override canonical method.
 */
export function classifyEvidence(params: {
  sourceType: string;
  evidenceType?: string;
  evidenceMethod?: string;
  authorityClass?: string;
  metadata?: Record<string, unknown> | null;
}): EpistemicClass {
  const canonicalProducer = resolveCanonicalProducerId(params.sourceType);
  const method = (params.evidenceMethod ?? '').toUpperCase().trim();

  // U6: materially ambiguous methods or authority classes must not fall through to producer fallbacks
  if (method === 'AMBIGUOUS' || params.authorityClass === 'AMBIGUOUS') {
    return 'DERIVED';
  }

  // Method-first precedence
  if (method) {
    if (method === 'SELF_REPORT' || method === 'SIGNED_MANIFEST') {
      return 'SELF_REPORTED';
    }
    if (method === 'APPROVED_POLICY_RECORD' || method === 'POLICY_CONFIGURATION' || method === 'IAM_OBSERVATION') {
      return 'OBSERVED_CONFIGURATION';
    }
    if (method === 'STATIC_PATH_ANALYSIS' || method === 'STATIC_STRUCTURAL_ANALYSIS') {
      // Only native HAIEC static producers support canonical HAIEC native technical
      if (canonicalProducer === 'saas-static' || canonicalProducer === 'ci-cd-scanner') {
        return 'HAIEC_NATIVE_TECHNICAL';
      }
      return 'EXTERNAL_TECHNICAL';
    }
    if (method === 'EXTERNAL_REPORT') {
      return 'EXTERNAL_TECHNICAL';
    }
    if (method === 'RUNTIME_TRACE' || method === 'ACTION_WITNESS') {
      return 'RUNTIME_EMPIRICAL';
    }
    // Unknown method with an explicit source remains DERIVED (do not guess)
    return 'DERIVED';
  }

  // External SARIF imports are external technical (legacy fallback)
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
