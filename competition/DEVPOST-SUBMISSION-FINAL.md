# Devpost Submission — Final Copy

## Project name

AI Action Path Assurance by HAIEC

## One-line description

See what your AI agents can reach — and where those paths lead.

## Problem

What can your AI actually cause?

AI agents now hold tools, credentials, APIs, memory, and permission to act.
A permission record says what an identity may be allowed to do; a tool
registry says what tools exist. Neither tells you the complete path an AI
system can reach to a real-world consequence.

In 2012, Knight Capital lost over $460 million in roughly 45 minutes when its
own production software — not an attacker — kept acting through legitimate
market access (SEC Release No. 34-70694). It wasn't an AI incident; it's the
structural shape of the risk we are now handing to agents at scale.

## Solution

HAIEC reconstructs source-backed paths through the system:

Source Context → Capability Exposure → Dispatch → Implementation →
Handler → Service / Resource → Consequence

Then it asks five independent evidence questions — Requested, Policy
Authorized, Effectively Granted, Code Capable, Observed — and reports each
honestly, including when the answer is "not assessed." It is useful not only
because it shows what it can prove; it shows where the proof stops
(Evidence Frontier).

## Why it matters

Organizations are deploying consequential agentic software faster than they
can answer "what can this system actually cause, under what authority?" Static
code review, IAM reports, and runtime firewalls each see one slice. HAIEC
binds the path, the authority/control context, and the proof boundary into one
evaluated record.

## Why it matters for Europe

Production AI in European enterprise environments needs inspectable technical
accountability: source-backed evidence about what agentic systems can reach,
which controls are on the path, and where assurance remains incomplete —
before automation is trusted with consequential operations. HAIEC is built for
environments where consequential AI must be reviewable, and its honest
"where the proof stops" posture fits European expectations for technical
accountability and digital sovereignty.

## Target users

- Engineering and platform teams shipping agentic systems
- Security / assurance teams who must sign off on consequential automation
- Enterprises evaluating AI deployments against internal controls
- Assurance firms performing technical review of AI systems

## Technical architecture

Repository / AI System → source-backed analysis → canonical typed evidence
(capability, dispatch, handler, operation, resource, control, context
bindings) → evidence reconciliation → canonical Assurance Decision
(ALLOW / REVIEW / BLOCK, bounded to evaluated scope) → one exact evaluation →
Reports (executive/technical/auditor), System Constellation, Agentic
Production Passport, Decision Receipt, machine-readable evidence, Consequence
Delta.

Stack: TypeScript/Next.js, Prisma/PostgreSQL, Python AST extraction with
canonical-bytes verification, SHA-256/Merkle artifact integrity.

## What is technically novel

- A source-backed path model from AI capability to consequence — not a
  permission list, not a scanner rule list.
- Five strictly independent evidence planes; code capability is never
  promoted to authorization or observed execution.
- The Evidence Frontier: where the proof stops is a first-class output.
- The Agentic Production Passport: the evidence and decision context travel
  with the evaluated release as a portable, hash-bound record.

## How it was built

On top of the HAIEC platform foundation (pre-existing evaluator, package and
receipt layer, static scanner, SaaS infrastructure), the MunichTech window
produced the Constellation projection, the five-plane Action Assurance
section, the Passport, Consequence Delta, artifact-integrity/output
convergence, three report profiles, and the public Kestrel demonstration.
Every capability is mapped to its real commit in the public repository's
filtered history.

## Pre-existing foundation disclosure

Pre-existing: HAIEC platform, assurance evaluator/types/persistence,
assurance package/receipt service, action surface, engine registry, static
AI-security scanner, SaaS infrastructure.

Built during MunichTech (Git-verified): topology/Constellation projection
(Sep 4–9), five-plane Action Assurance (Sep 9), Passport + artifact manifest
+ product adapters (Sep 10), Consequence Delta (Sep 11), evidence-bound
report projection + report API/page (Sep 13), Kestrel real-repository demo
pack + consequence-label audit (Sep 14), qualified Kestrel Release A/B
comparison + public comparison projection (Sep 18), consequence-first
workflow visualization (Sep 19).

## What was built during MunichTech

See the disclosure above and the public repo's `ORIGINALITY.md` +
`competition/` directory — commit-mapped, date-verified, SHA-mapped back to
the private development history.

## Live demo

- Public report: https://www.haiec.com/sample-reports/kestrel
- Public constellation:
  https://www.haiec.com/sample-reports/kestrel/constellation
- Public Release A / Release B comparison:
  https://www.haiec.com/sample-reports/kestrel/compare
- Demo video: https://youtu.be/9MZQBOY8RKI
- Narrated judge-deck walkthrough: https://youtu.be/5Eb2XnLJ8UE
- Interactive workspace: https://www.haiec.com/login —
  `munich-judge@haiec.com` / `Kestrel-Judge-2026` — after login open
  **Judge Review** at the top of the Munich Tech sidebar group for the
  guided proof.

## Repository

https://github.com/subodhkc/MunicEXPO — filtered public history of the
competition-relevant implementation slice, originality manifests, sanitized
Kestrel evidence pack, and a zero-dependency verifier:

`node competition/verify-evidence.mjs`

## Limitations / responsible claim boundaries

- The public demo is a sanitized projection of one frozen real-repository
  evaluation — not a new evaluation and not a customer deployment.
- `CODE_CAPABLE` is not observed execution; `NOT_ASSESSED` is neither failure
  nor safety. The Kestrel evaluation honestly reports the four
  authority/runtime planes as not assessed.
- Consequence Delta is demonstrated on a qualified Kestrel A/B pair (A/B-8):
  12 CONTROL_CHANGED, 99 UNRESOLVED, overall INCONCLUSIVE. INCONCLUSIVE is a
  bounded answer — unresolved evidence is preserved, not converted into a
  pass or an absence claim.
- The Agentic Production Passport is a portable assurance record, not a
  certification.

## Deployment / enterprise use

HAIEC operates as a SaaS with organization-scoped tenancy, evaluating frozen
source snapshots of real repositories and producing evidence-bound assurance
artifacts (reports, Constellation, Passport, receipts, machine JSON) suitable
for enterprise review workflows. The Kestrel demonstration is a real
evaluation of a real repository — the same path judges can inspect live.
