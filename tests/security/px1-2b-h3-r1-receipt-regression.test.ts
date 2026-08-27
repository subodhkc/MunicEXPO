/**
 * PX1.2B-H3-R1 — Receipt Projection Regression Tests
 *
 * Tests for the four R1 corrections:
 *   Section 2: DISPLAYED_RECEIPT_STATE == AGGREGATED_RECEIPT_STATE
 *   Section 3: hasAvailableReceipt (not hasValidReceipt)
 *   Section 4: Historical receipt total count is exact (not capped at 50)
 *   Section 5: Regression tests for representative package selection
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  deriveReceiptState,
  selectRepresentativePackage,
  type EvaluationReceiptState,
} from '../../lib/ai-inventory/system-receipt-projection';

function readFile(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8');
}

type Pkg = {
  packageId: string;
  receiptHash: string | null;
  publicationState: string;
  createdAt: Date | null;
};

function makePkg(id: string, state: string, createdAt: Date): Pkg {
  return { packageId: id, receiptHash: `hash-${id}`, publicationState: state, createdAt };
}

// ─── Section 2: DISPLAYED_RECEIPT_STATE == AGGREGATED_RECEIPT_STATE ──────────

describe('[PX1.2B-H3-R1 §2] Representative package matches aggregate state', () => {
  it('PUBLIC older + REVOKED newer → state PUBLIC, displayed package is PUBLIC', () => {
    const older = makePkg('pub-1', 'PUBLIC', new Date('2026-01-01'));
    const newer = makePkg('rev-1', 'REVOKED', new Date('2026-02-01'));
    const packages = [newer, older]; // sorted desc by createdAt
    const state = deriveReceiptState(['REVOKED', 'PUBLIC']);
    expect(state).toBe('PUBLIC_RECEIPT');
    const rep = selectRepresentativePackage(packages, state);
    expect(rep).not.toBeNull();
    expect(rep!.packageId).toBe('pub-1'); // PUBLIC package, not the newer REVOKED
    expect(rep!.publicationState).toBe('PUBLIC');
  });

  it('PRIVATE older + REVOKED newer → state PRIVATE, displayed package is PRIVATE', () => {
    const older = makePkg('priv-1', 'PRIVATE', new Date('2026-01-01'));
    const newer = makePkg('rev-1', 'REVOKED', new Date('2026-02-01'));
    const packages = [newer, older];
    const state = deriveReceiptState(['REVOKED', 'PRIVATE']);
    expect(state).toBe('PRIVATE_RECEIPT');
    const rep = selectRepresentativePackage(packages, state);
    expect(rep).not.toBeNull();
    expect(rep!.packageId).toBe('priv-1');
    expect(rep!.publicationState).toBe('PRIVATE');
  });

  it('multiple PUBLIC → most recent PUBLIC displayed', () => {
    const older = makePkg('pub-1', 'PUBLIC', new Date('2026-01-01'));
    const newer = makePkg('pub-2', 'PUBLIC', new Date('2026-02-01'));
    const packages = [newer, older];
    const state = deriveReceiptState(['PUBLIC', 'PUBLIC']);
    expect(state).toBe('PUBLIC_RECEIPT');
    const rep = selectRepresentativePackage(packages, state);
    expect(rep).not.toBeNull();
    expect(rep!.packageId).toBe('pub-2'); // most recent PUBLIC
  });

  it('all REVOKED → most recent REVOKED displayed', () => {
    const older = makePkg('rev-1', 'REVOKED', new Date('2026-01-01'));
    const newer = makePkg('rev-2', 'REVOKED', new Date('2026-02-01'));
    const packages = [newer, older];
    const state = deriveReceiptState(['REVOKED', 'REVOKED']);
    expect(state).toBe('REVOKED_RECEIPT');
    const rep = selectRepresentativePackage(packages, state);
    expect(rep).not.toBeNull();
    expect(rep!.packageId).toBe('rev-2'); // most recent REVOKED
  });

  it('NO_RECEIPT → representative is null', () => {
    const state = deriveReceiptState([]);
    expect(state).toBe('NO_RECEIPT');
    const rep = selectRepresentativePackage([], state);
    expect(rep).toBeNull();
  });

  it('PUBLIC + PRIVATE + REVOKED → state PUBLIC, displayed is most recent PUBLIC', () => {
    const pubOld = makePkg('pub-1', 'PUBLIC', new Date('2026-01-01'));
    const privMid = makePkg('priv-1', 'PRIVATE', new Date('2026-01-15'));
    const revNew = makePkg('rev-1', 'REVOKED', new Date('2026-02-01'));
    const packages = [revNew, privMid, pubOld]; // sorted desc
    const state = deriveReceiptState(['REVOKED', 'PRIVATE', 'PUBLIC']);
    expect(state).toBe('PUBLIC_RECEIPT');
    const rep = selectRepresentativePackage(packages, state);
    expect(rep!.packageId).toBe('pub-1'); // only PUBLIC, most recent PUBLIC
    expect(rep!.publicationState).toBe('PUBLIC');
  });
});

// ─── Section 3: hasAvailableReceipt != hasValidReceipt ───────────────────────

describe('[PX1.2B-H3-R1 §3] Availability != validity — naming', () => {
  const content = readFile('lib/ai-inventory/system-receipt-projection.ts');

  it('uses hasAvailableReceipt (not hasValidReceipt) in the interface', () => {
    expect(content).toContain('hasAvailableReceipt');
    // The interface field must be hasAvailableReceipt, not hasValidReceipt
    // Check the interface declaration specifically
    expect(content).toMatch(/hasAvailableReceipt:\s*boolean/);
    expect(content).not.toMatch(/hasValidReceipt:\s*boolean/);
  });

  it('documents that verifyAssurancePackage is NOT run', () => {
    expect(content).toContain('verifyAssurancePackage');
    expect(content).toContain('NOT');
  });

  it('reserves "verified"/"valid" for U6 verification semantics', () => {
    expect(content).toContain('Reserve');
    expect(content).toContain('verified');
  });
});

// ─── Section 4: Historical receipt total count is exact ──────────────────────

describe('[PX1.2B-H3-R1 §4] Historical receipt total count — exact, not capped', () => {
  const content = readFile('lib/ai-inventory/system-receipt-projection.ts');

  it('uses count() for total — NOT take: 50 + .length', () => {
    expect(content).toContain('prisma.assurance_packages.count');
    // The actual query code must NOT use take: 50
    // Check the function body, not the doc comment
    const funcBody = content.split('export async function resolveHistoricalReceiptSummary')[1] ?? '';
    expect(funcBody).not.toMatch(/take:\s*50/);
  });

  it('uses findFirst for most recent — NOT loading all rows', () => {
    expect(content).toContain('prisma.assurance_packages.findFirst');
  });

  it('HISTORICAL_RECEIPT_TOTAL_COUNT_RULE documented', () => {
    expect(content).toContain('HISTORICAL_RECEIPT_TOTAL_COUNT_RULE');
  });
});

// ─── Section 2: Source inspection — lock present ─────────────────────────────

describe('[PX1.2B-H3-R1 §2] DISPLAYED_RECEIPT_STATE lock in source', () => {
  const content = readFile('lib/ai-inventory/system-receipt-projection.ts');

  it('DISPLAYED_RECEIPT_STATE == AGGREGATED_RECEIPT_STATE lock present', () => {
    expect(content).toContain('DISPLAYED_RECEIPT_STATE == AGGREGATED_RECEIPT_STATE');
  });

  it('selectRepresentativePackage function exists and is exported', () => {
    expect(content).toContain('export function selectRepresentativePackage');
  });
});
