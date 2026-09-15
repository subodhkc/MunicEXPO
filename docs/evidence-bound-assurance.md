# Evidence-Bound Assurance

Every HAIEC statement is bound to a specific evaluation of a specific source
snapshot. There is no floating verdict.

An assurance evaluation produces a canonical disposition — **ALLOW**,
**REVIEW**, or **BLOCK** — bounded to the evaluated scope and the available
evidence. Nothing more.

- A disposition applies only within its Operating Envelope.
- `UNKNOWN` is a first-class state, never silently converted to PASS or SAFE.
- Missing runtime evidence is never presented as proof of non-occurrence.
- Evidence feeds assurance; evidence alone is not a disposition.

The Kestrel demo is a frozen, real-repository evaluation — decision REVIEW,
44 consequential action paths — inspectable end to end in the live demo.
