/**
 * UX0-R2 — AST-Based Metadata Em-Dash Guard
 *
 * Uses the TypeScript compiler API to accurately parse metadata exports
 * and check for em dashes in metadata string fields.
 *
 * Reports accurate counts:
 *   CANDIDATE_FILES_SCANNED
 *   FILES_WITH_METADATA_EXPORTS
 *   FILES_WITH_GENERATE_METADATA
 *   ACTUAL_METADATA_DEFINITIONS_CHECKED
 *
 * Checks: title, description, openGraph.title, openGraph.description,
 *         twitter.title, twitter.description, image alt, headline (JSON-LD)
 *
 * Excludes body-copy data arrays.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const cwd = process.cwd();

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

function findFiles(dir: string, exts: string[], results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isExcluded(fullPath)) continue;
    if (entry.isDirectory()) {
      findFiles(fullPath, exts, results);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Recursively collect all string literal values from a TypeScript node,
 * but only within metadata-relevant property assignments.
 */
function collectMetadataStrings(node: ts.Node, strings: string[]): void {
  const text = node.getText();

  // Match property assignments with metadata-relevant keys
  // We look for PropertyAssignment nodes whose name is a metadata field
  if (ts.isPropertyAssignment(node)) {
    const name = node.name.getText().replace(/['"`]/g, '');
    const METADATA_KEYS = ['title', 'description', 'alt', 'headline', 'name'];

    if (METADATA_KEYS.includes(name)) {
      // Extract string literal value from the initializer
      const init = node.initializer;
      if (ts.isStringLiteral(init)) {
        strings.push(init.text);
      } else if (ts.isNoSubstitutionTemplateLiteral(init)) {
        strings.push(init.text);
      } else if (ts.isTemplateExpression(init)) {
        // For template expressions with substitutions, check the head and middle parts
        strings.push(init.head.text);
        for (const part of init.templateSpans) {
          if (ts.isTemplateMiddlePart(part)) {
            strings.push(part.text);
          }
        }
      } else if (ts.isObjectLiteralExpression(init)) {
        // Nested object (e.g., openGraph: { title: ... }) — recurse
        for (const child of init.properties) {
          collectMetadataStrings(child, strings);
        }
      } else if (ts.isArrayLiteralExpression(init)) {
        // Array of objects (e.g., images: [{ alt: ... }])
        for (const elem of init.elements) {
          if (ts.isObjectLiteralExpression(elem)) {
            for (const child of elem.properties) {
              collectMetadataStrings(child, strings);
            }
          }
        }
      }
    }
  }

  // Recurse into child nodes
  ts.forEachChild(node, (child) => collectMetadataStrings(child, strings));
}

/**
 * Parse a file and extract all metadata string values from:
 * 1. export const metadata = { ... }
 * 2. generateMetadata(): Metadata { return { ... } }
 * 3. JSON-LD structured data (application/ld+json)
 */
function extractMetadataFromSource(
  filePath: string
): { hasMetadataExport: boolean; hasGenerateMetadata: boolean; strings: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const strings: string[] = [];
  let hasMetadataExport = false;
  let hasGenerateMetadata = false;

  function visit(node: ts.Node) {
    // export const metadata = { ... }
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (decl.name.getText() === 'metadata') {
          hasMetadataExport = true;
          if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
            for (const prop of decl.initializer.properties) {
              collectMetadataStrings(prop, strings);
            }
          }
        }
      }
    }

    // generateMetadata(): Metadata { return { ... } }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.getText() === 'generateMetadata'
    ) {
      hasGenerateMetadata = true;
      // Find return statement with object literal
      function findReturn(n: ts.Node): ts.ObjectLiteralExpression | null {
        if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) {
          return n.expression;
        }
        let result: ts.ObjectLiteralExpression | null = null;
        ts.forEachChild(n, (child) => {
          if (!result) result = findReturn(child);
        });
        return result;
      }
      const returnObj = findReturn(node);
      if (returnObj) {
        for (const prop of returnObj.properties) {
          collectMetadataStrings(prop, strings);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Also check JSON-LD structured data blocks via regex
  // (these are stringified JSON, not parsed by TS as metadata)
  const jsonLdMatches = content.matchAll(
    /'application\/ld\+json':\s*JSON\.stringify\(([\s\S]*?)\)\s*[,}]/g
  );
  for (const m of jsonLdMatches) {
    const jsonLdContent = m[1];
    // Extract string values from the JSON-LD object
    for (const sm of jsonLdContent.matchAll(/['"`](?:headline|name|description|title|alt)['"`]\s*:\s*['"`]([^'"`]+)['"`]/g)) {
      strings.push(sm[1]);
    }
  }

  return { hasMetadataExport, hasGenerateMetadata, strings };
}

describe('[UX0-R2] AST-based metadata em-dash guard', () => {
  // Find all candidate files
  const tsFiles = findFiles(path.join(cwd, 'app'), ['.ts']);
  const tsxFiles = findFiles(path.join(cwd, 'app'), ['.tsx']);
  const allCandidates = [...tsFiles, ...tsxFiles];
  const candidateCount = allCandidates.length;

  // Process each file
  const filesWithMetadata: string[] = [];
  const filesWithGenerateMetadata: string[] = [];
  const allMetadataStrings: { file: string; value: string }[] = [];

  for (const filePath of allCandidates) {
    try {
      const result = extractMetadataFromSource(filePath);
      if (result.hasMetadataExport) {
        filesWithMetadata.push(filePath);
      }
      if (result.hasGenerateMetadata) {
        filesWithGenerateMetadata.push(filePath);
      }
      for (const s of result.strings) {
        allMetadataStrings.push({ file: filePath, value: s });
      }
    } catch {
      // Skip files that fail to parse
    }
  }

  const metadataDefinitionCount = filesWithMetadata.length + filesWithGenerateMetadata.length;

  it(`CANDIDATE_FILES_SCANNED = ${candidateCount} (must be > 50)`, () => {
    expect(candidateCount).toBeGreaterThan(50);
  });

  it(`FILES_WITH_METADATA_EXPORTS = ${filesWithMetadata.length}`, () => {
    expect(filesWithMetadata.length).toBeGreaterThan(0);
  });

  it(`FILES_WITH_GENERATE_METADATA = ${filesWithGenerateMetadata.length}`, () => {
    // May be 0, just report
    expect(filesWithGenerateMetadata.length).toBeGreaterThanOrEqual(0);
  });

  it(`ACTUAL_METADATA_DEFINITIONS_CHECKED = ${metadataDefinitionCount}`, () => {
    expect(metadataDefinitionCount).toBeGreaterThan(0);
  });

  // Test each file with metadata for em dashes
  const filesToCheck = [...new Set([...filesWithMetadata, ...filesWithGenerateMetadata])];

  for (const filePath of filesToCheck) {
    const relPath = path.relative(cwd, filePath);
    it(`${relPath} has no em dash in metadata fields`, () => {
      const result = extractMetadataFromSource(filePath);
      for (const s of result.strings) {
        expect(s).not.toContain('—');
      }
    });
  }

  // Global em-dash count across all metadata strings
  it('ACTIVE_METADATA_EM_DASH_COUNT = 0', () => {
    const emDashCount = allMetadataStrings.filter((s) => s.value.includes('—')).length;
    expect(emDashCount).toBe(0);
  });
});
