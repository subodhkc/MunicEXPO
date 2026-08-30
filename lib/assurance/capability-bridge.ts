/**
 * Gate 4 — CODE_CAPABLE Evidence Bridge
 *
 * Deterministic adapter: existing IR (sinks, tools, model calls)
 * → capability extraction registry
 * → EvidenceCapabilityDeclaration[]
 *
 * Canonical CODE_CAPABLE declarations satisfy the existing evidence contract:
 *   - sourcePlane = CODE_CAPABLE
 *   - evidenceMethod = STATIC_STRUCTURAL_ANALYSIS
 *   - mappingStrength = EXACT_CAPABILITY_MAPPING (or HEURISTIC_SUGGESTION for uncertain)
 *   - discoveryBasis = CAPABILITY_EXTRACTOR
 *
 * CRITICAL: HEURISTIC_SUGGESTION must NOT become canonical CODE_CAPABLE evidence.
 * If exact reachability cannot be established, expose as non-canonical suggestion/context.
 *
 * This is NOT a new engine. It is a pure adapter that reuses:
 *   - IR types from lib/ai-security/types.ts
 *   - EvidenceCapabilityDeclaration from lib/evidence/capability-declaration-contract.ts
 *   - capability-registry from lib/assurance/capability-registry.ts
 */

import { IR, Sink, AITool, ModelCall, Entrypoint, AuthSignal } from '@/lib/ai-security/types';
import { EvidenceCapabilityDeclaration, AIReachabilityStatus, AnalysisImpediment } from '@/lib/evidence/capability-declaration-contract';
import { lookupCapability, registryEntryToDeclaration, CapabilityRegistryEntry } from './capability-registry';

// ─── Principal extraction (Part 8) ───────────────────────────────────────────

/**
 * Extract principal/subject from auth signals and entrypoint context.
 *
 * Rules:
 * - A static source-code auth/role check is a CODE_CAPABLE path constraint.
 * - It does NOT by itself create EFFECTIVELY_GRANTED.
 * - EFFECTIVELY_GRANTED remains reserved for qualifying IAM/config/effective-grant evidence.
 *
 * Principal values:
 * - principal:anonymous — no auth signal found
 * - principal:authenticated — auth signal present but no role distinction
 * - role:user — session/role check for regular user
 * - role:admin — admin/owner role check
 * - service:<name> — service account / API key auth
 */
export function extractPrincipal(
  authSignals: AuthSignal[],
  entrypoint?: Entrypoint,
): string {
  if (!authSignals || authSignals.length === 0) {
    return 'principal:anonymous';
  }

  const signalNames = authSignals.map(s => s.name.toLowerCase());

  // Check for admin/owner level
  if (signalNames.some(n =>
    n.includes('admin') || n.includes('owner') || n.includes('superadmin') ||
    n.includes('platformadmin') || n.includes('requireplatformadmin')
  )) {
    return 'role:admin';
  }

  // Check for authenticated (any auth signal present)
  if (signalNames.some(n =>
    n.includes('auth') || n.includes('session') || n.includes('token') ||
    n.includes('getsession') || n.includes('requiresorganizationaccess')
  )) {
    return 'role:user';
  }

  // Auth signal present but unknown type
  return 'principal:authenticated';
}

// ─── IR → EvidenceCapabilityDeclaration bridge ───────────────────────────────

export interface BridgeResult {
  /** Canonical CODE_CAPABLE declarations with EXACT_CAPABILITY_MAPPING and proven/structural AI reachability */
  declarations: EvidenceCapabilityDeclaration[];
  /** Non-canonical suggestions with HEURISTIC_SUGGESTION — NOT proof */
  suggestions: EvidenceCapabilityDeclaration[];
  /** Sinks that are NOT AI-reachable — excluded from CODE_CAPABLE */
  nonAIReachable: EvidenceCapabilityDeclaration[];
  /** Principal extracted from auth signals */
  principal: string;
  /** Analysis impediments discovered during bridging */
  impediments: AnalysisImpediment[];
  /** Stats */
  stats: {
    sinksProcessed: number;
    toolsProcessed: number;
    modelCallsProcessed: number;
    exactMatches: number;
    heuristicMatches: number;
    unmatched: number;
    nonAIReachable: number;
  };
}

