/* eslint-disable @typescript-eslint/no-explicit-any -- mocked Prisma facade and route harness */
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
    scan_intents: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/org-context', () => ({
  requireOrganizationAccess: vi.fn(),
}));

vi.mock('@/lib/github-app/linkage-recovery', () => ({
  validateInstallationForOrganization: vi.fn(),
}));

vi.mock('@/lib/ai-security/scan-ai-system-binding', () => ({
  validateScanAISystemBinding: vi.fn(),
}));

import { POST as postIntent } from '@/app/api/ai-security/scan/intent/route';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { requireOrganizationAccess } from '@/lib/org-context';
import { validateInstallationForOrganization } from '@/lib/github-app/linkage-recovery';
import { validateScanAISystemBinding } from '@/lib/ai-security/scan-ai-system-binding';

const db = prisma as any;
const mockGetSession = vi.mocked(getServerSession);
const mockOrgAccess = vi.mocked(requireOrganizationAccess);
const mockInstall = vi.mocked(validateInstallationForOrganization);
const mockAiSystem = vi.mocked(validateScanAISystemBinding);

const USER = 'user-pk0';
const ORG_A = 'org-a';
const REPO = 'owner/repo';
const REPO_UPPER = 'Owner/Repo';
const REPO_OTHER = 'other/repo';
const BRANCH = 'main';
const SYSTEM_A = 'system-a';
const INSTALL_123 = 123;
const INSTALL_456 = 456;

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ai-security/scan/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeAuth(orgId: string) {
  return {
    user: { id: USER, email: 'test@haiec.io' },
    organizationId: orgId,
    membershipRole: 'member',
  };
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    repoFullName: REPO_UPPER,
    branch: BRANCH,
    intakeAnswers: {
      aiSystemType: 'llm',
      deploymentContext: 'customer_facing',
      frameworkAlignments: ['soc2'],
      modelProvider: '',
      intendedUse: '',
      environment: 'production',
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    user: { id: USER, email: 'test@haiec.io', name: 'Test' },
    expires: '2099-01-01T00:00:00.000Z',
  } as any);
  mockOrgAccess.mockResolvedValue(makeAuth(ORG_A) as any);
  mockInstall.mockResolvedValue(true);
  mockAiSystem.mockResolvedValue({ valid: true, aiSystemId: SYSTEM_A });
  db.scan_intents.findFirst.mockResolvedValue(null);
  db.scan_intents.create.mockImplementation(async ({ data }: { data: any }) => data);
});

