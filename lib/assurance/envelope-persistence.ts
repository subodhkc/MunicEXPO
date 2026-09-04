/**
 * E1 Closure Section 5 — Operating Envelope Persistence Service
 *
 * Persistent, tenant-owned operating envelopes with versioning.
 *
 * States: DRAFT, APPROVED, SUPERSEDED, REVOKED.
 * APPROVED envelopes are immutable — any semantic modification creates a new version.
 * Do not overwrite approved history.
 *
 * Section 28: Tenant safety — no cross-org envelope can evaluate another tenant's run.
 */

import { prisma } from '@/lib/prisma';
import {
  OperatingEnvelope,
  OperatingEnvelopeConstraints,
  OperatingEnvelopeState,
} from './types';
import { computeEnvelopeDigest } from './operating-envelope';

/**
 * Persist a DRAFT envelope to the database.
 * Returns the persisted envelope with real createdAt.
 *
 * LOCK: Only DRAFT envelopes may be persisted through this helper.
 * Non-DRAFT state is rejected to prevent accidental creation of
 * APPROVED/SUPERSEDED/REVOKED rows through the DRAFT persistence path.
 */
export async function persistDraftEnvelope(envelope: OperatingEnvelope): Promise<OperatingEnvelope> {
  if (envelope.state !== 'DRAFT') {
    throw new Error(`persistDraftEnvelope cannot persist envelope in state ${envelope.state} — only DRAFT is allowed`);
  }
  const record = await (prisma as any).operating_envelopes.create({
    data: {
      envelopeId: envelope.envelopeId,
      envelopeVersion: envelope.envelopeVersion,
      organizationId: envelope.organizationId,
      aiSystemId: envelope.aiSystemId,
      profileId: envelope.profileId,
      profileVersion: envelope.profileVersion,
      state: envelope.state,
      constraints: envelope.constraints as any,
      envelopeDigest: envelope.envelopeDigest,
      authoritySourceLabel: envelope.authoritySourceLabel ?? null,
    },
  });

  return {
    ...envelope,
    createdAt: record.createdAt,
  };
}

/**
 * Section 5/15: Approve a DRAFT envelope in the database.
 * Atomic transaction:
 *   - verify v2 is still DRAFT and owned by tenant
 *   - mark prior APPROVED version SUPERSEDED
 *   - mark v2 APPROVED and record approval identity
 * This prevents an authorization gap where the prior envelope is invalidated
 * before the new envelope has been approved.
 */
export async function approveEnvelopeInDb(
  envelopeId: string,
  envelopeVersion: string,
  organizationId: string,
  approvedBy: string,
  approvedAt: Date,
  approvalReference?: string,
): Promise<OperatingEnvelope | null> {
  return await prisma.$transaction(async (tx: any) => {
    // Verify ownership and current state of the draft to approve
    const draft = await tx.operating_envelopes.findFirst({
      where: {
        envelopeId,
        envelopeVersion,
        organizationId, // Section 28: tenant safety
      },
    });

    if (!draft) return null;
    if (draft.state !== 'DRAFT') {
      throw new Error(`Cannot approve envelope in state ${draft.state}`);
    }

    // Supersede the currently APPROVED version (if any) for the same envelope
    const priorApproved = await tx.operating_envelopes.findFirst({
      where: {
        envelopeId,
        organizationId,
        state: 'APPROVED',
      },
    });

    if (priorApproved) {
      await tx.operating_envelopes.update({
        where: { id: priorApproved.id },
        data: { state: 'SUPERSEDED' },
      });
    }

    const updated = await tx.operating_envelopes.update({
      where: { id: draft.id },
      data: {
        state: 'APPROVED',
        approvedBy,
        approvedAt,
        approvalReference: approvalReference ?? null,
      },
    });

    return dbRecordToEnvelope(updated);
  });
}

/**
 * Section 5/15: Create a new version of an envelope.
 * The prior APPROVED version stays APPROVED. The new version is DRAFT.
 * Supersession of the prior version happens only when this DRAFT is later approved.
 * Does NOT overwrite approved history.
 */
