# lib/topology/ — AI Action & Access Map Truth

Scoped agent guide for the `lib/topology/` directory. Adds local constraints to root `AGENTS.md`. Must not contradict root.

## AI Action & Access Map Truth

The AI Action & Access Map is an evidence-bound representation of what AI systems and agents can reach, what controls apply, and what the evidence actually establishes. It is NOT a claim of safety. It is NOT a claim of completeness.

## JoinBasis

Every edge in the topology graph has a `JoinBasis` that declares what evidence type established the connection:

- **STATIC** — established by static source analysis (what the code is capable of).
- **CREDENTIAL** — established by credential evidence (what the credential evidence supports).
- **POLICY** — established by policy/configuration evidence.
- **OBSERVED** — established by runtime observation (what actually happened).
- **INFERRED** — inferred from a combination of the above, with explicit reasoning.

Do not upgrade INFERRED to OBSERVED. Do not upgrade STATIC to OBSERVED. Each JoinBasis is a distinct evidence type with distinct limitations.

## Edge Semantics

- **Permission != Delegation** — A credential granting permission does not establish that the agent was delegated to use it. Credential evidence establishes what the credential evidence supports.
- **Code-capable != Observed** — Static analysis showing a code path exists does not establish that the path was exercised at runtime.
- **Effectively granted != Actually exercised** — What credentials establish is not the same as what was observed.

## Sample vs Production Separation

- The public sample map (`/sample-ai-action-access-map`) uses a fixed, illustrative `SAMPLE_PROJECTION` constant.
- The sample is NOT evidence. It is NOT an Assurance evaluation. It must NEVER contaminate production source truth.
- Permanent lock: `PUBLIC_SAMPLE == SAME_SYNTHETIC_TRUTH_BOUNDARY`
- Production topology data comes from connected evidence sources and is authenticated.
- Do not mix sample and production data paths.

## Static != Runtime

- Static analysis establishes what the code is capable of.
- Runtime observation establishes what actually happened.
- They are different evidence types. Do not treat one as the other.
- A node or edge established by static analysis must not be labeled as observed.

## Unknown != Observed

- Unknown is a first-class status, not a gap to be hidden.
- Missing runtime evidence is not "did not happen."
- Unobserved paths are not "non-existent."
- The Map must preserve these distinctions visibly.
