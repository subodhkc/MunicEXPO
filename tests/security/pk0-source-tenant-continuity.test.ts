import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalGitHubRepoFullName } from '@/lib/ai-security/url-utils';
import { validateSemanticSourceBundleIdentity } from '@/lib/ai-security/semantic-source-bundle';

const repoRoot = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'semantic-source-bundle-1.0.0',
    scanId: 'scan_pk0',
    repositoryUrlHash: 'hash',
    branch: 'main',
    commitSha: 'a'.repeat(40),
    sourceBasis: 'GIT_COMMIT_ARCHIVE',
    transport: 'VERCEL_PRIVATE_BLOB',
    archiveFormat: 'tar.gz',
    blobPathname: 'semantic-source/scan_pk0/archive.tar.gz',
    archiveSha256: 'b'.repeat(64),
    pathSetSha256: 'c'.repeat(64),
    fileCount: 1,
    archiveBytes: 10,
    createdAt: new Date().toISOString(),
    transportState: 'UPLOADED',
    completeness: 'COMPLETE',
    limitations: [],
    ...overrides,
  } as never;
}

describe('PK0 Source & Tenant Continuity', () => {
  it('canonicalizes repository identity and rejects same-name owner substitution', () => {
    expect(canonicalGitHubRepoFullName('https://github.com/Owner/Repo.git')).toBe('owner/repo');
    expect(canonicalGitHubRepoFullName('https://github.com/Other/Repo')).toBe('other/repo');
    expect(canonicalGitHubRepoFullName('https://github.com/Owner/Repo')).not.toBe(
      canonicalGitHubRepoFullName('https://github.com/Other/Repo'),
    );
  });

  it('rejects semantic source commit mismatch', () => {
    const result = validateSemanticSourceBundleIdentity(manifest(), {
      routeScanId: 'scan_pk0',
      scanRecordScanId: 'scan_pk0',
      expectedRepositoryUrlHash: 'hash',
      expectedBranch: 'main',
      expectedCommitSha: 'd'.repeat(40),
      expectedBlobPathnamePrefix: 'semantic-source/scan_pk0/',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('commitSha');
  });

  it('requires atomic intent linkage before the Modal trigger', () => {
    const source = read('app/api/ai-security/scan/route.ts');
    expect(source).toContain("prisma.$transaction(async (tx)");
    expect(source).toContain("throw new Error('INTENT_LINKAGE_FAILED')");
    expect(source.indexOf('INTENT_LINKAGE_FAILED')).toBeLessThan(source.indexOf('triggerModalScannerWithRetry'));
  });

  it('propagates the resolved organization into authorization', () => {
    const source = read('app/api/ai-security/scan/route.ts');
    expect(source).toContain('organizationId,\n        scanId,');
    expect(source).toContain('commitSha: expectedCommitSha');
  });

  it('fails closed for missing Modal authorization and scanner service key', () => {
    const source = read('modal_ai_security_scanner.py');
    expect(source).toContain('AUTHORIZATION_REQUIRED');
    expect(source).toContain('EXPECTED_COMMIT_REQUIRED');
    expect(source).toContain('SCANNER_NOT_READY');
    expect(source).toContain('if not SCANNER_API_KEY:');
  });

  it('does not expose private static proof through the unauthenticated route', () => {
    const route = read('app/api/proof/ai-security/static/[scanId]/route.ts');
    const page = read('app/proof/ai-security/static/[scanId]/page.tsx');
    expect(route).toContain('requireOrganizationAccess');
    expect(route).toContain("'Cache-Control': 'private, no-store'");
    expect(route).not.toContain('Public, unauthenticated');
    expect(page).toContain('Authentication required to view this private scan proof.');
  });

  it('keeps public OAuth credentials out of the worker request path', () => {
    const source = read('app/api/ai-security/scan/route.ts');
    expect(source).toContain('isRepositoryPrivate(repositoryUrl)');
    expect(source).toContain('if (isPrivateRepo === true)');
    expect(source).toContain('github_token: githubToken');
  });

  it('preserves downstream exact scan identity contracts', () => {
    const source = read('lib/ai-inventory/source-reachability-read-model.ts');
    expect(source).toContain('data.scanId !== expectedScanId');
    expect(source).toContain('SCAN_MISMATCH');
    expect(read('lib/ai-security/semantic-source-consumer.ts')).toContain('expectedCommitSha: ctx.commitSha');
  });
});
