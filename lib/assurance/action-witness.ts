/**
 * E1 Closure Sections 14-16 — Action Witness Correction + Correlation + OTel Trust
 *
 * Section 14: Generic runtime trace does NOT prove ACTION_APPLIED.
 *   targetReached does NOT prove network action applied.
 *   Generic runtime trace may prove ACTION_REQUESTED or TARGET_REACHED/ACTION_ATTEMPTED.
 *   ACTION_APPLIED requires evidence from an authoritative controlled action boundary.
 *   ACTION_CONFIRMED requires confirmation/side-effect evidence.
 *   Do NOT infer APPLIED from an HTTP response alone.
 *
 * Section 15: All phases in one Action Witness set must refer to the SAME logical action.
 *   actionCorrelationId + build identity + actor + operation + resource/scope.
 *   isWitnessSetComplete() must not combine unrelated witness events.
 *
 * Section 16: Do not let caller-selected arbitrary OTel phase become authoritative.
 *   Classify OTel source authority.
 *   Generic application span → OBSERVATION/REQUESTED.
 *   Trusted sandbox/platform instrumentation → may qualify for APPLIED/CONFIRMED.
 */

import {
  ActionWitness,
  ActionWitnessPhase,
  ActionWitnessCorrelation,
  OTelSourceAuthority,
  WitnessPhaseAuthority,
  AuthoritySourceLabel,
} from './types';

/**
 * Section 15: Check if an action witness set is complete (all 5 phases present)
 * AND all witnesses share the same actionCorrelationId.
 *
 * Witnesses with different correlation IDs cannot form a complete trajectory.
 */
export function isWitnessSetComplete(witnesses: ActionWitness[]): boolean {
  // Must have all 5 phases
  const phases = new Set(witnesses.map(w => w.phase));
  const hasAllPhases =
    phases.has('ACTION_REQUESTED') &&
    phases.has('ACTION_AUTHORIZED') &&
    phases.has('ACTION_ACCEPTED') &&
    phases.has('ACTION_APPLIED') &&
    phases.has('ACTION_CONFIRMED');

  if (!hasAllPhases) return false;

  // Section 15: All witnesses must share the same actionCorrelationId
  const correlationIds = new Set(
    witnesses.map(w => w.actionCorrelationId ?? '').filter(id => id !== '')
  );
  if (correlationIds.size > 1) {
    // Multiple correlation IDs → unrelated witness events
    return false;
  }

  // If any witness has a correlation ID, all must share it
  const hasCorrelation = witnesses.some(w => w.actionCorrelationId && w.actionCorrelationId !== '');
  if (hasCorrelation) {
    const firstCorrelation = witnesses.find(w => w.actionCorrelationId)?.actionCorrelationId;
    if (!witnesses.every(w => w.actionCorrelationId === firstCorrelation)) {
      return false;
    }
  }

  return true;
}

/**
 * Section 15: Get missing phases for an action witness set.
 */
export function getMissingPhases(witnesses: ActionWitness[]): ActionWitnessPhase[] {
  const present = new Set(witnesses.map(w => w.phase));
  const allPhases: ActionWitnessPhase[] = [
    'ACTION_REQUESTED',
    'ACTION_AUTHORIZED',
    'ACTION_ACCEPTED',
    'ACTION_APPLIED',
    'ACTION_CONFIRMED',
  ];
  return allPhases.filter(p => !present.has(p));
}

/**
 * Section 15: Validate witness sequence ordering.
 * Witnesses must be in phase order: REQUESTED → AUTHORIZED → ACCEPTED → APPLIED → CONFIRMED
 */
