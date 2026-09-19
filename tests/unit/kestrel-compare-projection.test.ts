/**
 * Truth-lock test for the sanitized A/B-8 public comparison projection.
 *
 * Locks the frozen experiment facts published at
 * /demo/kestrel/kestrel-compare.public.json — evaluation refs, commits,
 * digest, counts, transitions — and asserts no private identifiers leak.
 * Regeneration via scripts/kestrel-compare-export.ts must keep these true.
 */

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const PROJ_PATH = path.join(process.cwd(), 'public', 'demo', 'kestrel', 'kestrel-compare.public.json')
const proj = JSON.parse(fs.readFileSync(PROJ_PATH, 'utf8'))
const raw = fs.readFileSync(PROJ_PATH, 'utf8')

const BASELINE_COMMIT = '5e65843fddfe5f907485b798e464ad37b3b3b2c7'
const CANDIDATE_COMMIT = '27c56a9fdb21e7af6b91df9e61e8841129ed9ad9'
const DIGEST = '2fbd8e9aa6afa0b5b29d4579d09886080a66dede13e9536506c7e7a5159ba4aa'
const INTERNAL_UUIDS = [
  '10231b6b-313a-44ec-83bc-058d8af6a6c6', // org
  '6fb713f8-fe13-4d99-86c9-7c5d06d28f99', // system
  '6526c2d3-2f0b-4d91-b2e8-ae83304e6dbf', // run A
  '5fae3f52-63d2-44b2-8eaa-e57eb398f7a1', // run B
]

describe('kestrel compare public projection', () => {
  const c = proj.comparison

  it('locks the frozen comparison digest', () => {
    expect(c.comparisonDigest).toBe(DIGEST)
  })

  it('locks the exact evaluated releases', () => {
    expect(c.baseline.commitSha).toBe(BASELINE_COMMIT)
    expect(c.candidate.commitSha).toBe(CANDIDATE_COMMIT)
    expect(c.baseline.evaluationRef).toMatch(/^HAIEC-KESTREL-EVAL-/)
    expect(c.candidate.evaluationRef).toMatch(/^HAIEC-KESTREL-EVAL-/)
  })

  it('locks the established counts', () => {
    expect(c.summary.establishedControlChanges).toBe(12)
    expect(c.summary.unresolvedFacts).toBe(99)
    expect(c.summary.totalComparedFacts).toBe(111)
    expect(c.summary.unexpectedEstablishedChanges).toBe(0)
    expect(c.overallResult).toBe('INCONCLUSIVE')
  })

  it('locks comparability', () => {
    expect(c.comparability.releasePerimeter).toBe('SAME')
    expect(c.comparability.analyzer).toBe('EXACT')
    expect(c.comparability.repeatability).toBe('PASS')
  })

  it('locks the canonical transition DECLARED -> DECLARED + PATH_BOUND', () => {
    expect(c.transition.before).toBe('DECLARED')
    expect(c.transition.after).toBe('DECLARED + PATH_BOUND')
    expect(c.transition.count).toBe(12)
    expect(c.establishedItems).toHaveLength(12)
  })

  it('keeps unresolved distinct from absent', () => {
    expect(c.mutations.find((m) => m.id === 'M1').result).toBe('INCONCLUSIVE')
    expect(c.mutations.find((m) => m.id === 'M2').result).toBe('INCONCLUSIVE')
    expect(c.mutations.find((m) => m.id === 'M3').result).toBe('ESTABLISHED')
    expect(c.mutations.find((m) => m.id === 'M4').result).toBe('0')
    expect(JSON.stringify(c)).not.toMatch(/UNRESOLVED\s*=\s*ABSENT/)
    expect(raw).not.toMatch(/removed (?:all )?99|99 removed/i)
  })

  it('leaks no private identifiers', () => {
    for (const id of INTERNAL_UUIDS) expect(raw).not.toContain(id)
    expect(raw).not.toMatch(/@[\w-]+\.[\w.]+/) // no emails
    expect(raw).not.toMatch(/localhost|127\.0\.0\.1|\.local\//)
  })

  it('carries no credentials', () => {
    expect(raw).not.toMatch(/password|secret|token|bearer|api[_-]?key/i)
  })

  it('defines the judge navigation paths', () => {
    expect(proj.navigation.baselineReport).toBe('/sample-reports/kestrel')
    expect(proj.navigation.consequenceMap).toBe('/sample-reports/kestrel/constellation')
    expect(proj.navigation.orderRecordWrite).toContain('/sample-reports/kestrel/constellation?path=')
    expect(proj.navigation.judgeLogin).toBe('/login')
  })
})
