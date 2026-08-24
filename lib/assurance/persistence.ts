/**
 * U5 B32 — Assurance Persistence Service
 *
 * Persists Assurance Evaluation results to the database.
 * B30: Idempotent — duplicate evaluations for same run+methodology are rejected.
 * B31: Tenant-scoped — all records carry organizationId.
 */

import { prisma } from '@/lib/prisma';
import { AssuranceEvaluation, ClaimEvaluationResult } from './types';

/**
 * Persist an Assurance Evaluation to the database.
 *
 * B30: Idempotent — if an evaluation with the same orchestratorRunId + methodology
 * version already exists, return it (do not overwrite).
 */
export async function persistAssuranceEvaluation(
  evaluation: AssuranceEvaluation
): Promise<{ id: string; created: boolean; existing: boolean }> {
  // B30: Check for existing evaluation (idempotency)
  const existing = await prisma.assurance_evaluations.findFirst({
    where: {
      orchestratorRunId: evaluation.orchestratorRunId,
      assuranceMethodologyVersion: evaluation.assuranceMethodologyVersion,
    },
    select: { id: true, outputHash: true },
  });

  if (existing) {
    // B30: Do not overwrite — return existing
    return { id: existing.id, created: false, existing: true };
  }

  // Create the evaluation with all related records in a transaction
  const result = await prisma.$transaction(async (tx: any) => {
    // Create assurance evaluation
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

    // Create claim evaluations + evidence sets + members
    for (const claimResult of evaluation.claimResults) {
      const claimEval = await tx.control_claim_evaluations.create({
        data: {
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

  return { id: result.id, created: true, existing: false };
}

/**
 * Retrieve an Assurance Evaluation by orchestrator run ID.
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
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) return null;

  // Reconstruct the AssuranceEvaluation object
  return reconstructEvaluation(record);
}

/**
 * Reconstruct an AssuranceEvaluation from DB records.
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

  return {
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
}
