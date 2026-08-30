/**
 * Gate 4 — Capability Extraction Registry V1
 *
 * The smallest useful HAIEC-owned deterministic semantic registry.
 * Converts known source-code signatures (API calls, method invocations) into
 * the EXISTING EvidenceCapabilityDeclaration structure.
 *
 * This is NOT a new engine, NOT a new database, NOT a new truth model.
 * It is a pure lookup table that maps source signatures → semantic actions/resources.
 *
 * Canonical flow remains:
 *   source/code → IR → registry lookup → EvidenceCapabilityDeclaration[] → Evidence → CapabilityFact → U5 → U6
 *
 * Registry categories V1:
 *   1. database (read/create/update/delete/bulk)
 *   2. HTTP/API egress
 *   3. filesystem (read/write)
 *   4. messaging (email/SMS)
 *   5. calendar (read/create/update/delete)
 *   6. payments (charge/refund)
 *   7. identity/authorization (user update, role/permission change)
 *   8. process/code execution
 *   9. MCP/agent tools
 *   10. cloud/control-plane action
 */

import { EvidenceCapabilityDeclaration, EvidenceCapabilityPlane, EvidenceMappingStrength, CapabilityCardinality, AIReachabilityStatus } from '@/lib/evidence/capability-declaration-contract';

// ─── Registry Entry ──────────────────────────────────────────────────────────

export interface CapabilityRegistryEntry {
  /** Pattern to match against the source signature (e.g., "prisma.customer.deleteMany") */
  signaturePattern: string;
  /** Normalized action (e.g., "customer.delete", "payment.refund.create") */
  action: string;
  /** Normalized resource (e.g., "customer", "payment", "calendar_event") */
  resource: string;
  /** Capability family for grouping */
  family: string;
  /** Cardinality: SINGLE or BULK */
  cardinality?: 'SINGLE' | 'BULK';
  /** Effect type */
  effectType?: 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXECUTE' | 'EGRESS' | 'NOTIFY' | 'WRITE';
  /** Default impact */
  impact?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Whether this is reversible */
  reversibility?: 'REVERSIBLE' | 'IRREVERSIBLE' | 'UNKNOWN';
}

// ─── Registry V1 ─────────────────────────────────────────────────────────────

