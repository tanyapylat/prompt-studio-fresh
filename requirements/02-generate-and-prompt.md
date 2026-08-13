# Generate & Prompt

Covers turning a Spec into a first-draft Prompt (`Target`), and editing that Prompt afterward.
See [`spec-driven-redesign/02`](../spec-driven-redesign/02-workflow-starting-anew.md) for the
full "dry run" narrative this simplifies.

Status legend: **Implemented** · **Partial** · **Planned**.

---

### GEN-1 — Generate a bundle from the Spec
**Status:** Partial
A "Generate" action in the top bar drafts a full bundle in one step: a Prompt (`Target`), one Assertion per guardrail/criterion, a Judge Policy (only if needed), and a Dataset — then immediately launches a run and switches to the Results tab.
- Runs entirely client-side with deterministic/templated logic — no real LLM call (see [`app/README.md`](../app/README.md) "Known simplifications").
- Resets Dataset status and Eval status back to `draft` even if they were previously published.

### GEN-2 — Regenerate overwrites the bundle wholesale
**Status:** Partial
Once a Target exists, the same button relabels to "Regenerate" and fully replaces the Target, Assertions, Judge, and Dataset — it does not preserve hand-edits.
- Gap vs. concept docs: there's no diff-driven delta regeneration (Case B) — no "suggest, don't silently overwrite" step, and no per-item accept/reject.

### GEN-3 — Deterministic prompt template
**Status:** Implemented
Prompt content is assembled from the Spec in a fixed order: goal → input contract → output contract → guardrails (as a bulleted "never violate" block) → success criteria (as a bulleted "must satisfy" block).
- This is a template render, not an LLM call — wording is copied near-verbatim from the Spec text.

### GEN-4 — Edit the Prompt directly
**Status:** Implemented
The Prompt pane shows a model dropdown (4 fixed options: `gpt-4o-mini`, `gpt-4o`, `claude-3-7-sonnet`, `gemini-1.5-pro`) and a free-text editor for the full prompt body.
- Both are editable at any time, independent of the Spec.

### GEN-5 — Editing a published Prompt forks the Spec back to draft
**Status:** Implemented
Changing the prompt text or model after the Spec was published flips the whole Spec's status back to `draft` (see [VER-2](09-versioning-and-provenance.md)).
- A hint below the editor reminds the user to re-run the Eval to re-check the bar.

### GEN-6 — Model selection has no runtime effect
**Status:** Partial
Model choice is stored but does not change any simulated output, latency, or cost — it's a UI affordance for a future real integration, not a functional switch today.
