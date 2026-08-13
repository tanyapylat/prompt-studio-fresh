# SDD Alignment: Resolving the Open Critiques

This doc reads the actual `Evals Service SDD.md` (author @Volodymyr Romaniv, team Cyborgs) against the critical review of this proposal ("grill me" pass) and resolves what can be resolved. Numbering below matches the critique list from that review.

**Headline finding:** the SDD confirms this proposal's core architectural bet — Spec, roles, approval workflow, and the whole Prompt-Studio-side UX are **correctly out of the Evals Platform's scope**. The SDD's own "Limitations, Dependencies, Unknowns" section lists "Auth: SSO, project isolation, or shared tokens — undecided" as unresolved on the Evals Platform side, and says nothing about approval roles at all — that's Prompt Studio's problem to own, which is exactly how this proposal split it. Two things the SDD changes materially: **migration** has a real, simple answer, and **online evaluation is Phase 2, not v1** — several docs need a phasing correction.

---

## Resolved by the SDD

### #3 — Migration of legacy prompts: answered, and simpler than proposed

The SDD's open-questions log has a direct answer:

> "Migration of existing PromptFoo YAML configs into eval definitions: automatic or manual? (Historical *results* are explicitly not migrated - starting clean.)" → **"All new configs should be created through new service. For old ones we should provide an ability to migrate it in case of need."**

This resolves open question #2 in [04](04-cross-cutting-ux-and-open-questions.md): **no bulk/automatic migration, no expectation that historical run history moves over.** Concretely:

- Every **new** prompt goes through the Spec → dry-run → Evals Platform flow from day one — no opt-out.
- **Existing** prompts stay on the legacy `ConfigurationJson` blob model until someone deliberately migrates that specific prompt — there is no forced cutover date or background migration job.
- The trigger for migrating a specific legacy prompt is exactly **Case B or Case A** in [03](03-workflow-new-version-from-existing.md): the first time someone needs a new version of an old prompt, that's the natural, low-friction moment to write a retroactive Spec for it (even a thin one — name, a few success criteria back-filled from the existing eval config) and let the new version enter the new model. Nobody needs to migrate a prompt that's stable and untouched.
- **Historical run results for that prompt do not carry over.** The prompt gets a clean slate in the Evals Platform starting from its first migrated version — this is explicit in the SDD, not an oversight in this proposal.

This turns a previously-open, potentially-blocking question into a non-event: the two systems simply coexist indefinitely, and prompts cross over one at a time, exactly when someone touches them.

### #11 — Storage/version growth: not actually a risk, per the SDD's own sizing

The SDD's "Expected data volumes" section sizes this directly:

> "The authoring side is small and human-paced... Hundreds → low thousands of rows total; effectively static day-to-day." Run-layer volume (the only thing that actually grows fast) is bounded by "the 30-day clearing job" for online/ingested payloads, and by batch-run frequency for batch — "v1 storage is modest and predictable."

So: forking a new version on every meaningful edit, forever, across every prompt in the org, is **not** the storage risk it sounded like — versioned authoring rows stay in the hundreds-to-low-thousands range regardless. The real volume driver is `run_item`/`Score` rows (proportional to dataset rows × targets × runs), and that's already accounted for by the retention job and is "someone else's problem" only in the sense that it's explicitly the Evals Platform's own designed-in responsibility, not an externality this proposal quietly created.

### #10 — Was I designing blind to the SDD? Partially, and it mattered less than feared

Now that it's readable: the SDD is almost entirely infrastructure/subsystem design (four subsystems, auth model, security posture, data volumes, stored-proc impact) — it does not touch Spec, roles, review workflow, or UX at all. Nothing in `02`–`05` contradicts it. Two things it surfaces that this proposal had wrong or missing, addressed below (#new-1, #new-2).

---

## Newly surfaced by the SDD (not in the original critique, but real)

### New-1 — Online Evaluation is Phase 2, not available in v1

> "Online (Phase 2): runs against production traces; shape exists in the model, no executor yet." Also: "online is explicitly Phase 2 with no executor yet — sizing revisited then."

This directly affects [02-workflow-starting-anew.md](02-workflow-starting-anew.md) step 10 and Phase 5 of its diagram, and the "CI-style batch vs. production monitoring" section of [05](05-eval-methodology-best-practices.md) — both describe binding an `EvalVersion` to production traces as if it's available from day one. **It isn't**, per this SDD. Fix: those sections need an explicit phase label. Until Phase 2 ships, "Case C" (eval/dataset evolves from production feedback, [03](03-workflow-new-version-from-existing.md)) has to be fed from **ingested** sources instead (imported Jenkins/PromptFoo reports, or manually reviewed trace exports) rather than a live online-eval binding — same destination (new dataset rows / new assertions), different, more manual source until the executor exists.

*(Applied below in the doc edits.)*

### New-2 — Code assertions are a security surface, not just "the cheap tier"

Section "Security Requirements → Code assertions" in the SDD:

