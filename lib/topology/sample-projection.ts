/**
 * AI Action & Access Map — Sample Projection (DEMO)
 *
 * A FIXED, SYNTHETIC, ILLUSTRATIVE topology projection for the Sample Map
 * experience. This is NOT evidence. It is NOT an Assurance evaluation. It
 * is NOT persisted. It does NOT call any production API, database, or
 * mutation endpoint.
 *
 * Permanent locks:
 *   SAMPLE_DATA != EVIDENCE
 *   SAMPLE_MAP != CUSTOMER_TOPOLOGY
 *   SYNTHETIC_RELATION != SOURCE_ESTABLISHED_RELATION
 *   ILLUSTRATIVE_OBSERVATION != OBSERVED_PLANE_FACT
 *   DEMO != ASSURANCE
 *   SAMPLE_AVAILABLE != SOURCE_ESTABLISHED
 *   SAMPLE_PRESENTATION != PRODUCTION_EVIDENCE_STATE
 *   SYNTHETIC_PLANE != CURRENT_SOURCE
 *   SAMPLE_PLANE_DISPLAY != CANONICAL_PLANE_FACT
 *   SYNTHETIC_EFFECT != SOURCE_BACKED_CAPABILITY_EFFECT
 *   SYNTHETIC_EDGE != SOURCE_ESTABLISHED_SOLID_EDGE
 *   NOT_OBSERVED_CONSEQUENCE != PRODUCES
 *   REQUEST != IDENTITY
 *
 * The sample DTO conforms to TopologyProjectionResult so the existing
 * presentation layer (ActionAccessMapView) can render it without a second
 * visualization implementation. The presentation layer does not treat
 * sample data as production truth — it renders whatever projection it
 * receives. The separation is enforced by:
 *   1. This file is the ONLY source of sample topology data
 *   2. The sample route uses this constant directly (no fetch)
 *   3. Node IDs use the `sample-node:` prefix (production uses `node:`)
 *   4. organizationId / aiSystemId are clearly synthetic
 *   5. No scanProvenance, no real commit SHA, no real scan ID
 *   6. Every sample node has sampleContext.isSample === true
 *   7. No sample node uses canonical planeStatus / planeStatusBasis / effect / effectLabel
 *   8. No sample edge invents a new canonical JoinBasis — all use UNRESOLVED
 *   9. No sample structural edge uses solid style (all dashed or dotted)
 *
 * SAMPLE_RELATION_HAS_NO_PRODUCTION_EVIDENCE_BASIS:
 *   All sample edges use joinBasis = 'UNRESOLVED' because sample relations
 *   have no production evidence correlation. 'ILLUSTRATIVE_SAMPLE' is NOT
 *   a canonical JoinBasis and is never exported or registered.
 *
 * Scenario: Northstar Commerce Operations Copilot
 * Task: AI-assisted refund processing
 *
 * Core reveal:
 *   "Permission can be valid while delegation of the consequential choice remains unproven."
 *   "Permission is not delegation."
 *
 * @version sample-1.0.0
 */

import type {
  TopologyProjectionResult,
  TopologyNode,
  TopologyEdge,
  PlaneStatusDisplay,
} from './types';
import { SUPPORTED_MAP_LENSES } from './types';
import { SUPPORTED_SEMANTIC_ZOOM_LEVELS } from './types';

// ─── Fixed sample node IDs (clearly synthetic, never collide with production) ─

