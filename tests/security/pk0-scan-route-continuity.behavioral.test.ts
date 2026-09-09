/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth/getSafeSession', () => ({
  getSafeSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: { findUnique: vi.fn() },
    scan_consents: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    scan_intents: { findUnique: vi.fn(), updateMany: vi.fn() },
    ai_security_scans: { create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/org-context', () => ({
  requireOrganizationAccess: vi.fn(),
}));

vi.mock('@/lib/ai-security/scanner-health', () => ({
  requireScannerAvailable: vi.fn(),
  getScannerUrl: vi.fn(),
}));

vi.mock('@/lib/ai-security/branch-validation', () => ({
  resolveBranchCommit: vi.fn(),
  validateBranch: vi.fn(),
  shouldValidateBranch: vi.fn(),
}));

vi.mock('@/lib/ai-security/github-token', () => ({
  isRepositoryPrivate: vi.fn(),
  getUserGitHubToken: vi.fn(),
}));

vi.mock('@/lib/ai-security/scan-authorization', () => ({
  startScanRun: vi.fn(),
}));

vi.mock('@/lib/ai-security/scan-ai-system-binding', () => ({
  validateScanAISystemBinding: vi.fn(),
}));

vi.mock('@/lib/ai-security/semantic-source-blob-transport', () => ({
  mintSemanticSourceStorageCapability: vi.fn(),
  buildSemanticSourceTransportRequest: vi.fn(),
}));

vi.mock('@/lib/analytics/vercel-events', () => ({
  serverTrack: {
    engineScanStarted: vi.fn(),
    modalBackendError: vi.fn(),
  },
}));

import { POST as postScan } from '@/app/api/ai-security/scan/route';
import { prisma } from '@/lib/prisma';
import { getSafeSession } from '@/lib/auth/getSafeSession';
import { requireOrganizationAccess } from '@/lib/org-context';
import { requireScannerAvailable, getScannerUrl } from '@/lib/ai-security/scanner-health';
import { resolveBranchCommit, validateBranch, shouldValidateBranch } from '@/lib/ai-security/branch-validation';
import { isRepositoryPrivate, getUserGitHubToken } from '@/lib/ai-security/github-token';
import { startScanRun } from '@/lib/ai-security/scan-authorization';
import { validateScanAISystemBinding } from '@/lib/ai-security/scan-ai-system-binding';
import { mintSemanticSourceStorageCapability, buildSemanticSourceTransportRequest } from '@/lib/ai-security/semantic-source-blob-transport';

