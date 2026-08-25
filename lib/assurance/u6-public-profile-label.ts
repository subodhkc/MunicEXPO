/**
 * Defect 3: Public Profile Label Resolver
 *
 * Deterministic source-backed public label resolver.
 * Does NOT expose arbitrary internal profileId publicly.
 *
 * Hierarchy:
 * 1. If profileId is an explicitly designated built-in PUBLIC HAIEC profile,
 *    return its public display name.
 * 2. Otherwise return generic: "HAIEC Assurance Profile"
 *
 * Do NOT infer safety from the shape/name of the ID.
 */

/**
 * Bounded allowlist of source-confirmed built-in HAIEC profiles
 * that are safe to expose publicly.
 */
const PUBLIC_PROFILE_LABELS: Record<string, string> = {
  'haiec.agentic.baseline': 'HAIEC Agentic Baseline',
  'haiec.core.baseline': 'HAIEC Core Baseline',
  'haiec.telecom.rapp': 'HAIEC Telecom rApp',
};

/**
 * Resolve a public-safe profile label.
 * Returns the display name for known built-in profiles,
 * or a generic label for all other profile IDs.
 */
export function resolvePublicProfileLabel(profileId: string | undefined): string {
  if (!profileId) return 'HAIEC Assurance Profile';
  return PUBLIC_PROFILE_LABELS[profileId] ?? 'HAIEC Assurance Profile';
}