> "A code assertion is a small piece of JavaScript that runs during an eval to check a model's output. It executes on the runner with the runner's permissions, so writing an assertion means writing code that our infrastructure will run... A stolen user credential [without curation] has no way to put executable code into the system [is only true if curated]." Controls considered for later, **none shipped in v1**: a curated library (only engineers write JS, users request), AI approval on submission ("a filter, not a guarantee"), runner hardening.

This is a real gap in [01](01-concepts-and-entity-mapping.md) and [05](05-eval-methodology-best-practices.md): both recommend defaulting assertion generation to `code_assertion` as the "cheap, safe" tier purely on maintenance-cost grounds, without acknowledging that **freely LLM-generated, user-editable JavaScript is exactly the risk the SDD flags** — and v1 ships with none of the mitigations. Fix, since refined further by later review feedback (see [02](02-workflow-starting-anew.md) step 2): the dry-run generator should not free-form generate arbitrary JS per criterion as its *first* move. Instead:

- Map the criterion onto an existing, parameterized type in the **promptfoo assertions library** first (contains/excludes string, matches regex, valid JSON, matches JSON schema, field-in-range, tool-was-called) — the generator's job is mainly *detecting the opportunity* to check something deterministically, not writing code from scratch.
- **Only if nothing in that library fits**, let the generator write a small custom check itself — this is a deliberate loosening of the original "engineer-only" stance, agreed on review, on the grounds that LLMs are already good at writing small, self-contained assertion code and the actual risk is in *what the code does*, not who typed it. The mitigation isn't banning generated code, it's **never trusting it silently**: flag it for the AI review agent to look at during Review & Approve (step 8 of [02](02-workflow-starting-anew.md)).
- A check too novel or risky even for that — or one the reviewing agent flags as doing more than a value check — becomes a **request to an engineer** (mirrors the SDD's own proposed "curated library" control) rather than something that ships unreviewed.
- Neat convergence worth keeping: the SDD's own alternative idea — "AI approval on run submission... a filter, not a guarantee. Suspicious cases go to an engineer." — is the *same shape* as this proposal's AI review agent in [02](02-workflow-starting-anew.md) step 8. **One agent, two jobs**: review the changeset for spec/eval/prompt consistency *and* flag any code-assertion content — curated or generator-authored — that looks like it's doing more than a value check, escalating to an engineer rather than auto-approving either way.

### New-3 — Promoting a production trace into a Dataset can leak PII forever (this proposal's own gap, found via the SDD's PII section)

> "Run data (online and ingested) is the service's responsibility: a scheduled job clears payload columns 30 days after the run... Hand-authored datasets are the author's responsibility... The service does not expire them: they are reusable working assets."

[03](03-workflow-new-version-from-existing.md)'s Case C and [05](05-eval-methodology-best-practices.md)'s error-analysis workflow both describe "promote a failing production trace directly into a permanent `DatasetItem`" as the core mechanic for growing the eval from real failures. Read against the SDD's PII rule, that's a real problem: online/ingested run payloads get redacted after 30 days, but a **Dataset never expires** — so a raw customer input copied into a Dataset row bypasses the very redaction the run layer is designed to enforce, and persists indefinitely. Fix, applied to both docs below: **promoting a real trace into a Dataset item must pass through PII redaction first** — reusing the existing `PiiRedactionService` pattern already built for online evals in the current system — before the row is written, not after.

### New-4 — The Library is more specific than what this proposal designed

PR-3 / SR-8 (identical wording, both required) specify the shared component library in more detail than [04](04-cross-cutting-ux-and-open-questions.md)'s "Libraries as real browse surfaces" bullet:

- **Private (personal) vs. public (org-wide) scoping**, with visibility/ownership controls **per component**, not just "the library" as one flat shared space.
- **Structured filtering**: type, owner, tags, creation date, usage count, associated prompt/project.
- **Grouping**: by team, project, judge type, dataset domain.
- **Semantic search over judge rubrics and dataset descriptions** — not keyword-only.
- Enough metadata per component (description, tags, owner, version history, usage stats) "to make discovery and reuse practical at scale."

This is a straightforward upgrade to fold into [04](04-cross-cutting-ux-and-open-questions.md) — applied below — and it also **helps New-1/New-2 above and the judge-calibration discussion (#9)**: semantic search over rubrics is exactly the mechanism that could power "does an assertion covering this already exist" during Case B's delta-regeneration (turning a hand-wavy diff into an assisted-search-and-confirm step, addressed next), and a private/public split means an individual can iterate on a judge before publishing it to the shared org library, softening the effort of any calibration someone chooses to do for personal experimentation.

---

## Not resolved by the SDD — still need your call, now sharper

### #7 — Case B's "diff-driven regeneration" was hand-wavy; here's a scoped, buildable v1

Rather than claim the system reliably knows which existing assertion maps to a changed Spec criterion (a hard, unsolved NLP problem when a human has hand-edited things), the honest v1 version, enabled directly by New-4's semantic search requirement:

1. Diff the Spec text mechanically (which criteria/fields changed) — this part *is* reliable, it's plain text diffing.
2. For each changed/new criterion, **semantically search the existing Assertion library** (the same capability PR-3/SR-8 already requires) for candidates that might already cover it, and surface them as suggestions — "criterion #3 changed; assertion 'tone-check-v2' looks related, keep/edit/replace?"
3. The human confirms the mapping. Nothing is silently regenerated or silently discarded.

This is a real, scoped v1 feature instead of an aspirational claim, and it's built on a capability the SDD already commits to delivering for an unrelated reason (library discovery).

### #9 — Judge calibration friction: superseded — the gate itself was later dropped

This section originally proposed bounding the calibration gate (cap at 20-30 labeled items and 3 rubric-iteration rounds) rather than removing the friction question entirely. **Per team decision, documented in [02](02-workflow-starting-anew.md) step 6, there is no calibration gate at all anymore** — Publish doesn't block on it, so there's nothing left to bound. The one part of this section still worth keeping: per New-4's private/public library split, **most judges won't need fresh calibration regardless** — reusing a *published, already-calibrated* library Judge Policy (the common case if the library is actually good) costs nothing extra, whether or not calibration is a gate.

### #4/#6 — Small-edit friction and the solo-user approval deadlock: still genuinely open, SDD is silent (it's out of scope by design)

The SDD confirms roles/approval are entirely Prompt Studio's concern (auth is even listed as its own unresolved item, scoped to client/reader API tokens, not human roles). Concrete proposal to reduce friction, not just flag it: a **fast-track tier** for changesets where (a) the citable run shows no regression against the prior published baseline, and (b) no assertion is new or `rubric_grading`-changed (i.e., prompt-wording-only tweaks or Case-C dataset additions with no eval change) — these can auto-clear to "approved, notify the domain expert async" instead of blocking on synchronous human review. Anything touching guardrails, success criteria, or judges keeps mandatory human review. This still needs your confirmation that it's an acceptable trade-off — see updated open questions in [04](04-cross-cutting-ux-and-open-questions.md).

### #5 — "Benevolent dictator" fitting your actual org structure: genuinely unresolved, needs your input specifically

Nothing in the SDD or data model speaks to team structure — this was always going to need direct input rather than another document to read. Still open.

### #1/#2 — The eval-driven-development tension and doc emphasis: a methodology stance, not an engineering fact the SDD can settle

The SDD doesn't take a position on this (it's not an SDD concern). **Note this is now stale in one respect:** [05](05-eval-methodology-best-practices.md) no longer has a hard rule here — the calibration gate referenced was dropped by later team decision (see [02](02-workflow-starting-anew.md) step 6). Still worth revisiting once real usage data exists to see if the balance of effort actually shakes out the way `05`'s underlying methodology predicts, gate or no gate.

---

## Doc changes made as a result of this pass

- [04](04-cross-cutting-ux-and-open-questions.md): open question #2 marked resolved; Library principle rewritten with private/public scoping, structured filtering, grouping, and semantic search per PR-3/SR-8; new open question about the fast-track approval tier.
- [03](03-workflow-new-version-from-existing.md): Case C now requires PII redaction before promoting a real trace into a Dataset item, and notes that until Online Evaluation ships (Phase 2), the feeder source is ingested/imported reports rather than a live binding.
- [02](02-workflow-starting-anew.md): step 10 / Phase 5 labeled as a Phase 2 dependency, with the Phase 1 fallback spelled out.
- [01](01-concepts-and-entity-mapping.md) and [05](05-eval-methodology-best-practices.md): `code_assertion` guidance narrowed to a curated, parameterized set in v1, not freeform generated JavaScript, with the security rationale from the SDD.

## Later revisions, from a subsequent review pass (comments + team decisions)

- **Dropped the judge-calibration publish gate entirely** (not just bounded it, per #9 above) — [02](02-workflow-starting-anew.md) step 6, with matching softening across [01](01-concepts-and-entity-mapping.md), [04](04-cross-cutting-ux-and-open-questions.md) (open question #9), and [05](05-eval-methodology-best-practices.md).
- **`code_assertion` generation now maps to the existing promptfoo assertions library first**, and allows LLM-authored custom code as a flagged-for-review fallback (not only an engineer request) — see New-2 above, and [01](01-concepts-and-entity-mapping.md)/[02](02-workflow-starting-anew.md)/[03](03-workflow-new-version-from-existing.md)/[05](05-eval-methodology-best-practices.md).
- **Renamed "Eval Service" to "Evals Platform"** throughout, as the name for the system this proposal describes (the actual SDD document keeps its original title).
- **Results pane elevated further**: structured filters and roll-up summaries, plus one-click promotion from an error-analysis finding into an Assertion, Dataset row, **Spec criterion**, or direct prompt edit — see [02](02-workflow-starting-anew.md) steps 3/3b and [05](05-eval-methodology-best-practices.md).
- **Sharper scoping of the EVAL-fault diagnosis loop** in [02](02-workflow-starting-anew.md)'s dry-run iteration, and an explicit note on what Phase 3 (mechanical freeze) vs. Phase 4 (human/AI review) each are responsible for.
- **Spec's Input contract and Output contract are now required fields**, not optional — see [02](02-workflow-starting-anew.md) step 1.
