# Dataset

Covers the Dataset pane: the test rows a run is scored against. See
[`spec-driven-redesign/04`](../spec-driven-redesign/04-cross-cutting-ux-and-open-questions.md#libraries-need-a-path-in-from-real-data-not-just-a-path-out-to-reuse)
for the real-data path this doesn't yet cover.

Status legend: **Implemented** · **Partial** · **Planned**.

---

### DATA-1 — Seed rows from Spec examples
**Status:** Implemented
On Generate, every Spec example becomes one `DatasetItem` tagged `source: "seed"`, in the same order as entered in the Spec pane.

### DATA-2 — Synthetic filler rows
**Status:** Partial
Generate tops the dataset up to a minimum of 6 rows total by cycling through 5 fixed scenario templates (first-time user with no context, missing required info, frustrated user, long rambling input, technically precise expert request), each combined with the Spec's goal text, tagged `source: "synthetic"`.
- Gap vs. concept docs: this is templated text substitution, not real structured-dimension generation, and the row count is a hardcoded floor rather than scaled to the number of success criteria/edge cases (see [open question 5](../spec-driven-redesign/04-cross-cutting-ux-and-open-questions.md)).

### DATA-3 — Add a dataset row manually
**Status:** Implemented
An "Add" menu on the Dataset pane splits into "Add manually" and "Create from file" (DATA-8). Add manually opens a form with one field per `{variable}` the current Target's prompt actually uses (falling back to a single "input" field for prompts that only use the legacy `{input}` placeholder, or none yet), plus an optional expected output, and supports adding several rows in one sitting. New rows are tagged `source: "case-c"` (matching the "promoted from error analysis" provenance case even when added directly here, not only via Results).

### DATA-4 — Edit / delete a row
**Status:** Implemented
Every row's variable field(s) and expected output are directly editable inline; rows can be deleted. Editing a published dataset forks the Spec back to draft.

### DATA-5 — Source badge per row
**Status:** Implemented
Each row shows a colored badge for its source: `seed` (neutral), `synthetic` (info), `case-c` (accent).

### DATA-6 — Build a dataset from real production data
**Status:** Planned
No browse surface over real interactions exists, and there's no bulk "select N rows → Add to Dataset" action. Per the concept doc, this needs a PII-redaction gate applied uniformly to anything entering a Dataset this way. (Distinct from DATA-8, which imports a file the author already has on hand.)

### DATA-7 — Per-row expected output / per-row assertions
**Status:** Partial
`DatasetItem.expectedOutput` now has an inline editor (an "+ Expected output" toggle per row, and it's part of both the manual-add form and the file-import mapping). `DatasetItemAssertion` (a per-row override check, e.g. "this exact input must produce refusal") still has no equivalent in `DatasetItem`.

### DATA-8 — Create a dataset from a file
**Status:** Implemented
"Create from file" uploads a `.csv` or `.jsonl` file, auto-guesses which column maps to which prompt variable (or to expected output) by header name — falling back to positional assignment for unnamed/unmatched columns — with a preview and a per-column override dropdown before importing. Import can append to or replace the current rows.

### DATA-9 — Multi-variable dataset rows
**Status:** Implemented
Dataset rows are no longer locked to a single "input" string: the row editor, manual-add form, and file-import column mapping all derive their fields from every `{variable}` placeholder actually used in the Target's current prompt template (via the structured Playground messages), and the Eval Suite substitutes each variable into the real prompt when running — not just a single `{input}`. Specs that haven't touched the Playground keep the original single-field behavior unchanged.
