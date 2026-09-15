#!/usr/bin/env node
/**
 * MunichTech evidence-pack verifier.
 *
 * Dependency-free (Node built-ins only). Verifies the published Kestrel
 * evidence artifacts against the shipped manifest and the frozen evaluation
 * facts. This is verification of published artifacts — NOT a second assurance
 * engine and NOT a recomputation.
 *
 * Usage: node competition/verify-evidence.mjs   (exit 1 on any mismatch)
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = (p) => join(root, p);

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const loadJSON = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

// 1. Required artifacts exist
const manifest = loadJSON(D('demo/kestrel/evidence/manifest.json'));
check('manifest.json parses', !!manifest);

const machine = loadJSON(D('demo/kestrel/evidence/kestrel-assurance.machine.json'));
check('machine JSON parses', !!machine);

const pubJson = loadJSON(D('demo/kestrel/evidence/kestrel-assurance.public.json'));
check('public JSON parses', !!pubJson);

const passport = loadJSON(D('demo/kestrel/passport/agentic-production-passport.json'));
check('passport parses', !!passport);

const receipt = loadJSON(D('demo/kestrel/receipts/decision-receipt.json'));
check('decision receipt parses', !!receipt);

for (const f of [
  'demo/kestrel/reports/HAIEC-Kestrel-Executive-Assurance-Report.pdf',
  'demo/kestrel/reports/HAIEC-Kestrel-Technical-Assurance-Report.pdf',
  'demo/kestrel/reports/HAIEC-Kestrel-Assurance-Evidence-Report.pdf',
]) check(`PDF exists: ${f.split('/').pop()}`, existsSync(D(f)));

// 2. SHA-256 parity with manifest
//    Manifest hashes refer to the live /demo/kestrel/ files (original names).
//    Map published names back to manifest names.
const nameMap = {
  'demo/kestrel/evidence/kestrel-assurance.public.json': 'kestrel-assurance.public.json',
  'demo/kestrel/evidence/kestrel-assurance.machine.json': 'kestrel-assurance.machine.json',
};
if (manifest?.artifacts) {
  for (const [local, mname] of Object.entries(nameMap)) {
    const entry = manifest.artifacts.find((a) => a.name === mname);
    check(`sha256 manifest parity: ${mname}`,
      !!entry && existsSync(D(local)) && sha256(D(local)) === entry.sha256,
      entry ? `expected ${entry.sha256.slice(0, 16)}…` : 'missing manifest entry');
  }
}

// 3. Frozen evaluation facts
check('disposition = REVIEW', machine?.disposition === 'REVIEW');
const paths = machine?.actionPaths ?? [];
check('actionPathCount = 44', paths.length === 44, `got ${paths.length}`);
check('codeCapable 44/44', paths.filter((p) => p?.planes?.codeCapable === 'ESTABLISHED').length === 44);
for (const plane of ['requested', 'policyAuthorized', 'effectivelyGranted', 'observed']) {
  const all = paths.every((p) => p?.planes?.[plane] === 'NOT_ASSESSED');
  check(`${plane} = NOT_ASSESSED (all paths)`, all);
}

// 4. Bindings reconcile across artifacts
check('source commit binding', machine?.sourceCommitSha === '5e65843fddfe5f907485b798e464ad37b3b3b2c7');
check('public eval ref binding', machine?.publicEvaluationRef === 'HAIEC-KESTREL-EVAL-5e65843');
check('bundle digest present', /^[0-9a-f]{64}$/.test(machine?.bundleDigest ?? ''));
check('passport schema present', !!passport?.schemaVersion);
check('receipt disposition = REVIEW', receipt?.disposition === 'REVIEW');
check('receipt hash present', /^[0-9a-f]{64}$/.test(receipt?.receiptHash ?? ''));
check('receipt bound to same source commit',
  receipt?.buildIdentity?.gitCommit === '5e65843fddfe5f907485b798e464ad37b3b3b2c7');
check('receipt bound to same public eval',
  (receipt?.receiptId ?? '').includes('HAIEC-KESTREL-EVAL-5e65843'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
