# Concepts and Entity Mapping

## The new concept: Spec

A **Spec** is the structured brief that a prompt, its evaluation, and its test data are all generated from. It is the answer to "what is this prompt actually supposed to do, and how would we know if it did it?" — written down *before* prompt wording, in a form an LLM (and a teammate) can act on directly.

The Evals Platform data model deliberately stops at Assertion / Target / Dataset / Judge Policy / Eval / Suite — it has no concept of a product "spec." That is correct: Spec is a **Prompt Studio concept**, not an Evals Platform concept. Prompt Studio should own it, generate Evals Platform entities from it, and keep a provenance link back to it. This mirrors what `PromptRequirement` does today, but widens it from "drives assertions only" to "drives prompt + assertions + dataset together."

### Recommendation: give Spec the same versioning shape as everything else

For consistency with the mental model the team is already adopting for Assertion/Target/Dataset/Eval, a Spec should follow the same **logical / version split** and **draft → published → deprecated** lifecycle described in the data model's Foundations section:

- `Spec` — identity row: id, name, owning project, owning client.
- `SpecVersion` — frozen content once published: goal, contracts, guardrails, criteria, examples. Editing after publish forks a new `SpecVersion`, never mutates the old one.

This buys the same thing it buys everywhere else in the model: a stable thing to point at, reproducibility, and an audit trail of who changed the brief and when.

### Suggested Spec fields

| Field | What it captures | Why it matters downstream |
|---|---|---|
| **Name / summary** | One-line description of the prompt's purpose | Shown everywhere as the human label |
| **Goal / business context** | Why this prompt exists, who consumes its output | Seeds the prompt's system instructions |
| **Input contract** (required) | Variables the prompt needs — a single string, or a collection of named, typed variables — and their sources | Becomes prompt placeholders + `DatasetVersion.ItemSchema` |
| **Output contract** (required) | Expected shape of the output (free text, or a JSON schema with required fields for structured output) | Seeds prompt instructions/structured-output config, and seeds structural (`code_assertion`) checks |
| **Guardrails / must-not-do** | Tone, compliance, safety, things the model must avoid | Seeds `rubric_grading` Assertions |
| **Success criteria** | A bulleted list of pass/fail behaviors ("must always cite a source", "must refuse X") | Each bullet ≈ one Assertion |
| **Examples (input → expected output)** | Few-shot pairs | Seed `DatasetItem` rows (and optionally few-shot content in the prompt itself) |
| **Edge cases / negative examples** | Tricky or adversarial inputs and how they should be handled | Seed additional `DatasetItem` rows + per-item `DatasetItemAssertion` |
| **Model/target assumptions (optional)** | Preferred model family, latency/cost constraints | Seeds default `TargetVersion.Params` |
| **Owner, status** | Who wrote it, draft/published/deprecated | Same lifecycle pattern as every other entity |

**Required vs. optional:** per [02](02-workflow-starting-anew.md) step 1, only **Name**, **at least one success criterion**, and the **Input contract + Output contract** are required to save a draft Spec — everything else (goal/context, guardrails, examples, edge cases, model assumptions) can be filled in later through iteration. The Input/Output contract pair is required precisely because the Prompt and its structural `code_assertion` checks can't be safely drafted without knowing what goes in and what shape comes out.

### Provenance: linking generated artifacts back to the Spec

Because Assertion/Dataset/Eval/Target are engine-neutral and client-agnostic by design, they should **not** carry a hard foreign key to `SpecVersionId` inside the Evals Platform schema — that would leak a Prompt-Studio-only concept into a shared, multi-client service. Instead, Prompt Studio keeps its own lightweight join table, something like:

```
SpecGenerationLink
  SpecVersionId        -> Spec (Prompt Studio's own store)
  GeneratedEntityType   ('prompt' | 'assertion' | 'dataset' | 'eval' | 'judge' | 'target' | 'suite')
  GeneratedEntityId
  GeneratedVersionId
  SourceSection         (which part of the spec produced this, e.g. "criterion #3")
  CreatedAt
```

This is what powers the "this assertion came from spec criterion #3" breadcrumbs in the UI (see [04-cross-cutting-ux-and-open-questions.md](04-cross-cutting-ux-and-open-questions.md)) without polluting the shared data model.

---

## Entity mapping: Spec section → Evals Platform entity generated

