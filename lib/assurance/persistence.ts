/**
 * E1 Closure Sections 4, 13, 28 — Assurance Persistence Service
 *
 * Section 4: Methodology 1.1 AssuranceEvaluation must durably record:
 *   profileId, profileVersion, profileDigest, effective rulePackVersions,
 *   effective claimPackVersions, operatingEnvelopeId/Version/Digest,
 *   operatingEnvelopeState/approval reference.
 *
 * Section 13: Persist the effective five-plane/capability comparison result
 *   associated with methodology 1.1 evaluation.
 *
 * Section 28: Tenant safety — all records carry organizationId, no cross-org access.
 *
 * A13: Idempotency distinguishes same-input vs changed-input conflict.
 * A14: All lookup/idempotency checks include authoritative tenant ownership.
 * B31: Tenant-scoped — all records carry organizationId.
 */

import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma';
import {
  AssuranceEvaluation,
  AssuranceEvaluationV1_1,
  AssurancePlane,
  ClaimEvaluationResult,
  PersistenceResult,
  PersistedFivePlaneResult,
  PlaneAvailability,
  deriveFivePlaneComparisonState,
  ASSURANCE_METHODOLOGY_VERSION_1_1,
} from './types';
import { EvaluatedScopeSnapshot } from './u6-types';
import { persistEvaluatedScope } from './scope-persistence';

/**
 * Persist an Assurance Evaluation to the database.
 *
 * G3-R1: The Evaluated Scope snapshot MUST be provided for new evaluations.
 * The scope and evaluation are persisted atomically in ONE transaction.
 * If scope persistence fails, the evaluation persistence rolls back.
 * If evaluation persistence fails, the scope persistence rolls back.
 * NEW evaluations without scope are NOT allowed (fail closed).
 *
 * A13: Idempotency/conflict semantics:
 *   - same run + same methodology + same inputHash → IDEMPOTENT (return existing)
 *   - same run + same methodology + different inputHash → CONFLICT (fail closed, do NOT overwrite)
 *   - no existing → CREATE
 *
 * Section 4: Methodology 1.1 rows record profile/envelope identities in
 * `assurance_evaluation_profile_bindings`.
 * Historical methodology 1.0 rows remain valid with null profile fields.
 */