const SN = {
  // Layer 1 — Context / injection surface
  l1UserInput: 'sample-node:entrypoint:user-application-input',
  l1Rag: 'sample-node:connected_asset:rag-knowledge-base',
  l1Memory: 'sample-node:connected_asset:memory-agent-state',
  l1ToolOutput: 'sample-node:connected_asset:tool-api-output',
  l1PeerAgent: 'sample-node:connected_asset:peer-agent-mcp',
  l1RuntimeOverride: 'sample-node:connected_asset:runtime-override',
  l1ProviderSdk: 'sample-node:connected_asset:provider-sdk',
  l1McpPackage: 'sample-node:connected_asset:mcp-tool-package',
  l1Secrets: 'sample-node:provider_iam:secrets-credentials',

  // Layer 2 — Instruction authority & precedence
  l2SystemInstruction: 'sample-node:policy:system-instruction',
  l2RepoInstruction: 'sample-node:policy:repo-app-instruction',
  l2ToolSchema: 'sample-node:connected_asset:tool-schema-description',
  l2InstructionMerge: 'sample-node:ai_execution:instruction-merge-precedence',
  l2Optimizer: 'sample-node:ai_execution:optimizer-rewrite',
  l2VersionBinding: 'sample-node:evidence:evaluated-version-binding',
  l2RuntimeConfigBinding: 'sample-node:evidence:runtime-config-binding',

  // Layer 3 — Agent core & authority envelopes
  l3ModelCall: 'sample-node:ai_execution:model-call',
  l3Planner: 'sample-node:ai_execution:planner-agent-loop',
  l3ToolRouter: 'sample-node:ai_execution:tool-router-selector',
  l3ActionConstructor: 'sample-node:ai_execution:action-constructor',
  l3ExecutionIdentity: 'sample-node:identity:execution-identity',
  l3EffectivelyGranted: 'sample-node:provider_iam:effectively-granted',
  l3PolicyAuthorized: 'sample-node:policy:policy-authorized-envelope',
  l3DelegatedDiscretion: 'sample-node:identity:delegated-discretion',

  // Layer 4 — Action contract
  l4StripeRefundCreate: 'sample-node:action:stripe-refunds-create',
  l4PaymentIntent: 'sample-node:action:payment-intent-target',
  l4OrgDemo: 'sample-node:identity:org-demo-8472',
  l4RefundAmount: 'sample-node:action:refund-amount',
  l4ApiStripe: 'sample-node:action:api-stripe-com',

  // Layer 5 — Deterministic mediation before effect commit
  l5Authentication: 'sample-node:policy:authentication',
  l5TenantScope: 'sample-node:policy:tenant-scope',
  l5ResourceAuthz: 'sample-node:policy:resource-authorization',
  l5ApprovedTool: 'sample-node:policy:approved-tool',
  l5SchemaValidation: 'sample-node:policy:schema-type-validation',
  l5EffectBoundsMismatch: 'sample-node:policy:effect-bounds-mismatch',
  l5ApprovalNotEstablished: 'sample-node:policy:approval-not-established',
  l5RateRetryIdempotency: 'sample-node:policy:rate-retry-idempotency',

  // Layer 6 — Execution paths, effects, containment & witness
  l6CanonicalPath: 'sample-node:action:canonical-path',
  l6AsyncWorker: 'sample-node:action:async-worker-path',
  l6DirectToolMcp: 'sample-node:action:direct-tool-mcp',
  l6WebhookCallback: 'sample-node:action:webhook-callback',
  l6FallbackLegacy: 'sample-node:action:fallback-flag-legacy',
  l6DatabaseWrite: 'sample-node:consequence:database-write',
  l6StripeRefund: 'sample-node:consequence:stripe-refund',
  l6EmailSlackHttp: 'sample-node:consequence:email-slack-http',
  l6RolePermissionIam: 'sample-node:consequence:role-permission-iam',
  l6CodeCiCloud: 'sample-node:consequence:code-ci-cloud-change',
  l6KillSwitch: 'sample-node:consequence:kill-switch-domain',

  // Layer 7 — HAIEC Assurance, coverage & proof
  l7AiInventory: 'sample-node:evidence:ai-inventory-connected-assets',
  l7StaticIr: 'sample-node:evidence:static-ir-flow-analysis',
  l7CapabilitySurface: 'sample-node:evidence:capability-action-surface',
  l7EvaluatedScope: 'sample-node:evidence:evaluated-scope',
  l7EvidenceProjection: 'sample-node:evidence:evidence-projection-diagnostic-pipeline',
  l7AssuranceDecision: 'sample-node:evidence:assurance-decision-engine',
  l7PackageReceipt: 'sample-node:evidence:package-receipt-service',
} as const;

// ─── Shared sample context (the core reveal) ─────────────────────────────────

const SHARED_SAMPLE_CONTEXT = {
  isSample: true,
  sampleEvidenceStatus: 'Illustrative sample',
  sampleDelegation: 'Not established',
  sampleObservation: 'No runtime observation connected',
} as const;

// ─── Illustrative five-plane status (sample-only, never on canonical fields) ──
// These values live ONLY in sampleContext.samplePlaneStatus.
// They NEVER appear on the canonical TopologyNode.planeStatus field.

const ILLUSTRATIVE_PLANE_STATUS: PlaneStatusDisplay = {
  requested: 'PRESENT',
  policyAuthorized: 'PRESENT',
  effectivelyGranted: 'PARTIAL',
  codeCapable: 'PRESENT',
  observed: 'NOT_PROVIDED',
};

// ─── Helper to build sample context with optional overrides ──────────────────

type SampleNodeOverrides = {
  sampleAuthorityContext?: string;
  sampleApplicationContext?: string;
  sampleConsequence?: string;
  samplePlaneStatus?: PlaneStatusDisplay;
  sampleEffectLabel?: string;
};

function sampleContext(overrides?: SampleNodeOverrides) {
  return {
    sampleContext: {
      ...SHARED_SAMPLE_CONTEXT,
      ...(overrides || {}),
    },
  };
}

// ─── Sample nodes ────────────────────────────────────────────────────────────
// EVERY node has sampleContext.isSample === true.
// No node uses canonical planeStatus, planeStatusBasis, effect, or effectLabel.
// Illustrative five-plane values live in sampleContext.samplePlaneStatus.

