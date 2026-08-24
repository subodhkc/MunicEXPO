/**
 * U5 B14/B20 — Control Evidence Set Builder
 *
 * Builds an exact Evidence Set for a claim evaluation.
 * Each member has an explicit role and epistemic class.
 * Produces a deterministic set digest.
 */

import { createHash } from 'crypto';
import {
  ControlClaimDefinition,
  ControlEvidenceSet,
  ControlEvidenceSetMember,
  EvidenceMemberRole,
  ExclusionReason,
  EpistemicClass,
} from './types';
import { classifyEvidence, isSelfReportedClass, isExternalClass } from './epistemic-classifier';

/**
 * Projected evidence row — minimal shape needed for evidence set building.
 */
export interface ProjectedEvidence {
  id: string;
  sourceType: string;
  sourceId: string | null;
  evidenceType: string;
  metadata: Record<string, unknown> | null;
  evidenceDate: Date;
  status: string;
  contentHash?: string | null;
  findings?: unknown[];
  coverageStatus?: string;
  producerOutcome?: string;
}

/**
 * Build a Control Evidence Set for a claim.
 *
 * Evaluates each piece of evidence against the claim's requirements
 * and assigns a role: SUPPORTING, CONTRADICTING, CONTEXT_ONLY, or EXCLUDED.
 */
export function buildControlEvidenceSet(params: {
  claim: ControlClaimDefinition;
  evidence: ProjectedEvidence[];
  evaluationSnapshotAt: Date;
}): ControlEvidenceSet {
  const { claim, evidence, evaluationSnapshotAt } = params;
  const members: ControlEvidenceSetMember[] = [];

  for (const ev of evidence) {
    const epistemicClass = classifyEvidence({
      sourceType: ev.sourceType,
      evidenceType: ev.evidenceType,
      metadata: ev.metadata,
    });

    const role = determineMemberRole(claim, ev, epistemicClass, evaluationSnapshotAt);
    const member: ControlEvidenceSetMember = {
      evidenceId: ev.id,
      role: role.role,
      epistemicClass,
      producerId: ev.sourceType,
      contentHash: ev.contentHash ?? undefined,
    };

    if (role.role === 'EXCLUDED' && role.exclusionReason) {
      member.exclusionReason = role.exclusionReason;
    }

    members.push(member);
  }

  // Sort members by evidenceId for deterministic digest
  members.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  const setDigest = computeEvidenceSetDigest(claim.claimKey, claim.version, members);

  return {
    claimKey: claim.claimKey,
    claimVersion: claim.version,
    members,
    setDigest,
  };
}

/**
 * Determine the role of a piece of evidence for a claim.
 */