export async function createNewEnvelopeVersionInDb(
  envelopeId: string,
  currentVersion: string,
  organizationId: string,
  newConstraints: OperatingEnvelopeConstraints,
): Promise<OperatingEnvelope | null> {
  // Verify ownership and current state
  const existing = await (prisma as any).operating_envelopes.findFirst({
    where: {
      envelopeId,
      envelopeVersion: currentVersion,
      organizationId, // Section 28: tenant safety
    },
  });

  if (!existing) return null;
  if (existing.state !== 'APPROVED') {
    throw new Error(`Cannot version envelope in state ${existing.state} — only APPROVED can be superseded`);
  }

  // Parse current version and increment (Section 16: numeric ordering)
  const currentVersionNum = parseInt(currentVersion, 10) || 1;
  const newVersionNum = currentVersionNum + 1;
  const newVersionStr = String(newVersionNum);

  // Compute new digest
  const newDraft: Omit<OperatingEnvelope, 'envelopeDigest'> = {
    envelopeId,
    envelopeVersion: newVersionStr,
    organizationId,
    aiSystemId: existing.aiSystemId,
    state: 'DRAFT',
    profileId: existing.profileId,
    profileVersion: existing.profileVersion,
    constraints: newConstraints,
    createdAt: new Date(0),
    authoritySourceLabel: existing.authoritySourceLabel,
  };
  const newDigest = computeEnvelopeDigest(newDraft);

  const newRecord = await (prisma as any).operating_envelopes.create({
    data: {
      envelopeId,
      envelopeVersion: newVersionStr,
      organizationId,
      aiSystemId: existing.aiSystemId,
      profileId: existing.profileId,
      profileVersion: existing.profileVersion,
      state: 'DRAFT',
      constraints: newConstraints as any,
      envelopeDigest: newDigest,
      authoritySourceLabel: existing.authoritySourceLabel ?? null,
    },
  });

  return dbRecordToEnvelope(newRecord);
}

/**
 * Revoke an APPROVED envelope.
 */
export async function revokeEnvelopeInDb(
  envelopeId: string,
  envelopeVersion: string,
  organizationId: string,
): Promise<OperatingEnvelope | null> {
  const existing = await (prisma as any).operating_envelopes.findFirst({
    where: {
      envelopeId,
      envelopeVersion,
      organizationId, // Section 28: tenant safety
    },
  });

  if (!existing) return null;
  if (existing.state !== 'APPROVED') {
    throw new Error(`Cannot revoke envelope in state ${existing.state}`);
  }

  const updated = await (prisma as any).operating_envelopes.update({
    where: { id: existing.id },
    data: { state: 'REVOKED' },
  });

  return dbRecordToEnvelope(updated);
}

/**
 * Get the latest APPROVED envelope for an org + AI system.
 * Section 6: Only APPROVED envelope may provide POLICY_AUTHORIZED evidence.
 * Section 16: Numeric version ordering — do not rely on lexical string ordering.
 */
export async function getApprovedEnvelope(
  organizationId: string,
  aiSystemId: string,
): Promise<OperatingEnvelope | null> {
  const records = await (prisma as any).operating_envelopes.findMany({
    where: {
      organizationId, // Section 28: tenant safety
      aiSystemId,
      state: 'APPROVED',
    },
  });

  if (records.length === 0) return null;

  const sorted = records.sort((a: any, b: any) => {
    const aNum = parseInt(a.envelopeVersion, 10) || 0;
    const bNum = parseInt(b.envelopeVersion, 10) || 0;
    return bNum - aNum;
  });

  return dbRecordToEnvelope(sorted[0]);
}

/**
 * UX-2A: Get the latest DRAFT envelope for an org + AI system.
 * A DRAFT is an editable, non-authoritative envelope.
 * Section 28: organizationId required for tenant safety.
 *
 * LOCK: DRAFT_ENVELOPE != POLICY_AUTHORIZED
 */
