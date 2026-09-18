# Requirements — Spec Studio Prototype

This is the functional-requirements layer that sits between the concept and the code:

- [`prompt-management-docs/`](../prompt-management-docs/README.md) documents **what exists today** in the current Prompt Management product.
- [`spec-driven-redesign/`](../spec-driven-redesign/README.md) is the **target-state concept** — the brainstorm/proposal for a spec-driven workflow, grounded in the current-state docs and the Evals Platform data model.
- **This folder** breaks that concept into discrete, testable **requirement blocks** — small enough to point a coding agent at one at a time — and states plainly, for each one, whether the [`app/`](../app/README.md) click-through prototype already implements it, implements a simplified version of it, or hasn't built it yet.

Use this set to decide what to prototype next: pick a block, or a small group of related blocks, and hand it to a coding agent as a self-contained unit of work.

## How each block is written

Every requirement is a short block: an ID, a title, a one-line description, a **Status**, and a
handful of acceptance-criteria-style bullets describing exactly how it behaves (or should
behave). IDs are stable references you can point at in a prompt or a commit message (e.g. "implement EVAL-4" or "close the gap in RUN-10").

**Status legend:**

| Status | Meaning |
|---|---|
| **Implemented** | Works in `app/` today, matching this description |
| **Partial** | Works, but simplified — the block calls out exactly what's missing or faked |
| **Planned** | Described in the concept docs; nothing built yet |

## Document index

| Doc | Covers |
|---|---|
| [01-spec-authoring.md](01-spec-authoring.md) | Creating a Spec, the home list, editing goal/contracts/guardrails/criteria/examples, the live coverage checklist |
| [02-generate-and-prompt.md](02-generate-and-prompt.md) | Turning a Spec into a first-draft Prompt, regenerating, editing the Prompt directly |
| [03-assertions-and-judge.md](03-assertions-and-judge.md) | Cost-hierarchy assertion classification, manual assertions, Judge Policy (configurable, no calibration step), assertion grouping and passing thresholds |
| [04-dataset.md](04-dataset.md) | Seed/synthetic dataset rows, manual rows, real-data ingestion (planned) |
| [05-runs-and-results.md](05-runs-and-results.md) | Running the Suite, citable vs. dry-run, the Results/error-analysis pane |
| [06-review-and-publish.md](06-review-and-publish.md) | Publish gating, the atomic publish + citable run, AI review agent, comments, verdicts |
| [07-workspace-and-navigation.md](07-workspace-and-navigation.md) | The five-pane workspace shell, top action bar, app-level state |
| [08-library-and-real-data.md](08-library-and-real-data.md) | Org-wide library, save-to-library, semantic search, build-from-real-data (all planned) |
| [09-versioning-and-provenance.md](09-versioning-and-provenance.md) | Draft/published lifecycle, forking-on-edit, provenance breadcrumbs, fingerprinting (cross-cutting) |
| [10-run-results-page-redesign.md](10-run-results-page-redesign.md) | The Run Results page ground-up redesign, in business/requirements terms (not implementation detail) — what the page must do, why, and the 5 demo scenarios it was checked against. A self-contained handoff doc (own ID prefix `RES-`), meant to be read on its own, e.g. by an engineer breaking it into stories. Supersedes the Results-specific blocks in [05-runs-and-results.md](05-runs-and-results.md) (RUN-6/7/8/10/11). |

## What's genuinely new here vs. the concept docs

The concept docs (`spec-driven-redesign/`) describe *why* the workflow should work this way and
the target data model behind it. This folder instead pins down, block by block, *exactly what a
screen or button does right now* — including every place the prototype quietly simplified,
faked, or skipped something (simulated model calls, a single mutable status flag instead of full
version history, a hardcoded three-item AI review checklist, etc.). Where the prototype's actual
behavior diverges from what the concept docs recommend — not just "simpler than," but genuinely
different — that's called out explicitly (e.g. [EVAL-7](03-assertions-and-judge.md#eval-7--judge-calibration) drops judge calibration entirely rather than making it a recommended-but-optional practice, since it was judged too complex a concept to surface to users right now).

## Suggested next step

Pick one open gap (any block marked **Partial** or **Planned**) and turn it into a scoped prompt
for the next round of prototyping — e.g. "implement RUN-10's structured filters and one-click
promotion from a Results-pane finding into a new Dataset row." Small, one-block-at-a-time changes
keep the prototype's simplifications visible and intentional instead of accumulating silently.