export function validateWitnessSequence(witnesses: ActionWitness[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const phaseOrder: Record<ActionWitnessPhase, number> = {
    ACTION_REQUESTED: 0,
    ACTION_AUTHORIZED: 1,
    ACTION_ACCEPTED: 2,
    ACTION_APPLIED: 3,
    ACTION_CONFIRMED: 4,
  };

  const sorted = [...witnesses].sort((a, b) =>
    (a.observedAt?.getTime() ?? 0) - (b.observedAt?.getTime() ?? 0)
  );

  for (let i = 1; i < sorted.length; i++) {
    if (phaseOrder[sorted[i].phase] < phaseOrder[sorted[i - 1].phase]) {
      errors.push(`Phase ordering violation: ${sorted[i].phase} after ${sorted[i - 1].phase}`);
    }
  }

  // Section 15: Check correlation identity consistency
  const correlationIds = new Set(
    witnesses.map(w => w.actionCorrelationId ?? '').filter(id => id !== '')
  );
  if (correlationIds.size > 1) {
    errors.push(`Witness set contains multiple actionCorrelationIds: ${Array.from(correlationIds).join(', ')}`);
  }

  const logical = validateLogicalActionIdentity(witnesses);
  errors.push(...logical.errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Section 15: Check if all witnesses in a set share the same correlation identity.
 */
export function shareCorrelationIdentity(witnesses: ActionWitness[]): boolean {
  const correlationIds = new Set(
    witnesses.map(w => w.actionCorrelationId ?? '').filter(id => id !== '')
  );
  return correlationIds.size <= 1;
}

/**
 * Section 15: Validate that all witnesses describe the SAME logical action.
 *
 * Logical identity is defined by:
 * - actorIdentity (the logical principal)
 * - operation
 * - resource identity/scope compatibility
 * - build digest (when known)
 * - actionCorrelationId
 *
 * Different instrumentation sources (oTelSourceAuthority, observerIdentity)
 * are allowed; they do not change the logical action.
 */
export function validateLogicalActionIdentity(witnesses: ActionWitness[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (witnesses.length === 0) return { valid: true, errors };

  const first = witnesses[0];

  const actors = new Set(witnesses.map(w => w.actorIdentity).filter(Boolean));
  if (actors.size > 1) {
    errors.push(`Inconsistent logical actor: ${Array.from(actors).join(', ')}`);
  }

  const operations = new Set(witnesses.map(w => w.operation).filter(Boolean));
  if (operations.size > 1) {
    errors.push(`Inconsistent logical operation: ${Array.from(operations).join(', ')}`);
  }

  const resourceScopes = new Set(witnesses.map(w => w.resourceScope).filter(Boolean));
  if (resourceScopes.size > 1) {
    errors.push(`Inconsistent logical resource scope: ${Array.from(resourceScopes).join(', ')}`);
  }

  const buildDigests = new Set(witnesses.map(w => w.buildDigest).filter(Boolean));
  if (buildDigests.size > 1) {
    errors.push(`Inconsistent logical build digest: ${Array.from(buildDigests).join(', ')}`);
  }

  const correlationIds = new Set(
    witnesses.map(w => w.actionCorrelationId ?? '').filter(id => id !== '')
  );
  if (correlationIds.size > 1) {
    errors.push(`Inconsistent action correlation: ${Array.from(correlationIds).join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Section 15: Extract correlation identity from a witness.
 */
export function extractCorrelation(witness: ActionWitness): ActionWitnessCorrelation {
  return {
    actionCorrelationId: witness.actionCorrelationId ?? '',
    buildDigest: witness.buildDigest,
    actorIdentity: witness.actorIdentity,
    operation: witness.operation,
    resourceScope: witness.resourceScope,
  };
}

/**
 * Section 14: Convert a runtime execution trace to a witness.
 *
 * CORRECTION: A generic runtime trace does NOT prove ACTION_APPLIED.
 *   targetReached does NOT prove network action applied.
 *
 * Generic runtime trace may prove:
 *   - ACTION_REQUESTED (if it shows a request was made)
 *   - TARGET_REACHED / ACTION_ATTEMPTED (if targetReached is true)
 *
 * ACTION_APPLIED requires evidence from an authoritative controlled action boundary:
 *   R1 sandbox adapter, mock R1 producer, test proxy, platform callback, authoritative telemetry.
 *
 * @param authoritativeBoundary - if true, the trace comes from an authoritative
 *   controlled action boundary and may qualify for ACTION_APPLIED.
 *   If false (default), the trace can only prove ACTION_REQUESTED or ACTION_ATTEMPTED.
 */
export function runtimeTraceToWitness(params: {
  traceId: string;
  attackId: string;
  transportAdapter?: string;
  executionMode?: string;
  requestHash?: string;
  responseHash?: string;
  targetReached?: boolean;
  executedAt: Date;
  actionCorrelationId?: string;
  /** Section 14: Whether this trace comes from an authoritative action boundary */
  authoritativeBoundary?: boolean;
}): ActionWitness {
  // Section 14: Determine the correct phase based on source authority
  let phase: ActionWitnessPhase;
  if (params.authoritativeBoundary === true) {
    // Authoritative controlled action boundary → may prove ACTION_APPLIED
    phase = 'ACTION_APPLIED';
  } else if (params.targetReached) {
    // Generic trace with targetReached → ACTION_ATTEMPTED (not APPLIED)
    // But ACTION_ATTEMPTED is not a standard phase — use ACTION_REQUESTED
    // to indicate the action was attempted but not confirmed applied
    phase = 'ACTION_REQUESTED';
  } else {
    // Generic trace → ACTION_REQUESTED only
    phase = 'ACTION_REQUESTED';
  }

  return {
    witnessId: `witness:runtime:${params.traceId}`,
    phase,
    actorIdentity: params.transportAdapter ?? 'runtime-adapter',
    operation: params.attackId,
    resourceScope: params.executionMode ?? 'runtime',
    result: params.targetReached ? 'TARGET_REACHED' : 'NOT_REACHED',
    sideEffectWitness: params.responseHash,
    buildDigest: params.requestHash,
    observedAt: params.executedAt,
    actionCorrelationId: params.actionCorrelationId,
    authoritySourceLabel: params.authoritativeBoundary ? 'TECHNICAL_EVIDENCE' : 'UNKNOWN',
  };
}

/**
 * Section 14: Create an ACTION_APPLIED witness from an authoritative controlled action boundary.
 *
 * This is the ONLY way to produce ACTION_APPLIED evidence.
 * Sources: R1 sandbox adapter, mock R1 producer, test proxy, platform callback, authoritative telemetry.
 */
export function authoritativeActionAppliedWitness(params: {
  boundaryId: string;
  actionCorrelationId: string;
  actorIdentity: string;
  operation: string;
  resourceScope?: string;
  buildDigest?: string;
  sideEffectWitness?: string;
  observedAt: Date;
  authoritySourceLabel?: AuthoritySourceLabel;
}): ActionWitness {
  return {
    witnessId: `witness:applied:${params.boundaryId}:${params.actionCorrelationId}`,
    phase: 'ACTION_APPLIED',
    actorIdentity: params.actorIdentity,
    operation: params.operation,
    resourceScope: params.resourceScope,
    buildDigest: params.buildDigest,
    sideEffectWitness: params.sideEffectWitness,
    observedAt: params.observedAt,
    actionCorrelationId: params.actionCorrelationId,
    authoritySourceLabel: params.authoritySourceLabel ?? 'TECHNICAL_EVIDENCE',
    oTelSourceAuthority: 'TRUSTED_SANDBOX',
  };
}

/**
 * Section 14: Create an ACTION_CONFIRMED witness from confirmation/side-effect evidence.
 */
export function actionConfirmedWitness(params: {
  confirmationId: string;
  actionCorrelationId: string;
  actorIdentity: string;
  operation: string;
  sideEffectWitness: string;
  observedAt: Date;
  authoritySourceLabel?: AuthoritySourceLabel;
}): ActionWitness {
  return {
    witnessId: `witness:confirmed:${params.confirmationId}:${params.actionCorrelationId}`,
    phase: 'ACTION_CONFIRMED',
    actorIdentity: params.actorIdentity,
    operation: params.operation,
    sideEffectWitness: params.sideEffectWitness,
    observedAt: params.observedAt,
    actionCorrelationId: params.actionCorrelationId,
    authoritySourceLabel: params.authoritySourceLabel ?? 'TECHNICAL_EVIDENCE',
  };
}

/**
 * Section 16: Classify OTel source authority.
 *
 * Generic application span → OBSERVATION / REQUESTED.
 * Trusted sandbox/platform instrumentation → may qualify for APPLIED / CONFIRMED.
 */
export function classifyOTelSourceAuthority(params: {
  serviceName?: string;
  instrumentationLibrary?: string;
  attributes?: Record<string, string>;
}): OTelSourceAuthority {
  const service = (params.serviceName ?? '').toLowerCase();
  const lib = (params.instrumentationLibrary ?? '').toLowerCase();
  const attrs = params.attributes ?? {};

  // Trusted sandbox instrumentation
  if (service.includes('sandbox') || service.includes('r1-sandbox') ||
      lib.includes('sandbox') || lib.includes('r1-boundary')) {
    return 'TRUSTED_SANDBOX';
  }

  // Platform instrumentation
  if (service.includes('platform') || service.includes('haiec-platform') ||
      lib.includes('platform') || attrs['haiec.platform'] === 'true') {
    return 'PLATFORM_INSTRUMENTATION';
  }

  // Generic application span
  if (service.includes('app') || service.includes('application') ||
      lib.includes('app') || lib.includes('http') || lib.includes('express')) {
    return 'GENERIC_APPLICATION';
  }

  return 'UNKNOWN_OTEL_SOURCE';
}

/**
 * Section 16: Determine what phase authority an OTel source can prove.
 *
 * Generic application span → OBSERVATION / REQUESTED only.
 * Trusted sandbox → may qualify for ACCEPTED / APPLIED.
 * Platform instrumentation → may qualify for APPLIED / CONFIRMED.
 */
export function oTelAuthorityToPhase(
  authority: OTelSourceAuthority,
  requestedPhase: ActionWitnessPhase,
): WitnessPhaseAuthority {
  switch (authority) {
    case 'GENERIC_APPLICATION':
      // Generic spans can only prove REQUESTED or OBSERVATION
      if (requestedPhase === 'ACTION_REQUESTED') return 'ACTION_REQUESTED';
      return 'OBSERVATION_ONLY';

    case 'TRUSTED_SANDBOX':
      // Trusted sandbox may qualify for ACCEPTED or APPLIED
      if (requestedPhase === 'ACTION_ACCEPTED') return 'ACTION_ACCEPTED';
      if (requestedPhase === 'ACTION_APPLIED') return 'ACTION_APPLIED';
      if (requestedPhase === 'ACTION_REQUESTED') return 'ACTION_REQUESTED';
      return 'OBSERVATION_ONLY';

    case 'PLATFORM_INSTRUMENTATION':
      // Platform instrumentation may qualify for APPLIED or CONFIRMED
      if (requestedPhase === 'ACTION_APPLIED') return 'ACTION_APPLIED';
      if (requestedPhase === 'ACTION_CONFIRMED') return 'ACTION_CONFIRMED';
      if (requestedPhase === 'ACTION_REQUESTED') return 'ACTION_REQUESTED';
      return 'OBSERVATION_ONLY';

    case 'UNKNOWN_OTEL_SOURCE':
    default:
      return 'OBSERVATION_ONLY';
  }
}

/**
 * Section 16: Convert an OpenTelemetry span to an action witness.
 *
 * OTel source authority is classified — generic spans cannot self-declare
 * ACTION_APPLIED or ACTION_CONFIRMED.
 */
export function openTelemetrySpanToWitness(params: {
  spanId: string;
  traceId: string;
  operationName: string;
  phase: ActionWitnessPhase;
  attributes?: Record<string, string>;
  startTime: Date;
  actionCorrelationId?: string;
  serviceName?: string;
  instrumentationLibrary?: string;
}): ActionWitness {
  // Section 16: Classify OTel source authority
  const sourceAuthority = classifyOTelSourceAuthority({
    serviceName: params.serviceName,
    instrumentationLibrary: params.instrumentationLibrary,
    attributes: params.attributes,
  });

  // Section 16: Determine what this source can actually prove
  const phaseAuthority = oTelAuthorityToPhase(sourceAuthority, params.phase);

  // If the source cannot prove the requested phase, downgrade to OBSERVATION_ONLY
  const actualPhase: ActionWitnessPhase =
    phaseAuthority === 'OBSERVATION_ONLY' ? 'ACTION_REQUESTED' : params.phase;

  return {
    witnessId: `witness:otel:${params.traceId}:${params.spanId}`,
    phase: actualPhase,
    actorIdentity: params.attributes?.['actor.id'] ?? 'otel-actor',
    operation: params.operationName,
    resourceScope: params.attributes?.['resource.scope'],
    authorizationContext: params.attributes?.['authorization.context'],
    observedAt: params.startTime,
    actionCorrelationId: params.actionCorrelationId,
    oTelSourceAuthority: sourceAuthority,
    authoritySourceLabel: sourceAuthority === 'GENERIC_APPLICATION' ? 'UNKNOWN' : 'TECHNICAL_EVIDENCE',
  };
}