export async function getDraftEnvelope(
  organizationId: string,
  aiSystemId: string,
): Promise<OperatingEnvelope | null> {
  const records = await (prisma as any).operating_envelopes.findMany({
    where: {
      organizationId, // Section 28: tenant safety
      aiSystemId,
      state: 'DRAFT',
    },
  });

  if (records.length === 0) return null;

  // Return the highest-version DRAFT
  const sorted = records.sort((a: any, b: any) => {
    const aNum = parseInt(a.envelopeVersion, 10) || 0;
    const bNum = parseInt(b.envelopeVersion, 10) || 0;
    return bNum - aNum;
  });

  return dbRecordToEnvelope(sorted[0]);
}

/**
 * UX-2A: Update a DRAFT envelope's constraints in the database.
 *
 * DEFECT 1 (final correction): expectedCurrentDigest is REQUIRED.
 * The atomic compare-and-set always binds:
 *   state = DRAFT
 *   envelopeDigest = expectedCurrentDigest
 * to the WHERE clause. This prevents TOCTOU where a concurrent editor
 * or approval path changes the row between read and write.
 *
 * Requirements:
 * - exact organization ownership (tenant safety);
 * - exact envelope ID + version;
 * - state must be DRAFT — APPROVED/SUPERSEDED/REVOKED cannot be patched;
 * - expectedCurrentDigest must be a non-empty string;
 * - server recomputes the canonical envelope digest;
 * - never trusts a client-supplied digest as the NEW digest;
 * - mutation changes only constraints — no approval provenance mutation;
 * - no silent history rewriting.
 * - atomic: the write is conditioned on state = DRAFT AND
 *   envelopeDigest = expectedCurrentDigest.
 *
 * LOCK: DRAFT_ENVELOPE != POLICY_AUTHORIZED
 * LOCK: CLIENT_PROVIDED_EXPECTED_DIGEST != NEW_SERVER_DIGEST
 * LOCK: DRAFT_UPDATE_WITHOUT_EXPECTED_DIGEST = REJECTED
 * LOCK: APPROVED_IMMUTABLE
 * LOCK: ATOMIC_STATE_GUARD = YES
 * LOCK: ATOMIC_DIGEST_GUARD = YES
 * LOCK: STALE_WRITE_CAN_OVERWRITE_NEWER_DRAFT = NO
 */
export async function updateDraftEnvelopeInDb(
  envelopeId: string,
  envelopeVersion: string,
  organizationId: string,
  newConstraints: OperatingEnvelopeConstraints,
  expectedCurrentDigest: string,
): Promise<
  | { status: 'UPDATED'; envelope: OperatingEnvelope }
  | { status: 'CONFLICT'; reason: 'STALE_DIGEST'; currentDigest: string }
  | { status: 'NOT_FOUND' }
  | { status: 'NOT_DRAFT'; currentState: string }
  | { status: 'MISSING_EXPECTED_DIGEST' }