export async function persistAssuranceEvaluation(
  evaluation: AssuranceEvaluation,
  scopeSnapshot: EvaluatedScopeSnapshot, // G3-R1: REQUIRED for new evaluations
): Promise<PersistenceResult> {
  // A14: Check for existing evaluation WITH tenant ownership
  const existing = await prisma.assurance_evaluations.findFirst({
    where: {
      orchestratorRunId: evaluation.orchestratorRunId,
      assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
      organizationId: evaluation.organizationId, // A14: tenant safety
    },
    select: { id: true, inputHash: true, outputHash: true },
  });

  if (existing) {
    // A13: Check inputHash to distinguish idempotent from conflict
    if (existing.inputHash === evaluation.inputHash) {
      // Same input → IDEMPOTENT
      return { status: 'IDEMPOTENT', id: existing.id };
    }
    // A13: Different input → CONFLICT (fail closed, do NOT overwrite)
    return {
      status: 'CONFLICT',
      id: existing.id,
      conflictReason: 'ASSURANCE_EVALUATION_INPUT_CONFLICT',
    };
  }

  // G3-R1: Create evaluation + scope atomically in ONE transaction.
  // Scope capture already happened BEFORE U5 (in the API route).
  // If scope persistence fails → evaluation rolls back.
  // If evaluation persistence fails → scope rolls back.
  // NEW_EVALUATION_WITHOUT_SCOPE_ALLOWED = NO.
  const result = await prisma.$transaction(async (tx: any) => {
    const evalRecord = await tx.assurance_evaluations.create({
      data: {
        id: evaluation.id,
        organizationId: evaluation.organizationId,
        aiSystemId: evaluation.aiSystemId,
        orchestratorRunId: evaluation.orchestratorRunId,
        pipelineAggregationId: evaluation.pipelineAggregationId,
        assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
        evaluationSnapshotAt: evaluation.evaluationSnapshotAt,
        disposition: evaluation.disposition,
        evaluationStatus: evaluation.evaluationStatus,
        claimCounts: evaluation.claimCounts as any,
        reasonCodes: evaluation.reasonCodes as any,
        evidenceSetDigest: evaluation.evidenceSetDigest,
        inputHash: evaluation.inputHash,
        outputHash: evaluation.outputHash,
      },
    });

    // G3-R1: Persist scope in the SAME transaction (atomic).
    // Uses the transaction client, not a separate prisma call.
    await persistEvaluatedScope(
      scopeSnapshot,
      evaluation.id,
      tx, // transaction client
    );

    // Section 4: Persist 1.1 profile/envelope binding
    if (isV1_1(evaluation)) {
      const v1_1 = evaluation as AssuranceEvaluationV1_1;
      await tx.assurance_evaluation_profile_bindings.create({
        data: {
          assuranceEvaluationId: evalRecord.id,
          organizationId: evaluation.organizationId,
          profileId: v1_1.profileId,
          profileVersion: v1_1.profileVersion,
          profileDigest: v1_1.profileDigest,
          profileDigestResolved: v1_1.profileDigestResolved ?? v1_1.profileDigest ?? null,
          claimPackVersions: v1_1.claimPackVersions as any,
          rulePackVersions: v1_1.rulePackVersions as any,
          operatingEnvelopeId: v1_1.operatingEnvelopeId ?? null,
          operatingEnvelopeVersion: v1_1.operatingEnvelopeVersion ?? null,
          operatingEnvelopeDigest: v1_1.operatingEnvelopeDigest ?? null,
          operatingEnvelopeState: v1_1.operatingEnvelopeState ?? null,
          operatingEnvelopeApprovedBy: v1_1.operatingEnvelopeApprovedBy ?? null,
          operatingEnvelopeApprovedAt: v1_1.operatingEnvelopeApprovedAt ?? null,
          operatingEnvelopeAuthoritySourceLabel: v1_1.operatingEnvelopeAuthoritySourceLabel ?? null,
          operatingEnvelopeApprovalReference: v1_1.operatingEnvelopeApprovalReference ?? null,
          syntheticClassification: v1_1.syntheticClassification ?? null,
          // Section 13: Persist five-plane comparison as concise JSON
          fivePlaneResult: buildPersistedFivePlaneResult(v1_1) as any,
          applicableClaimKeys: (v1_1.applicableClaimKeys ?? []) as any,
          // Defect 5: Persist buildBinding if supplied (supported contract, currently not populated)
          buildBinding: (v1_1 as any).buildBinding ?? null,
        },
      });
    }

    for (const claimResult of evaluation.claimResults) {
      const claimEval = await tx.control_claim_evaluations.create({
        data: {
          id: nanoid(),
          assuranceEvaluationId: evalRecord.id,
          organizationId: evaluation.organizationId,
          claimKey: claimResult.claimKey,
          claimVersion: claimResult.claimVersion,
          claimState: claimResult.claimState,
          reasonCodes: claimResult.reasonCodes as any,
          dimensionResult: claimResult.dimensionResult as any,
          supportingCount: claimResult.supportingCount,
          contradictingCount: claimResult.contradictingCount,
          excludedCount: claimResult.excludedCount,
          explanation: claimResult.explanation,
          evidenceSetDigest: claimResult.evidenceSet.setDigest,
        },
      });

      const evidenceSet = await tx.control_evidence_sets.create({
        data: {
          id: nanoid(),
          controlClaimEvaluationId: claimEval.id,
          organizationId: evaluation.organizationId,
          claimKey: claimResult.claimKey,
          claimVersion: claimResult.claimVersion,
          setDigest: claimResult.evidenceSet.setDigest,
        },
      });

      for (const member of claimResult.evidenceSet.members) {
        await tx.control_evidence_set_members.create({
          data: {
            id: nanoid(),
            controlEvidenceSetId: evidenceSet.id,
            organizationId: evaluation.organizationId,
            evidenceId: member.evidenceId,
            role: member.role,
            epistemicClass: member.epistemicClass,
            producerId: member.producerId,
            exclusionReason: member.exclusionReason ?? null,
            contentHash: member.contentHash ?? null,
          },
        });
      }
    }

    return evalRecord;
  });

  return { status: 'CREATED', id: result.id };
}

/**
 * Section 13: Build concise five-plane result JSON for persistence.
 */