const SAMPLE_NODES: TopologyNode[] = [
  // ── Layer 1 — Context / injection surface (9 nodes) ─────────────────────────
  {
    id: SN.l1UserInput,
    label: 'User / application input',
    kind: 'entrypoint',
    subType: 'user_application_input',
    subTypeLabel: 'Entrypoint',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [],
    ...sampleContext({ sampleApplicationContext: 'goal + parameters' }),
  },
  {
    id: SN.l1Rag,
    label: 'RAG / knowledge base',
    kind: 'connected_asset',
    subType: 'rag_knowledge_base',
    subTypeLabel: 'Connected asset',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['data ≠ instruction'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
    ...sampleContext(),
  },
  {
    id: SN.l1Memory,
    label: 'Memory / agent state',
    kind: 'connected_asset',
    subType: 'memory_agent_state',
    subTypeLabel: 'Connected asset · PARTIAL',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: ['lineage currently partial'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
    ...sampleContext(),
  },
  {
    id: SN.l1ToolOutput,
    label: 'Tool / API output',
    kind: 'connected_asset',
    subType: 'tool_api_output',
    subTypeLabel: 'Connected asset',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['can re-enter context'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
    ...sampleContext(),
  },
  {
    id: SN.l1PeerAgent,
    label: 'Peer agent / MCP',
    kind: 'connected_asset',
    subType: 'peer_agent_mcp',
    subTypeLabel: 'Connected asset · PARTIAL',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: ['trust + scope unresolved'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
    ...sampleContext(),
  },
  {
    id: SN.l1RuntimeOverride,
    label: 'Runtime override',
    kind: 'connected_asset',
    subType: 'runtime_override',
    subTypeLabel: 'Connected asset',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['prompt/model/tool/config'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
    ...sampleContext(),
  },
  {
    id: SN.l1ProviderSdk,
    label: 'Provider / SDK',
    kind: 'connected_asset',
    subType: 'provider_sdk',
    subTypeLabel: 'Connected asset',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['dependency ≠ runtime use'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
    ...sampleContext(),
  },
  {
    id: SN.l1McpPackage,
    label: 'MCP / tool package',
    kind: 'connected_asset',
    subType: 'mcp_tool_package',
    subTypeLabel: 'Connected asset · PARTIAL',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: ['dynamic topology partial'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
    ...sampleContext(),
  },
  {
    id: SN.l1Secrets,
    label: 'Secrets / credentials',
    kind: 'provider_iam',
    subType: 'OBSERVED_PARTIAL',
    subTypeLabel: 'Provider IAM',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: ['effective reach'],
    ...sampleContext({ sampleAuthorityContext: 'Secrets / credentials' }),
  },

  // ── Layer 2 — Instruction authority & precedence (7 nodes) ──────────────────
  {
    id: SN.l2SystemInstruction,
    label: 'System instruction',
    kind: 'policy',
    subType: 'system_instruction',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['policy intent'],
    ...sampleContext(),
  },
  {
    id: SN.l2RepoInstruction,
    label: 'Repo / app instruction',
    kind: 'policy',
    subType: 'repo_app_instruction',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['local constraints'],
    ...sampleContext(),
  },
  {
    id: SN.l2ToolSchema,
    label: 'Tool schema / description',
    kind: 'connected_asset',
    subType: 'tool_schema_description',
    subTypeLabel: 'Connected asset',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['availability ≠ entitlement'],
    assetProvider: 'Sample',
    assetEnvironment: 'Sample',
    assetConnectionState: 'Illustrative',
    ...sampleContext(),
  },
  {
    id: SN.l2InstructionMerge,
    label: 'Instruction merge / precedence',
    kind: 'ai_execution',
    subType: 'instruction_merge',
    subTypeLabel: 'AI execution',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['trusted + untrusted sources'],
    ...sampleContext({ sampleApplicationContext: 'Commerce Operations Copilot' }),
  },
  {
    id: SN.l2Optimizer,
    label: 'Optimizer / rewrite',
    kind: 'ai_execution',
    subType: 'optimizer_rewrite',
    subTypeLabel: 'AI execution',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['only if discovered'],
    ...sampleContext({ sampleApplicationContext: 'Commerce Operations Copilot' }),
  },
  {
    id: SN.l2VersionBinding,
    label: 'Evaluated version binding',
    kind: 'evidence',
    subType: 'evaluated_version_binding',
    subTypeLabel: 'Evidence · ESTABLISHED',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['scope + build/deployment'],
    ...sampleContext(),
  },
  {
    id: SN.l2RuntimeConfigBinding,
    label: 'Runtime config binding',
    kind: 'evidence',
    subType: 'runtime_config_binding',
    subTypeLabel: 'Evidence · PARTIAL',
    aiReachable: false,
    availability: 'PARTIAL',
    limitations: ['current vs evaluated'],
    ...sampleContext(),
  },

  // ── Layer 3 — Agent core & authority envelopes (8 nodes) ─────────────────────
  {
    id: SN.l3ModelCall,
    label: 'Model call',
    kind: 'ai_execution',
    subType: 'model_call',
    subTypeLabel: 'AI execution',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['provider + model + tools'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l3Planner,
    label: 'Planner / agent loop',
    kind: 'ai_execution',
    subType: 'planner_agent_loop',
    subTypeLabel: 'AI execution',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['only when source-proven'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l3ToolRouter,
    label: 'Tool router / selector',
    kind: 'ai_execution',
    subType: 'tool_router_selector',
    subTypeLabel: 'AI execution',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['available vs approved'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l3ActionConstructor,
    label: 'Action constructor',
    kind: 'ai_execution',
    subType: 'action_constructor',
    subTypeLabel: 'AI execution',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['tool + arguments'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l3ExecutionIdentity,
    label: 'Execution identity',
    kind: 'identity',
    subType: 'execution_identity',
    subTypeLabel: 'Identity · PER-ACTION PARTIAL',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: ['who the system acts as'],
    ...sampleContext({ sampleAuthorityContext: 'Execution identity' }),
  },
  {
    id: SN.l3EffectivelyGranted,
    label: 'EFFECTIVELY_GRANTED',
    kind: 'provider_iam',
    subType: 'OBSERVED_PARTIAL',
    subTypeLabel: 'Provider IAM · synthetic PARTIAL',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: [
      'synthetic PARTIAL',
      'source required in production',
    ],
    ...sampleContext({ sampleAuthorityContext: 'Effectively granted' }),
  },
  {
    id: SN.l3PolicyAuthorized,
    label: 'POLICY_AUTHORIZED · Approved Operating Envelope',
    kind: 'policy',
    subType: 'approved_operating_envelope',
    subTypeLabel: 'Approved operating envelope',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['tools · scope · destinations · bounds'],
    ...sampleContext(),
  },
  {
    id: SN.l3DelegatedDiscretion,
    label: 'Delegated discretion',
    kind: 'identity',
    subType: 'delegated_discretion',
    subTypeLabel: 'Identity · NOT GENERALLY ESTABLISHED',
    aiReachable: true,
    availability: 'UNKNOWN',
    limitations: ['permission ≠ delegation'],
    ...sampleContext({ sampleAuthorityContext: 'Delegated discretion' }),
  },

  // ── Layer 4 — Action contract (5 nodes) ─────────────────────────────────────
  {
    id: SN.l4StripeRefundCreate,
    label: 'stripe.refunds.create',
    kind: 'action',
    subType: 'stripe_refunds_create',
    subTypeLabel: 'Action · CODE_CAPABLE',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [
      'FINANCIAL_MUTATION',
      'AI-reachable',
      'Delegation not established',
      'No runtime observation connected',
    ],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      sampleAuthorityContext: 'Effectively granted',
      sampleConsequence: 'External financial mutation',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
      sampleEffectLabel: 'Financial mutation',
    }),
  },
  {
    id: SN.l4PaymentIntent,
    label: 'PaymentIntent target',
    kind: 'action',
    subType: 'payment_intent_target',
    subTypeLabel: 'Action',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['symbolic target · server-resolved ID'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l4OrgDemo,
    label: 'org_demo_8472',
    kind: 'identity',
    subType: 'tenant_scope',
    subTypeLabel: 'Identity · BOUND',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['tenant scope · server-bound'],
    ...sampleContext({ sampleAuthorityContext: 'Tenant scope' }),
  },
  {
    id: SN.l4RefundAmount,
    label: 'Refund amount',
    kind: 'action',
    subType: 'refund_amount',
    subTypeLabel: 'Action · POLICY/CODE MISMATCH',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: [
      'policy ≤ $2,500',
      'code capable ≤ $10,000',
      'Delegation not established',
    ],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
      sampleEffectLabel: 'Financial mutation',
    }),
  },
  {
    id: SN.l4ApiStripe,
    label: 'api.stripe.com',
    kind: 'action',
    subType: 'api_stripe_com',
    subTypeLabel: 'Action',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['approved external payment destination'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },

  // ── Layer 5 — Deterministic mediation before effect commit (8 nodes) ────────
  {
    id: SN.l5Authentication,
    label: 'Authentication',
    kind: 'policy',
    subType: 'authentication',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['✓ Authentication'],
    ...sampleContext(),
  },
  {
    id: SN.l5TenantScope,
    label: 'Tenant scope',
    kind: 'policy',
    subType: 'tenant_scope',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['✓ Tenant scope'],
    ...sampleContext(),
  },
  {
    id: SN.l5ResourceAuthz,
    label: 'Resource authorization',
    kind: 'policy',
    subType: 'resource_authorization',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['✓ Resource authorization'],
    ...sampleContext(),
  },
  {
    id: SN.l5ApprovedTool,
    label: 'Approved tool',
    kind: 'policy',
    subType: 'approved_tool',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['✓ Approved tool'],
    ...sampleContext(),
  },
  {
    id: SN.l5SchemaValidation,
    label: 'Schema / type validation',
    kind: 'policy',
    subType: 'schema_type_validation',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['✓ Schema / type validation'],
    ...sampleContext(),
  },
  {
    id: SN.l5EffectBoundsMismatch,
    label: 'Effect bounds mismatch',
    kind: 'policy',
    subType: 'effect_bounds_mismatch',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'PARTIAL',
    limitations: ['! Effect bounds mismatch'],
    ...sampleContext(),
  },
  {
    id: SN.l5ApprovalNotEstablished,
    label: 'Approval not established',
    kind: 'policy',
    subType: 'approval_not_established',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'UNKNOWN',
    limitations: ['! Approval not established'],
    ...sampleContext(),
  },
  {
    id: SN.l5RateRetryIdempotency,
    label: 'Rate · retry · idempotency',
    kind: 'policy',
    subType: 'rate_retry_idempotency',
    subTypeLabel: 'Policy',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['Rate · retry · idempotency'],
    ...sampleContext(),
  },

  // ── Layer 6 — Execution paths, effects, containment & witness (11 nodes) ────
  {
    id: SN.l6CanonicalPath,
    label: 'Canonical path',
    kind: 'action',
    subType: 'canonical_path',
    subTypeLabel: 'Action · canonical path · stronger controls',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['POST /refund → BillingService'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l6AsyncWorker,
    label: 'Async worker path',
    kind: 'action',
    subType: 'async_worker_path',
    subTypeLabel: 'Action · PARTIAL',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: ['refund.queue → worker', 'retry + idempotency parity partial'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l6DirectToolMcp,
    label: 'Direct tool / MCP',
    kind: 'action',
    subType: 'direct_tool_mcp',
    subTypeLabel: 'Action · PARTIAL',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: ['Tool / MCP', 'canonical guard bypass?'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l6WebhookCallback,
    label: 'Webhook / callback',
    kind: 'action',
    subType: 'webhook_callback',
    subTypeLabel: 'Action',
    aiReachable: true,
    availability: 'AVAILABLE',
    limitations: ['Webhook / callback', 'provider auth + tenant attribution'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l6FallbackLegacy,
    label: 'Fallback / flag / legacy',
    kind: 'action',
    subType: 'fallback_flag_legacy',
    subTypeLabel: 'Action · PARTIAL',
    aiReachable: true,
    availability: 'PARTIAL',
    limitations: ['Fallback / flag / legacy', 'weaker topology?'],
    ...sampleContext({
      sampleApplicationContext: 'Commerce Operations Copilot',
      samplePlaneStatus: ILLUSTRATIVE_PLANE_STATUS,
    }),
  },
  {
    id: SN.l6DatabaseWrite,
    label: 'Database write',
    kind: 'consequence',
    subType: 'database_write',
    subTypeLabel: 'Potential consequence',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: [
      'tenant-sensitive mutation',
      'Consequence not established: no runtime observation connected',
    ],
    ...sampleContext({
      sampleConsequence: 'Database write',
      sampleEffectLabel: 'Write / Update',
    }),
  },
  {
    id: SN.l6StripeRefund,
    label: 'Stripe refund',
    kind: 'consequence',
    subType: 'stripe_refund',
    subTypeLabel: 'Potential consequence · REVIEW',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: [
      'external financial mutation',
      'Consequence not established: no runtime observation connected',
    ],
    ...sampleContext({
      sampleConsequence: 'Stripe refund',
      sampleEffectLabel: 'Financial mutation',
    }),
  },
  {
    id: SN.l6EmailSlackHttp,
    label: 'Email / Slack / HTTP',
    kind: 'consequence',
    subType: 'email_slack_http',
    subTypeLabel: 'Potential consequence',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: [
      'data leaves boundary',
      'Consequence not established: no runtime observation connected',
    ],
    ...sampleContext({
      sampleConsequence: 'Email / Slack / HTTP',
      sampleEffectLabel: 'External data transfer',
    }),
  },
  {
    id: SN.l6RolePermissionIam,
    label: 'Role / permission / IAM',
    kind: 'consequence',
    subType: 'role_permission_iam',
    subTypeLabel: 'Potential consequence',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: [
      'authority expansion',
      'Consequence not established: no runtime observation connected',
    ],
    ...sampleContext({
      sampleConsequence: 'Role / permission / IAM',
      sampleEffectLabel: 'Authority change',
    }),
  },
  {
    id: SN.l6CodeCiCloud,
    label: 'Code / CI / cloud change',
    kind: 'consequence',
    subType: 'code_ci_cloud_change',
    subTypeLabel: 'Potential consequence',
    aiReachable: 'UNKNOWN',
    availability: 'UNKNOWN',
    limitations: [
      'operational mutation',
      'Consequence not established: no runtime observation connected',
    ],
    ...sampleContext({
      sampleConsequence: 'Code / CI / cloud change',
      sampleEffectLabel: 'Configuration change',
    }),
  },
  {
    id: SN.l6KillSwitch,
    label: 'Kill-switch domain',
    kind: 'consequence',
    subType: 'kill_switch_domain',
    subTypeLabel: 'Potential consequence · PARTIAL',
    aiReachable: 'UNKNOWN',
    availability: 'PARTIAL',
    limitations: [
      'generalized agent integration not established',
      'Consequence not established: no runtime observation connected',
    ],
    ...sampleContext({
      sampleConsequence: 'Kill-switch domain',
      sampleEffectLabel: 'Configuration change',
    }),
  },

  // ── Layer 7 — HAIEC Assurance, coverage & proof (7 nodes) ────────────────────
  {
    id: SN.l7AiInventory,
    label: 'AI Inventory + Connected Assets',
    kind: 'evidence',
    subType: 'ai_inventory_connected_assets',
    subTypeLabel: 'Evidence',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['current topology anchors'],
    ...sampleContext(),
  },
  {
    id: SN.l7StaticIr,
    label: 'Static IR + Flow analysis',
    kind: 'evidence',
    subType: 'static_ir_flow_analysis',
    subTypeLabel: 'Evidence',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['entrypoints · prompts · sinks · auth'],
    ...sampleContext(),
  },
  {
    id: SN.l7CapabilitySurface,
    label: 'Capability / Action Surface',
    kind: 'evidence',
    subType: 'capability_action_surface',
    subTypeLabel: 'Evidence',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['what software can do'],
    ...sampleContext(),
  },
  {
    id: SN.l7EvaluatedScope,
    label: 'Evaluated Scope',
    kind: 'evidence',
    subType: 'evaluated_scope',
    subTypeLabel: 'Evidence',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['what was actually evaluated'],
    ...sampleContext(),
  },
  {
    id: SN.l7EvidenceProjection,
    label: 'Evidence Projection & Diagnostic Pipeline',
    kind: 'evidence',
    subType: 'evidence_projection_diagnostic_pipeline',
    subTypeLabel: 'Evidence',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['exact-run evidence + coverage'],
    ...sampleContext(),
  },
  {
    id: SN.l7AssuranceDecision,
    label: 'Assurance Decision Engine',
    kind: 'evidence',
    subType: 'assurance_decision_engine',
    subTypeLabel: 'Evidence · CANONICAL',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['sole decision authority'],
    ...sampleContext(),
  },
  {
    id: SN.l7PackageReceipt,
    label: 'Package & Receipt Service',
    kind: 'evidence',
    subType: 'package_receipt_service',
    subTypeLabel: 'Evidence',
    aiReachable: false,
    availability: 'AVAILABLE',
    limitations: ['verifiable decision integrity'],
    ...sampleContext(),
  },
];

// ─── Sample edges ────────────────────────────────────────────────────────────
// All structural edges are static (non-animated). The presentation layer
// enforces animated: false on all edges regardless.
//
// SAMPLE_RELATION_HAS_NO_PRODUCTION_EVIDENCE_BASIS:
//   All sample edges use joinBasis = 'UNRESOLVED' (the frozen non-evidence
//   placeholder). 'ILLUSTRATIVE_SAMPLE' is NOT a canonical JoinBasis and
//   is never exported or registered.
//
// No sample structural edge uses solid style.
//   Structural relationships use dashed.
//   Unresolved/potential consequence relationships use dotted.

const SAMPLE_EDGES: TopologyEdge[] = [
  // ── Layer 1 → Layer 2 (context feeds instruction authority) ─────────────────
  {
    id: 'sample-edge:reaches:l1-user-to-l2-system-instruction',
    source: SN.l1UserInput,
    target: SN.l2SystemInstruction,
    label: 'provides goal',
    kind: 'reaches',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l1-rag-to-l2-repo-instruction',
    source: SN.l1Rag,
    target: SN.l2RepoInstruction,
    label: 'feeds',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l1-memory-to-l2-tool-schema',
    source: SN.l1Memory,
    target: SN.l2ToolSchema,
    label: 'informs',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l1-tool-output-to-l2-instruction-merge',
    source: SN.l1ToolOutput,
    target: SN.l2InstructionMerge,
    label: 'enters context',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l1-peer-agent-to-l2-instruction-merge',
    source: SN.l1PeerAgent,
    target: SN.l2InstructionMerge,
    label: 'enters context',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  // Special: Layer 1 right side (runtime override) → Layer 2 right side (version binding)
  {
    id: 'sample-edge:connected_to:l1-runtime-override-to-l2-version-binding',
    source: SN.l1RuntimeOverride,
    target: SN.l2VersionBinding,
    label: 'runtime config',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l1-provider-sdk-to-l2-runtime-config-binding',
    source: SN.l1ProviderSdk,
    target: SN.l2RuntimeConfigBinding,
    label: 'dependency',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l1-mcp-package-to-l2-runtime-config-binding',
    source: SN.l1McpPackage,
    target: SN.l2RuntimeConfigBinding,
    label: 'dynamic topology',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:uses_credential:l1-secrets-to-l2-optimizer',
    source: SN.l1Secrets,
    target: SN.l2Optimizer,
    label: 'effective reach',
    kind: 'uses_credential',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },

  // ── Layer 2 → Layer 3 (instruction authority binds agent core) ──────────────
  {
    id: 'sample-edge:governed_by:l2-system-instruction-to-l3-model-call',
    source: SN.l2SystemInstruction,
    target: SN.l3ModelCall,
    label: 'policy intent',
    kind: 'governed_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:governed_by:l2-repo-instruction-to-l3-planner',
    source: SN.l2RepoInstruction,
    target: SN.l3Planner,
    label: 'local constraints',
    kind: 'governed_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l2-tool-schema-to-l3-tool-router',
    source: SN.l2ToolSchema,
    target: SN.l3ToolRouter,
    label: 'availability',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:routes_to:l2-instruction-merge-to-l3-action-constructor',
    source: SN.l2InstructionMerge,
    target: SN.l3ActionConstructor,
    label: 'trusted + untrusted',
    kind: 'routes_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l2-optimizer-to-l3-model-call',
    source: SN.l2Optimizer,
    target: SN.l3ModelCall,
    label: 'rewrite',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:scoped_by:l2-version-binding-to-l3-execution-identity',
    source: SN.l2VersionBinding,
    target: SN.l3ExecutionIdentity,
    label: 'scope + build',
    kind: 'scoped_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l2-runtime-config-binding-to-l3-effectively-granted',
    source: SN.l2RuntimeConfigBinding,
    target: SN.l3EffectivelyGranted,
    label: 'current vs evaluated',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },

  // ── Layer 3 → Layer 4 (agent core → action contract) ────────────────────────
  {
    id: 'sample-edge:reaches:l3-model-call-to-l4-stripe-refund-create',
    source: SN.l3ModelCall,
    target: SN.l4StripeRefundCreate,
    label: 'provider + model + tools',
    kind: 'reaches',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:routes_to:l3-planner-to-l4-payment-intent',
    source: SN.l3Planner,
    target: SN.l4PaymentIntent,
    label: 'source-proven',
    kind: 'routes_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:can_reach:l3-tool-router-to-l4-refund-amount',
    source: SN.l3ToolRouter,
    target: SN.l4RefundAmount,
    label: 'available vs approved',
    kind: 'can_reach',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:reaches:l3-action-constructor-to-l4-stripe-refund-create',
    source: SN.l3ActionConstructor,
    target: SN.l4StripeRefundCreate,
    label: 'tool + arguments',
    kind: 'reaches',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:scoped_by:l3-execution-identity-to-l4-org-demo',
    source: SN.l3ExecutionIdentity,
    target: SN.l4OrgDemo,
    label: 'who the system acts as',
    kind: 'scoped_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:uses_credential:l3-effectively-granted-to-l4-api-stripe',
    source: SN.l3EffectivelyGranted,
    target: SN.l4ApiStripe,
    label: 'synthetic PARTIAL',
    kind: 'uses_credential',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:governed_by:l3-policy-authorized-to-l4-refund-amount',
    source: SN.l3PolicyAuthorized,
    target: SN.l4RefundAmount,
    label: 'approved envelope',
    kind: 'governed_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:governed_by:l3-delegated-discretion-to-l4-stripe-refund-create',
    source: SN.l3DelegatedDiscretion,
    target: SN.l4StripeRefundCreate,
    label: 'permission ≠ delegation',
    kind: 'governed_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },

  // ── Layer 4 → Layer 5 (action contract → deterministic controls) ────────────
  {
    id: 'sample-edge:guarded_by:l4-stripe-refund-create-to-l5-authentication',
    source: SN.l4StripeRefundCreate,
    target: SN.l5Authentication,
    label: 'FINANCIAL_MUTATION',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:scoped_by:l4-payment-intent-to-l5-tenant-scope',
    source: SN.l4PaymentIntent,
    target: SN.l5TenantScope,
    label: 'server-resolved',
    kind: 'scoped_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:scoped_by:l4-org-demo-to-l5-resource-authz',
    source: SN.l4OrgDemo,
    target: SN.l5ResourceAuthz,
    label: 'tenant scope',
    kind: 'scoped_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l4-refund-amount-to-l5-approved-tool',
    source: SN.l4RefundAmount,
    target: SN.l5ApprovedTool,
    label: 'policy ≤ $2,500',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l4-api-stripe-to-l5-schema-validation',
    source: SN.l4ApiStripe,
    target: SN.l5SchemaValidation,
    label: 'approved destination',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l4-stripe-refund-create-to-l5-effect-bounds-mismatch',
    source: SN.l4StripeRefundCreate,
    target: SN.l5EffectBoundsMismatch,
    label: 'bounds',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l4-stripe-refund-create-to-l5-approval-not-established',
    source: SN.l4StripeRefundCreate,
    target: SN.l5ApprovalNotEstablished,
    label: 'approval',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l4-api-stripe-to-l5-rate-retry-idempotency',
    source: SN.l4ApiStripe,
    target: SN.l5RateRetryIdempotency,
    label: 'rate',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },

  // ── Layer 5 → Layer 6 (controls → effect boundary → paths) ──────────────────
  {
    id: 'sample-edge:guarded_by:l5-authentication-to-l6-canonical-path',
    source: SN.l5Authentication,
    target: SN.l6CanonicalPath,
    label: '✓ Authentication',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:scoped_by:l5-tenant-scope-to-l6-canonical-path',
    source: SN.l5TenantScope,
    target: SN.l6CanonicalPath,
    label: '✓ Tenant scope',
    kind: 'scoped_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l5-resource-authz-to-l6-canonical-path',
    source: SN.l5ResourceAuthz,
    target: SN.l6CanonicalPath,
    label: '✓ Resource authorization',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l5-approved-tool-to-l6-canonical-path',
    source: SN.l5ApprovedTool,
    target: SN.l6CanonicalPath,
    label: '✓ Approved tool',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l5-schema-validation-to-l6-canonical-path',
    source: SN.l5SchemaValidation,
    target: SN.l6CanonicalPath,
    label: '✓ Schema / type validation',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l5-effect-bounds-mismatch-to-l6-async-worker',
    source: SN.l5EffectBoundsMismatch,
    target: SN.l6AsyncWorker,
    label: '! Effect bounds mismatch',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l5-approval-not-established-to-l6-direct-tool-mcp',
    source: SN.l5ApprovalNotEstablished,
    target: SN.l6DirectToolMcp,
    label: '! Approval not established',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:guarded_by:l5-rate-retry-idempotency-to-l6-async-worker',
    source: SN.l5RateRetryIdempotency,
    target: SN.l6AsyncWorker,
    label: 'Rate · retry · idempotency',
    kind: 'guarded_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },

  // ── Layer 6 paths → effects (canonical produces / potential consequence) ────
  // Canonical path produces established effects (dashed).
  {
    id: 'sample-edge:produces:l6-canonical-path-to-l6-database-write',
    source: SN.l6CanonicalPath,
    target: SN.l6DatabaseWrite,
    label: 'produces',
    kind: 'produces',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:produces:l6-canonical-path-to-l6-stripe-refund',
    source: SN.l6CanonicalPath,
    target: SN.l6StripeRefund,
    label: 'produces',
    kind: 'produces',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  // Potential consequence edges (dotted).
  {
    id: 'sample-edge:connected_to:l6-async-worker-to-l6-database-write',
    source: SN.l6AsyncWorker,
    target: SN.l6DatabaseWrite,
    label: 'could result in',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dotted',
  },
  {
    id: 'sample-edge:connected_to:l6-async-worker-to-l6-stripe-refund',
    source: SN.l6AsyncWorker,
    target: SN.l6StripeRefund,
    label: 'could result in',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dotted',
  },
  {
    id: 'sample-edge:connected_to:l6-direct-tool-mcp-to-l6-stripe-refund',
    source: SN.l6DirectToolMcp,
    target: SN.l6StripeRefund,
    label: 'could result in',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dotted',
  },
  {
    id: 'sample-edge:connected_to:l6-webhook-callback-to-l6-email-slack-http',
    source: SN.l6WebhookCallback,
    target: SN.l6EmailSlackHttp,
    label: 'could result in',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dotted',
  },
  {
    id: 'sample-edge:connected_to:l6-fallback-legacy-to-l6-code-ci-cloud',
    source: SN.l6FallbackLegacy,
    target: SN.l6CodeCiCloud,
    label: 'could result in',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dotted',
  },
  {
    id: 'sample-edge:connected_to:l6-canonical-path-to-l6-role-permission-iam',
    source: SN.l6CanonicalPath,
    target: SN.l6RolePermissionIam,
    label: 'could result in',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dotted',
  },
  {
    id: 'sample-edge:connected_to:l6-fallback-legacy-to-l6-kill-switch',
    source: SN.l6FallbackLegacy,
    target: SN.l6KillSwitch,
    label: 'could result in',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dotted',
  },

  // ── Layer 6 effects → Layer 7 assurance (tap edges) ─────────────────────────
  {
    id: 'sample-edge:evidenced_by:l6-database-write-to-l7-ai-inventory',
    source: SN.l6DatabaseWrite,
    target: SN.l7AiInventory,
    label: 'tap',
    kind: 'evidenced_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:evidenced_by:l6-stripe-refund-to-l7-static-ir',
    source: SN.l6StripeRefund,
    target: SN.l7StaticIr,
    label: 'tap',
    kind: 'evidenced_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:evidenced_by:l6-email-slack-http-to-l7-capability-surface',
    source: SN.l6EmailSlackHttp,
    target: SN.l7CapabilitySurface,
    label: 'tap',
    kind: 'evidenced_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:evidenced_by:l6-role-permission-iam-to-l7-evaluated-scope',
    source: SN.l6RolePermissionIam,
    target: SN.l7EvaluatedScope,
    label: 'tap',
    kind: 'evidenced_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:evidenced_by:l6-code-ci-cloud-to-l7-evidence-projection',
    source: SN.l6CodeCiCloud,
    target: SN.l7EvidenceProjection,
    label: 'tap',
    kind: 'evidenced_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:evidenced_by:l6-kill-switch-to-l7-assurance-decision',
    source: SN.l6KillSwitch,
    target: SN.l7AssuranceDecision,
    label: 'tap',
    kind: 'evidenced_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:evidenced_by:l6-stripe-refund-to-l7-package-receipt',
    source: SN.l6StripeRefund,
    target: SN.l7PackageReceipt,
    label: 'tap',
    kind: 'evidenced_by',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },

  // ── Layer 7 internal chain (assurance pipeline) ─────────────────────────────
  {
    id: 'sample-edge:connected_to:l7-ai-inventory-to-l7-static-ir',
    source: SN.l7AiInventory,
    target: SN.l7StaticIr,
    label: 'feeds',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l7-static-ir-to-l7-capability-surface',
    source: SN.l7StaticIr,
    target: SN.l7CapabilitySurface,
    label: 'feeds',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l7-capability-surface-to-l7-evaluated-scope',
    source: SN.l7CapabilitySurface,
    target: SN.l7EvaluatedScope,
    label: 'feeds',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l7-evaluated-scope-to-l7-evidence-projection',
    source: SN.l7EvaluatedScope,
    target: SN.l7EvidenceProjection,
    label: 'feeds',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l7-evidence-projection-to-l7-assurance-decision',
    source: SN.l7EvidenceProjection,
    target: SN.l7AssuranceDecision,
    label: 'feeds',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
  {
    id: 'sample-edge:connected_to:l7-assurance-decision-to-l7-package-receipt',
    source: SN.l7AssuranceDecision,
    target: SN.l7PackageReceipt,
    label: 'emits',
    kind: 'connected_to',
    joinBasis: 'UNRESOLVED',
    style: 'dashed',
  },
];

// ─── Fixed sample projection result ──────────────────────────────────────────

export const SAMPLE_PROJECTION: TopologyProjectionResult = {
  projectionSchemaVersion: 'topology-1.0.0',
  sourceVersion: 'sample-1.0.0',
  projectionScope: 'AI_SYSTEM',
  organizationId: 'sample-organization-illustrative',
  aiSystemId: 'sample-system-illustrative',
  aiSystemName: 'Northstar Commerce Operations Copilot (Sample)',
  primaryTimeBasis: 'CURRENT',
  projectionHash: 'sample-projection-fixed-illustrative-hash-0001',
  coverage: 'PARTIAL',
  mapAvailability: 'AVAILABLE',
  limitations: [
    'Illustrative sample data: not evidence',
    'No runtime observation connected',
    'Delegation not established',
    'Credential evidence: limited',
    'Synthetic high-action scenario: demonstration values only',
    '3 review paths / 9 CODE_CAPABLE / 2 OBSERVED / 5 evidence gaps are demonstration values only',
    'REQUESTED means an explicit customer/operator declaration, not prompt or user input',
  ],
  nodes: SAMPLE_NODES,
  edges: SAMPLE_EDGES,
  lenses: [...SUPPORTED_MAP_LENSES],
  zoomLevels: [...SUPPORTED_SEMANTIC_ZOOM_LEVELS],
  // No scanProvenance — this is not a real scan
  // No providerIam at projection level — credential evidence is shown on nodes
  // No currentPolicy — the policy node is illustrative
  // No evaluatedBasis — this is not an Assurance evaluation
};

// ─── Sample scenario metadata (for the page header) ──────────────────────────

export const SAMPLE_SCENARIO = {
  title: 'Action to Consequence',
  subtitle:
    'Trace what AI can do, how authority and controls narrow it, what was actually evaluated, and exactly where the evidence ends.',
  bannerLabel: 'Synthetic high-action demo',
  coreReveal: 'Permission can be valid while delegation of the consequential choice remains unproven.',
  secondaryReveal: 'Permission is not delegation.',
  scenarioName: 'Northstar Commerce Operations Copilot',
  scenarioTask: 'AI-assisted refund processing',
  delegationStateCopy: 'Not established',
  observedStateCopy: 'No runtime observation connected',
} as const;

// ─── Hard separation invariant ───────────────────────────────────────────────
// This constant proves the sample is not evidence. It is checked by tests.

export const SAMPLE_INVARIANTS = {
  IS_SAMPLE: true,
  IS_EVIDENCE: false,
  IS_ASSURANCE: false,
  IS_PERSISTED: false,
  CALLS_PRODUCTION_API: false,
  CREATES_AI_SYSTEM: false,
  CREATES_DECISION_RECEIPT: false,
  FABRICATES_RUNTIME_OBSERVATION: false,
} as const;
