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
 */
export async function persistDraftEnvelope(envelope: OperatingEnvelope): Promise<OperatingEnvelope> {
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
 * Get all envelope versions for an org + AI system (history).
 */
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
