# lib/assurance/ — Evidence & Assurance Boundaries

Scoped agent guide for the `lib/assurance/` directory. Adds local constraints to root `AGENTS.md`. Must not contradict root.

## Core Distinctions

- **EVIDENCE != ASSURANCE** — Evidence feeds Assurance evaluation. Evidence alone is not a disposition.
- **UNKNOWN != PASS** — Unknown, not assessed, partial, failed, timeout, unsupported, and not-run must never silently become PASS.
- **ALLOW = ALLOW WITHIN EVALUATED SCOPE AND AVAILABLE EVIDENCE** — nothing more.
- **FRAMEWORK_MAPPING != CERTIFICATION** — Mapping controls to a framework is not certification, audit opinion, or accreditation.

## Canonical Dispositions

The Assurance Decision Engine owns the canonical ALLOW / REVIEW / BLOCK disposition. No other module may produce a competing disposition.

- ALLOW — allowed within evaluated scope and available evidence.
- REVIEW — evidence is insufficient or ambiguous; human review required.
- BLOCK — evidence establishes a problem that prevents allowance within evaluated scope.

## Decision Receipt Relationship

The Assurance Package & Decision Receipt Layer owns the canonical package/receipt/report integrity output. The Decision Receipt is the tamper-evident record of what was evaluated, what was established, and what disposition was reached.

- Do not create a second receipt format.
- Do not modify receipt integrity semantics without updating the architecture baseline.

## Operating Envelope Authority

The Operating Envelope defines the bounds within which an ALLOW disposition is valid. ALLOW outside the Operating Envelope is not ALLOW.

- The Operating Envelope is defined by evaluated scope + available evidence + time bounds.
- Do not expand the Operating Envelope without new evidence.
- Do not silently narrow the Operating Envelope without recording what changed.

## No Compliance/Certification Overclaim

- Do not output "certified," "compliant," "accredited," or "audited" unless an actual certification/accreditation/audit exists.
- Framework mapping output must say "mapping" or "readiness," not "certification" or "compliance."
- Do not upgrade PARTIAL to PASS.
- Do not upgrade SOURCE_ESTABLISHED to SAFE.

## Legacy Compatibility

- `NOT_VERIFIED` / `REVIEW_REQUIRED` are S0 containment statuses. Do not remove until U2/U5 replaces.
- `evidenceProvenance` on `ComputedDIS` is legacy containment. Do not remove until its active dependency cone is proven migrated.
- Legacy Decision Pipeline scoring (`lib/decision-pipeline/scoring.ts`) is not the canonical Assurance disposition.
