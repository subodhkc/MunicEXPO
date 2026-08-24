/**
 * E1 B11 — Interface Profile Compiler
 *
 * B11: Versioned, deterministic, provenance-preserving.
 *
 * Compiles an interface specification (e.g., O-RAN R1 OpenAPI, Ericsson EIAP spec)
 * into a CompiledProfile with semantically classified operations.
 *
 * Unknown operations fail to REVIEW — never ALLOW.
 *
 * Provenance: every compiled operation records its source profile ID/version.
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
export const SEMANTIC_MAPPING_VERSION = '1.0';

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
 * B11: Default semantic mapping rules.
 * These are generic — industry profiles provide additional rules.
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
 * Unknown operations → UNKNOWN_OPERATION classification (never ALLOW).
 */
export function compileProfile(params: {
  specification: InterfaceSpecification;
  sourceProfileId: string;
  sourceProfileVersion: string;
  semanticMappings?: SemanticMappingRule[];
}): CompiledProfile {
  const { specification, sourceProfileId, sourceProfileVersion } = params;
  const mappings = params.semanticMappings ?? DEFAULT_SEMANTIC_MAPPINGS;

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
 * B11: Classify an operation using semantic mapping rules.
 * Unknown operations → UNKNOWN_OPERATION (never ALLOW).
 */
function classifyOperation(
  op: InterfaceOperation,
  mappings: SemanticMappingRule[]
): { classification: OperationClassification; capabilityFamily?: CapabilityFamily } {
  for (const rule of mappings) {
    if (matchesPattern(op.operationId, rule.operationIdPattern, rule.matchType)) {
      return {
        classification: rule.classification,
        capabilityFamily: rule.capabilityFamily,
      };
    }
  }
  // B11: Unknown operation → UNKNOWN_OPERATION (fail to REVIEW, never ALLOW)
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
