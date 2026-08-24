/**
 * E1 B27 — Action Witness Contract
 *
 * B27: Action Witness is the canonical evidence for OBSERVED plane.
 *
 * Phases:
 *   ACTION_REQUESTED → ACTION_AUTHORIZED → ACTION_ACCEPTED
 *   → ACTION_APPLIED → ACTION_CONFIRMED
 *
 * A complete privileged action requires witnesses for all five phases.
 * Missing phase → REVIEW (not BLOCK unless explicitly configured).
 *
 * B28: Runtime trace reuse disposition.
 *   - Existing runtime_execution_traces can serve as ACTION_APPLIED witnesses
 *   - OpenTelemetry spans can serve as ACTION_REQUESTED/ACTION_APPLIED witnesses
 *   - Static capability extraction can serve as CODE_CAPABLE plane evidence
 */

import { ActionWitness, ActionWitnessPhase } from './types';

/**
 * B27: Check if an action witness set is complete (all 5 phases present).
 */
export function isWitnessSetComplete(witnesses: ActionWitness[]): boolean {
  const phases = new Set(witnesses.map(w => w.phase));
  return phases.has('ACTION_REQUESTED') &&
    phases.has('ACTION_AUTHORIZED') &&
    phases.has('ACTION_ACCEPTED') &&
    phases.has('ACTION_APPLIED') &&
    phases.has('ACTION_CONFIRMED');
}

/**
 * B27: Get missing phases for an action witness set.
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
 * B27: Validate witness sequence ordering.
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

  return { valid: errors.length === 0, errors };
}

/**
 * B28: Convert a runtime execution trace to an ACTION_APPLIED witness.
 *
 * Reuses existing runtime_execution_traces infrastructure.
 * Does NOT create a new runtime trace table.
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
}): ActionWitness {
  return {
    witnessId: `witness:runtime:${params.traceId}`,
    phase: 'ACTION_APPLIED',
    actorIdentity: params.transportAdapter ?? 'runtime-adapter',
    operation: params.attackId,
    resourceScope: params.executionMode ?? 'runtime',
    result: params.targetReached ? 'REACHED' : 'NOT_REACHED',
    sideEffectWitness: params.responseHash,
    buildDigest: params.requestHash,
    observedAt: params.executedAt,
  };
}

/**
 * B29: Convert an OpenTelemetry span to an action witness.
 *
 * OpenTelemetry spans can serve as ACTION_REQUESTED or ACTION_APPLIED witnesses.
 */
export function openTelemetrySpanToWitness(params: {
  spanId: string;
  traceId: string;
  operationName: string;
  phase: ActionWitnessPhase;
  attributes?: Record<string, string>;
  startTime: Date;
}): ActionWitness {
  return {
    witnessId: `witness:otel:${params.traceId}:${params.spanId}`,
    phase: params.phase,
    actorIdentity: params.attributes?.['actor.id'] ?? 'otel-actor',
    operation: params.operationName,
    resourceScope: params.attributes?.['resource.scope'],
    authorizationContext: params.attributes?.['authorization.context'],
    observedAt: params.startTime,
  };
}