/**
 * Convert IR sinks/tools/modelCalls into EvidenceCapabilityDeclarations.
 *
 * G4-R2: CODE_CAPABLE is now bound to AI reachability.
 * - Sinks with proven AI reachability + exact registry match → canonical declarations
 * - Sinks with structural reachability + exact match → canonical declarations (REACHABILITY_STRUCTURAL)
 * - Sinks with unknown reachability + exact match → suggestions (NOT canonical CODE_CAPABLE)
 * - Sinks proven NOT AI-reachable → excluded from CODE_CAPABLE entirely
 * - Sinks without exact matches → suggestions (HEURISTIC_SUGGESTION)
 */
export function bridgeIRToCapabilities(ir: IR): BridgeResult {
  const declarations: EvidenceCapabilityDeclaration[] = [];
  const suggestions: EvidenceCapabilityDeclaration[] = [];
  const nonAIReachable: EvidenceCapabilityDeclaration[] = [];
  const impediments: AnalysisImpediment[] = [];
  let exactMatches = 0;
  let heuristicMatches = 0;
  let unmatched = 0;

  // Build entrypoint lookup
  const entrypointMap = new Map<string, Entrypoint>();
  for (const ep of ir.entrypoints || []) {
    entrypointMap.set(ep.id, ep);
  }

  // Build auth signal lookup by entrypoint
  const authSignalsByEntrypoint = new Map<string, AuthSignal[]>();
  for (const signal of ir.authSignals || []) {
    if (signal.entrypointId) {
      const existing = authSignalsByEntrypoint.get(signal.entrypointId) || [];
      existing.push(signal);
      authSignalsByEntrypoint.set(signal.entrypointId, existing);
    }
  }

  // G4-R2: Determine AI reachability for each sink.
  // The IR Sink type has an `aiReachable` flag set by FlowGraph.markAIReachableSinks().
  // If the IR has no flow graph data (aiReachable is undefined), reachability is UNKNOWN.
  function getAIReachability(sink: Sink): AIReachabilityStatus {
    if (sink.aiReachable === true) return 'REACHABILITY_PROVEN';
    if (sink.aiReachable === false) return 'NOT_AI_REACHABLE';
    return 'REACHABILITY_UNKNOWN';
  }

  // G4-R2: Detect analysis impediments from IR
  if ((ir.assignments?.length ?? 0) === 0 && (ir.sinks?.length ?? 0) > 0) {
    impediments.push({
      reason: 'INCOMPLETE_FLOW_ANALYSIS',
      detail: 'IR has no assignments — alias/data-flow analysis was not performed. Reachability is structural at best.',
    });
  }

  // G4-R2.1: Impediments must be attached to each affected declaration, not
  // merely returned in BridgeResult. This ensures they propagate through
  // Action Surface rows to the customer.
  function attachImpediments(decl: EvidenceCapabilityDeclaration): EvidenceCapabilityDeclaration {
    if (impediments.length === 0) return decl;
    return {
      ...decl,
      analysisImpediments: [...(decl.analysisImpediments ?? []), ...impediments],
    };
  }

  // Process sinks
  for (const sink of ir.sinks || []) {
    const entrypoint = sink.entrypointId ? entrypointMap.get(sink.entrypointId) : undefined;
    const authSignals = sink.entrypointId ? (authSignalsByEntrypoint.get(sink.entrypointId) || []) : [];
    const principal = extractPrincipal(authSignals, entrypoint);
    const reachability = getAIReachability(sink);

    // G4-R2: Sinks proven NOT AI-reachable are excluded from CODE_CAPABLE entirely
    if (reachability === 'NOT_AI_REACHABLE') {
      const registryEntry = lookupCapability(sink.api);
      if (registryEntry) {
        const decl = registryEntryToDeclaration(registryEntry, {
          sourceLocation: `${sink.location.file}:${sink.location.line}`,
          subject: principal,
          scope: entrypoint?.path ?? 'unknown',
          aiReachability: 'NOT_AI_REACHABLE',
        });
        nonAIReachable.push(decl);
      }
      continue;
    }

    const registryEntry = lookupCapability(sink.api);
    if (registryEntry) {
      // G4-R2: Only proven/structural reachability produces canonical CODE_CAPABLE
      if (reachability === 'REACHABILITY_PROVEN' || reachability === 'REACHABILITY_STRUCTURAL') {
        const decl = registryEntryToDeclaration(registryEntry, {
          sourceLocation: `${sink.location.file}:${sink.location.line}`,
          subject: principal,
          scope: entrypoint?.path ?? 'unknown',
          aiReachability: reachability,
        });
        declarations.push(attachImpediments(decl));
        exactMatches++;
      } else {
        // REACHABILITY_UNKNOWN → exact match but NOT canonical CODE_CAPABLE
        // It remains scanner/context evidence, not AI capability proof
        const decl: EvidenceCapabilityDeclaration = {
          capabilityId: `${registryEntry.action}:${registryEntry.resource}`,
          sourcePlane: 'CODE_CAPABLE',
          capabilityFamily: registryEntry.family,
          subject: principal,
          action: registryEntry.action,
          resource: registryEntry.resource,
          scope: entrypoint?.path ?? 'unknown',
          // G4-R2: NO invented environment
          impact: registryEntry.impact ?? 'UNKNOWN',
          sourceLocation: `${sink.location.file}:${sink.location.line}`,
          discoveryBasis: 'CAPABILITY_EXTRACTOR',
          capabilityCoverage: 'UNKNOWN',
          authorityClass: 'NON_AUTHORITATIVE',
          evidenceMethod: 'STATIC_STRUCTURAL_ANALYSIS',
          authoritySourceLabel: 'TECHNICAL_EVIDENCE',
          mappingStrength: 'EXACT_CAPABILITY_MAPPING',
          aiReachability: 'REACHABILITY_UNKNOWN',
        };
        suggestions.push(attachImpediments(decl));
        heuristicMatches++;
      }
    } else {
      // No exact match → heuristic suggestion (NOT canonical proof)
      const inferred = inferFromSinkKind(sink);
      if (inferred) {
        const decl: EvidenceCapabilityDeclaration = {
          capabilityId: `${inferred.action}:${inferred.resource}`,
          sourcePlane: 'CODE_CAPABLE',
          capabilityFamily: inferred.family,
          subject: principal,
          action: inferred.action,
          resource: inferred.resource,
          scope: entrypoint?.path ?? 'unknown',
          // G4-R2: NO invented environment
          impact: inferred.impact ?? 'UNKNOWN',
          sourceLocation: `${sink.location.file}:${sink.location.line}`,
          discoveryBasis: 'CAPABILITY_EXTRACTOR',
          capabilityCoverage: 'PARTIAL',
          authorityClass: 'NON_AUTHORITATIVE',
          evidenceMethod: 'STATIC_STRUCTURAL_ANALYSIS',
          authoritySourceLabel: 'TECHNICAL_EVIDENCE',
          mappingStrength: 'HEURISTIC_SUGGESTION',
          aiReachability: reachability,
        };
        suggestions.push(attachImpediments(decl));
        heuristicMatches++;
      } else {
        unmatched++;
      }
    }
  }

  // Process AI tools — tools are inherently AI-reachable (they are called by the AI)
  for (const tool of ir.tools || []) {
    const entrypoint = tool.entrypointId ? entrypointMap.get(tool.entrypointId) : undefined;
    const authSignals = tool.entrypointId ? (authSignalsByEntrypoint.get(tool.entrypointId) || []) : [];
    const principal = extractPrincipal(authSignals, entrypoint);

    const registryEntry = lookupCapability(tool.name);
    if (registryEntry) {
      // G4-R2.1: AI tools are REACHABILITY_STRUCTURAL, not REACHABILITY_PROVEN.
      // Tool registration/exposure establishes structural reachability — the AI
      // can call this tool. But deterministic CFG/data-flow proof requires
      // proven path evidence from AI entrypoint through the tool call site.
      const decl = registryEntryToDeclaration(registryEntry, {
        sourceLocation: `${tool.location.file}:${tool.location.line}`,
        subject: principal,
        scope: entrypoint?.path ?? 'unknown',
        aiReachability: 'REACHABILITY_STRUCTURAL',
      });
      declarations.push(attachImpediments(decl));
      exactMatches++;
    } else {
      // AI tool without registry match → suggestion
      const decl: EvidenceCapabilityDeclaration = {
        capabilityId: `agent.tool.execute:${tool.name}`,
        sourcePlane: 'CODE_CAPABLE',
        capabilityFamily: 'mcp',
        subject: principal,
        action: 'agent.tool.execute',
        resource: tool.name,
        scope: entrypoint?.path ?? 'unknown',
        // G4-R2: NO invented environment
        impact: tool.privilegeLevel === 'admin' ? 'HIGH' : 'MEDIUM',
        sourceLocation: `${tool.location.file}:${tool.location.line}`,
        discoveryBasis: 'CAPABILITY_EXTRACTOR',
        capabilityCoverage: 'PARTIAL',
        authorityClass: 'NON_AUTHORITATIVE',
        evidenceMethod: 'STATIC_STRUCTURAL_ANALYSIS',
        authoritySourceLabel: 'TECHNICAL_EVIDENCE',
        mappingStrength: 'HEURISTIC_SUGGESTION',
        aiReachability: 'REACHABILITY_STRUCTURAL',
      };
      suggestions.push(attachImpediments(decl));
      heuristicMatches++;
    }
  }

  return {
    declarations,
    suggestions,
    nonAIReachable,
    principal: extractPrincipal(
      (ir.authSignals || []).filter(s => s.entrypointId === (ir.entrypoints[0]?.id ?? '')),
      ir.entrypoints[0],
    ),
    impediments,
    stats: {
      sinksProcessed: ir.sinks?.length ?? 0,
      toolsProcessed: ir.tools?.length ?? 0,
      modelCallsProcessed: ir.modelCalls?.length ?? 0,
      exactMatches,
      heuristicMatches,
      unmatched,
      nonAIReachable: nonAIReachable.length,
    },
  };
}