function determineMemberRole(
  claim: ControlClaimDefinition,
  ev: ProjectedEvidence,
  epistemicClass: EpistemicClass,
  evaluationSnapshotAt: Date
): { role: EvidenceMemberRole; exclusionReason?: ExclusionReason } {
  // EXCLUDED: After snapshot
  if (ev.evidenceDate > evaluationSnapshotAt) {
    return { role: 'EXCLUDED', exclusionReason: 'AFTER_SNAPSHOT' };
  }

  // EXCLUDED: Inactive evidence
  if (ev.status !== 'active') {
    return { role: 'EXCLUDED', exclusionReason: 'NOT_RELEVANT_TO_CLAIM' };
  }

  // EXCLUDED: Self-reported when not allowed
  if (isSelfReportedClass(epistemicClass) && !claim.selfReportedCanSupport) {
    return { role: 'EXCLUDED', exclusionReason: 'SELF_REPORTED_NOT_ALLOWED' };
  }

  // EXCLUDED: External-only when not allowed
  if (isExternalClass(epistemicClass) && !claim.externalCanSupportAlone) {
    // External evidence can still be CONTEXT_ONLY
    return { role: 'CONTEXT_ONLY' };
  }

  // EXCLUDED: Stale evidence
  if (claim.maxEvidenceAgeDays !== null) {
    const ageMs = evaluationSnapshotAt.getTime() - ev.evidenceDate.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > claim.maxEvidenceAgeDays) {
      return { role: 'EXCLUDED', exclusionReason: 'STALE' };
    }
  }

  // EXCLUDED: Producer failed
  if (ev.producerOutcome === 'FAILED' || ev.producerOutcome === 'TIMEOUT' || ev.producerOutcome === 'ERROR') {
    return { role: 'EXCLUDED', exclusionReason: 'PRODUCER_FAILED' };
  }

  // EXCLUDED: Coverage insufficient
  if (claim.coverageRequirement !== null && ev.coverageStatus === 'UNKNOWN') {
    return { role: 'EXCLUDED', exclusionReason: 'COVERAGE_INSUFFICIENT' };
  }

  // Check if evidence has contradicting findings
  const rawFindings = Array.isArray(ev.findings) ? ev.findings : [];
  const findings = rawFindings as Array<{ ruleId?: string; severity?: string }>;
  const hasContradictingFinding = findings.some(f =>
    claim.contradictionConditions.some(cond => {
      const fRule = (f.ruleId ?? '').toLowerCase()
      const condLower = cond.toLowerCase()
      // Match exact, with dashes, or with underscores
      return fRule === condLower ||
        fRule === condLower.replace(/_/g, '-') ||
        fRule === condLower.replace(/-/g, '_') ||
        fRule.includes(condLower) ||
        fRule.includes(condLower.replace(/_/g, '-')) ||
        fRule.includes(condLower.replace(/-/g, '_'))
    })
  );

  if (hasContradictingFinding) {
    return { role: 'CONTRADICTING' };
  }

  // Check if this evidence class is acceptable for the claim
  if (claim.acceptableEvidenceClasses.includes(epistemicClass)) {
    // Configuration/inventory/derived evidence is not findings-based.
    // Its presence IS the evidence — zero findings is normal.
    const isFindingsBased = epistemicClass === 'HAIEC_NATIVE_TECHNICAL' ||
      epistemicClass === 'EXTERNAL_TECHNICAL' || epistemicClass === 'RUNTIME_EMPIRICAL';

    // Check coverage requirement
    if (claim.coverageRequirement !== null && ev.coverageStatus === 'PARTIAL') {
      // Partial coverage evidence is CONTEXT_ONLY unless it has zero findings
      if (findings.length === 0 && claim.zeroFindingsCanSupport) {
        return { role: 'SUPPORTING' };
      }
      return { role: 'CONTEXT_ONLY' };
    }

    // Zero findings handling
    if (findings.length === 0) {
      if (!isFindingsBased) {
        // Configuration/inventory/derived: presence IS the evidence
        return { role: 'SUPPORTING' };
      }
      if (claim.zeroFindingsCanSupport && ev.coverageStatus === 'COMPLETE') {
        return { role: 'SUPPORTING' };
      }
      if (!claim.zeroFindingsCanSupport) {
        return { role: 'CONTEXT_ONLY' };
      }
      // Zero findings with unknown coverage → CONTEXT_ONLY (not SUPPORTING)
      if (ev.coverageStatus === 'UNKNOWN' || !ev.coverageStatus) {
        return { role: 'CONTEXT_ONLY' };
      }
    }

    // Evidence with findings that don't contradict → still supporting if findings are non-blocking
    return { role: 'SUPPORTING' };
  }

  // Not in acceptable classes → context only
  return { role: 'CONTEXT_ONLY' };
}

/**
 * B20: Compute deterministic Evidence Set digest.
 * Commits to: claim key/version, methodology, ordered member IDs, content hashes, roles.
 */
export function computeEvidenceSetDigest(
  claimKey: string,
  claimVersion: string,
  members: ControlEvidenceSetMember[]
): string {
  const digestInput = {
    claimKey,
    claimVersion,
    members: members.map(m => ({
      id: m.evidenceId,
      role: m.role,
      hash: m.contentHash ?? '',
      class: m.epistemicClass,
      exclusion: m.exclusionReason ?? '',
    })),
  };

  // Canonical sorted JSON
  const canonical = JSON.stringify(digestInput, Object.keys(digestInput).sort());

  return createHash('sha256').update(canonical).digest('hex');
}
