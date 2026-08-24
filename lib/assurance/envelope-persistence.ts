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
 * Section 5: Approve a DRAFT envelope in the database.
 * Sets state to APPROVED, records approvedBy/approvedAt/approvalReference.
 * Does NOT modify the envelope digest (semantic constraints unchanged).
 */
export async function approveEnvelopeInDb(
  envelopeId: string,
  envelopeVersion: string,
  organizationId: string,
  approvedBy: string,
  approvedAt: Date,
  approvalReference?: string,
): Promise<OperatingEnvelope | null> {
  // Verify ownership and current state
  const existing = await (prisma as any).operating_envelopes.findFirst({
    where: {
      envelopeId,
      envelopeVersion,
      organizationId, // Section 28: tenant safety
    },
  });

  if (!existing) return null;
  if (existing.state !== 'DRAFT') {
    throw new Error(`Cannot approve envelope in state ${existing.state}`);
  }

  const updated = await (prisma as any).operating_envelopes.update({
    where: { id: existing.id },
    data: {
      state: 'APPROVED',
      approvedBy,
      approvedAt,
      approvalReference: approvalReference ?? null,
    },
  });

  return dbRecordToEnvelope(updated);
}

/**
 * Section 5: Create a new version of an envelope.
 * The old APPROVED version becomes SUPERSEDED. The new version is DRAFT.
 * Does NOT overwrite approved history.
 */
export async function createNewEnvelopeVersionInDb(
  envelopeId: string,
  currentVersion: string,
  organizationId: string,
  newConstraints: OperatingEnvelopeConstraints,
): Promise<{ superseded: OperatingEnvelope; newVersion: OperatingEnvelope } | null> {
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

  // Parse current version and increment
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

  // Transaction: supersede old + create new
  const [supersededRecord, newRecord] = await prisma.$transaction([
    (prisma as any).operating_envelopes.update({
      where: { id: existing.id },
      data: { state: 'SUPERSEDED' },
    }),
    (prisma as any).operating_envelopes.create({
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
    }),
  ]);

  return {
    superseded: dbRecordToEnvelope(supersededRecord),
    newVersion: dbRecordToEnvelope(newRecord),
  };
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
 */
export async function getApprovedEnvelope(
  organizationId: string,
  aiSystemId: string,
): Promise<OperatingEnvelope | null> {
  const record = await (prisma as any).operating_envelopes.findFirst({
    where: {
      organizationId, // Section 28: tenant safety
      aiSystemId,
      state: 'APPROVED',
    },
    orderBy: { envelopeVersion: 'desc' },
  });

  if (!record) return null;
  return dbRecordToEnvelope(record);
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
    orderBy: { envelopeVersion: 'desc' },
  });

  return records.map(dbRecordToEnvelope);
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
