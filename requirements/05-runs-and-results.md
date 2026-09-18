# Runs & Results

Covers running the Suite and the Results/error-analysis pane. See
[`spec-driven-redesign/05`](../spec-driven-redesign/05-eval-methodology-best-practices.md) for
why this pane is called out as the single highest-leverage surface in the whole product.

> **The Results pane itself (RUN‑6, ‑7, ‑8, ‑10, ‑11 below) has since had a full ground-up
> redesign** — see [`10-run-results-page-redesign.md`](10-run-results-page-redesign.md) for the
> current, much more detailed requirements (table/panel/comparison UX, composite assertions,
> filters, the 5 demo scenarios). That document supersedes those blocks. Note that its RES‑4 found
> `RunGroup` no longer carries the `citable` field RUN‑4 below describes — worth a quick re-check
> of RUN‑1 through ‑5 for drift before relying on them.

Status legend: **Implemented** · **Partial** · **Planned**.

---

### RUN-1 — Simulated scoring, not real model calls
**Status:** Partial
Running the Suite scores every dataset row against every assertion using a seeded pseudo-random function keyed by `datasetItemId:assertionId`, so results are stable across re-renders but not based on any real model output.

### RUN-2 — Violation-rate model
**Status:** Implemented (as a simulation)
Simulated failure likelihood: `deterministic` with a real check value ≈ 16% baseline failure, an empty/placeholder structural check ≈ 10%; `custom_code` ≈ 14% baseline failure; `rubric_grading` ≈ 20% baseline failure — a flat rate, since there's no calibration state to vary it by (see [EVAL-7](03-assertions-and-judge.md#eval-7--judge-calibration)).

### RUN-3 — Simulated output transcript
**Status:** Implemented (as a simulation)
Each row's "model output" is templated text that reflects which contains/excludes checks passed or failed, so the Results pane has something plausible-looking to read per row, not just pass/fail flags.

### RUN-4 — Citable vs. non-citable runs
**Status:** Implemented
A run is marked `citable` only if, at the moment it runs, the Spec, Target, Eval, and Dataset statuses are all `published`. Any run against draft content is `non-citable` — a dry run, per the lifecycle rules in [`spec-driven-redesign/01`](../spec-driven-redesign/01-concepts-and-entity-mapping.md#lifecycle-recap-borrowed-directly-from-the-evals-platform-foundations).

### RUN-5 — Re-run without regenerating
**Status:** Implemented
Once a Target exists, a "Run" action re-scores the current bundle (unchanged Prompt/Assertions/Dataset) and appends a new `RunGroup` — useful after a manual edit that doesn't warrant a full Generate.

### RUN-6 — Results summary header
**Status:** Implemented
Shows the aggregate pass rate as a large percentage, the row-count × check-count denominator, a citable/dry-run badge, and a soft warning when pass rate is exactly 100% ("worth checking the dataset is actually stress-testing anything").

### RUN-7 — Failing rows sort first
**Status:** Implemented
Rows are sorted by descending fail-count so the worst rows are seen first, without any manual filter needed.

### RUN-8 — Per-row expand with reasons
**Status:** Implemented
Expanding a row shows the simulated output plus every assertion's pass/fail with a human-readable reason string (e.g. `Found "X" in the output.` / `Missing "X" in the output.` / `Judge: does not satisfy the rubric.`).

### RUN-9 — Open-coding note per row
**Status:** Implemented
A free-text note field per row persists onto that row's `RunItemResult`, matching the "support free-text open-coding notes before any category exists" principle.

### RUN-10 — Structured filters, roll-ups, and one-click promotion
**Status:** Partial
Pass-rate-by-assertion/-group roll-up now exists (RUN-11). Still missing vs. concept doc: no filter by assertion/failure-cluster/cost/latency, no top-failure-cluster roll-up, no trend-vs-last-run view, and no one-click action to turn a note into a new Assertion, Dataset row, or Spec criterion edit (the note field is a dead end today — nothing reads it back into any other pane).

### RUN-11 — Pass rate by assertion, grouped
**Status:** Implemented
Above the per-row list, a "Pass rate by assertion" card shows every assertion's actual pass rate for the current run (`passed / total scored`) against its effective passing threshold ([EVAL-12](03-assertions-and-judge.md#eval-12--per-assertion-and-spec-wide-passing-thresholds)), with a check/cross icon for at-or-above vs. below threshold — grouped the same way the Eval pane groups assertions ([EVAL-13](03-assertions-and-judge.md#eval-13--assertion-grouping)), so e.g. all "Guardrails" assertions roll up together. The Review pane's AI findings also surface a one-line count of any assertions below threshold.
- This is informational only — it doesn't change `RunGroup.passRate` (still a flat total-scores-passed/total-scores ratio) or gate anything.

### RUN-12 — Sample run on a subset of rows
**Status:** Implemented
The Dataset pane can select rows for a quick "Run sample" — either a random N (typed count, "Pick random") or a hand-picked set via per-row checkboxes — and score only that subset instead of the full dataset, useful for a fast check before running a large dataset in full. A sample `RunGroup` is tagged `scope: "sample"`, is always non-citable regardless of publish status, and the Results header shows "Sample run — N of M rows" instead of the usual citable/dry-run badge.