| Spec section | Generates | Evals Platform entity/entities |
|---|---|---|
| Goal + output contract + guardrails (as instructions) | Prompt content & system instructions | Prompt Studio's own `PromptVersion` (unchanged concept from today) |
| Output contract (structural parts) | A structural check | `Assertion` / `AssertionVersion` (`code_assertion` type) |
| Each success-criterion bullet | One check, **cheapest tier that plausibly covers it** | `Assertion` / `AssertionVersion` (`code_assertion` preferred; `rubric_grading` only when the criterion is genuinely subjective) |
| Guardrails / must-not-do | One check each — deterministic where possible, model-graded only when necessary | `Assertion` / `AssertionVersion` (`code_assertion` or `rubric_grading`) |
| Grading approach / model preference | The grader those rubric checks call | `JudgePolicy` / `JudgePolicyVersion` — **draft**; calibrating it against a human-labeled sample is recommended before trusting its verdicts as release evidence, but is not a required gate (see [05](05-eval-methodology-best-practices.md)) |
| Examples + edge cases | Test rows, via structured dimensions → tuples → rows, not naive generation | `Dataset` / `DatasetVersion` / `DatasetItem` |
| Per-example expected behavior ("golden" cases) | Per-row checks | `DatasetItemAssertion` |
| Target model & call parameters | The subject under test, wrapping the drafted prompt version | `Target` / `TargetVersion` (`Params` include the promptId + versionId) |
| All checks + judge + aggregation rule | The reusable "what to check" bundle | `Eval` / `EvalVersion` / `EvalAssertion` |
| Eval + Dataset + Target(s) tied together | The runnable unit | `Suite` / `SuiteVersion` / `SuiteTarget` |
| Launching the suite | The dry run / verification | `RunGroup` (type `batch`) → `Run` → `RunItem` → `Score` |

This table is the backbone of the "dry run" described in the next two docs: generating a spec-backed prompt is really "populate every row on the right-hand column from the spec, then launch a batch run and look at the scores." Two caveats that matter more than the mechanics, expanded in [05-eval-methodology-best-practices.md](05-eval-methodology-best-practices.md):

- **Every row in this table is a starting hypothesis, not a finished evaluator.** Current field practice (Hamel Husain / Shreya Shankar) is explicit that writing evaluators before you have real failure data — "eval-driven development" — is generally the wrong default; a Spec's stated criteria are a reasonable exception (they're known constraints, not guesses), but the assertions generated from them still need to survive real error analysis before they're trustworthy.
- **`rubric_grading` assertions should be the exception, not the default.** When a success criterion *could* be checked deterministically, generate a `code_assertion` instead — reserve the LLM-as-judge tier for criteria that are genuinely subjective, since that tier requires ongoing calibration and maintenance that a `code_assertion` never does.
- **"Prefer `code_assertion`" means mapping to an existing library first, not generating arbitrary code by default.** Per the *Eval Service SDD*'s security section (see [06-sdd-alignment-and-resolutions.md](06-sdd-alignment-and-resolutions.md)), a `code_assertion` is JavaScript that executes on the runner with the runner's permissions — in v1 there's no sandboxing, review-gate, or runtime hardening around that. So the dry-run generator's job is mainly **detecting the opportunity** to check something deterministically, not writing the code from scratch: (1) map the criterion onto an existing, parameterized type in the **promptfoo assertions library** (contains/excludes, regex match, valid JSON, JSON-schema conformance, field-in-range, tool-was-called) first; (2) only if nothing in that library fits, let the generator write a small custom check itself, flagged for the AI review agent to look at during Review & Approve (see [02](02-workflow-starting-anew.md) step 2 and step 8); (3) a check too novel or risky even for that becomes a request to an engineer to add a new curated type instead.

---

## Lifecycle recap (borrowed directly from the Evals Platform Foundations)

Every artifact — Spec, Assertion, Judge Policy, Dataset, Eval, Target, Suite — moves through the same three states:

- **draft** — freely editable, and runnable. You can attach your own drafts to a draft Suite and launch it; the result is a **dry run** (non-citable).
- **published** — frozen. Content and bundle membership are immutable. To change anything, fork a new version.
- **deprecated** — a label, not a content change.

Publishing is **one atomic act** across the whole pinned graph (Spec, Assertions, Judge Policy, Dataset, Eval, Target, Suite) — there is no "publish the eval but not the dataset" half-state. This is what replaces today's fragile, independently-tracked approval checks (final config flag, executed flag, relevancy score) with a single frozen, reproducible bundle.

A **citable** result is one where every pinned version was already published when it ran — these are the only results that should count as approval evidence or feed cross-run trend dashboards. A dry run against draft content is always **non-citable**: useful to the author, invisible to trend analytics, and rejected by the publish gate as evidence.
