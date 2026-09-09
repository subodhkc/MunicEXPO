/* eslint-disable @typescript-eslint/no-explicit-any -- mocked Prisma facade */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    scan_authorizations: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    scan_audit_events: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    ai_security_scans: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  mintAuthorization,
  validateAuthorizationBinding,
} from '@/lib/ai-security/scan-authorization';

const db = prisma as any;
const USER_ID = 'user-a';
const ORG_ID = 'org-a';
const SCAN_ID = 'scan-a';
const REPOSITORY = 'https://github.com/owner/repo';
const BRANCH = 'main';
const COMMIT = 'a'.repeat(40);

function scanRecord() {
  return {
    scanId: SCAN_ID,
    userId: USER_ID,
    organizationId: ORG_ID,
    repositoryUrl: REPOSITORY,
    repositoryBranch: BRANCH,
    commitSha: COMMIT,
  };
}

async function makeConsumedAuthorization() {
  db.scan_authorizations.create.mockImplementation(async ({ data }: { data: unknown }) => data);
  const minted = await mintAuthorization({
    consentId: 'consent-a',
    scanId: SCAN_ID,
    userId: USER_ID,
    organizationId: ORG_ID,
    repositoryUrl: REPOSITORY,
    branch: BRANCH,
    commitSha: COMMIT,
    scanMethod: 'full_clone',
  });
  if ('error' in minted) throw new Error('fixture authorization could not be minted');

  const created = db.scan_authorizations.create.mock.calls.at(-1)?.[0].data;
  return {
    ...created,
    usedAt: new Date(),
    executionStatus: 'running',
    scan_consents: { revokedAt: null },
  };
}

describe('PK-0 callback authorization binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.scan_audit_events.findFirst.mockResolvedValue(null);
    db.scan_audit_events.create.mockResolvedValue({});
    db.ai_security_scans.findUnique.mockResolvedValue(scanRecord());
  });

  it('accepts the correct service-authenticated per-scan delegation without consuming it', async () => {
    const authorization = await makeConsumedAuthorization();
    db.scan_authorizations.findUnique.mockResolvedValue(authorization);

    const result = await validateAuthorizationBinding({
      authorizationId: authorization.authorizationId,
      scanId: SCAN_ID,
      repositoryUrl: REPOSITORY,
      branch: BRANCH,
      commitSha: COMMIT,
    });

    expect(result).toEqual({ valid: true });
    expect(db.scan_authorizations.update).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong authorization', { authorizationId: 'auth-wrong' }],
    ['wrong scan', { scanId: 'scan-b' }],
    ['wrong repository', { repositoryUrl: 'https://github.com/owner/other' }],
    ['wrong branch', { branch: 'release' }],
    ['wrong commit', { commitSha: 'b'.repeat(40) }],
  ])('%s is rejected by the non-consuming binding validator', async (_label, overrides) => {
    const authorization = await makeConsumedAuthorization();
    db.scan_authorizations.findUnique.mockResolvedValue(
      overrides.authorizationId && overrides.authorizationId !== authorization.authorizationId ? null : authorization,
    );

    const result = await validateAuthorizationBinding({
      authorizationId: authorization.authorizationId,
      scanId: SCAN_ID,
      repositoryUrl: REPOSITORY,
      branch: BRANCH,
      commitSha: COMMIT,
      ...overrides,
    });

    expect(result.valid).toBe(false);
    expect(db.scan_authorizations.update).not.toHaveBeenCalled();
  });

  it('rejects revoked and tampered delegations', async () => {
    const authorization = await makeConsumedAuthorization();
    db.scan_authorizations.findUnique.mockResolvedValue({
      ...authorization,
      scan_consents: { revokedAt: new Date() },
    });
    expect((await validateAuthorizationBinding({
      authorizationId: authorization.authorizationId,
      scanId: SCAN_ID,
      repositoryUrl: REPOSITORY,
      branch: BRANCH,
      commitSha: COMMIT,
    })).valid).toBe(false);

    db.scan_authorizations.findUnique.mockResolvedValue({
      ...authorization,
      authorizationHash: 'tampered',
      scan_consents: { revokedAt: null },
    });
    expect((await validateAuthorizationBinding({
      authorizationId: authorization.authorizationId,
      scanId: SCAN_ID,
      repositoryUrl: REPOSITORY,
      branch: BRANCH,
      commitSha: COMMIT,
    })).valid).toBe(false);
  });
});
