/* eslint-disable @typescript-eslint/no-explicit-any -- mocked Prisma facade */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ai_security_scans: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/org-context', () => ({
  requireOrganizationAccess: vi.fn(),
}));

import { GET as getProof } from '@/app/api/proof/ai-security/static/[scanId]/route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { requireOrganizationAccess } from '@/lib/org-context';

const db = prisma as any;
const mockSession = vi.mocked(getServerSession);
const mockOrg = vi.mocked(requireOrganizationAccess);

const SCAN_ID = 'scan-pk0';
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER = 'user-pk0';

function makeRequest(scanId: string, orgId: string) {
  const url = `http://localhost/api/proof/ai-security/static/${scanId}`;
  return new Request(url, { headers: { 'x-organization-id': orgId } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({
    user: { id: USER, email: 'test@haiec.io' },
    expires: '2099-01-01T00:00:00.000Z',
  } as any);
  mockOrg.mockResolvedValue({ organizationId: ORG_A } as any);
  db.ai_security_scans.findFirst.mockResolvedValue(null);
});

describe('PK-0 static proof privacy', () => {
  it('returns 401 for unauthenticated callers', async () => {
    mockSession.mockResolvedValue(null as any);
    const res = await getProof(makeRequest(SCAN_ID, ORG_A) as any, { params: { scanId: SCAN_ID } });
    expect(res.status).toBe(401);
  });

  it('permitted for Org A + Org A scan', async () => {
    mockOrg.mockResolvedValue({ organizationId: ORG_A } as any);
    db.ai_security_scans.findFirst.mockResolvedValue({
      id: '1',
      scanId: SCAN_ID,
      organizationId: ORG_A,
      createdAt: new Date(),
      ai_security_findings: [],
    });
    const res = await getProof(makeRequest(SCAN_ID, ORG_A) as any, { params: { scanId: SCAN_ID } });
    expect(res.status).toBe(200);
  });

  it('does not leak cross-org scan as generic not-found', async () => {
    mockOrg.mockResolvedValue({ organizationId: ORG_B } as any);
    db.ai_security_scans.findFirst.mockResolvedValue(null);
    const res = await getProof(makeRequest(SCAN_ID, ORG_B) as any, { params: { scanId: SCAN_ID } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Proof record not found');
  });

  it('rejects cross-org access through org-context', async () => {
    mockOrg.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as any);
    const res = await getProof(makeRequest(SCAN_ID, ORG_B) as any, { params: { scanId: SCAN_ID } });
    expect(res.status).toBe(403);
  });
});
