# Assertions & Judge Policy

Covers the Eval pane: the checks generated from the Spec, and the LLM-as-judge policy that
backs the subjective ones. See [`spec-driven-redesign/01`](../spec-driven-redesign/01-concepts-and-entity-mapping.md#entity-mapping-spec-section--evals-platform-entity-generated)
for the cost-hierarchy rationale.

Status legend: **Implemented** · **Partial** · **Planned**.

---

### EVAL-1 — Cheapest-tier-first classification into a three-tier assertion taxonomy
**Status:** Partial
Every reusable assertion belongs to one of three tiers, cheapest-first — mirroring a real assertion
library (e.g. promptfoo's) rather than a bespoke two-way split:
1. **`deterministic`** — a built-in, parameterized check, no LLM call. The catalog (`app/src/assertionCatalog.ts`) is modeled on promptfoo's non-model-graded assertion types: `equals`, `contains`/`icontains`, `excludes`, `contains_all`/`contains_any` (+ case-insensitive variants), `starts_with`, `regex_match`/`regex_excludes`, `enum`, `valid_json`, `contains_json`, `is_xml`/`contains_xml`, `contains_sql`, `levenshtein`, `rouge_n`, `latency`, `cost`.
2. **`custom_code`** — a user-authored function (JavaScript or Python) run against the output, for logic the built-in catalog can't express. JavaScript executes for real, in-browser, via `new Function`; Python is stored but not executed (no in-browser runtime) — a documented gap, not a silent no-op.
3. **`rubric_grading`** — an LLM-as-judge rubric, the most expensive tier, used only when the first two can't cover it.

Auto-classification from a guardrail/criterion (`classifyCriterion` in `app/src/engine.ts`) still only produces a narrow slice of tier 1 by keyword/regex matching:
- Exclude-style phrasing ("must not / never / should not ... mention/include/contain/cite/say/reference X") → `deterministic`, mode `excludes`, extracted phrase.
- Include-style phrasing ("must/should always ... mention/include/contain/cite/say/reference X") → `deterministic`, mode `contains`, extracted phrase.
- Structural keywords (json/schema/bullet/word limit/character limit/sentences/format) → `deterministic` with an empty check value (a placeholder structural marker, not a real structural validator).
- Anything else → `rubric_grading`, with an auto-written rubric sentence ("Judge whether the output satisfies: '...'. Answer pass or fail.").

The full deterministic catalog, the `custom_code` tier, and the mode/threshold/reference editor are only reachable by hand (Add manually, or editing a generated assertion) — auto-classification doesn't yet pick among the wider catalog itself.
- Gap: `latency`/`cost` checks always pass — this prototype doesn't track per-run latency or cost in `RunItemResult` yet, so they're explicit no-op placeholders (see `scoreCodeAssertion` in `app/src/engine.ts`), not silently wrong.
- Gap: `contains_sql`/`is_xml`/`contains_xml` are heuristic (keyword/regex-based), not a real SQL or XML parser.
- Gap: Python `custom_code` assertions are stored but never executed.

### EVAL-2 — Provenance label per assertion
**Status:** Partial
Each assertion shows "From: `<criterion text>`", or "Manually added" if it wasn't generated, or "Requirement removed from Spec — orphaned" if its source criterion was deleted from the Spec.
- Gap vs. concept docs: this is the only provenance breadcrumb in the app — there's no equivalent for Dataset rows or Prompt sections (see [VER-3](09-versioning-and-provenance.md)).

### EVAL-3 — Add an assertion manually
**Status:** Implemented
An "Add manually" action lets you pick the tier first (`deterministic` / `custom_code` / `rubric_grading`), then creates a blank assertion of that tier — `deterministic` defaults to mode `contains` with an empty value, `custom_code` to an empty JavaScript stub, `rubric_grading` to an empty rubric sentence — with no source criterion, editable immediately.

### EVAL-4 — Edit an assertion inline
**Status:** Implemented
Every field of an assertion is directly editable in the Eval pane, tier-aware: `deterministic` shows a mode dropdown (grouped by Text match / Structured data / Similarity / Cost & latency) plus whichever of value/reference/threshold that mode needs, `custom_code` shows a language select and a code textarea, `rubric_grading` shows the rubric textarea — all three also keep an editable free-text description. Editing a published assertion forks the Spec back to draft.
- Previously-flagged gap now closed: the structured `CodeCheck` (`mode`/`value`/`threshold`/`reference`) is now editable from the UI, not just the free-text description.

### EVAL-5 — Delete an assertion
**Status:** Implemented
Removing an assertion also forks the Spec back to draft if it was published; the criterion it covered immediately shows as uncovered again in the Spec pane (SPEC-7).

### EVAL-6 — Judge Policy auto-creation
**Status:** Implemented
A Judge Policy is created only if the generated bundle contains at least one `rubric_grading` assertion; its model defaults to `gpt-4o-mini` and is editable afterward (see EVAL-11).
- If no rubric assertions exist, the Eval pane states "No LLM-as-judge assertions yet, so no judge is needed" instead of showing a judge card.

### EVAL-7 — Judge calibration
**Status:** Removed
There is no calibration step: a Judge Policy is just a model choice, with no calibrated/uncalibrated state, agreement score, or "Run calibration pass" action. Deliberately dropped as too complex a concept to surface to users right now.
- Per [`spec-driven-redesign/05`](../spec-driven-redesign/05-eval-methodology-best-practices.md#judge-calibration-recommended-practice-not-a-publish-gate), real calibration (human-labeled sample vs. judge agreement, TPR/TNR) is recommended best practice for teams that want confidence in a judge's verdicts — that remains a valid future direction, but isn't part of this app today.
- Publish no longer has any calibration gate as a result (see EVAL-8).

### EVAL-8 — Calibration gates Publish
**Status:** Removed
Publish is gated only on having a current citable run (see [`05-runs-and-results.md`](05-runs-and-results.md)) — it no longer checks Judge Policy calibration, since calibration itself no longer exists (EVAL-7).

### EVAL-9 — Orphaned assertions are not auto-deleted
**Status:** Implemented
Deleting a criterion from the Spec does not delete the assertion(s) generated from it — they persist, relabeled as orphaned (EVAL-2), until a human removes them or regenerates.

### EVAL-10 — Custom code assertions
**Status:** Partial
A third assertion tier, `custom_code`, sits alongside `deterministic` and `rubric_grading` (EVAL-1) for logic the built-in catalog can't express — the same role promptfoo's `javascript`/`python` assertion types play. An assertion of this tier stores a language (`javascript` | `python`) and a code body, editable inline (EVAL-4).
- JavaScript executes for real, in-browser, via `new Function("output", "input", code)`, both in the offline/simulated run path (`runSuiteOffline`) and the live-LLM run path (`/api/run`). It follows promptfoo's `javascript` assertion contract: return a boolean, or `{ pass, reason }`.
- Gap: Python has no in-browser (or server-side) execution in this prototype — the code is stored and shown, but every Python `custom_code` assertion always passes with a reason explicitly stating it wasn't executed.
- Gap: no sandboxing beyond `try`/`catch` — a thrown error is reported as a failed assertion, but there's no timeout or resource limit on the executed function.

### EVAL-11 — Configurable Judge Policy settings
**Status:** Implemented
A Judge Policy is directly editable in the Eval pane, not just a fixed model stamp: `model` (a select over the same catalog Prompts use — `app/src/components/prompts/PromptPlaygroundBody.tsx`'s `MODELS`), `temperature` (defaults to 0), and `systemPrompt` — the grading instructions sent to the judge, overriding the built-in default (`DEFAULT_JUDGE_SYSTEM_PROMPT` in `app/src/judgeDefaults.ts`) when non-empty. All three round-trip through Save/Load to the Judge Policy Library (`LibraryJudgePolicy`). Editing any of them forks a published Spec back to draft, same as every other Eval edit.
- In live mode (`/api/run`), the override actually reaches the grading call (`judgeWithLLM` in `app/server/openai.ts`) — this isn't just a cosmetic field.
- Gap: the offline/simulated run path (`runSuiteOffline`) doesn't read `systemPrompt`/`temperature` at all — the simulated pass/fail is a flat rate for every `rubric_grading` assertion regardless of judge settings, since there's no real judge call to influence in that path.

### EVAL-12 — Per-assertion and Spec-wide passing thresholds
**Status:** Implemented
Every assertion can set its own `passThreshold` (the fraction of dataset rows it must pass, shown/edited as a 0-100% field, left blank to inherit the Spec's default); the Spec also has a single `defaultPassThreshold` (also a %, defaults to 100%) editable right above the assertion list, which applies to any assertion that doesn't set its own. The Results pane's new "Pass rate by assertion" rollup computes each assertion's actual pass rate for the current run against its effective threshold and flags any miss; the Review pane's AI findings surface a one-line summary of the same check.
- This doesn't gate Publish or set the run's overall `citable`/pass status — it's a visibility/QA aid, deliberately not a hard gate, consistent with how [EVAL-8](#eval-8--calibration-gates-publish) was resolved (recommended signal, not enforcement).
- Replaces the old `SpecProject.evalAggregation` field (`"all_pass" | "weighted"`), which was defined but never actually wired into any scoring or gating logic.

### EVAL-13 — Assertion grouping
**Status:** Implemented
Every assertion has an optional free-text `group` (e.g. "Guardrails", "Output shape") set inline per assertion, with autocomplete suggestions drawn from the other groups already used in the same Spec. The assertion list in the Eval pane renders as collapsible sections by group, with an "Ungrouped" bucket for assertions that don't set one. The Results pane's per-assertion pass-rate rollup (EVAL-12) is grouped the same way, so a roll-up like "Guardrails: 3/3 above threshold" is visible without opening every row. Groups round-trip through Save/Load to the Assertion Library.
- Gap: a group is just a string stamped per-assertion, not a first-class entity — renaming a group means editing it on every assertion that used the old name; there's no dedicated "rename group" action.
