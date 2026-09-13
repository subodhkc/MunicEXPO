/* eslint-disable @typescript-eslint/no-explicit-any -- mocked Prisma */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    ai_security_scans: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    ai_security_findings: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/ai-security/scan-authorization', () => ({
  validateAuthorizationBinding: vi.fn(),
}));

vi.mock('@/lib/ai-security/static-scan-safety', () => ({
  validateS6ACoverageLimitations: vi.fn(),
  deriveCoverageStatusFromS6ALimitations: vi.fn(),
  STATIC_SCAN_SAFETY_POLICY_VERSION: '1.0.0',
}));

vi.mock('@/lib/ai-security/static-finding-collector', () => ({
  collectEligibleStaticFindings: vi.fn(),
}));

vi.mock('@/lib/ai-security/context-aware-aggregation', () => ({
  aggregateFindingsWithContext: vi.fn(),
  DEFAULT_AGGREGATION_CONFIG: {},
}));

vi.mock('@/lib/ai-security/result-intent-classifier', () => ({
  normalizeResultIntent: vi.fn().mockReturnValue({ resultIntent: 'POSITIVE', needsPersistence: false }),
  isValidPersistedResultIntent: vi.fn(),
}));

vi.mock('@/lib/evidence/producer-activation-hooks', () => ({
  activateStaticScanEvidence: vi.fn(),
}));

vi.mock('@/lib/ai-security/static-evidence-handoff', () => ({
  executeStaticEvidenceHandoff: vi.fn(),
}));

vi.mock('@/lib/ai-security/semantic-source-consumer', () => ({
  consumeSemanticSourceBundle: vi.fn(),
}));

import { POST as aggregate } from '@/app/api/ai-security/scan/[scanId]/aggregate/route';
import { prisma } from '@/lib/prisma';
import { validateAuthorizationBinding } from '@/lib/ai-security/scan-authorization';
import { aggregateFindingsWithContext } from '@/lib/ai-security/context-aware-aggregation';
import { collectEligibleStaticFindings } from '@/lib/ai-security/static-finding-collector';
import { validateS6ACoverageLimitations } from '@/lib/ai-security/static-scan-safety';
import { activateStaticScanEvidence } from '@/lib/evidence/producer-activation-hooks';
import { executeStaticEvidenceHandoff } from '@/lib/ai-security/static-evidence-handoff';

const mockExecuteHandoff = executeStaticEvidenceHandoff as any;

const db = prisma as any;
const SCAN_ID = 'scan-pk0';
const SCANNER_KEY = 'scanner-secret';

function makeRequest(body: any, key?: string) {
  return new Request(`http://localhost/api/ai-security/scan/${SCAN_ID}/aggregate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key !== undefined ? { 'x-scanner-key': key } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SCANNER_API_KEY', SCANNER_KEY);

  db.ai_security_scans.findUnique.mockResolvedValue({
    id: 'scan-row',
    scanId: SCAN_ID,
    userId: 'user-pk0',
    organizationId: 'org-pk0',
    status: 'SCANNING',
    repositoryUrl: 'https://github.com/owner/repo',
    repositoryBranch: 'main',
    commitSha: 'a'.repeat(40),
  });
  db.ai_security_scans.update.mockResolvedValue({});
  db.ai_security_findings.updateMany.mockResolvedValue({ count: 0 });
  db.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  mockExecuteHandoff.mockResolvedValue({ attempted: false });

  (validateAuthorizationBinding as any).mockResolvedValue({ valid: true });

  (validateS6ACoverageLimitations as any).mockReturnValue({ valid: true, limitations: [] });

  (collectEligibleStaticFindings as any).mockResolvedValue({
    complete: true,
    findings: [],
    expectedTotal: 0,
    collectedCount: 0,
    pagesFetched: 1,
  });

  (aggregateFindingsWithContext as any).mockReturnValue({
    aggregationVersion: '1.0.0',
    riskModelVersion: '1.0.0',
    pathFilterProfile: 'default',
    configFingerprint: 'abc',
    aggregatedCount: 0,
    totalRiskScore: 0,
    securitySeverityDistribution: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
    allAggregatedGroups: [],
    aggregationGroupMembership: {},
    timestamp: new Date().toISOString(),
    scanDurationMs: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PK-0 aggregate callback admission', () => {
  it('rejects missing or wrong scanner key', async () => {
    for (const key of ['', 'wrong']) {
      const res = await aggregate(makeRequest({ authorizationId: 'auth-123' }, key) as any, { params: { scanId: SCAN_ID } });
      expect(res.status).toBe(401);
    }
    expect(aggregateFindingsWithContext).not.toHaveBeenCalled();
    expect(executeStaticEvidenceHandoff).not.toHaveBeenCalled();
    expect(activateStaticScanEvidence).not.toHaveBeenCalled();
  });

  it('rejects when authorizationId is missing', async () => {
    const res = await aggregate(makeRequest({ authorizationId: '' }, SCANNER_KEY) as any, { params: { scanId: SCAN_ID } });
    expect(res.status).toBe(403);
    expect(validateAuthorizationBinding).not.toHaveBeenCalled();
    expect(aggregateFindingsWithContext).not.toHaveBeenCalled();
    expect(executeStaticEvidenceHandoff).not.toHaveBeenCalled();
  });

  it('rejects invalid per-scan authorization binding', async () => {
    (validateAuthorizationBinding as any).mockResolvedValue({ valid: false, reason: 'REVOKED' });

    const res = await aggregate(makeRequest({ authorizationId: 'auth-bad' }, SCANNER_KEY) as any, { params: { scanId: SCAN_ID } });
    expect(res.status).toBe(403);
    expect(validateAuthorizationBinding).toHaveBeenCalled();
    expect(aggregateFindingsWithContext).not.toHaveBeenCalled();
    expect(executeStaticEvidenceHandoff).not.toHaveBeenCalled();
  });

  it('proceeds with valid scanner key + binding', { timeout: 20000 }, async () => {
    const res = await aggregate(makeRequest({ authorizationId: 'auth-123' }, SCANNER_KEY) as any, { params: { scanId: SCAN_ID } });
    expect(res.status).toBe(200);
    expect(validateAuthorizationBinding).toHaveBeenCalled();
    expect(collectEligibleStaticFindings).toHaveBeenCalled();
    expect(aggregateFindingsWithContext).toHaveBeenCalled();
  });
});

