/**
 * Kestrel demo consequence labels — CANONICAL_EVIDENCE → CUSTOMER_DISPLAY_LABEL.
 *
 * Deterministic presentation mapping keyed to the exact frozen-evaluation sink
 * target IDs (Flagship-4, source commit 5e65843). Each label was audited against
 * the actual operation at that commit:
 *
 *   tool_handlers.py:220        orders.insert(...)                    -> order record write
 *   tool_handlers.py:252        menu_items.select(...)                -> menu items read
 *   lifecycle_tracker.py:117    call_lifecycle.insert(...)            -> call lifecycle record write
 *   lifecycle_tracker.py:43     call_lifecycle.select(*).limit(1)     -> call lifecycle table read
 *   transactional_sms.py:190    sms_messages.select("id, created_at") -> customer message records read
 *   calendar_service.py:50      ai_agent_configs.select("timezone")   -> tenant timezone config read
 *   template_schema.py:1140     locations.select("id, code")          -> tenant locations read
 *   template_schema.py:1294     ai_config_templates.select(...)       -> AI config template read
 *
 * Locks: RESOURCE_NAME != EFFECT_VERB. MESSAGE_RESOURCE != MESSAGE_SEND.
 * This file changes presentation only — it never upgrades evidence state.
 * Unmapped sinks fall back to bounded technical wording (no invented verb).
 */

export type ConsequenceEffect = 'READ' | 'WRITE' | 'CREATE' | 'SEND' | 'UPDATE' | 'DELETE' | 'ACCESS' | 'INVOKE'

export interface ConsequenceLabel {
  /** Executive headline — exact established effect, no stronger verb. */
  label: string
  /** Canonical effect verb. */
  effect: ConsequenceEffect
  /** Bounded technical description of the exact operation. */
  technical: string
  /** Resource the operation targets. */
  resource: string
}

const SINK_LABELS: Record<string, ConsequenceLabel> = {
  'pydb_hvac_agent/app/utils/tool_handlers.py:220:18': {
    label: 'ORDER RECORD WRITE',
    effect: 'WRITE',
    technical: 'orders table insert — creates a customer order record',
    resource: 'orders',
  },
  'pydb_hvac_agent/app/utils/tool_handlers.py:252:18': {
    label: 'MENU ITEMS READ',
    effect: 'READ',
    technical: 'menu_items table query — retrieves menu items for a tenant',
    resource: 'menu_items',
  },
  'pydb_hvac_agent/app/utils/lifecycle_tracker.py:117:9': {
    label: 'CALL LIFECYCLE RECORD WRITE',
    effect: 'WRITE',
    technical: 'call_lifecycle table insert — writes a call-lifecycle event record',
    resource: 'call_lifecycle',
  },
  'pydb_hvac_agent/app/utils/lifecycle_tracker.py:43:18': {
    label: 'CALL LIFECYCLE TABLE READ',
    effect: 'READ',
    technical: 'call_lifecycle table query — reads the lifecycle table',
    resource: 'call_lifecycle',
  },
  'pydb_hvac_agent/app/services/transactional_sms.py:190:21': {
    label: 'CUSTOMER MESSAGE RECORDS READ',
    effect: 'READ',
    technical: 'sms_messages table query — reads recent message records for rate limiting',
    resource: 'sms_messages',
  },
  'pydb_hvac_agent/app/services/calendar_service.py:50:22': {
    label: 'TENANT TIMEZONE CONFIG READ',
    effect: 'READ',
    technical: 'ai_agent_configs table query — reads tenant timezone configuration',
    resource: 'ai_agent_configs',
  },
  'pydb_hvac_agent/app/services/template_schema.py:1140:18': {
    label: 'TENANT LOCATIONS READ',
    effect: 'READ',
    technical: 'locations table query — reads active tenant locations',
    resource: 'locations',
  },
  'pydb_hvac_agent/app/services/template_schema.py:1294:18': {
    label: 'AI CONFIG TEMPLATE READ',
    effect: 'READ',
    technical: 'ai_config_templates table query — reads agent configuration template data',
    resource: 'ai_config_templates',
  },
}

export interface LabeledPathLike {
  handlerRef?: string
  sinkTargetIds?: string[]
}

/**
 * Fail-soft: unmapped sinks get bounded technical wording derived from the
 * handler + sink file — never an invented business verb.
 */
export function consequenceLabelFor(p: LabeledPathLike): ConsequenceLabel {
  const sink = p.sinkTargetIds?.[0]
  if (sink && SINK_LABELS[sink]) return SINK_LABELS[sink]
  const file = sink?.split('/').pop()?.split(':')[0] ?? 'unknown resource'
  return {
    label: 'INVOCABLE OPERATION',
    effect: 'INVOKE',
    technical: `${p.handlerRef ?? 'handler'} reaches ${file} — effect semantics not individually mapped`,
    resource: file,
  }
}