const db = prisma as any;
const USER = 'user-pk0';
const ORG = 'org-pk0';
const AUTH_ID = 'auth-pk0';
const REPO_URL = 'https://github.com/Owner/Repo';
const REPO_CANONICAL = 'owner/repo';
const BRANCH = 'main';
const COMMIT = 'a'.repeat(40);
const INTENT_ID = 'intent-pk0';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ai-security/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    intentId: INTENT_ID,
    userId: USER,
    organizationId: ORG,
    repoFullName: REPO_CANONICAL,
    branch: BRANCH,
    aiSystemId: null,
    installationId: null,
    status: 'PENDING',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MODAL_SCANNER_URL', 'https://modal-scanner.test');
  vi.stubEnv('SCANNER_API_KEY', 'scanner-secret');

  (getSafeSession as any).mockResolvedValue({
    user: { id: USER, email: 'test@haiec.io' },
    expires: '2099-01-01T00:00:00.000Z',
  });

  (requireOrganizationAccess as any).mockResolvedValue({ organizationId: ORG });

  db.users.findUnique.mockResolvedValue({
    id: USER,
    email: 'test@haiec.io',
    role: 'superadmin',
  });

  (requireScannerAvailable as any).mockResolvedValue({ available: true });
  (getScannerUrl as any).mockReturnValue('https://modal-scanner.test');

  (resolveBranchCommit as any).mockResolvedValue({ resolved: true, commitSha: COMMIT });
  (validateBranch as any).mockResolvedValue({ valid: true });
  (shouldValidateBranch as any).mockReturnValue(false);

  (isRepositoryPrivate as any).mockResolvedValue(false);
  (getUserGitHubToken as any).mockResolvedValue({ success: false });

  (startScanRun as any).mockResolvedValue({
    authorized: true,
    authorizationId: AUTH_ID,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  (validateScanAISystemBinding as any).mockImplementation(async (params: { aiSystemId: string | null | undefined }) => {
    if (params.aiSystemId === undefined || params.aiSystemId === null) {
      return { valid: false, aiSystemId: null, reason: 'NO_AI_SYSTEM_ID' };
    }
    return { valid: true, aiSystemId: params.aiSystemId };
  });

  (mintSemanticSourceStorageCapability as any).mockResolvedValue({
    minted: false,
    reason: 'test',
  });
  (buildSemanticSourceTransportRequest as any).mockReturnValue(null);

  db.scan_intents.findUnique.mockResolvedValue(null);
  db.scan_intents.updateMany.mockResolvedValue({ count: 1 });
  db.scan_consents.findFirst.mockResolvedValue(null);
  db.scan_consents.update.mockResolvedValue({});
  db.scan_consents.create.mockResolvedValue({});

  db.ai_security_scans.create.mockImplementation(async ({ data }: { data: any }) => data);

  db.$transaction.mockImplementation(async (fn: any) => fn(prisma));

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    text: vi.fn().mockResolvedValue('Accepted'),
  } as any);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('PK-0 scan route continuity', () => {
  it('A: OAuth-only happy path passes exact identity to Modal', async () => {
    db.scan_intents.findUnique.mockResolvedValue(intent());

    const res = await postScan(makeRequest({
      scanType: 'repository',
      scanProfiles: ['DEFAULT'],
      repositoryUrl: REPO_URL,
      branch: BRANCH,
      intentId: INTENT_ID,
      installationId: null,
      aiSystemId: null,
    }) as any);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.scanId).toMatch(/^scan_/);

    expect(startScanRun).toHaveBeenCalledWith(expect.objectContaining({
      repositoryUrl: REPO_URL,
      branch: BRANCH,
      commitSha: COMMIT,
      scanMethod: 'full_clone',
    }));

    const fetchCall = (global.fetch as any).mock.calls.find((call: any) =>
      call[0].includes('/api/security/scan')
    );
    expect(fetchCall).toBeTruthy();
    const body = JSON.parse(fetchCall[1].body);
    expect(body.scan_id).toBe(json.scanId);
    expect(body.repository_url).toBe(REPO_URL);
    expect(body.branch).toBe(BRANCH);
    expect(body.expected_commit_sha).toBe(COMMIT);
    expect(body.authorization_id).toBe(AUTH_ID);
  });

  it('B: GitHub App + AI System happy path passes exact identity to Modal', async () => {
    db.scan_intents.findUnique.mockResolvedValue(intent({
      aiSystemId: 'system-A',
      installationId: 123,
    }));

    const res = await postScan(makeRequest({
      scanType: 'repository',
      scanProfiles: ['DEFAULT'],
      repositoryUrl: REPO_URL,
      branch: BRANCH,
      intentId: INTENT_ID,
      installationId: 123,
      aiSystemId: 'system-A',
    }) as any);

    expect(res.status).toBe(200);
    const json = await res.json();
    const fetchCall = (global.fetch as any).mock.calls.find((call: any) =>
      call[0].includes('/api/security/scan')
    );
    const body = JSON.parse(fetchCall[1].body);
    expect(body.scan_id).toBe(json.scanId);
    expect(body.expected_commit_sha).toBe(COMMIT);
    expect(body.authorization_id).toBe(AUTH_ID);
  });

  it('C: rejects request when intent installationId does not match request', async () => {
    db.scan_intents.findUnique.mockResolvedValue(intent({
      installationId: 123,
    }));

    const res = await postScan(makeRequest({
      scanType: 'repository',
      scanProfiles: ['DEFAULT'],
      repositoryUrl: REPO_URL,
      branch: BRANCH,
      intentId: INTENT_ID,
      installationId: 456,
    }) as any);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe('INTENT_INSTALLATION_MISMATCH');
    expect(startScanRun).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