> {
  // DEFECT 1: expectedCurrentDigest is mandatory
  if (!expectedCurrentDigest || typeof expectedCurrentDigest !== 'string' || expectedCurrentDigest.length === 0) {
    return { status: 'MISSING_EXPECTED_DIGEST' };
  }

  // Read current row to compute server digest and classify failure cases.
  // The actual mutation is atomic via updateMany below — this read is only
  // for digest computation and error classification, not for guarding the write.
  const existing = await (prisma as any).operating_envelopes.findFirst({
    where: {
      envelopeId,
      envelopeVersion,
      organizationId, // Section 28: tenant safety
    },
  });

  if (!existing) {
    return { status: 'NOT_FOUND' };
  }

  if (existing.state !== 'DRAFT') {
    return { status: 'NOT_DRAFT', currentState: existing.state };
  }

  // Stale digest pre-check (fast path — the atomic write also enforces this)
  if (expectedCurrentDigest !== existing.envelopeDigest) {
    return {
      status: 'CONFLICT',
      reason: 'STALE_DIGEST',
      currentDigest: existing.envelopeDigest,
    };
  }

  // Server recomputes digest — never trusts client digest
  const updatedDraft: Omit<OperatingEnvelope, 'envelopeDigest'> = {
    envelopeId,
    envelopeVersion,
    organizationId,
    aiSystemId: existing.aiSystemId,
    state: 'DRAFT',
    profileId: existing.profileId,
    profileVersion: existing.profileVersion,
    constraints: newConstraints,
    createdAt: existing.createdAt,
    authoritySourceLabel: existing.authoritySourceLabel ?? undefined,
  };
  const newDigest = computeEnvelopeDigest(updatedDraft);

  // Atomic compare-and-set via updateMany.
  // The WHERE clause ALWAYS binds the mutation to:
  //   id = existing.id
  //   organizationId = organizationId
  //   envelopeId = envelopeId
  //   envelopeVersion = envelopeVersion
  //   state = 'DRAFT'
  //   envelopeDigest = expectedCurrentDigest
  //
  // If a concurrent editor/approval path changed the row between the read
  // and this write, count == 0 and we classify the failure.
  const atomicWhere: Record<string, unknown> = {
    id: existing.id,
    organizationId,
    envelopeId,
    envelopeVersion,
    state: 'DRAFT',
    envelopeDigest: expectedCurrentDigest,
  };

  const result = await (prisma as any).operating_envelopes.updateMany({
    where: atomicWhere,
    data: {
      constraints: newConstraints as any,
      envelopeDigest: newDigest,
      // No mutation of: state, approvedBy, approvedAt, approvalReference
    },
  });

  if (result.count === 1) {
    // Atomic update succeeded — re-read the updated row to return the full envelope
    const updated = await (prisma as any).operating_envelopes.findFirst({
      where: { id: existing.id, organizationId },
    });
    return { status: 'UPDATED', envelope: dbRecordToEnvelope(updated) };
  }

  // count == 0 — the row changed between read and write.
  // Re-read to classify the failure.
  const current = await (prisma as any).operating_envelopes.findFirst({
    where: { id: existing.id, organizationId },
  });

  if (!current) {
    return { status: 'NOT_FOUND' };
  }

  if (current.state !== 'DRAFT') {
    return { status: 'NOT_DRAFT', currentState: current.state };
  }

  // State is still DRAFT but digest changed → stale digest
  return {
    status: 'CONFLICT',
    reason: 'STALE_DIGEST',
    currentDigest: current.envelopeDigest,
  };
}

export async function getEnvelopeHistory(
  organizationId: string,
  aiSystemId: string,
): Promise<OperatingEnvelope[]> {
  const records = await (prisma as any).operating_envelopes.findMany({
    where: {
      organizationId, // Section 28: tenant safety
      aiSystemId,
    },
  });

  return records
    .sort((a: any, b: any) => {
      const aNum = parseInt(a.envelopeVersion, 10) || 0;
      const bNum = parseInt(b.envelopeVersion, 10) || 0;
      return bNum - aNum;
    })
    .map(dbRecordToEnvelope);
}

/**
 * Get a specific envelope version.
 * Section 28: organizationId required for tenant safety.
 */
export async function getEnvelope(
  envelopeId: string,
  envelopeVersion: string,
  organizationId: string,
): Promise<OperatingEnvelope | null> {
  const record = await (prisma as any).operating_envelopes.findFirst({
    where: {
      envelopeId,
      envelopeVersion,
      organizationId, // Section 28: tenant safety
    },
  });

  if (!record) return null;
  return dbRecordToEnvelope(record);
}

/**
 * Convert a DB record to an OperatingEnvelope.
 */
function dbRecordToEnvelope(record: any): OperatingEnvelope {
  return {
    envelopeId: record.envelopeId,
    envelopeVersion: record.envelopeVersion,
    organizationId: record.organizationId,
    aiSystemId: record.aiSystemId,
    state: record.state as OperatingEnvelopeState,
    profileId: record.profileId,
    profileVersion: record.profileVersion,
    approvedBy: record.approvedBy ?? undefined,
    approvedAt: record.approvedAt ?? undefined,
    approvalReference: record.approvalReference ?? undefined,
    constraints: record.constraints as OperatingEnvelopeConstraints,
    envelopeDigest: record.envelopeDigest,
    createdAt: record.createdAt,
    authoritySourceLabel: record.authoritySourceLabel ?? undefined,
  };
}
