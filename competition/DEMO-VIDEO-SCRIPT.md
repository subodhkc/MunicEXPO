# Demo Video Script — ~2:30

> **ARCHIVED PRE-A/B SCRIPT — the submitted demo video
> (https://youtu.be/9MZQBOY8RKI) supersedes this file.** This script predates
> the qualified A/B-8 Release A / Release B comparison (12 CONTROL_CHANGED,
> 99 UNRESOLVED, overall INCONCLUSIVE), which is demonstrated live at
> https://www.haiec.com/sample-reports/kestrel/compare and in the Judge
> Review guided flow.

All screens are the **live production site** (https://www.haiec.com) or the
public repo. Record at 1440p viewport. Do NOT show the judge password,
internal UUIDs beyond what the public demo already shows, or any logged-in
view with real customer data — the public routes suffice for almost all
segments.

## 0:00–0:12 — Hook (compressed)

**Screen:** Title card or the public report header (decision REVIEW visible).

**Narration:**
"In 2012, Knight Capital lost $460 million in 45 minutes — not to a hacker.
Their own production software kept acting. Now AI agents have tools,
credentials, and permission to act."

## 0:12–0:30 — The question

**Screen:** https://www.haiec.com/sample-reports/kestrel — scroll to the
decision banner.

**Narration:**
"So we built HAIEC to answer one question: what can your AI actually cause?
This is a real evaluation of a real repository — Kestrel, an AI service call
agent — frozen at a specific commit."

## 0:30–1:10 — Constellation, one path

**Screen:** https://www.haiec.com/sample-reports/kestrel/constellation

**Click:** Select the **ORDER RECORD WRITE** path (top consequential path).

**Narration:**
"The System Constellation shows what the system can reach — consequence-first.
This path: agent, capability, dispatch, handler — ending in an actual order
record write. Not a permission name. The exact operation in the frozen
source."

## 1:10–1:40 — Inspect Proof + where proof stops

**Screen:** Same constellation page — open Inspect Proof on the selected
path; then the Evidence Frontier section.

**Narration:**
"Inspect Proof opens the source-backed chain. And here — the Evidence
Frontier — is where HAIEC is honest about what it cannot establish. 555
frontier items are shown, not hidden. It shows where the proof stops."

## 1:40–2:05 — Five planes

**Screen:** Report → Technical profile → Action Assurance section
(https://www.haiec.com/sample-reports/kestrel).

**Narration:**
"Five independent evidence questions. Code Capable: all 44 paths — the code
really can do it. But Requested, Policy Authorized, Effectively Granted,
Observed: NOT ASSESSED. A path existing is not authorization, and it's not
execution. HAIEC never blurs that."

## 2:05–2:22 — Passport / evidence package

**Screen:** Public repo → `demo/kestrel/` — show passport JSON briefly, then
terminal: `node competition/verify-evidence.mjs` → 25 PASS.

**Narration:**
"The evidence travels with the release — the Agentic Production Passport, a
canonical decision receipt, machine-readable JSON, all hash-bound. Anyone can
verify the published pack locally — one command, no dependencies."

## 2:22–2:35 — Originality + close

**Screen:** `competition/WHAT-WE-BUILT-DURING-MUNICTECH.svg` or the
build-timeline section of README.

**Narration:**
"Everything competition-relevant was built inside the window — and the Git
provenance is public. Git shows what changed in code. HAIEC shows what
changed in what the system can reach. Map the consequence. Prove the path.
Show what changed."

## Do NOT show on screen

- Judge password / any credentials
- Internal org/scan/run UUIDs beyond what the sanitized public demo shows
- Customer/production data in the logged-in workspace
- Consequence Delta claims beyond the established A/B-8 result (12
  CONTROL_CHANGED, 99 UNRESOLVED, INCONCLUSIVE — qualified, bounded)

## If you show the logged-in workspace

- Workspace: MunichTech Demo; click "Skip tour" if the welcome modal appears
- Route: Assurance → Evaluations → Kestrel report (REVIEW)
- Do NOT film other orgs or fixture systems beyond the demo set
