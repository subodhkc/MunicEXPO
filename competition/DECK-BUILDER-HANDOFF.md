# Deck Builder Handoff — MunichTech EXPO 2026

Everything a presentation builder needs, evidence-bound. No fishing required.

## Canonical story

Knight Capital, 2012: a deployment missed one of eight servers. Dormant
trading code remained callable; for ~45 minutes the system kept acting —
~$460M lost (SEC Release No. 34-70694).

**Explicitly NOT an AI incident.** Structural analogy only: dormant/callable
capability can matter even before anyone intended that consequence.

Then the question:

## **What can your AI actually cause?**

Kestrel real repository → source-backed action/consequence mapping → five
evidence planes → Evidence Frontier / Inspect Proof → Assurance **REVIEW** →
portable evidence/report outputs.

## Frozen Kestrel facts (exact)

- Source commit: `5e65843fddfe5f907485b798e464ad37b3b3b2c7`
- Evaluation: `HAIEC-KESTREL-EVAL-5e65843` (public ref)
- Disposition: **REVIEW**
- Consequential action paths: **44**
- Code Capable: **44/44**
- Requested / Policy Authorized / Effectively Granted / Observed:
  **NOT_ASSESSED**

`CODE_CAPABLE != OBSERVED` · `NOT_ASSESSED != SAFE`

## Recommended visuals (ranked)

1. **`demo/kestrel/screenshots/constellation-focused-path-1440.png`**
   *Proves:* one full source-backed path (Agent → Capability → Handler →
   Operation → Consequence) ending in ORDER RECORD WRITE, with the five
   planes shown independently.
   *Caption:* "One path, traced from the agent to an actual order-record
   write — and exactly which evidence planes are established."
   *Do not claim:* that the path executed or was authorized.

2. **`demo/kestrel/screenshots/five-evidence-planes-technical-1440.png`**
   *Proves:* the five independent evidence questions rendered honestly.
   *Caption:* "Requested, authorized, granted, capable, observed — separate
   evidence, never blurred."
   *Do not claim:* the planes form a maturity ladder or pipeline.

3. **`demo/kestrel/screenshots/assurance-decision-executive-1440.png`**
   *Proves:* REVIEW disposition + executive summary on a real repository.
   *Caption:* "REVIEW — bounded to the evaluated scope and available
   evidence."
   *Do not claim:* REVIEW means failure or safety.

4. **`demo/kestrel/screenshots/constellation-overview-1440.png`**
   *Proves:* consequence-first constellation, frozen snapshot basis.
   *Caption:* "What the system can reach — consequence-first, not the
   mutable current view."
   *Do not claim:* edges are observed executions.

5. **`demo/kestrel/screenshots/authenticated-eval-report-1440.png`** *(optional)*
   *Proves:* the same frozen evaluation inside the product workspace.
   *Caption:* "Same evaluation in the authenticated product — the public
   demo is not a mock."

Do not use the mobile screenshot for the main pitch (layout check only).

## Reports / assets

- `demo/kestrel/reports/HAIEC-Kestrel-Executive-Assurance-Report.pdf`
- `demo/kestrel/reports/HAIEC-Kestrel-Technical-Assurance-Report.pdf`
- `demo/kestrel/reports/HAIEC-Kestrel-Assurance-Evidence-Report.pdf`
- `demo/kestrel/passport/agentic-production-passport.json`
- `demo/kestrel/receipts/decision-receipt.json`
- `competition/architecture.svg`
- `competition/WHAT-WE-BUILT-DURING-MUNICTECH.svg`

## Do-not-overclaim list

- HAIEC did not observe execution from static evidence.
- Provider/IAM effective authority is not established unless corresponding
  evidence exists — for Kestrel it does not.
- Knight Capital was not an AI incident.
- A qualified Kestrel A/B-8 comparison exists — 12 CONTROL_CHANGED,
  99 UNRESOLVED, overall INCONCLUSIVE. Present only those qualified claims;
  do not turn INCONCLUSIVE into a pass or a score.
- Passport is a portable evidence record, not certification.
- The public Kestrel demo is a frozen evaluation projection, not a fresh
  rescan.
