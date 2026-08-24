/**
 * E1 Closure Section 21 — Interface Profile Compiler
 *
 * B11: Versioned, deterministic, provenance-preserving.
 *
 * Compiles an interface specification (e.g., O-RAN R1 OpenAPI, Ericsson EIAP spec)
 * into a CompiledProfile with semantically classified operations.
 *
 * Section 21: For known O-RAN profile operations, use EXACT_PROFILE_MAPPING first.
 *   registerCallback must NOT become MODEL_LIFECYCLE.
 *   subscribeData must NOT automatically mean RAG memory.
 *   Generic prefix classifications remain GENERATED_CLASSIFICATION and result in REVIEW.
 *
 * Unknown operations → REVIEW, never ALLOW.
 * Provenance: every compiled operation records source profile ID/version.
 */

import {
  CompiledProfile,
  CompiledOperation,
  OperationClassification,
  CapabilityFamily,
} from './types';
import { canonicalSerialize } from '@/lib/evidence/deterministic-serialization';
import { hashTextContent } from '@/lib/evidence/crypto-hash';
import { isCapabilityFamily } from './capability-ontology';

export const PROFILE_COMPILER_VERSION = '1.0';
export const SEMANTIC_MAPPING_VERSION = '1.1'; // E1 Closure — exact O-RAN mappings

/**
 * B11: Input interface specification operation.
 */
export interface InterfaceOperation {
  operationId: string;
  method: string;
  routeTemplate: string;
  schemaIdentities?: string[];
  securityDeclarations?: string[];
  callbacks?: string[];
}

/**
 * B11: Input interface specification.
 */
export interface InterfaceSpecification {
  specificationId: string;
  specificationVersion: string;
  specificationDigest: string;
  operations: InterfaceOperation[];
}

/**
 * B11: Semantic mapping rule — maps an operation to a capability family.
 *
 * Section 21: EXACT matches for known O-RAN operations.
 */
export interface SemanticMappingRule {
  /** Pattern to match against operationId (exact or prefix) */
  operationIdPattern: string;
  /** Match type */
  matchType: 'EXACT' | 'PREFIX' | 'REGEX';
  /** Capability family to assign */
  capabilityFamily: CapabilityFamily;
  /** Classification strength */
  classification: OperationClassification;
}

/**
 * Section 21: Exact O-RAN semantic mappings first.
 * Generic prefix classifications remain GENERATED_CLASSIFICATION.
 *
 * Examples:
 *   registerCallback must NOT become model lifecycle
 *   subscribeData must NOT automatically mean RAG memory
 */
export const ORAN_R1_SEMANTIC_MAPPINGS: SemanticMappingRule[] = [
  // Exact O-RAN R1 v11.00 mappings
  { operationIdPattern: 'listServices', matchType: 'EXACT', capabilityFamily: 'DATA_ACCESS', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'createService', matchType: 'EXACT', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'deleteService', matchType: 'EXACT', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'getPolicy', matchType: 'EXACT', capabilityFamily: 'DATA_ACCESS', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'createPolicy', matchType: 'EXACT', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'updatePolicy', matchType: 'EXACT', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'deletePolicy', matchType: 'EXACT', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'subscribeData', matchType: 'EXACT', capabilityFamily: 'RAG_CONTEXT_MEMORY', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'unsubscribeData', matchType: 'EXACT', capabilityFamily: 'RAG_CONTEXT_MEMORY', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'registerData', matchType: 'EXACT', capabilityFamily: 'DATA_ACCESS', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'discoverData', matchType: 'EXACT', capabilityFamily: 'DATA_ACCESS', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'readData', matchType: 'EXACT', capabilityFamily: 'DATA_ACCESS', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'deployModel', matchType: 'EXACT', capabilityFamily: 'MODEL_LIFECYCLE', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'retireModel', matchType: 'EXACT', capabilityFamily: 'MODEL_LIFECYCLE', classification: 'EXACT_PROFILE_MAPPING' },
  // Section 21: registerCallback is EXTERNAL_EGRESS, not MODEL_LIFECYCLE
  { operationIdPattern: 'registerCallback', matchType: 'EXACT', capabilityFamily: 'EXTERNAL_EGRESS', classification: 'EXACT_PROFILE_MAPPING' },
  { operationIdPattern: 'unregisterCallback', matchType: 'EXACT', capabilityFamily: 'EXTERNAL_EGRESS', classification: 'EXACT_PROFILE_MAPPING' },
];

/**
 * B11: Generic default semantic mapping rules.
 * These are GENERATED_CLASSIFICATION — result in REVIEW until confirmed.
 */
