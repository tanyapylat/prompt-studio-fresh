# Review, Publish & Release

Covers freezing the bundle and the human approval loop. See
[`spec-driven-redesign/04`](../spec-driven-redesign/04-cross-cutting-ux-and-open-questions.md#what-this-replaces-from-todays-system)
for what this replaces from the current-state approval model.

Status legend: **Implemented** · **Partial** · **Planned**.

---

### REV-1 — Publish gating
**Status:** Implemented
The Publish action is enabled only when a run already exists against the current bundle and the Spec isn't already published. There's no Judge Policy calibration gate (removed — see [EVAL-8](03-assertions-and-judge.md#eval-8--calibration-gates-publish)).

### REV-2 — One atomic publish + auto citable run
**Status:** Implemented
Publishing flips Spec, every Assertion, the Target, Dataset status, and Eval status to `published` in a single action, then immediately launches a citable run and appends it to the run history — matching the "one atomic act across the whole pinned graph" principle.

### REV-3 — Review requires a citable run
**Status:** Implemented
The Review pane refuses to render its checklist/comments/verdict UI until a citable run exists, pointing the user back to Publish instead.

### REV-4 — AI review agent, comment-only
**Status:** Partial
On opening Review, a fixed checklist runs automatically: full requirement coverage, which Judge Policy (if any) is in use, whether every assertion meets its passing threshold ([EVAL-12](03-assertions-and-judge.md#eval-12--per-assertion-and-spec-wide-passing-thresholds)), and a 100%-pass-rate sanity warning — each shown as a line. It never sets the verdict itself.
- Gap vs. concept docs: this is a fixed, hardcoded checklist (four checks, always the same), not an LLM agent actually reading the diff/regressions/spec text — there's no consistency-gap or regression detection beyond these four canned checks.

### REV-5 — Comment thread
**Status:** Partial
A flat list of comments can be posted and is stored on the Spec. Every comment uses a single `anchor: "general"` value.
- Gap vs. concept docs: comments aren't anchored to a specific artifact/line (spec criterion, prompt line, assertion, dataset row) as the "PR-style review" concept calls for, and there's no resolve/unresolve state exposed in the UI even though `Comment.resolved` exists in the type.

### REV-6 — Human verdict
**Status:** Implemented
Two actions: "Request changes" or "Approve & release." Approving sets `released: true`, shown thereafter as a persistent banner ("Released — this is now the latest published version, served via the API").

### REV-7 — Request-changes loop
**Status:** Planned
"Request changes" only sets the verdict field — it doesn't fork a new draft version, doesn't track a version history of verdicts, and doesn't re-trigger review once new changes are made and re-published.

### REV-8 — Multi-target / regression comparison
**Status:** Planned
Only one Target exists per Spec; there's no way to pin an old published Target alongside a new draft one in the same run to get a native side-by-side regression comparison (Case A/B in the concept docs).
