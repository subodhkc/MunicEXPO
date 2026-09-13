/**
 * Customer-Facing Naming Guard
 *
 * Internal architecture wave codenames (U5, U6, U7, Atlas) must never
 * reach customer-visible surfaces. The canonical naming contract lives in
 * capabilities/engine-qual/canonical-naming-truth.ts:
 *
 *   U5 → canonical "Assurance Decision Engine" / public "HAIEC Assurance Engine"
 *   U6 → canonical "Assurance Package & Receipt Service" / public "Assurance Receipts"
 *
 * Immutable identifiers (file names, Prisma tables, serialized API fields
 * like `u6Package`, schema-version constants) are retained per the naming
 * contract — this guard targets *displayed* strings only.
 *
 * Method: scan customer-facing source files, strip comments and import
 * specifiers, then assert no case-sensitive \bU5\b / \bU6\b / \bU7\b /
 * \bAtlas\b remain in string content.
 *
 * LOCK: INTERNAL_CODENAME != CUSTOMER_VISIBLE_COPY
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

/** Recursively collect files under dir matching extensions. */
function collect(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      out.push(...collect(p, exts));
    } else if (exts.some(x => p.endsWith(x))) {
      out.push(p);
    }
  }
  return out;
}

/** Strip comments and import/export lines so only logic + strings remain. */
function stripCommentsAndImports(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\/\/[^\n]*/g, '')       // line comments
    .split('\n')
    .filter(l => !/^\s*import\b/.test(l) && !/^\s*export\s+type\b/.test(l))
    .join('\n');
}

const FORBIDDEN = /\bU5\b|\bU6\b|\bU7\b|\bAtlas\b/;

describe('Customer-facing naming guard — no internal codenames in rendered surfaces', () => {
  const componentFiles = collect(join(ROOT, 'components'), ['.tsx']);
  const pageFiles = collect(join(ROOT, 'app'), ['page.tsx']);

  const scanned = [...componentFiles, ...pageFiles];

  it('scanned a non-trivial set of customer-facing files', () => {
    expect(scanned.length).toBeGreaterThan(50);
  });

  for (const file of scanned) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    it(`${rel} contains no U5/U6/U7/Atlas in rendered content`, () => {
      const stripped = stripCommentsAndImports(readFileSync(file, 'utf-8'));
      // Allow lowercase identifiers like u6-types import paths inside code —
      // flag only the uppercase codename tokens in remaining content.
      const offenders = stripped
        .split('\n')
        .filter(l => FORBIDDEN.test(l))
        // Remaining identifiers like U6_REPORT_SCHEMA_VERSION constants
        // appear in lib code — but not inside customer-facing components/pages.
        .filter(l => !/U6_REPORT_SCHEMA|U6_BUNDLE_SCHEMA|U6_RECEIPT_SCHEMA|U6_VERIFICATION_SCHEMA/.test(l));
      expect(offenders, `${rel} leaks internal codename:\n${offenders.join('\n')}`).toHaveLength(0);
    });
  }
});
