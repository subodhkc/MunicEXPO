# Judge — Start Here

**The question:** What can your AI actually cause?

**The 60-second path:** Tested → Found → Path → Change → Verify.

## 1. TESTED — what did HAIEC evaluate?

A frozen source snapshot of the real **Kestrel** AI Service Call Agent at
commit `5e65843fddfe5f907485b798e464ad37b3b3b2c7`
(public ref `HAIEC-KESTREL-EVAL-5e65843`).

## 2. FOUND — what did HAIEC find?

[Kestrel Assurance Report](https://www.haiec.com/sample-reports/kestrel)
→ decision **REVIEW** · **44** consequential action paths · Code Capable
**44/44 ESTABLISHED**. Requested, Policy Authorized, Effectively Granted and
Observed remain honestly `NOT_ASSESSED`.

## 3. PATH — show me one path

[ORDER RECORD WRITE](https://www.haiec.com/sample-reports/kestrel/constellation?path=99a1e018d6e45a2f25cc013039d876a64afe87394f7d17c03c50d99a0547993d)
— one click opens the focused consequence path: `handle_place_order` →
`orders` insert → **ORDER RECORD WRITE**. The view explains the established
consequence *and* the evidence boundary — where proof stops.

## 4. CHANGE — what changed between releases?

[Release A / Release B comparison](https://www.haiec.com/sample-reports/kestrel/compare)
→ **12 CONTROL_CHANGED**, **99 UNRESOLVED**, overall **INCONCLUSIVE**.
Git shows file changes; HAIEC shows qualified consequence/control change —
and preserves unresolved evidence as unresolved instead of guessing.

## 5. VERIFY — check it yourself

- **Live, no login:** report · consequence view · release comparison (links
  above).
- **PDFs:** executive / technical / assurance-evidence reports in
  `demo/kestrel/reports/`.
- **Local integrity check** (Node, zero dependencies):
  ```
  node competition/verify-evidence.mjs
  ```
  Artifact hashes, decision, path count, plane states, A/B-8 comparison
  facts, source/evaluation bindings.
- **Evidence packs + references:** Judge Deck, Technical Evaluation
  Companion, Technical Judge FAQ, Hands-On Trial Guide and Drive evidence
  packs are linked from the README judge block and
  [`JUDGE-ACCESS.md`](JUDGE-ACCESS.md).

## Optional interactive review

- **Login:** https://www.haiec.com/login
- **Email:** `munich-judge@haiec.com` · **Password:** `Kestrel-Judge-2026`

After login, open **Judge Review** at the top of the Munich Tech group in the
sidebar — the same Tested → Found → Path → Change → Verify flow as a guided
in-product experience. *If a welcome tour appears on first login, click "Skip
tour".* Demonstration data only.

## Originality

[`ORIGINALITY.md`](ORIGINALITY.md): every capability is mapped to its real Git
commit and date — pre-existing foundation vs. competition-period work.

---

## The boundary, plainly

**Pre-existing foundation:** HAIEC platform, earlier assurance
evaluator/types, package/receipt layer, static scanner, SaaS infrastructure.

**Built/advanced during MunichTech:** System Constellation projection,
five-plane Action Assurance, Agentic Production Passport, Consequence Delta,
artifact integrity/output convergence, report profiles, the Kestrel public
demo/publication experience, the qualified Release A/B comparison, and the
consequence-first workflow view — per the Git-derived provenance record.
