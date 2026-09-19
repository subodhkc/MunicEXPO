# AI Action Path Assurance by HAIEC

## What can your AI actually cause?

HAIEC is an evidence-bound assurance system for consequential AI and agentic
software.

It traces evaluated AI-facing capabilities into application code and
consequential effects, shows what the evidence establishes, preserves where
proof stops, and compares qualified releases without turning unknown evidence
into a pass.

> **Permission is not delegation. Capability is not authorization.
> Code Capable is not Observed.**

---

## Judge — start here

The fastest way to review the MunichTech EXPO submission:

| Review | Link |
|---|---|
| **Watch the 2–3 minute demo** | https://youtu.be/9MZQBOY8RKI |
| **Interactive demo login** | [JUDGE-ACCESS.md](JUDGE-ACCESS.md) |
| **Kestrel Assurance Report** | https://www.haiec.com/sample-reports/kestrel |
| **See how Kestrel can act** | https://www.haiec.com/sample-reports/kestrel/constellation |
| **Compare Release A vs Release B** | https://www.haiec.com/sample-reports/kestrel/compare |
| **Judge Review & Evidence Index** | https://docs.google.com/document/d/1x0wNPmIrzUUvyohCfohWt563eIjtkYYIDS_NjcoeTxw/edit |
| **Judge Deck** | https://docs.google.com/presentation/d/1SMUI5CNS6bds3YYZy7jI9FvfDqpCV8BU/edit |
| **Technical Evaluation Companion** | https://docs.google.com/presentation/d/1r-UUk8P6B-ruWQQJmZOcYz1_WxQI_fvD/edit |
| **Verify the evidence locally** | `node competition/verify-evidence.mjs` |
| **Baseline Kestrel Evidence ZIP** | https://drive.google.com/file/d/1blQpcCwEI8Q3NoeHGWBrt-Cr5j3mcZR7/view |
| **Release A–B Comparison Evidence ZIP** | https://drive.google.com/file/d/1gYKAaABgfkyBp7T5btC0xpkxRFDWykCX/view |
| **Judge deck & docs (Drive folder)** | https://drive.google.com/drive/folders/1OZzt-FQ5OikApRYyjqi_9vnoEvhsH4Xd |
| **Judge materials (in this repo)** | [`competition/judge-materials/`](competition/judge-materials/) |
| **60-second repository guide** | [JUDGE-START-HERE.md](JUDGE-START-HERE.md) |

No login is required for the public Kestrel report, consequence view, or
release comparison.

---

## What we tested

We evaluated **Kestrel**, a real AI service-call application, against a frozen
source snapshot.

**Baseline source**

`5e65843fddfe5f907485b798e464ad37b3b3b2c7`

**Public evaluation reference**

`HAIEC-KESTREL-EVAL-5e65843`

This is a sanitized publication projection of the real evaluation. It is not
a synthetic result and it is not a new evaluation created for the public
demo.

---

## What HAIEC found

| Evidence | Result |
|---|---:|
| Assurance Decision | **REVIEW** |
| Consequential action paths | **44** |
| Code Capable | **44 / 44 ESTABLISHED** |
| Supporting Action Path evidence traces | **1,322** |
| Evidence Frontier items | **555** |
| Requested | NOT ASSESSED |
| Policy Authorized | NOT ASSESSED |
| Effectively Granted | NOT ASSESSED |
| Observed | NOT ASSESSED |

The important part is not simply that HAIEC found paths.

It kept five different evidence questions separate instead of turning
technical capability into an authorization or runtime claim.

---

## One example: ORDER RECORD WRITE

The strongest Kestrel example is an evaluated path reaching an order-record
write.

The presentation intentionally distinguishes established evidence from
frontier:

```text
Kestrel system
      · · · evidence frontier · · ·
Evaluated capability
      · · · evidence frontier · · ·
handle_place_order
      ── established consequence relation ──▶
ORDER RECORD WRITE
      WRITE · target: orders
```