describe('PK-0 ScanIntent identity route', () => {
  it('PK0-A: rejects cross-org request', async () => {
    mockOrgAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as any);
    const res = await postIntent(makeRequest(baseBody()) as any);
    expect(res.status).toBe(403);
  });

  it('PK0-L: canonical same repository deduplicates', async () => {
    const existing = {
      intentId: 'intent-existing',
      userId: USER,
      organizationId: ORG_A,
      aiSystemId: null,
      installationId: null,
      repoFullName: REPO,
      branch: BRANCH,
      status: 'PENDING',
      requestedAt: new Date(),
    };
    db.scan_intents.findFirst.mockResolvedValue(existing);
    const res = await postIntent(makeRequest(baseBody()) as any);
    const json = await res.json();
    expect(json.deduplicated).toBe(true);
    expect(json.intentId).toBe('intent-existing');
  });

  it('PK0-M: same repository name under different GitHub owner cannot deduplicate', async () => {
    db.scan_intents.findFirst.mockImplementation(async ({ where }: any) => {
      return where.repoFullName === REPO ? null : undefined;
    });
    await postIntent(makeRequest(baseBody({ repoFullName: REPO_OTHER })) as any);
    expect(db.scan_intents.create).toHaveBeenCalled();
    const data = db.scan_intents.create.mock.calls[0][0].data;
    expect(data.repoFullName).toBe(REPO_OTHER);
  });

  it('PK0-F: OAuth null/null identity is accepted', async () => {
    const res = await postIntent(makeRequest(baseBody({ aiSystemId: null, installationId: null })) as any);
    expect(res.status).toBe(200);
    const data = db.scan_intents.create.mock.calls[0][0].data;
    expect(data.aiSystemId).toBeNull();
    expect(data.installationId).toBeNull();
  });

  it('PK0-G: GitHub App exact installation is accepted', async () => {
    const res = await postIntent(makeRequest(baseBody({ installationId: INSTALL_123 })) as any);
    expect(res.status).toBe(200);
    expect(mockInstall).toHaveBeenCalledWith({
      installationId: INSTALL_123,
      organizationId: ORG_A,
      repoFullName: REPO,
    });
    const data = db.scan_intents.create.mock.calls[0][0].data;
    expect(data.installationId).toBe(INSTALL_123);
  });

  it('PK0-H: AI-System-bound exact identity is accepted', async () => {
    const res = await postIntent(makeRequest(baseBody({ aiSystemId: SYSTEM_A, installationId: null })) as any);
    expect(res.status).toBe(200);
    expect(mockAiSystem).toHaveBeenCalledWith({
      aiSystemId: SYSTEM_A,
      organizationId: ORG_A,
      repositoryUrl: `https://github.com/${REPO}`,
    });
    const data = db.scan_intents.create.mock.calls[0][0].data;
    expect(data.aiSystemId).toBe(SYSTEM_A);
    expect(data.installationId).toBeNull();
  });

  it('PK0-I: GitHub App + AI System exact identity is accepted', async () => {
    const res = await postIntent(makeRequest(baseBody({ aiSystemId: SYSTEM_A, installationId: INSTALL_123 })) as any);
    expect(res.status).toBe(200);
    const data = db.scan_intents.create.mock.calls[0][0].data;
    expect(data.aiSystemId).toBe(SYSTEM_A);
    expect(data.installationId).toBe(INSTALL_123);
  });

  it('PK0-J: pending-intent dedup cannot cross AI Systems', async () => {
    db.scan_intents.findFirst.mockImplementation(async ({ where }: any) => {
      const isNull = where.aiSystemId === null;
      const hasA = where.aiSystemId === SYSTEM_A;
      if (isNull && where.installationId === null && where.repoFullName === REPO) return null;
      if (hasA && where.installationId === null && where.repoFullName === REPO) {
        return {
          intentId: 'intent-existing-system-a',
          userId: USER,
          organizationId: ORG_A,
          aiSystemId: SYSTEM_A,
          installationId: null,
          repoFullName: REPO,
          branch: BRANCH,
          status: 'PENDING',
        };
      }
      return undefined;
    });
    const res = await postIntent(makeRequest(baseBody({ aiSystemId: null, installationId: null })) as any);
    const json = await res.json();
    expect(json.deduplicated).not.toBe(true);
    expect(db.scan_intents.create).toHaveBeenCalled();
  });

  it('PK0-K: pending-intent dedup cannot cross installations', async () => {
    db.scan_intents.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.installationId === null && where.repoFullName === REPO) return null;
      if (where.installationId === INSTALL_123 && where.repoFullName === REPO) {
        return {
          intentId: 'intent-existing-123',
          userId: USER,
          organizationId: ORG_A,
          aiSystemId: null,
          installationId: INSTALL_123,
          repoFullName: REPO,
          branch: BRANCH,
          status: 'PENDING',
        };
      }
      return undefined;
    });
    const res = await postIntent(makeRequest(baseBody({ installationId: INSTALL_456 })) as any);
    const json = await res.json();
    expect(json.deduplicated).not.toBe(true);
    expect(db.scan_intents.create).toHaveBeenCalled();
  });

  it('rejects invalid installationId values (0, negative, string)', async () => {
    for (const bad of [0, -1, '123']) {
      const res = await postIntent(makeRequest(baseBody({ installationId: bad })) as any);
      expect(res.status).toBe(400);
    }
  });

  it('PK0-D: AI System mismatch is rejected', async () => {
    mockAiSystem.mockResolvedValue({ valid: false, reason: 'NO_MATCHING_SOURCE_REPOSITORY_ASSET' });
    const res = await postIntent(makeRequest(baseBody({ aiSystemId: SYSTEM_A })) as any);
    expect(res.status).toBe(403);
  });

  it('PK0-E: installation mismatch is rejected', async () => {
    mockInstall.mockResolvedValue(false);
    const res = await postIntent(makeRequest(baseBody({ installationId: INSTALL_123 })) as any);
    expect(res.status).toBe(403);
  });

  it('persists canonical repo identity regardless of raw caller casing', async () => {
    await postIntent(makeRequest(baseBody({ repoFullName: 'Owner/Repo.git' })) as any);
    const data = db.scan_intents.create.mock.calls[0][0].data;
    expect(data.repoFullName).toBe(REPO);
  });
});
