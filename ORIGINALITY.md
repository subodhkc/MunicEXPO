# Originality — MunichTech EXPO 2026

This repository preserves the competition-period implementation history of the
MunichTech-relevant HAIEC capabilities. Judges can verify the timeline
independently — every claim below is backed by a private-repo Git commit, and
`competition/ORIGINAL-SHA-MAP.json` maps each public commit back to its
original private SHA with original author and commit dates.

## Boundary

- **Competition baseline:** `4c999fb86ff8fb6a9283c250511339eac79b1d64`
  (2026-08-31 22:02 CDT — last accepted Main before Sep 1)
- **Submission source:** `11b2e8b68cdbd974d6ae0b03ede5c1e907700e12`

## What was already there

The HAIEC foundation predates the competition window: the assurance
evaluator and types (Aug 23), the assurance package/receipt service (Aug 24),
the action-surface model (Aug 30), the engine registry (Aug 23), and the
static AI-security scanner (January). Those are honestly labeled
`PRE_EXISTING_FOUNDATION` — we do not call them competition work.

## What was built during MunichTech

See [`competition/FEATURE-COMMIT-MAP.json`](competition/FEATURE-COMMIT-MAP.json)
for the machine-readable map and
[`competition/BUILD-TIMELINE.md`](competition/BUILD-TIMELINE.md) for the dated
timeline. Headline items — all first implemented inside the window:

| Capability | First impl | Merged to Main |
|---|---|---|
| Topology projector (Constellation core) | 2026-09-04 `24bf48f1` | 2026-09-09 |
| Constellation presentation projection | 2026-09-09 `371c6ecf` | 2026-09-09 |
| Action Assurance (five planes) | 2026-09-09 `8692943a` | 2026-09-09 |
| Agentic Production Passport + artifact manifest | 2026-09-10 `e0315497` | 2026-09-12 |
| Assurance product adapters (bundle owner) | 2026-09-10 `56b7b298` | 2026-09-12 |
| Consequence Delta + overlay | 2026-09-11 `e7e70ccb` | 2026-09-12 |
| Report projection (bundle + 3 profiles) + AssuranceBundleReport | 2026-09-13 `fc887901`/`ae48c964` | 2026-09-13 |
| Evaluation report API + page | 2026-09-13 `4410439d` | 2026-09-13 |
| Kestrel public demo pack | 2026-09-14 `cfa853e8` | 2026-09-14 |
| Consequence-label semantic hardening | 2026-09-14 `ee1cbafb` | 2026-09-14 |

## Method

- First-implementation dates come from `git log --diff-filter=A` on the
  implementation owner file — not PR merge dates alone.
- A file merely touched in September is not "new in September"; a capability
  created in September is not "pre-existing" merely because it reuses earlier
  primitives.
- Filtered history preserves original author/commit dates; the SHA map records
  the private→public correspondence so nothing is hidden by the rewrite.

## Numbers

See [`competition/GIT-DIFF-SUMMARY.md`](competition/GIT-DIFF-SUMMARY.md):
500 commits / 1,039 files overall in the window; 104 commits / 80 files in the
competition-relevant subset (assurance, topology, constellation, reports,
Kestrel demo).