export const CAPABILITY_REGISTRY_V1: CapabilityRegistryEntry[] = [
  // ─── 1. Database ──────────────────────────────────────────────────────────
  // Prisma patterns — G4-R2.1: separate PRESENCE from INVOCATION semantics.
  // The generic `prisma.` pattern is NOT an operation. It only establishes
  // that a Prisma client is present. Unknown Prisma methods must NOT silently
  // become canonical database.read. They should fall through to suggestions.
  // Operation-specific patterns are the only canonical mappings:
  { signaturePattern: '.findUnique', action: 'database.read', resource: 'database', family: 'database', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.findFirst', action: 'database.read', resource: 'database', family: 'database', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.findMany', action: 'database.read', resource: 'database', family: 'database', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.create', action: 'database.create', resource: 'database', family: 'database', effectType: 'CREATE', impact: 'MEDIUM', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.update', action: 'database.update', resource: 'database', family: 'database', effectType: 'UPDATE', impact: 'MEDIUM', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.upsert', action: 'database.update', resource: 'database', family: 'database', effectType: 'UPDATE', impact: 'MEDIUM', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.deleteMany', action: 'database.delete', resource: 'database', family: 'database', cardinality: 'BULK', effectType: 'DELETE', impact: 'HIGH', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: '.updateMany', action: 'database.update', resource: 'database', family: 'database', cardinality: 'BULK', effectType: 'UPDATE', impact: 'HIGH', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.delete', action: 'database.delete', resource: 'database', family: 'database', cardinality: 'SINGLE', effectType: 'DELETE', impact: 'HIGH', reversibility: 'IRREVERSIBLE' },
  // Resource-specific Prisma patterns (model name extracted from call chain)
  { signaturePattern: '.customer.deleteMany', action: 'customer.delete', resource: 'customer', family: 'database', cardinality: 'BULK', effectType: 'DELETE', impact: 'CRITICAL', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: '.customer.delete', action: 'customer.delete', resource: 'customer', family: 'database', cardinality: 'SINGLE', effectType: 'DELETE', impact: 'HIGH', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: '.user.update', action: 'user.update', resource: 'user', family: 'identity', effectType: 'UPDATE', impact: 'HIGH', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.user.delete', action: 'user.delete', resource: 'user', family: 'identity', effectType: 'DELETE', impact: 'CRITICAL', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: '.role.update', action: 'role.update', resource: 'role', family: 'identity', effectType: 'UPDATE', impact: 'CRITICAL', reversibility: 'REVERSIBLE' },
  { signaturePattern: '.permission.update', action: 'permission.update', resource: 'permission', family: 'identity', effectType: 'UPDATE', impact: 'CRITICAL', reversibility: 'REVERSIBLE' },

  // ─── 2. HTTP/API egress ───────────────────────────────────────────────────
  { signaturePattern: 'fetch(', action: 'http.egress', resource: 'external_api', family: 'http', effectType: 'EGRESS', impact: 'MEDIUM', reversibility: 'UNKNOWN' },
  { signaturePattern: 'axios.', action: 'http.egress', resource: 'external_api', family: 'http', effectType: 'EGRESS', impact: 'MEDIUM', reversibility: 'UNKNOWN' },
  { signaturePattern: 'http.request', action: 'http.egress', resource: 'external_api', family: 'http', effectType: 'EGRESS', impact: 'MEDIUM', reversibility: 'UNKNOWN' },

  // ─── 3. Filesystem ────────────────────────────────────────────────────────
  { signaturePattern: 'fs.readFile', action: 'file.read', resource: 'filesystem', family: 'filesystem', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'fs.writeFile', action: 'file.write', resource: 'filesystem', family: 'filesystem', effectType: 'WRITE', impact: 'MEDIUM', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'fs.unlink', action: 'file.delete', resource: 'filesystem', family: 'filesystem', effectType: 'DELETE', impact: 'HIGH', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: 'fs.mkdir', action: 'file.create', resource: 'filesystem', family: 'filesystem', effectType: 'CREATE', impact: 'LOW', reversibility: 'REVERSIBLE' },

  // ─── 4. Messaging ─────────────────────────────────────────────────────────
  { signaturePattern: 'resend.emails.send', action: 'email.send', resource: 'email', family: 'messaging', effectType: 'NOTIFY', impact: 'MEDIUM', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: 'sendMail', action: 'email.send', resource: 'email', family: 'messaging', effectType: 'NOTIFY', impact: 'MEDIUM', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: 'twilio.messages.create', action: 'sms.send', resource: 'sms', family: 'messaging', effectType: 'NOTIFY', impact: 'MEDIUM', reversibility: 'IRREVERSIBLE' },

  // ─── 5. Calendar ──────────────────────────────────────────────────────────
  { signaturePattern: 'google.calendar.events.list', action: 'calendar.event.read', resource: 'calendar_event', family: 'calendar', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'google.calendar.events.get', action: 'calendar.event.read', resource: 'calendar_event', family: 'calendar', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'google.calendar.events.insert', action: 'calendar.event.create', resource: 'calendar_event', family: 'calendar', effectType: 'CREATE', impact: 'MEDIUM', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'google.calendar.events.update', action: 'calendar.event.update', resource: 'calendar_event', family: 'calendar', effectType: 'UPDATE', impact: 'MEDIUM', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'google.calendar.events.delete', action: 'calendar.event.delete', resource: 'calendar_event', family: 'calendar', effectType: 'DELETE', impact: 'HIGH', reversibility: 'IRREVERSIBLE' },

  // ─── 6. Payments ──────────────────────────────────────────────────────────
  { signaturePattern: 'stripe.charges.create', action: 'payment.charge.create', resource: 'payment', family: 'payments', effectType: 'CREATE', impact: 'HIGH', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'stripe.refunds.create', action: 'payment.refund.create', resource: 'payment', family: 'payments', effectType: 'CREATE', impact: 'HIGH', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'stripe.customers.create', action: 'customer.create', resource: 'customer', family: 'payments', effectType: 'CREATE', impact: 'MEDIUM', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'stripe.customers.update', action: 'customer.update', resource: 'customer', family: 'payments', effectType: 'UPDATE', impact: 'MEDIUM', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'stripe.customers.del', action: 'customer.delete', resource: 'customer', family: 'payments', effectType: 'DELETE', impact: 'HIGH', reversibility: 'IRREVERSIBLE' },

  // ─── 7. Identity/Authorization ────────────────────────────────────────────
  { signaturePattern: 'requireOrganizationAccess', action: 'auth.check', resource: 'organization', family: 'identity', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'requirePlatformAdmin', action: 'auth.check', resource: 'platform', family: 'identity', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },
  { signaturePattern: 'getServerSession', action: 'auth.session', resource: 'session', family: 'identity', effectType: 'READ', impact: 'LOW', reversibility: 'REVERSIBLE' },

  // ─── 8. Process/code execution ────────────────────────────────────────────
  { signaturePattern: 'exec(', action: 'process.execute', resource: 'process', family: 'execution', effectType: 'EXECUTE', impact: 'CRITICAL', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: 'child_process', action: 'process.execute', resource: 'process', family: 'execution', effectType: 'EXECUTE', impact: 'CRITICAL', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: 'eval(', action: 'code.execute', resource: 'code', family: 'execution', effectType: 'EXECUTE', impact: 'CRITICAL', reversibility: 'IRREVERSIBLE' },
  { signaturePattern: 'Function(', action: 'code.execute', resource: 'code', family: 'execution', effectType: 'EXECUTE', impact: 'CRITICAL', reversibility: 'IRREVERSIBLE' },

  // ─── 9. MCP/agent tools ───────────────────────────────────────────────────
  { signaturePattern: 'tools.call', action: 'mcp.tool.call', resource: 'mcp_tool', family: 'mcp', effectType: 'EXECUTE', impact: 'HIGH', reversibility: 'UNKNOWN' },
  { signaturePattern: 'tool.execute', action: 'agent.tool.execute', resource: 'agent_tool', family: 'mcp', effectType: 'EXECUTE', impact: 'HIGH', reversibility: 'UNKNOWN' },

  // ─── 10. Cloud/control-plane ──────────────────────────────────────────────
  { signaturePattern: 'aws-sdk', action: 'cloud.action', resource: 'cloud', family: 'cloud', effectType: 'EXECUTE', impact: 'HIGH', reversibility: 'UNKNOWN' },
  { signaturePattern: '@aws-sdk/', action: 'cloud.action', resource: 'cloud', family: 'cloud', effectType: 'EXECUTE', impact: 'HIGH', reversibility: 'UNKNOWN' },
  { signaturePattern: 'gcloud.', action: 'cloud.action', resource: 'cloud', family: 'cloud', effectType: 'EXECUTE', impact: 'HIGH', reversibility: 'UNKNOWN' },
];

// ─── Lookup function ─────────────────────────────────────────────────────────

/**
 * Match a source-code signature against the registry.
 * Returns the best (most specific) match, or null if no match.
 * Specificity = longer signaturePattern wins.
 */
export function lookupCapability(signature: string): CapabilityRegistryEntry | null {
  let bestMatch: CapabilityRegistryEntry | null = null;
  let bestLength = 0;

  for (const entry of CAPABILITY_REGISTRY_V1) {
    if (signature.includes(entry.signaturePattern)) {
      // More specific (longer) patterns win
      if (entry.signaturePattern.length > bestLength) {
        bestMatch = entry;
        bestLength = entry.signaturePattern.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Match multiple signatures and return all unique matches.
 */
export function lookupCapabilities(signatures: string[]): CapabilityRegistryEntry[] {
  const seen = new Set<string>();
  const results: CapabilityRegistryEntry[] = [];

  for (const sig of signatures) {
    const match = lookupCapability(sig);
    if (match && !seen.has(match.action + ':' + match.resource)) {
      seen.add(match.action + ':' + match.resource);
      results.push(match);
    }
  }

  return results;
}

/**
 * Convert a registry entry to an EvidenceCapabilityDeclaration.
 * This is the bridge from registry → canonical evidence contract.
 *
 * ENGINE-TRUTH-1.3 CORRECTION:
 *   REGISTRY_MATCH != CODE_CAPABLE
 *   UNKNOWN_AI_REACHABILITY != CODE_CAPABLE
 *   PACK_REFERENCE != APPLICATION_EVIDENCE
 *
 * A registry signature match establishes that a capability-extractor pattern
 * matched source text. It does NOT establish that the code is AI-reachable.
 * When aiReachability is REACHABILITY_UNKNOWN, the sourcePlane must NOT be
 * CODE_CAPABLE — it must be a weaker plane that does not overclaim.
 *
 * sourcePlane is now derived from aiReachability:
 *   REACHABILITY_PROVEN    → CODE_CAPABLE (proven AI-reachable code path)
 *   REACHABILITY_STRUCTURAL → CODE_CAPABLE (structural path exists — still code-capable)
 *   REACHABILITY_UNKNOWN   → CODE_PRESENT (code exists but AI reachability unproven)
 *   NOT_AI_REACHABLE       → CODE_PRESENT (code exists but proven NOT AI-reachable)
 */
export function registryEntryToDeclaration(
  entry: CapabilityRegistryEntry,
  context: {
    sourceLocation: string;
    sourceEvidenceIds?: string[];
    subject?: string;
    scope?: string;
    environment?: string;
    aiReachability?: AIReachabilityStatus;
  },
): EvidenceCapabilityDeclaration {
  // G4-R2: An exact signature match establishes mappingStrength = EXACT_CAPABILITY_MAPPING
  // but does NOT establish capabilityCoverage = COMPLETE.
  // Coverage = COMPLETE requires an independent coverage analysis.
  // A single recognized signature is PARTIAL coverage at best.
  const reachability = context.aiReachability ?? 'REACHABILITY_UNKNOWN';
  const coverage = reachability === 'REACHABILITY_PROVEN' ? 'PARTIAL' : 'UNKNOWN';

  // ENGINE-TRUTH-1.3: sourcePlane depends on AI reachability, not just registry match.
  // REGISTRY_MATCH != CODE_CAPABLE
  // UNKNOWN_AI_REACHABILITY != CODE_CAPABLE
  const sourcePlane: EvidenceCapabilityPlane =
    reachability === 'REACHABILITY_PROVEN' || reachability === 'REACHABILITY_STRUCTURAL'
      ? 'CODE_CAPABLE'
      : 'CODE_PRESENT';

  return {
    capabilityId: `${entry.action}:${entry.resource}`,
    sourcePlane,
    capabilityFamily: entry.family,
    subject: context.subject ?? 'principal:unknown',
    action: entry.action,
    resource: entry.resource,
    scope: context.scope ?? 'unknown',
    // G4-R2: Do NOT invent environment. Static source has no deployment evidence.
    environment: context.environment, // undefined unless caller provides deployment evidence
    impact: entry.impact ?? 'UNKNOWN',
    sourceLocation: context.sourceLocation,
    discoveryBasis: 'CAPABILITY_EXTRACTOR',
    capabilityCoverage: coverage,
    authorityClass: 'NON_AUTHORITATIVE',
    evidenceMethod: 'STATIC_STRUCTURAL_ANALYSIS',
    authoritySourceLabel: 'TECHNICAL_EVIDENCE',
    mappingStrength: 'EXACT_CAPABILITY_MAPPING',
    sourceEvidenceIds: context.sourceEvidenceIds,
    // G4-R2: Structured cardinality replaces targetCount=-1 sentinel
    ...(entry.cardinality && { cardinality: entry.cardinality as CapabilityCardinality }),
    // targetCount is only set for known finite numeric bounds
    ...(entry.cardinality === 'SINGLE' && { targetCount: 1 }),
    ...(entry.effectType && { constraints: [`effect:${entry.effectType}`] }),
    // G4-R2: AI reachability binding
    aiReachability: reachability,
  };
}

/**
 * Get registry statistics.
 */
export function getRegistryStats(): {
  totalMappings: number;
  categories: string[];
} {
  const categories = [...new Set(CAPABILITY_REGISTRY_V1.map(e => e.family))];
  return {
    totalMappings: CAPABILITY_REGISTRY_V1.length,
    categories,
  };
}
