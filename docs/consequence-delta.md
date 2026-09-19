# Consequence Delta

Git tells you what changed in code. Consequence Delta compares qualified
evaluations to determine what changed in the source-backed consequence and
evidence surface.

Outcomes: `ADDED`, `REMOVED`, `EXPANDED`, `NARROWED`, `CONTROL_CHANGED`,
`DEPENDENCY_CHANGED`, `EVIDENCE_CHANGED`, `UNRESOLVED_DELTA` — or no qualified
consequence change established.

Delta is not a risk score. A zero delta is not proof of safety — it means no
qualified consequence change was established between the compared evaluations.

A qualified Kestrel A/B pair exists and is demonstrated: the A/B-8 Release
A / Release B comparison (eval refs `HAIEC-KESTREL-EVAL-5e65843` vs
`HAIEC-KESTREL-EVAL-27c56a9`) established 12 `CONTROL_CHANGED` facts while
99 positional facts remained `UNRESOLVED`; overall result `INCONCLUSIVE`.
The sanitized public projection is at
[demo/kestrel/evidence/kestrel-compare.public.json](../demo/kestrel/evidence/kestrel-compare.public.json)
and live at https://www.haiec.com/sample-reports/kestrel/compare.

Owner: `lib/assurance/consequence-delta.ts`,
`lib/assurance/consequence-delta-service.ts`,
`lib/topology/constellation-delta-overlay.ts`.