function buildDefaultPlaneAvailability(): PlaneAvailability[] {
  const planes: AssurancePlane[] = ['REQUESTED', 'POLICY_AUTHORIZED', 'EFFECTIVELY_GRANTED', 'CODE_CAPABLE', 'OBSERVED'];
  return planes.map(plane => ({
    plane,
    status: 'NOT_PROVIDED',
    coverage: 'UNKNOWN',
    basis: 'UNKNOWN',
    sourceEvidenceIds: [],
    explanation: 'Plane not evaluated',
  }));
}

function buildPersistedFivePlaneResult(evaluation: AssuranceEvaluationV1_1): PersistedFivePlaneResult | null {
  const comparisons = evaluation.fivePlaneComparisons ?? [];

  const capFacts = evaluation.capabilityFacts ?? {
    requested: [],
    policy: [],
    granted: [],
    capable: [],
    observed: [],
  };

  return {
    comparisons: comparisons.map(c => ({
      capabilityKey: c.capabilityKey,
      comparisons: c.comparisons,
      mappedClaimKey: c.mappedClaimKey,
      verdict: c.verdict,
      evidenceIds: c.evidenceIds,
      planes: {
        requested: c.requested,
        policyAuthorized: c.policyAuthorized,
        effectivelyGranted: c.effectivelyGranted,
        codeCapable: c.codeCapable,
        observed: c.observed,
      },
    })),
    planeAvailability: evaluation.planeAvailability ?? buildDefaultPlaneAvailability(),
    capabilityFacts: capFacts,
    // FP-EMPTY-1: explicit comparison availability; zero comparisons has no verdict.
    comparisonState: evaluation.fivePlaneComparisonState ?? deriveFivePlaneComparisonState({
      comparisons,
      planeAvailability: evaluation.planeAvailability,
    }),
    overallVerdict: comparisons.length > 0 ? (evaluation.fivePlaneOverallVerdict ?? 'REVIEW') : null,
  };
}

function isV1_1(evaluation: AssuranceEvaluation): boolean {
  return (evaluation as AssuranceEvaluationV1_1).assuranceMethodologyVersion === ASSURANCE_METHODOLOGY_VERSION_1_1;
}

/**
 * Retrieve an Assurance Evaluation by orchestrator run ID.
 * A14: organizationId is required for tenant safety.
 */
