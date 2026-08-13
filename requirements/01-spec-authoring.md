# Spec Authoring

Covers the left-hand Spec pane: creating a Spec and filling in the brief that everything
else gets generated from. See [`spec-driven-redesign/01`](../spec-driven-redesign/01-concepts-and-entity-mapping.md)
for the full field-by-field rationale.

Status legend: **Implemented** (works in `app/` today) · **Partial** (works but simplified) ·
**Planned** (described in the concept docs, not built yet).

---

### SPEC-1 — Create a new Spec
**Status:** Implemented
A "New Spec" action on the Specs home screen prompts for a name and opens a blank draft Spec directly in the workspace.
- A new Spec starts in `draft` status with every other field empty.
- The new Spec is selected/opened immediately — no intermediate confirmation step.
- Newly created Specs are prepended to the Specs list (most recent first).

### SPEC-2 — Specs home / overview list
**Status:** Implemented
A card grid on the home screen lists every Spec that exists.
- Each card shows: name, draft/published badge, a one-line goal snippet (or a placeholder if empty), last run's pass rate (or "No run yet"), a "Citable" badge if the last run was citable, a "Released" badge if approved, and a live "X/Y requirements checked" coverage count.
- Clicking a card opens that Spec's workspace.
- An empty state ("No Specs yet") shows when the list is empty.

### SPEC-3 — Edit core brief fields
**Status:** Partial
Goal, Input contract, and Output contract are free-text areas, inline-editable, autosaved on every keystroke.
- Gap vs. concept docs: these are plain text fields today, not a structured/typed input-variable list or a JSON-schema output contract — there's no distinction between "a single string" vs. "several named, typed variables."
- Gap vs. concept docs: nothing is actually required to save a Spec today (no validation that Name / ≥1 success criterion / both contracts are filled in before Generate is usable).

### SPEC-4 — Guardrails list
**Status:** Implemented
A "Guardrails" section holds must-not-do statements, one per line item.
- Add via a prompt dialog; edit inline via textarea; remove via a trash icon.
- Each guardrail is a `Criterion` with `kind: "guardrail"`.

### SPEC-5 — Success criteria list
**Status:** Implemented
A "Success criteria" section holds pass/fail statements, structurally identical to guardrails but `kind: "criterion"`.
- Same add/edit/remove interaction as guardrails.

### SPEC-6 — Examples / edge cases list
**Status:** Partial
A single list holds example inputs that seed the Dataset.
- Add via prompt dialog (input text only); remove via trash icon.
- Gap vs. concept docs: no way to attach an expected output to an example in the UI, even though the underlying data shape (`Example.expectedOutput`) supports it — examples and edge cases aren't visually distinguished from each other either.

### SPEC-7 — Live per-requirement coverage indicator
**Status:** Implemented
Every guardrail and success-criterion row shows a live icon: a green check if at least one Assertion's `sourceCriterionId` points at it, an amber alert if not.
- Recomputed on every render directly from current Spec + Assertions state — no caching, no explicit "recheck coverage" action needed.
- This is the "always visible, not just at generation" coverage checklist called out as the real safety net for direct prompt edits.

### SPEC-8 — Spec-level coverage summary
**Status:** Implemented
A `covered/total` count derived from SPEC-7 is shown in two places: the Workspace top bar and each card on the Specs home screen.

### SPEC-9 — Rename a Spec
**Status:** Implemented
The Spec's name is an inline-editable text input in the Workspace header, autosaved on change.
