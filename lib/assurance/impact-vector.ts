/**
 * E1 B17 — Impact Vector
 *
 * Captures the potential impact of a capability/action.
 * Used to determine blast radius, reversibility, and approval requirements.
 */

import { ImpactVector, CapabilityFact } from './types';

/**
 * B17: Compute impact vector from a capability fact.
 *
 * Deterministic: same capability fact → same impact vector.
 */
export function computeImpactVector(fact: CapabilityFact): ImpactVector {
  const blastRadius = computeBlastRadius(fact);
  const dataSensitivity = computeDataSensitivity(fact);
  const propagation = computePropagation(fact);
  const reversibility = computeReversibility(fact);
  const externality = computeExternality(fact);
  const observability = computeObservability(fact);
  const autonomy = computeAutonomy(fact);

  return {
    authority: fact.authorityClass,
    resourceScope: fact.scope,
    blastRadius,
    dataSensitivity,
    propagation,
    reversibility,
    humanApproval: fact.guardRequirements?.includes('approval') ?? false,
    externality,
    observability,
    autonomy,
    environment: fact.environment ?? 'unknown',
  };
}

function computeBlastRadius(fact: CapabilityFact): ImpactVector['blastRadius'] {
  const scope = fact.scope.toLowerCase();
  if (scope.includes('global') || scope.includes('organization')) return 'CRITICAL';
  if (scope.includes('system') || scope.includes('network')) return 'HIGH';
  if (scope.includes('project') || scope.includes('tenant')) return 'MEDIUM';
  return 'LOW';
}

function computeDataSensitivity(fact: CapabilityFact): ImpactVector['dataSensitivity'] {
  const dataClass = (fact.dataClass ?? '').toLowerCase();
  if (dataClass.includes('restricted')) return 'RESTRICTED';
  if (dataClass.includes('confidential')) return 'CONFIDENTIAL';
  if (dataClass.includes('internal')) return 'INTERNAL';
  return 'PUBLIC';
}

function computePropagation(fact: CapabilityFact): ImpactVector['propagation'] {
  const action = fact.action.toLowerCase();
  if (action.includes('broadcast') || action.includes('publish')) return 'NETWORK';
  if (action.includes('network') || fact.channel?.includes('network')) return 'NETWORK';
  if (action.includes('system') || fact.scope.includes('system')) return 'SYSTEM';
  if (action.includes('local')) return 'LOCAL';
  return 'NONE';
}

function computeReversibility(fact: CapabilityFact): ImpactVector['reversibility'] {
  const action = fact.action.toLowerCase();
  if (action.includes('delete') || action.includes('destroy')) return 'IRREVERSIBLE';
  if (action.includes('create') || action.includes('deploy')) return 'PARTIALLY_REVERSIBLE';
  if (action.includes('update') || action.includes('modify')) return 'PARTIALLY_REVERSIBLE';
  if (action.includes('read') || action.includes('query')) return 'REVERSIBLE';
  return 'PARTIALLY_REVERSIBLE';
}

function computeExternality(fact: CapabilityFact): ImpactVector['externality'] {
  const dest = (fact.resource ?? '').toLowerCase();
  const channel = (fact.channel ?? '').toLowerCase();
  if (dest.includes('external') || channel.includes('external') || channel.includes('egress')) {
    return 'EXTERNAL_EGRESS';
  }
  if (dest.includes('internal') && (fact.action.includes('egress') || channel.includes('callback'))) {
    return 'INTERNAL_EGRESS';
  }
  return 'NONE';
}

function computeObservability(fact: CapabilityFact): ImpactVector['observability'] {
  const guards = fact.guardRequirements ?? [];
  if (guards.includes('audit-logging') && guards.includes('trace')) return 'FULL';
  if (guards.includes('audit-logging') || guards.includes('trace')) return 'PARTIAL';
  return 'NONE';
}

function computeAutonomy(fact: CapabilityFact): ImpactVector['autonomy'] {
  const guards = fact.guardRequirements ?? [];
  if (guards.includes('approval')) return 'HUMAN_IN_LOOP';
  if (guards.includes('human-only')) return 'HUMAN_ONLY';
  return 'AUTONOMOUS';
}
