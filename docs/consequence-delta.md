# Consequence Delta

Git tells you what changed in code. Consequence Delta compares qualified
evaluations to determine what changed in the source-backed consequence and
evidence surface.

Outcomes: `ADDED`, `REMOVED`, `EXPANDED`, `NARROWED`, `CONTROL_CHANGED`,
`DEPENDENCY_CHANGED`, `EVIDENCE_CHANGED`, `UNRESOLVED_DELTA` — or no qualified
consequence change established.

Delta is not a risk score. A zero delta is not proof of safety — it means no
qualified consequence change was established between the compared evaluations.

No public Kestrel A/B delta artifact is presented in this pack because no
qualified A/B pair exists; we document the capability and its tests rather
than fabricate a demo.

Owner: `lib/assurance/consequence-delta.ts`,
`lib/assurance/consequence-delta-service.ts`,
`lib/topology/constellation-delta-overlay.ts`.
