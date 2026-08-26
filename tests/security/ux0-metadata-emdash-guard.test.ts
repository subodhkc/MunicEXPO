/**
 * UX0-R1 — Comprehensive Metadata Em-Dash Guard
 *
 * Discovers ALL active metadata files and validates no em dash (—)
 * is present in title, description, openGraph, or twitter fields.
 *
 * Excludes: Old Files/, test fixtures, demo artifacts, historical docs.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const cwd = process.cwd();

// Excluded paths — historical artifacts, not active metadata
const EXCLUDED_PATTERNS = [
  'Old Files',
  'node_modules',
  '.next',
  'public/demo',
  'test-github-report.html',
  'test-ai-security-report.html',
  'test-nyc-ll144-report.html',
  'test-compliance-wizard-report.html',
];

function isExcluded(filePath: string): boolean {
  return EXCLUDED_PATTERNS.some((p) => filePath.includes(p));
}

/** Recursively find all files matching a pattern, excluding historical artifacts. */
function findFiles(dir: string, ext: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isExcluded(fullPath)) continue;
    if (entry.isDirectory()) {
      findFiles(fullPath, ext, results);
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Extract metadata-relevant string literals from a file. */
function extractMetadataStrings(content: string): string[] {
  const strings: string[] = [];

  for (const m of content.matchAll(/title:\s*['"`]([^'"`]+)['"`]/g)) strings.push(m[1]);
  for (const m of content.matchAll(/description:\s*['"`]([^'"`]+)['"`]/g)) strings.push(m[1]);
  for (const m of content.matchAll(/alt:\s*['"`]([^'"`]+)['"`]/g)) strings.push(m[1]);
  for (const m of content.matchAll(/headline:\s*['"`]([^'"`]+)['"`]/g)) strings.push(m[1]);

  return strings;
}

describe('[UX0-R1] Comprehensive metadata em-dash guard', () => {
  // Find all metadata.ts files
  const metadataFiles = findFiles(path.join(cwd, 'app'), '.ts')
    .filter((f) => f.endsWith('metadata.ts'));

  // Find all layout.tsx and page.tsx files that may export metadata
  const layoutFiles = findFiles(path.join(cwd, 'app'), '.tsx')
    .filter((f) => f.endsWith('layout.tsx') || f.endsWith('page.tsx'));

  const allFiles = [...metadataFiles, ...layoutFiles];
  const discoveredCount = allFiles.length;

  it(`discovers active metadata files (found ${discoveredCount})`, () => {
    expect(discoveredCount).toBeGreaterThan(50);
  });

  // Test each file for em dashes in metadata fields
  for (const filePath of allFiles) {
    const relPath = path.relative(cwd, filePath);
    it(`${relPath} has no em dash in metadata fields`, () => {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Only check files that actually export metadata
      if (!content.includes('metadata') && !content.includes('Metadata')) {
        return; // skip non-metadata files
      }

      // Extract only the metadata export portion of the file.
      // This avoids matching description: fields in data arrays (body copy).
      // Look for `export const metadata` or `export const metadata: Metadata` blocks.
      const metadataBlockMatch = content.match(
        /export\s+const\s+metadata(?:\s*:\s*Metadata)?\s*=\s*\{([\s\S]*?)\n\}/
      );
      if (!metadataBlockMatch) {
        // Also check generateMetadata return objects
        const genMetaMatch = content.match(/generateMetadata[\s\S]*?return\s*\{([\s\S]*?)\n\s*\}/);
        if (!genMetaMatch) return; // no metadata export found, skip
        var checkContent = genMetaMatch[1];
      } else {
        var checkContent = metadataBlockMatch[1];
      }

      // Also check JSON-LD structured data blocks (application/ld+json)
      const jsonLdMatches = content.matchAll(/'application\/ld\+json':\s*JSON\.stringify\(([\s\S]*?)\)\s*[,}]/g);
      for (const m of jsonLdMatches) {
        checkContent += '\n' + m[1];
      }

      const strings: string[] = [];

      // title: '...' — only within metadata block
      for (const m of checkContent.matchAll(/title:\s*['"`]([^'"`]+)['"`]/g)) {
        strings.push(m[1]);
      }
      // description: '...' — only within metadata block
      for (const m of checkContent.matchAll(/description:\s*['"`]([^'"`]+)['"`]/g)) {
        strings.push(m[1]);
      }
      // alt: '...' (in metadata image objects)
      for (const m of checkContent.matchAll(/alt:\s*['"`]([^'"`]+)['"`]/g)) {
        strings.push(m[1]);
      }
      // headline: '...' (structured data)
      for (const m of checkContent.matchAll(/headline:\s*['"`]([^'"`]+)['"`]/g)) {
        strings.push(m[1]);
      }

      for (const s of strings) {
        expect(s).not.toContain('—');
      }
    });
  }
});