// ─── SinkKind inference (fallback for unmatched sinks) ───────────────────────

function inferFromSinkKind(sink: Sink): {
  action: string;
  resource: string;
  family: string;
  impact?: string;
} | null {
  switch (sink.kind) {
    case 'db_write':
      return { action: 'database.write', resource: 'database', family: 'database', impact: 'MEDIUM' };
    case 'db_read':
      return { action: 'database.read', resource: 'database', family: 'database', impact: 'LOW' };
    case 'http_fetch':
      return { action: 'http.egress', resource: 'external_api', family: 'http', impact: 'MEDIUM' };
    case 'send_email':
      return { action: 'email.send', resource: 'email', family: 'messaging', impact: 'MEDIUM' };
    case 'file_write':
      return { action: 'file.write', resource: 'filesystem', family: 'filesystem', impact: 'MEDIUM' };
    case 'file_read':
      return { action: 'file.read', resource: 'filesystem', family: 'filesystem', impact: 'LOW' };
    case 'code_exec':
      return { action: 'code.execute', resource: 'code', family: 'execution', impact: 'CRITICAL' };
    case 'payment':
      return { action: 'payment.charge', resource: 'payment', family: 'payments', impact: 'HIGH' };
    case 'log':
    case 'log_output':
      return { action: 'log.write', resource: 'log', family: 'logging', impact: 'LOW' };
    default:
      return null;
  }
}