HAIEC established that application code can reach this consequential
operation.

It did **not** claim that:

* the organization authorized the action,
* effective runtime authority was established,
* the path executed in production, or
* an order transaction was observed.

Those are separate evidence questions.

That is why the result remains **REVIEW**.

---

## The consequence view

The live Kestrel experience does not begin with hundreds of topology objects.

It begins with **8 understandable consequence families**, while preserving all
**44 exact evaluated paths and consequence identities** underneath:

* ORDER RECORD WRITE
* CALL LIFECYCLE RECORD WRITE
* MENU ITEMS READ
* CALL LIFECYCLE TABLE READ
* CUSTOMER MESSAGE RECORDS READ
* TENANT TIMEZONE CONFIG READ
* TENANT LOCATIONS READ
* AI CONFIG TEMPLATE READ

The interface then lets a reviewer move through:

**Overview → Action Paths → Authority → Proof → System Map**

The full System Map remains available for advanced exploration, but it is not
used as a substitute for evidence.

[Explore how Kestrel can act →](https://www.haiec.com/sample-reports/kestrel/constellation)

---

## What changed between releases?

HAIEC also compared two qualified evaluations of the same Kestrel system.

**Release A**

`5e65843fddfe5f907485b798e464ad37b3b3b2c7` — public ref `HAIEC-KESTREL-EVAL-5e65843`

**Release B**

`27c56a9fdb21e7af6b91df9e61e8841129ed9ad9` — public ref `HAIEC-KESTREL-EVAL-27c56a9`

### Result

| Comparison evidence                       |           Result |
| ----------------------------------------- | ---------------: |
| Overall comparison                        | **INCONCLUSIVE** |
| Established `CONTROL_CHANGED`             |           **12** |
| `UNRESOLVED` positional facts             |           **99** |
| Unexpected established structural changes |            **0** |
| Release perimeter                         |             SAME |
| Analyzer comparability                    |            EXACT |
| Repeatability                             |             PASS |

The established change was a confirmation-control transition from:

`DECLARED`

to:

`DECLARED + PATH_BOUND`

across 12 qualified consequence facts.

The comparison deliberately did **not** convert partial absence coverage into
a removal claim.

> **UNRESOLVED ≠ ABSENT**

Git can tell you which files changed.

HAIEC asks a different question:

> **What changed in the evidence around consequential behavior?**

[Open the public Release A / Release B comparison →](https://www.haiec.com/sample-reports/kestrel/compare)

---

## Evidence you can inspect yourself

This repository includes a sanitized evidence pack tied to the frozen Kestrel
baseline evaluation.

### Reports

* [Executive Assurance Report](demo/kestrel/reports/HAIEC-Kestrel-Executive-Assurance-Report.pdf)
* [Technical Assurance Report](demo/kestrel/reports/HAIEC-Kestrel-Technical-Assurance-Report.pdf)
* [Assurance Evidence Report](demo/kestrel/reports/HAIEC-Kestrel-Assurance-Evidence-Report.pdf)

### Portable evidence

* [Agentic Production Passport](demo/kestrel/passport/agentic-production-passport.json)
* [Decision Receipt](demo/kestrel/receipts/decision-receipt.json)
* [Machine-readable evidence](demo/kestrel/evidence/kestrel-assurance.machine.json)
* [Sanitized report projection](demo/kestrel/evidence/kestrel-assurance.public.json)
* [Sanitized A/B-8 release-comparison projection](demo/kestrel/evidence/kestrel-compare.public.json)
* [SHA-256 evidence manifest](demo/kestrel/evidence/manifest.json)

### Verify locally

Requires Node.js and no third-party dependencies:

```bash
node competition/verify-evidence.mjs
```

The verifier checks artifact integrity, source/evaluation binding, assurance
decision, action-path counts, evidence-plane states, Passport and Decision
Receipt continuity.

---

## What HAIEC is doing differently

Traditional tools each answer useful but narrower questions.

IAM can tell you what an identity is permitted to access.

Static security analysis can identify code-level weaknesses.

Runtime controls can observe or constrain execution.

Governance systems can document policies and obligations.

HAIEC is designed to connect another layer:

> **What consequential action is source-reachable in the evaluated system,
> under what evidence of authority and control, and exactly where does the
> proof stop?**

HAIEC complements AppSec, IAM, runtime security, observability and governance.
It does not replace them.

---

## Why consequential software matters

In 2012, Knight Capital lost more than $460 million in roughly 45 minutes
after a software deployment failure left old functionality active on one
production server.

Knight Capital was **not an AI incident**. We use it as a historical example
of why consequential software requires strong control and evidence around what
it can cause — not as a claim that HAIEC would have prevented the incident.

Source:
[SEC Release No. 34-70694](https://www.sec.gov/files/litigation/admin/2013/34-70694.pdf)

Agentic AI raises the same structural question in a new setting: systems now
have tools, credentials, APIs and the ability to create real-world effects.

---

## What was built during MunichTech

HAIEC existed before the competition. We do not present the entire company or
platform as MunichTech work.

The pre-existing foundation included the HAIEC SaaS platform, earlier
assurance evaluator/types, package/receipt infrastructure, scanner
foundations and commercial infrastructure.

Competition-period engineering added and materially advanced the
judge-visible action-assurance layer, including:

| Capability                                          | Competition-period milestone |
| --------------------------------------------------- | ---------------------------- |
| System topology / Constellation core                | Sep 4–9                      |
| Five-plane Action Assurance                         | Sep 9                        |
| Agentic Production Passport + artifact integrity    | Sep 10–12                    |
| Consequence Delta                                   | Sep 11–12                    |
| Evidence-bound report projections                   | Sep 13                       |
| Real-repository Kestrel public assurance experience | Sep 14                       |
| Qualified Kestrel Release A / Release B comparison  | Sep 18                       |
| Public release-comparison projection                | Sep 18                       |
| Consequence-first workflow visualization            | Sep 19                       |

See:

* [ORIGINALITY.md](ORIGINALITY.md)
* [Competition build timeline](competition/BUILD-TIMELINE.md)
* [Feature / commit map](competition/FEATURE-COMMIT-MAP.json)
* [Publication scope](PUBLICATION-SCOPE.md)

The public record distinguishes **pre-existing foundation** from
**competition-period work** rather than relabeling earlier HAIEC code as new.

---

## Claim boundaries

HAIEC intentionally preserves bounded answers.

`CODE_CAPABLE != AUTHORIZED`

`CODE_CAPABLE != OBSERVED`

`NOT_ASSESSED != PASS`

`NOT_ASSESSED != FAILURE`

`UNRESOLVED != ABSENT`

`SOURCE_REACHABLE != RUNTIME_EXECUTED`

`PASSPORT != CERTIFICATION`

A strong assurance system should not become more confident than its evidence.

---

## Interactive judge review

An authenticated MunichTech demo workspace is available for optional deeper
review.

See [JUDGE-ACCESS.md](JUDGE-ACCESS.md).

The public report, consequence view and Release Comparison do not require
credentials.

---

## Want to try HAIEC on your own system?

Email **[subodhkc@subodhkc.com](mailto:subodhkc@subodhkc.com)**

Subject:

**MUNIC TECH EXPO TRIAL Request**

Tell us whether you want a guided walkthrough or want to evaluate your own
repository/system.

---

## Repository scope

This repository is the public MunichTech implementation and evidence slice of
HAIEC.

It intentionally excludes unrelated or sensitive production SaaS
infrastructure such as customer data, production secrets, billing and
private deployment configuration.

See [PUBLICATION-SCOPE.md](PUBLICATION-SCOPE.md) for the exact boundary.

---

**HAIEC — Human AI Evidence Company**

*High assurance in every consequence.*
