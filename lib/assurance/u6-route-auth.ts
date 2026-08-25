/**
 * U6 — Resource-first route authorization helpers.
 *
 * Part 2-4: Resource identity first, tenant authorization second.
 * Never trust caller-supplied organizationId as proof of ownership.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionWithTestSupport } from '@/lib/auth-helpers';
import { getPackageOwnership, getEvaluationOwnership } from './u6-package-service';

export interface AuthorizedPackageContext {
  userId: string;
  packageId: string;
  organizationId: string;
  assuranceEvaluationId: string;
  publicationState: string;
  isOwner: boolean;
  isAdmin: boolean;
  canViewEvidence: boolean;
  canEditAssessments: boolean;
}

export interface AuthorizedEvaluationContext {
  userId: string;
  evaluationId: string;
  organizationId: string;
  isOwner: boolean;
  isAdmin: boolean;
  canViewEvidence: boolean;
  canEditAssessments: boolean;
}

/**
 * Part 4: Non-enumerating not-found response.
 * Unknown resource and cross-tenant resource use the same externally visible behavior.
 */
export function notFound(): NextResponse {
  return NextResponse.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 404 });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Part 2: Authenticate session, load package ownership, authorize against THAT organization.
 * Returns null on success (with context), or NextResponse on failure.
 */
export async function authorizePackageAccess(
  packageId: string,
  requireViewEvidence = true,
): Promise<{ ctx: AuthorizedPackageContext } | { error: NextResponse }> {
  const session = await getSessionWithTestSupport();
  if (!session?.user?.id) {
    return { error: unauthorized() };
  }

  // Part 2: Load minimal ownership fields BEFORE authorization
  const ownership = await getPackageOwnership(packageId);
  if (!ownership) {
    // Part 4: Non-enumerating 404
    return { error: notFound() };
  }

  // Part 2: Authorize against the package's canonical organizationId
  const orgId = ownership.organizationId;
  const membership = await getMembershipAndPermissions(session.user.id, orgId);

  if (!membership) {
    // Part 4: Cross-tenant looks the same as not-found
    return { error: notFound() };
  }

  if (requireViewEvidence && !membership.canViewEvidence) {
    return { error: forbidden() };
  }

  return {
    ctx: {
      userId: session.user.id,
      packageId,
      organizationId: orgId,
      assuranceEvaluationId: ownership.assuranceEvaluationId,
      publicationState: ownership.publicationState,
      isOwner: membership.isOwner,
      isAdmin: membership.isAdmin,
      canViewEvidence: membership.canViewEvidence,
      canEditAssessments: membership.canEditAssessments,
    },
  };
}

/**
 * Part 2: Authenticate session, load evaluation ownership, authorize against THAT organization.
 */
export async function authorizeEvaluationAccess(
  evaluationId: string,
  requireEditAssessments = false,
): Promise<{ ctx: AuthorizedEvaluationContext } | { error: NextResponse }> {
  const session = await getSessionWithTestSupport();
  if (!session?.user?.id) {
    return { error: unauthorized() };
  }

  // Part 2: Load minimal ownership fields BEFORE authorization
  const ownership = await getEvaluationOwnership(evaluationId);
  if (!ownership) {
    return { error: notFound() };
  }

  const orgId = ownership.organizationId;
  const membership = await getMembershipAndPermissions(session.user.id, orgId);

  if (!membership) {
    return { error: notFound() };
  }

  if (requireEditAssessments && !membership.canEditAssessments && !membership.isOwner && !membership.isAdmin) {
    return { error: forbidden() };
  }

  return {
    ctx: {
      userId: session.user.id,
      evaluationId,
      organizationId: orgId,
      isOwner: membership.isOwner,
      isAdmin: membership.isAdmin,
      canViewEvidence: membership.canViewEvidence,
      canEditAssessments: membership.canEditAssessments,
    },
  };
}

/**
 * Check if user can publish/revoke (Part 3: owner or admin AND canViewEvidence).
 */
export function canPublishOrRevoke(ctx: AuthorizedPackageContext): boolean {
  return (ctx.isOwner || ctx.isAdmin) && ctx.canViewEvidence;
}

async function getMembershipAndPermissions(
  userId: string,
  organizationId: string,
): Promise<{
  isOwner: boolean;
  isAdmin: boolean;
  canViewEvidence: boolean;
  canEditAssessments: boolean;
} | null> {
  try {
    const org = await prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { ownerId: true, deletedAt: true },
    });

    if (!org || org.deletedAt) return null;

    const isOwner = org.ownerId === userId;

    const member = await prisma.organization_members.findFirst({
      where: { userId, organizationId, status: 'active' },
      select: { role: true, canViewEvidence: true, canEditAssessments: true },
    });

    if (!isOwner && !member) return null;

    const isAdmin = isOwner || member?.role === 'admin';

    return {
      isOwner,
      isAdmin,
      canViewEvidence: isOwner || (member?.canViewEvidence ?? false),
      canEditAssessments: isOwner || (member?.canEditAssessments ?? false),
    };
  } catch {
    return null;
  }
}