export async function getAssuranceEvaluation(
  orchestratorRunId: string,
  organizationId: string
): Promise<AssuranceEvaluation | null> {
  const record = await prisma.assurance_evaluations.findFirst({
    where: { orchestratorRunId, organizationId },
    include: {
      control_claim_evaluations: {
        include: {
          control_evidence_sets: {
            include: {
              control_evidence_set_members: true,
            },
          },
        },
      },
      assurance_evaluation_profile_bindings: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return null;

  return reconstructEvaluation(record);
}



/**
 * A15: Reconstruct an AssuranceEvaluation from DB records.
 */
function reconstructEvaluation(record: any): AssuranceEvaluation {
  const claimResults: ClaimEvaluationResult[] = record.control_claim_evaluations.map((ce: any) => ({
    claimKey: ce.claimKey,
    claimVersion: ce.claimVersion,
    claimState: ce.claimState,
    reasonCodes: ce.reasonCodes as string[],
    dimensionResult: ce.dimensionResult,
    evidenceSet: {
      claimKey: ce.claimKey,
      claimVersion: ce.claimVersion,
      setDigest: ce.evidenceSetDigest,
      members: ce.control_evidence_sets?.control_evidence_set_members?.map((m: any) => ({
        evidenceId: m.evidenceId,
        role: m.role,
        epistemicClass: m.epistemicClass,
        producerId: m.producerId,
        exclusionReason: m.exclusionReason ?? undefined,
        contentHash: m.contentHash ?? undefined,
      })) ?? [],
    },
    supportingCount: ce.supportingCount,
    contradictingCount: ce.contradictingCount,
    excludedCount: ce.excludedCount,
    explanation: ce.explanation,
  }));

  const base: AssuranceEvaluation = {
    id: record.id,
    organizationId: record.organizationId,
    aiSystemId: record.aiSystemId,
    orchestratorRunId: record.orchestratorRunId,
    pipelineAggregationId: record.pipelineAggregationId,
    assuranceMethodologyVersion: record.assuranceMethodologyVersion,
    evaluationSnapshotAt: record.evaluationSnapshotAt,
    disposition: record.disposition,
    evaluationStatus: record.evaluationStatus,
    claimResults,
    claimCounts: record.claimCounts,
    reasonCodes: record.reasonCodes,
    evidenceSetDigest: record.evidenceSetDigest,
    inputHash: record.inputHash,
    outputHash: record.outputHash,
    createdAt: record.createdAt,
  };

  // Section 4: Reconstruct 1.1 fields if binding exists
  const binding = record.assurance_evaluation_profile_bindings;
  if (binding && base.assuranceMethodologyVersion === ASSURANCE_METHODOLOGY_VERSION_1_1) {
    const v1_1: AssuranceEvaluationV1_1 = {
      ...base,
      assuranceMethodologyVersion: '1.1',
      profileId: binding.profileId,
      profileVersion: binding.profileVersion,
      profileDigest: binding.profileDigest,
      profileDigestResolved: binding.profileDigestResolved ?? binding.profileDigest ?? '',
      operatingEnvelopeId: binding.operatingEnvelopeId ?? undefined,
      operatingEnvelopeVersion: binding.operatingEnvelopeVersion ?? undefined,
      operatingEnvelopeDigest: binding.operatingEnvelopeDigest ?? undefined,
      operatingEnvelopeState: binding.operatingEnvelopeState ?? undefined,
      operatingEnvelopeApprovedBy: binding.operatingEnvelopeApprovedBy ?? undefined,
      operatingEnvelopeApprovedAt: binding.operatingEnvelopeApprovedAt ?? undefined,
      operatingEnvelopeAuthoritySourceLabel: binding.operatingEnvelopeAuthoritySourceLabel ?? undefined,
      operatingEnvelopeApprovalReference: binding.operatingEnvelopeApprovalReference ?? undefined,
      syntheticClassification: (binding.syntheticClassification as 'NONE' | 'SYNTHETIC_REFERENCE' | 'UNKNOWN' | null) ?? undefined,
      applicableClaimKeys: binding.applicableClaimKeys as string[] ?? [],
      claimPackVersions: binding.claimPackVersions as Record<string, string> ?? {},
      rulePackVersions: binding.rulePackVersions as Record<string, string> ?? {},
      // FP-EMPTY-1.1: an empty comparison set reconstructs to null verdict —
      // never a latent REVIEW/ALLOW available to future consumers.
      fivePlaneOverallVerdict: ((binding.fivePlaneResult as any)?.comparisons ?? []).length > 0
        ? ((binding.fivePlaneResult as any)?.overallVerdict ?? 'REVIEW')
        : null,
      // FP-EMPTY-1: persisted state wins; historical rows without the field
      // derive it from comparison count + plane availability.
      fivePlaneComparisonState: (binding.fivePlaneResult as any)?.comparisonState
        ?? deriveFivePlaneComparisonState({
          comparisons: (binding.fivePlaneResult as any)?.comparisons,
          planeAvailability: (binding.fivePlaneResult as any)?.planeAvailability,
        }),
      fivePlaneComparisons: (binding.fivePlaneResult as any)?.comparisons ?? [],
      planeAvailability: (binding.fivePlaneResult as any)?.planeAvailability ?? buildDefaultPlaneAvailability(),
      capabilityFacts: (binding.fivePlaneResult as any)?.capabilityFacts ?? {
        requested: [],
        policy: [],
        granted: [],
        capable: [],
        observed: [],
      },
      // Defect 5: Reconstruct buildBinding if persisted
      buildBinding: (binding as any).buildBinding ?? undefined,
    };
    return v1_1;
  }

  return base;
}

/**
 * A15: Retrieve an Assurance Evaluation by exact ID.
 *
 * Uses the same reconstructEvaluation internal as the orchestrator-run lookup
 * so the U5 contract is recovered consistently.
 */
export async function getAssuranceEvaluationById(
  evaluationId: string,
  organizationId: string
): Promise<AssuranceEvaluation | null> {
  const record = await prisma.assurance_evaluations.findUnique({
    where: { id: evaluationId, organizationId },
    include: {
      control_claim_evaluations: {
        include: {
          control_evidence_sets: {
            include: {
              control_evidence_set_members: true,
            },
          },
        },
      },
      assurance_evaluation_profile_bindings: true,
    },
  });

  if (!record) return null;

  return reconstructEvaluation(record);
}
