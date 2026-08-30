/**
 * E1 Closure Section 9 — Normalized Capability Identity
 *
 * Deterministic capability relation functions.
 * Capability identity accounts for: subject, action, resource, scope,
 * data class, channel, environment, relevant constraints.
 *
 * Do NOT compare unrelated facts merely because one exists in each plane.
 */

import {
  CapabilityFact,
  CapabilityKey,
  normalizeCapabilityKey,
  capabilityKeyToString,
  normalizeSemanticCapabilityKey,
  semanticCapabilityKeyToString,
} from './types';

/**
 * U6: Check if two capability facts are semantically compatible candidates.
 *
 * Core identity (family, subject, action, resource) must match.
 * Optional dimensions (dataClass, channel, environment) must not be known to differ.
 * If one side is unknown/not established, they remain a candidate pair and
 * uncertainty is handled during bounds comparison.
 * Operational scope and quantitative bounds are compared separately.
 */
export function sameCapability(a: CapabilityFact, b: CapabilityFact): boolean {
  if ((a.capabilityFamily ?? '').toLowerCase() !== (b.capabilityFamily ?? '').toLowerCase()) return false;
  if (a.subject.toLowerCase() !== b.subject.toLowerCase()) return false;
  if (a.action.toLowerCase() !== b.action.toLowerCase()) return false;
  if (a.resource.toLowerCase() !== b.resource.toLowerCase()) return false;

  const optionalDim = (aVal?: string, bVal?: string) => {
    const x = (aVal ?? '').toLowerCase().trim();
    const y = (bVal ?? '').toLowerCase().trim();
    if (!x || !y) return true; // one side unknown is a candidate
    return x === y;
  };

  return optionalDim(a.dataClass, b.dataClass) &&
    optionalDim(a.channel, b.channel) &&
    optionalDim(a.environment, b.environment);
}

/**
 * Check if scope `container` contains scope `contained`.
 * Scope containment is hierarchical: "system" contains "project" contains "tenant".
 * Exact match also counts as containment.
 */
export function scopeContains(container: string, contained: string): boolean {
  const c = container.toLowerCase().trim();
  const d = contained.toLowerCase().trim();
  if (c === d) return true;
  if (c === '') return true; // empty scope = universal
  if (d === '') return false; // non-empty container cannot contain empty scope
  // Hierarchical containment: system > project > tenant > local
  const hierarchy = ['global', 'organization', 'system', 'network', 'project', 'tenant', 'local'];
  const ci = hierarchy.indexOf(c);
  const di = hierarchy.indexOf(d);
  if (ci !== -1 && di !== -1) {
    return ci <= di;
  }
  // Region containment: "region-*" patterns — exact match only
  if (c.startsWith('region-') && d.startsWith('region-')) {
    return c === d;
  }
  // Explicit wildcard semantics: "*" matches anything
  if (c === '*') return true;
  // G4: NO arbitrary string containment fallback.
  // Previously: `return d.includes(c) || c === d;`
  // This was unsafe — it inferred authorization containment merely because
  // one arbitrary scope string was a substring of another.
  // Canonical U5 decisions must fail safely: unknown scope → NOT established.
  return false;
}

/**
 * Check if constraints `container` contains all constraints in `contained`.
 * A capability with fewer constraints is broader (contains more).
 */
export function constraintsContain(
  container: string[] | undefined,
  contained: string[] | undefined,
): boolean {
  const c = (container ?? []).map(s => s.toLowerCase().trim());
  const d = (contained ?? []).map(s => s.toLowerCase().trim());
  // If contained has no constraints, any container satisfies
  if (d.length === 0) return true;
  // If container has no constraints but contained does, container is broader
  if (c.length === 0) return true;
  // Every constraint in contained must be present in container
  return d.every(constraint => c.includes(constraint));
}

/**
 * Check if a capability fact `container` contains capability fact `contained`.
 * Container is broader or equal — same action/resource, scope contains,
 * constraints contain, data class compatible.
 */
export function capabilityContains(
  container: CapabilityFact,
  contained: CapabilityFact,
): boolean {
  // U6: capability family must match when both sides provide it
  if (container.capabilityFamily &&
      contained.capabilityFamily &&
      container.capabilityFamily.toLowerCase() !== contained.capabilityFamily.toLowerCase()) {
    return false;
  }
  // Must be same action and resource (or container has wildcard)
  if (container.action.toLowerCase() !== '*' &&
      container.action.toLowerCase() !== contained.action.toLowerCase()) {
    return false;
  }
  if (container.resource.toLowerCase() !== '*' &&
      container.resource.toLowerCase() !== contained.resource.toLowerCase()) {
    return false;
  }
  // Subject must match or be wildcard
  if (container.subject.toLowerCase() !== '*' &&
      container.subject.toLowerCase() !== contained.subject.toLowerCase()) {
    return false;
  }
  // Scope containment
  if (!scopeContains(container.scope, contained.scope)) {
    return false;
  }
  // Data class containment (if specified)
  if (container.dataClass && contained.dataClass) {
    if (container.dataClass.toLowerCase() !== contained.dataClass.toLowerCase()) {
      return false;
    }
  }
  // Environment containment (if specified)
  if (container.environment && contained.environment) {
    if (container.environment.toLowerCase() !== contained.environment.toLowerCase()) {
      return false;
    }
  }
  // Constraints containment
  if (!constraintsContain(container.constraints, contained.constraints)) {
    return false;
  }
  return true;
}

/**
 * Group capability facts by normalized capability key.
 * Returns a map of capability key string → array of facts (from different planes).
 */
export function groupByCapability(facts: CapabilityFact[]): Map<string, CapabilityFact[]> {
  const groups = new Map<string, CapabilityFact[]>();
  for (const fact of facts) {
    const key = capabilityKeyToString(normalizeCapabilityKey(fact));
    const existing = groups.get(key) ?? [];
    existing.push(fact);
    groups.set(key, existing);
  }
  return groups;
}

/**
 * Check if a set of capability facts contains a specific capability
 * (by normalized key match).
 */
export function capabilitySetContains(
  set: CapabilityFact[],
  target: CapabilityFact,
): boolean {
  const targetKey = capabilityKeyToString(normalizeCapabilityKey(target));
  return set.some(f => capabilityKeyToString(normalizeCapabilityKey(f)) === targetKey);
}

/**
 * Find capabilities in set A that are not in set B (by normalized key).
 */
export function capabilitySetDifference(
  setA: CapabilityFact[],
  setB: CapabilityFact[],
): CapabilityFact[] {
  const bKeys = new Set(setB.map(f => capabilityKeyToString(normalizeCapabilityKey(f))));
  return setA.filter(f => !bKeys.has(capabilityKeyToString(normalizeCapabilityKey(f))));
}

/**
 * Find capabilities in set A that are also in set B (by normalized key).
 */
export function capabilitySetIntersection(
  setA: CapabilityFact[],
  setB: CapabilityFact[],
): CapabilityFact[] {
  const bKeys = new Set(setB.map(f => capabilityKeyToString(normalizeCapabilityKey(f))));
  return setA.filter(f => bKeys.has(capabilityKeyToString(normalizeCapabilityKey(f))));
}
