# Publication Scope

This repository contains the MunichTech implementation/evidence slice of
HAIEC — **not** the full product source.

## Published (PUBLIC_SAFE)

Filtered Git history preserves genuine engineering progression for:

- `lib/assurance/` — assurance contracts, evaluator, five-plane section,
  product adapters, report projections, Passport, Consequence Delta,
  artifact manifest, package service
- `lib/topology/` — topology projector, Constellation presentation/delta
  projections, types
- `lib/engine-registry/` — canonical producer/engine identity
- `components/ai-inventory/AssuranceBundleReport.tsx` — report renderer
- `app/sample-reports/` — public demo surfaces (incl. Kestrel demo)
- `app/dev/qa-review/` — dev-only QA review hub (404s outside dev)
- `data/kestrel-demo/` — sanitized public projection + consequence labels
- `data/sample-reports.ts` — sample manifest
- `scripts/kestrel-demo-export.ts` — sanitized export with fail-closed gate
- `tests/assurance/`, `tests/security/` — deterministic assurance tests

## Sanitized (PUBLIC_SANITIZED)

- `data/kestrel-demo/*.json`, `public/demo/kestrel/*` — internal org/run/
  system/scan UUIDs redacted; evidence states unchanged
- Commit author emails rewritten to public identities via mailmap; dates
  preserved. Mapping recorded in `competition/ORIGINAL-SHA-MAP.json`.

## Excluded (PRIVATE_EXCLUDED)

| Area | Reason |
|---|---|
| `lib/auth.ts`, NextAuth config, OAuth wiring | auth infrastructure — not competition logic |
| `app/api/**` (except report route reference) | production API surface + auth wiring |
| `lib/prisma.ts`, `prisma/schema.prisma` | production schema / tenant model — DB surface |
| Billing, Stripe, subscriptions | commercial infrastructure |
| `app/dashboard/**` (most), org management | customer-management surfaces |
| `docs/architecture/` internal audit docs | internal security documentation |
| `.env*`, deployment config, Vercel/Neon/Stripe secrets | credential/environment risk |
| Customer/test fixture data | privacy |
| NYC compliance modules, marketing pages | unrelated to competition logic |

Imports in published files may reference excluded modules — the slice is
**inspectable provenance, not a runnable application**.
