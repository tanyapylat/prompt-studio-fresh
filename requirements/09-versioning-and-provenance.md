# Versioning & Provenance

Cross-cutting rules that apply across every artifact (Spec, Prompt/Target, Assertions, Dataset,
Judge, Eval). See [`spec-driven-redesign/01`](../spec-driven-redesign/01-concepts-and-entity-mapping.md#lifecycle-recap-borrowed-directly-from-the-evals-platform-foundations)
for the target-state logical/version split this simplifies.

Status legend: **Implemented** · **Partial** · **Planned**.

---

### VER-1 — Single mutable record with a status flag
**Status:** Partial
Every artifact today is one mutable row with a `draft` / `published` status field — there is no separate logical-identity-vs-version-content split (no `Spec` + `SpecVersion`, no `AssertionVersion` history). Publishing overwrites the status in place rather than freezing an immutable version row and forking a new one.

### VER-2 — Editing published content forks the whole Spec
**Status:** Implemented
Any edit to a published Prompt, Assertion, or Dataset row flips the entire Spec's status back to `draft` (`markEdited`) — coarse-grained at the whole-Spec level, not per-artifact as the target model describes (independently forking just the touched artifact's own version).

### VER-3 — Provenance breadcrumbs
**Status:** Partial
The only breadcrumb implemented is "this Assertion came from Spec criterion/guardrail #N" (EVAL-2). Missing vs. concept doc: no equivalent breadcrumb for Dataset rows (which example/edge case or which finding produced this row), no breadcrumb for which section of the Spec produced which part of the Prompt text, and no run-level breadcrumb ("this run compares v4 against the current published v3").

### VER-4 — Comparability fingerprinting
**Status:** Planned
No equivalent of a `ComparabilityFingerprint` exists — there's no way to detect "this exact configuration already ran as a dry run" and reuse that result instead of forcing a fresh citable run at Publish time (see [open question 4](../spec-driven-redesign/04-cross-cutting-ux-and-open-questions.md)).

### VER-5 — Deprecated state
**Status:** Planned
Only `draft` and `published` exist; there is no `deprecated` label for retiring an old Spec/Assertion/Dataset without deleting it.
