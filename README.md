# HAIEC Constellation

## What can your AI actually cause?

In 2012, Knight Capital deployed a trading-software update.

Eight production servers were supposed to receive the new code.

Seven did.

One did not.

On that server, old dormant trading functionality remained callable.

For roughly 45 minutes, Knight's system kept acting.

It sent millions of orders into the market. It traded nearly 400 million
shares. It accumulated billions of dollars of unintended positions.

By the time the incident was stopped, Knight had lost more than $460 million.

The system wasn't externally hacked.

It was Knight's own production software operating through legitimate market
access.

The software could act.

The surrounding controls did not adequately bound what that software could
cause.

Now we are giving AI agents tools, credentials, APIs, memory, shared state,
queues, MCP servers, and permission to act.

And we are asking a dangerous question too late:

## What can this AI actually cause?

That's why we built HAIEC.

> *Knight Capital was not an AI incident. We use it as a historical example of
> why consequential software needs controls and evidence around what it can
> cause — not as proof that our product would have prevented it.*
> — [SEC Release No. 34-70694](https://www.sec.gov/files/litigation/admin/2013/34-70694.pdf)

```
Agent  →  Tool  →  Service  →  Consequence
```

**HAIEC follows that chain.**

---

## Follow the consequence

A permission tells you what an identity may be allowed to do.

A tool registry tells you what tools exist.

Neither necessarily tells you the complete path an AI system can reach.

HAIEC reconstructs source-backed paths through the system:

```
Source Context → Capability Exposure → Dispatch → Implementation
      → Handler → Service / Resource → Consequence
```

Then it asks five separate evidence questions — independently, not as a
pipeline:

| Question | Customer-facing name |
|---|---|
| What was requested? | Requested |
| What did policy authorize? | Policy Authorized |
| What authority was effectively established? | Effectively Granted |
| What can the code actually do? | Code Capable |
| What was actually observed? | Observed |

HAIEC is useful not only because it shows what it can prove.

**It is useful because it shows where the proof stops.**

That boundary is the Evidence Frontier — the explicit record of what the
evaluation could not establish.

---

## Real application — Kestrel

We evaluated a real repository: **Kestrel**, an AI service call agent
(Python/FastAPI, tool-dispatched voice ordering and booking flows).

**Frozen source:** `5e65843fddfe5f907485b798e464ad37b3b3b2c7`
**Frozen evaluation:** `e909995b-6d40-44ee-b949-c3c5373abc47:assurance:1.1`

| Fact | Result |
|---|---|
| Assurance Decision | **REVIEW** |
| Consequential action paths | **44** |
| Code Capable | **44 / 44** |
| Requested | NOT ASSESSED |
| Policy Authorized | NOT ASSESSED |
| Effectively Granted | NOT ASSESSED |
| Observed | NOT ASSESSED |

Top consequential actions (exact established effects):

- **ORDER RECORD WRITE** — `orders` table insert
- **CALL LIFECYCLE RECORD WRITE** — `call_lifecycle` insert
- **CUSTOMER MESSAGE RECORDS READ** — `sms_messages` query
- **TENANT TIMEZONE CONFIG READ** — `ai_agent_configs` query

HAIEC found the path.

**It did not invent the execution.**

A source-backed Code Capable path reaching an order-record write does **not**
mean the organization authorized it, that runtime permission was established,
that the path executed, or that an order transaction completed. Each of those
is a separate evidence question — and HAIEC shows exactly which ones remain
open.

---

## Public flagship demo

No login required:

- **[Kestrel Assurance Report](https://www.haiec.com/sample-reports/kestrel)** —
  executive / technical / auditor profiles, Inspect Proof, download pack
- **[Kestrel System Constellation](https://www.haiec.com/sample-reports/kestrel/constellation)** —
  consequence-first view of the same frozen evaluation

Downloadable artifacts (all SHA-256 hashed, see
[`demo/kestrel/evidence/manifest.json`](demo/kestrel/evidence/manifest.json)):

- Executive Assurance Report PDF
- Technical Assurance Report PDF
- Assurance Evidence Report PDF
- Machine-readable JSON
- Sanitized public projection JSON

---

## What changed in what the system can reach

Git shows what changed in code.

HAIEC compares qualified evaluations to determine what changed in the
source-backed consequence/evidence surface — **Consequence Delta**: added,
removed, expanded, narrowed, control-changed, dependency-changed, or
evidence-changed paths. An unresolved delta stays unresolved.

## The record travels with the release

The **Agentic Production Passport** binds the evidence and decision context to
the exact evaluated system/version — a portable assurance record, not a
certification.

## The system around the model

**System Constellation** shows what the AI system can reach and cause: the
evidence-backed paths around the agent, which controls sit on those paths, and
where the evidence ends — evaluation snapshot vs. current view are never
blurred.

---

## What we built during MunichTech

| Capability | First implementation | Merged to Main | Public code | Live evidence |
|---|---|---|---|---|
| Topology / Constellation projection | 2026-09-04 | 2026-09-09 | `src/lib/topology/` | [Constellation](https://www.haiec.com/sample-reports/kestrel/constellation) |
| Action Assurance (five-plane section) | 2026-09-09 | 2026-09-09 | `src/lib/assurance/` | [Report](https://www.haiec.com/sample-reports/kestrel) |
| Agentic Production Passport | 2026-09-10 | 2026-09-12 | `src/lib/assurance/agentic-production-passport.ts` | `demo/kestrel/passport/` |
| Consequence Delta | 2026-09-11 | 2026-09-12 | `src/lib/assurance/consequence-delta*.ts` | docs |
| Artifact manifest / integrity | 2026-09-10 | 2026-09-12 | `src/lib/assurance/assurance-artifact-manifest.ts` | `demo/kestrel/evidence/manifest.json` |
| Report projection (bundle + profiles) | 2026-09-13 | 2026-09-13 | `src/lib/assurance/reporting-projection-bundle.ts` | live report |
| Kestrel real-repository qualification | 2026-09-13/14 | 2026-09-14 | `scripts/kestrel-demo-export.ts` | live demo |
| Consequence-first public demo pack | 2026-09-14 | 2026-09-14 | `src/app/sample-reports/kestrel/` | live demo |
| Consequence-label semantic hardening | 2026-09-14 | 2026-09-14 | `src/data/kestrel-demo/consequence-labels.ts` | corrected labels |

We don't ask judges to take our build timeline on faith. The public repository
preserves the competition-period implementation history, and
[`ORIGINALITY.md`](ORIGINALITY.md) maps each capability to its source commit,
tests, and live evidence.

---

## What HAIEC is — and is not

HAIEC is not another generic SAST scanner. It is not IAM. It is not a runtime
firewall. It is not a governance checklist. It complements all of them.

The core question:

> What source-backed path can lead from AI capability to consequence, under
> what authority/control context — and exactly where does the proof stop?

Production AI needs inspectable technical accountability. HAIEC gives teams
source-backed evidence about what agentic systems can reach, which controls
are on the path, and where assurance remains incomplete — built for
environments where consequential AI must be reviewable before automation is
trusted.

---

## Interactive judging access

See [`JUDGE-ACCESS.md`](JUDGE-ACCESS.md) — a live MunichTech Demo workspace is
available for optional interactive review. Password is provided in the private
judging instructions (never committed here).

## Repository scope

This repository contains the MunichTech implementation/evidence slice of
HAIEC. The production SaaS contains additional proprietary infrastructure
(auth, billing, org management, deployment). See
[`PUBLICATION-SCOPE.md`](PUBLICATION-SCOPE.md) for exactly what was published,
sanitized, or excluded — and why.

## Evidence limitations

- The public demo is a **sanitized projection** of a real frozen evaluation —
  not a new evaluation, and not a customer deployment.
- `NOT_ASSESSED` is not failure and not safety. `CODE_CAPABLE` is not observed
  execution. A static path is not a runtime event.
- No qualified Kestrel A/B pair exists, so no Consequence Delta screenshot is
  presented — we document the capability and its tests instead.
- All artifact digests are SHA-256 and verifiable independently.

## References

- [SEC Release No. 34-70694 — Knight Capital](https://www.sec.gov/files/litigation/admin/2013/34-70694.pdf)
- [SEC — Equity Market Structure literature review](https://www.sec.gov/marketstructure/research/hft_lit_review_march_2014.pdf) (Knight incident discussed)

---

*HAIEC — Human AI Evidence Company. High assurance in every consequence.*
