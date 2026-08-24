/**
 * E1 B7 — Universal Capability Ontology
 *
 * Seed predefined capability families for HAIEC.
 * Industry profiles extend this vocabulary.
 *
 * This is universal HAIEC vocabulary — not Ericsson-specific.
 */

import { CapabilityFamily } from './types';

/**
 * B7: Predefined capability families with descriptions.
 * These are universal across all industries.
 */
export const CAPABILITY_FAMILY_DESCRIPTIONS: Record<CapabilityFamily, string> = {
  IDENTITY_PRIVILEGE: 'Identity, authentication, and privilege escalation capabilities',
  DATA_ACCESS: 'Data read, write, and access capabilities',
  RESOURCE_SCOPE: 'Resource scope and boundary capabilities',
  TOOL_ACTION_EXECUTION: 'Tool and action execution capabilities',
  CONFIGURATION_ACTUATION: 'Configuration read and write actuation',
  MODEL_LIFECYCLE: 'AI/ML model discover, register, train, deploy, and retire',
  RAG_CONTEXT_MEMORY: 'RAG context, memory, and retrieval capabilities',
  INTER_AGENT_COMMUNICATION: 'Inter-agent and multi-agent communication',
  EXTERNAL_EGRESS: 'External network egress and callback capabilities',
  PERSISTENCE: 'Data persistence and storage capabilities',
  SUPPLY_CHAIN: 'Supply chain, SBOM, and artifact integrity',
  HUMAN_AUTHORITY: 'Human authority, approval, and override capabilities',
  RESILIENCE: 'Resilience, fault tolerance, and conflict detection',
  OBSERVABILITY: 'Observability, audit, and trace capabilities',
  PRIVACY_RESIDENCY: 'Privacy, data residency, and jurisdictional constraints',
  CHANGE_RELEASE: 'Change management and release deployment',
};

/**
 * All capability families as an ordered list.
 */
export const ALL_CAPABILITY_FAMILIES = Object.keys(CAPABILITY_FAMILY_DESCRIPTIONS) as CapabilityFamily[];

/**
 * Check if a string is a valid capability family.
 */
export function isCapabilityFamily(value: string): value is CapabilityFamily {
  return value in CAPABILITY_FAMILY_DESCRIPTIONS;
}
