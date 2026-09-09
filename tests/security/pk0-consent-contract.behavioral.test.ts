/* eslint-disable @typescript-eslint/no-explicit-any -- mocked Prisma facade */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    scan_consents: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    scan_audit_events: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  createConsent,
  validateConsent,
  CURRENT_CONSENT_INTEGRITY_VERSION,
  CURRENT_TERMS_VERSION,
} from '@/lib/ai-security/consent-enforcement';

const db = prisma as any;
const base = {
  id: 'row-a',
  consentId: 'consent-a',
  userId: 'user-a',
  organizationId: 'org-a',
  repositoryUrl: 'https://github.com/owner/repo',
  branch: 'main',
  scanType: 'full_clone',
  consentVersion: CURRENT_CONSENT_INTEGRITY_VERSION,
  termsVersion: CURRENT_TERMS_VERSION,
  consentedAt: new Date('2026-09-09T10:00:00.000Z'),
  expiresAt: new Date('2026-10-09T10:00:00.000Z'),
  consentHash: '',
  dataHandling: {},
  revokedAt: null,
};

function currentConsentHash(consent: typeof base) {
  const payload = {
    userId: consent.userId,
    organizationId: consent.organizationId ?? null,
    repositoryUrl: consent.repositoryUrl,
    scanType: consent.scanType,
    consentVersion: consent.consentVersion,
    consentedAt: consent.consentedAt.toISOString(),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload, Object.keys(payload).sort())).digest('hex');
}

function legacyConsentHash(consent: typeof base) {
  const payload = {
    userId: consent.userId,
    repositoryUrl: consent.repositoryUrl,
    scanType: consent.scanType,
    consentVersion: consent.consentVersion,
    consentedAt: consent.consentedAt.toISOString(),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload, Object.keys(payload).sort())).digest('hex');
}

describe('PK-0 consent contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.scan_audit_events.findFirst.mockResolvedValue(null);
    db.scan_audit_events.create.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  it('keeps integrity schema version independent from legal terms version', async () => {
    db.scan_consents.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    await createConsent({
      userId: 'user-a',
      organizationId: 'org-a',
      repositoryUrl: base.repositoryUrl,
      branch: 'main',
      scanType: 'full_clone',
    });
    const data = db.scan_consents.create.mock.calls[0][0].data;
    expect(data.consentVersion).toBe('1.1.0');
    expect(data.termsVersion).toBe('1.0.0');
    db.scan_consents.findFirst.mockResolvedValue({ ...base, ...data });
    await expect(validateConsent('user-a', base.repositoryUrl, 'full_clone', 'org-a', 'main')).resolves.toMatchObject({ valid: true });
  });

  it('accepts a valid v1.1 organization-bound consent hash', async () => {
    const valid = { ...base, consentHash: currentConsentHash(base) };
    db.scan_consents.findFirst.mockResolvedValue(valid);
    const result = await validateConsent('user-a', base.repositoryUrl, 'full_clone', 'org-a', 'main');
    expect(result.valid).toBe(true);
  });

  it('rejects tampered organization-bound integrity', async () => {
    const valid = { ...base, consentHash: currentConsentHash(base) };
    db.scan_consents.findFirst.mockResolvedValue({ ...valid, organizationId: 'org-b' });
    const result = await validateConsent('user-a', base.repositoryUrl, 'full_clone', 'org-b', 'main');
    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe('CONSENT_TAMPERED');
  });

  it('rejects expired consent through the active-consent query contract', async () => {
    db.scan_consents.findFirst.mockResolvedValue(null);
    const result = await validateConsent('user-a', base.repositoryUrl, 'full_clone', 'org-a', 'main');
    expect(result.valid).toBe(false);
    const query = db.scan_consents.findFirst.mock.calls[0][0];
    expect(query.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(query.where.revokedAt).toBeNull();
  });

  it('rejects revoked consent', async () => {
    db.scan_consents.findFirst.mockResolvedValue(null);
    const result = await validateConsent('user-a', base.repositoryUrl, 'full_clone', 'org-a', 'main');
    expect(result.valid).toBe(false);
    const query = db.scan_consents.findFirst.mock.calls[0][0];
    expect(query.where.revokedAt).toBeNull();
  });

  it('accepts a valid legacy 1.0 consent only through bounded compatibility', async () => {
    const legacy = { ...base, consentVersion: '1.0.0', consentHash: legacyConsentHash({ ...base, consentVersion: '1.0.0' }) };
    db.scan_consents.findFirst.mockResolvedValue(legacy);
    const result = await validateConsent('user-a', base.repositoryUrl, 'full_clone', 'org-a', 'main');
    expect(result.valid).toBe(true);
  });

  it('rejects a legacy 1.0 hash masquerading as v1.1', async () => {
    const forged = { ...base, consentVersion: '1.1.0', consentHash: legacyConsentHash({ ...base, consentVersion: '1.0.0' }) };
    db.scan_consents.findFirst.mockResolvedValue(forged);
    const result = await validateConsent('user-a', base.repositoryUrl, 'full_clone', 'org-a', 'main');
    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe('CONSENT_TAMPERED');
  });
});