export const DEFAULT_SEMANTIC_MAPPINGS: SemanticMappingRule[] = [
  // Read operations
  { operationIdPattern: 'get', matchType: 'PREFIX', capabilityFamily: 'DATA_ACCESS', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'list', matchType: 'PREFIX', capabilityFamily: 'DATA_ACCESS', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'read', matchType: 'PREFIX', capabilityFamily: 'DATA_ACCESS', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'query', matchType: 'PREFIX', capabilityFamily: 'DATA_ACCESS', classification: 'GENERATED_CLASSIFICATION' },
  // Write operations
  { operationIdPattern: 'create', matchType: 'PREFIX', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'update', matchType: 'PREFIX', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'delete', matchType: 'PREFIX', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'write', matchType: 'PREFIX', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'modify', matchType: 'PREFIX', capabilityFamily: 'CONFIGURATION_ACTUATION', classification: 'GENERATED_CLASSIFICATION' },
  // Deploy/register
  { operationIdPattern: 'deploy', matchType: 'PREFIX', capabilityFamily: 'MODEL_LIFECYCLE', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'register', matchType: 'PREFIX', capabilityFamily: 'MODEL_LIFECYCLE', classification: 'GENERATED_CLASSIFICATION' },
  // Subscribe/publish
  { operationIdPattern: 'subscribe', matchType: 'PREFIX', capabilityFamily: 'RAG_CONTEXT_MEMORY', classification: 'GENERATED_CLASSIFICATION' },
  { operationIdPattern: 'publish', matchType: 'PREFIX', capabilityFamily: 'EXTERNAL_EGRESS', classification: 'GENERATED_CLASSIFICATION' },
];

/**
 * B11: Compile an interface specification into a CompiledProfile.
 *
 * Deterministic: same input → same output.
 * Provenance-preserving: every operation records source profile ID/version.
 * Unknown operations → UNKNOWN_OPERATION (never ALLOW).
 *
 * Section 21: Use exact O-RAN mappings first, then generic prefix mappings.
 */
export function compileProfile(params: {
  specification: InterfaceSpecification;
  sourceProfileId: string;
  sourceProfileVersion: string;
  semanticMappings?: SemanticMappingRule[];
}): CompiledProfile {
  const { specification, sourceProfileId, sourceProfileVersion } = params;
  // Section 21: exact mappings first, then generic fallbacks
  const exactMappings = ORAN_R1_SEMANTIC_MAPPINGS.filter(m => m.classification === 'EXACT_PROFILE_MAPPING');
  const genericMappings = DEFAULT_SEMANTIC_MAPPINGS.filter(m => m.classification === 'GENERATED_CLASSIFICATION');
  const userMappings = params.semanticMappings ?? [];
  const mappings = [...exactMappings, ...userMappings, ...genericMappings];

  const operations: CompiledOperation[] = specification.operations.map(op => {
    const classification = classifyOperation(op, mappings);
    return {
      operationId: op.operationId,
      method: op.method,
      routeTemplate: op.routeTemplate,
      schemaIdentities: op.schemaIdentities,
      securityDeclarations: op.securityDeclarations,
      callbacks: op.callbacks,
      semanticClassification: classification.classification,
      capabilityFamily: classification.capabilityFamily,
      sourceProfileId,
      sourceProfileVersion,
    };
  });

  // Sort operations by operationId for deterministic digest
  operations.sort((a, b) => a.operationId.localeCompare(b.operationId));

  const profileDigestInput = {
    profileId: sourceProfileId,
    profileVersion: sourceProfileVersion,
    sourceSpecificationId: specification.specificationId,
    sourceSpecificationVersion: specification.specificationVersion,
    sourceSpecDigest: specification.specificationDigest,
    compilerVersion: PROFILE_COMPILER_VERSION,
    semanticMappingVersion: SEMANTIC_MAPPING_VERSION,
    operations,
  };

  const canonical = canonicalSerialize(profileDigestInput, new Set(['operations']));
  const profileDigest = hashTextContent(canonical);

  return {
    profileId: sourceProfileId,
    profileVersion: sourceProfileVersion,
    sourceSpecificationId: specification.specificationId,
    sourceSpecificationVersion: specification.specificationVersion,
    sourceSpecDigest: specification.specificationDigest,
    compilerVersion: PROFILE_COMPILER_VERSION,
    semanticMappingVersion: SEMANTIC_MAPPING_VERSION,
    operations,
    profileDigest,
  };
}

/**
 * B11 / Section 21: Classify an operation using semantic mapping rules.
 * Exact mappings are checked first. Unknown operations → UNKNOWN_OPERATION.
 */
function classifyOperation(
  op: InterfaceOperation,
  mappings: SemanticMappingRule[]
): { classification: OperationClassification; capabilityFamily?: CapabilityFamily } {
  // Try EXACT matches first
  const exactMatch = mappings.find(rule =>
    rule.classification === 'EXACT_PROFILE_MAPPING' &&
    matchesPattern(op.operationId, rule.operationIdPattern, rule.matchType)
  );
  if (exactMatch) {
    return {
      classification: exactMatch.classification,
      capabilityFamily: exactMatch.capabilityFamily,
    };
  }

  // Then any other mapping
  for (const rule of mappings) {
    if (matchesPattern(op.operationId, rule.operationIdPattern, rule.matchType)) {
      return {
        classification: rule.classification,
        capabilityFamily: rule.capabilityFamily,
      };
    }
  }

  // Unknown operation → UNKNOWN_OPERATION (fail to REVIEW, never ALLOW)
  return { classification: 'UNKNOWN_OPERATION' };
}

function matchesPattern(
  operationId: string,
  pattern: string,
  matchType: 'EXACT' | 'PREFIX' | 'REGEX'
): boolean {
  const opLower = operationId.toLowerCase();
  const patternLower = pattern.toLowerCase();
  switch (matchType) {
    case 'EXACT':
      return opLower === patternLower;
    case 'PREFIX':
      return opLower.startsWith(patternLower);
    case 'REGEX':
      try {
        return new RegExp(pattern, 'i').test(operationId);
      } catch {
        return false;
      }
    default:
      return false;
  }
}
