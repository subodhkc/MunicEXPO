# AIAGENT.md — Repository Brief for AI Agents

**Project:** AI Action Path Assurance by HAIEC
**Event:** MunichTech EXPO 2026
**Repository role:** Public implementation and evidence slice of the HAIEC
submission — code, tests, frozen evaluation evidence, and judge materials.

---

## TL;DR

HAIEC answers one question most tools do not:

> **What can this AI system actually cause — and exactly where does the
> proof stop?**

On the real-repository Kestrel evaluation, HAIEC established **44
consequential action paths** with **Code Capable 44/44**, kept the other four
evidence planes honestly at `NOT_ASSESSED`, and produced decision **REVIEW**.
It then compared two qualified releases and reported **12 `CONTROL_CHANGED`,
99 `UNRESOLVED`, overall `INCONCLUSIVE`** — without converting unknowns into
passes.

Everything a judge needs is reachable without login. The published Kestrel
evidence artifacts are SHA-256 verifiable locally through the competition
verifier; bundled judge materials also carry a separate snapshot SHA-256
list.

```bash
node competition/verify-evidence.mjs
```

---

## USP — what is different here

1. **Evidence-bound assurance, not a scanner verdict.** HAIEC keeps five
   independent evidence planes separate — `Requested · Policy Authorized ·
   Effectively Granted · Code Capable · Observed`. One plane's state never
   implies another's. Capability is not authorization; capability is not
   observed execution.
2. **Consequence-first truth.** Consequence labels come from the actual
   operation at the exact frozen source line (`orders.insert(...)` →
   `ORDER RECORD WRITE`), never from naming heuristics.
3. **Honest frontier.** The evaluation ships its Evidence Frontier — 555
   items it could *not* establish — as first-class output, not a footnote.
4. **Release comparison over evidence, not diffs.** Consequence Delta
   compares two qualified evaluations and reports qualified change:
   `CONTROL_CHANGED`, `ADDED`, `REMOVED`, `UNRESOLVED` — and `UNRESOLVED` is
   preserved as unresolved rather than guessed.
5. **Portable, verifiable evidence.** Agentic Production Passport, canonical
   Decision Receipt, machine JSON, sanitized public projection, and a
   SHA-256 manifest travel with the release.
6. **Provenance by Git, not by claim.** `ORIGINALITY.md` and
   `competition/` map every capability to real commits and dates —
   pre-existing foundation vs. competition-period work is explicit.

## Strengths

- **Real target, not a toy.** Kestrel is a real AI service-call application
  (Python/FastAPI, tool-dispatched voice ordering) evaluated at frozen commit
  `5e65843fddfe5f907485b798e464ad37b3b3b2c7` (public ref
  `HAIEC-KESTREL-EVAL-5e65843`).
- **Live product behind the repo.** Public report, consequence view, and
  release comparison are served by the production HAIEC platform — the repo
  is a slice, not a mock.
- **Judge-verifiable end to end.** One command checks artifact integrity,
  source/evaluation binding, disposition, path counts, plane states,
  Passport and Receipt continuity, and the A/B-8 comparison facts.
- **Bounded claims by design.** `NOT_ASSESSED != PASS`, `UNRESOLVED !=
  ABSENT`, `PASSPORT != CERTIFICATION`. The system is designed to not become
  more confident than its evidence.

## Key result (frozen, verifiable)

| Evidence | Result |
|---|---:|
| Assurance Decision | REVIEW |
| Consequential action paths | 44 |
| Code Capable | 44/44 ESTABLISHED |
| Supporting evidence traces | 1,322 |
| Evidence Frontier items | 555 |
| A/B-8 comparison | 12 CONTROL_CHANGED · 99 UNRESOLVED · INCONCLUSIVE |

Release A `5e65843…` vs Release B `27c56a9…` — same release perimeter,
exact analyzer comparability, repeatability PASS.

## Repository map

| Path | Contents |
|---|---|
| `app/`, `components/`, `lib/`, `data/` | Public-safe implementation slice |
| `demo/kestrel/` | Report PDFs, Passport, Decision Receipt, machine + public JSON, SHA-256 manifest, screenshots |
| `demo/kestrel/evidence/kestrel-compare.public.json` | Sanitized A/B-8 comparison projection |
| `competition/` | Devpost copy, compliance matrix, build timeline, originality manifests, evidence verifier |
| `competition/judge-materials/` | Judge Deck, Technical Evaluation Companion, Judge FAQ, Hands-On Trial Guide, scoring map, Europe brief |
| `docs/` | Capability explainers incl. Kestrel case study and Consequence Delta |
| `JUDGE-START-HERE.md` | 60-second judge path |
| `JUDGE-ACCESS.md` | Live URLs, workspace access, references |
| `EVIDENCE-MANIFEST.md` | Claim → code → test → live surface → artifact → commit |
| `PUBLICATION-SCOPE.md` | Exactly what is published, sanitized, or excluded |
| `ORIGINALITY.md` | Pre-existing foundation vs. competition-period work |

## Live surfaces (no login)

- Kestrel Assurance Report — https://www.haiec.com/sample-reports/kestrel
- Consequence view — https://www.haiec.com/sample-reports/kestrel/constellation
- Release A/B comparison — https://www.haiec.com/sample-reports/kestrel/compare
- Demo video — https://youtu.be/9MZQBOY8RKI
- Judge deck & docs — https://drive.google.com/drive/folders/1OZzt-FQ5OikApRYyjqi_9vnoEvhsH4Xd

The MunichTech demo credential is intentionally public and grants access only
to the designated demonstration workspace; it is not a production/customer
credential.

## What this repository does NOT claim

- No authorization, effective permission, runtime execution, or completed
  transaction is claimed from static evidence — those planes read
  `NOT_ASSESSED`.
- `SOURCE_REACHABLE` is not `EXECUTED`. A static path is not a runtime event.
- The Passport is a portable assurance record, not a certification or audit
  opinion.
- The public demo is a sanitized projection of a real frozen evaluation —
  not a customer deployment and not a new evaluation made for the demo.

## Contact

Try HAIEC on your own system: **subodhkc@subodhkc.com** — subject
**MUNIC TECH EXPO TRIAL Request**.

---

*HAIEC — Human AI Evidence Company. High assurance in every consequence.*
