# Library & Real-Data Workflows

The org-wide library (LIB-1/2/3) has moved from Planned to a working prototype — this doc's
original framing ("none of this is built") is now stale for those three blocks. It still exists
so the remaining gaps (LIB-4/5/6, "build from real data") are tracked as concrete, prototype-able
requirements rather than left implicit in the concept docs. Source:
[`spec-driven-redesign/04`](../spec-driven-redesign/04-cross-cutting-ux-and-open-questions.md#libraries-need-a-path-in-from-real-data-not-just-a-path-out-to-reuse).

Status legend: **Implemented** · **Partial** · **Planned**.

---

### LIB-1 — Org-wide component library
**Status:** Partial
A shared, permissioned catalog of Assertions, Datasets, and Judge Policies (Evals are not yet a
separate library kind), each with private (personal) vs. org-wide visibility (`LibraryVisibility:
"private" | "org"`) and per-component ownership — not a single flat shared list. Visible from the
Sidebar as three catalog pages (`LibraryList`), each filterable to All / Mine / Org-wide.
- Gap: no library kind for Evals/Prompts-as-a-standalone-library-entity; Prompts have their own separate catalog (`PromptsList`) rather than living under the same `Library` model.

### LIB-2 — Save to library
**Status:** Partial
A "Save to library" action promotes an artifact from a Spec's draft into a discoverable, tagged
library entry (name, description, tags, owner, visibility) from inside the Eval/Dataset panes.
Usage is tracked two ways: `usageCount` (how often it's been pinned) and `usedInSpecIds` (**where**
it's been pinned — which Specs), both shown in the catalog page and incremented whenever a
"Load from Library" pin happens (copy-on-pin, not a live link — see `libraryOrigin`/`sourceSpecId`
provenance stamps in `app/src/types.ts`).
- Gap: no versioning on a library entry itself — editing a Spec's copy after pinning doesn't create a new library version, and saving again from a Spec creates a brand-new entry rather than a new version of an existing one.

### LIB-3 — Structured + type discovery, and heuristic semantic search
**Status:** Partial
Every catalog page and "Load from Library" modal supports: keyword search over name/description/tags (and, for Assertions, rubric/check value/reference/code text); an assertion-tier filter (All / Deterministic / Custom code / LLM judge); and a toggleable "Semantic" search mode (`app/src/librarySearch.ts`) that expands the query into a small domain synonym table (e.g. "block" ↔ "excludes"/"forbid"/"never") and ranks entries by weighted token overlap (name > tags > body text).
- Gap: semantic search is a local, deterministic heuristic — token + synonym overlap — not a real embeddings-based similarity search, nor a call to an external API.
- Gap: no filtering by creation date, associated prompt, or grouping by team/project/judge-type/dataset-domain yet — only owner (Mine/Org-wide), assertion tier, and free-text search.

### LIB-4 — Build from real data
**Status:** Planned
A "Build from real data" entry point sitting next to Generate on the Dataset/Assertion/Judge panes: a filterable browse surface over real production interactions (by time range, Target, pass/fail, tag), bulk multi-select, and a single "Add to Dataset" action that turns a selection into rows in one step. The same real-data source should also support seeding a candidate Assertion, not just Dataset rows.

### LIB-5 — PII redaction gate on ingestion
**Status:** Planned
Any real interaction entering a Dataset — whether via bulk import (LIB-4) or one-off promotion from a Results-pane finding — passes through the same redaction gate first, since a Dataset row doesn't expire the way a raw run payload does.

### LIB-6 — Org-wide overview as the home surface
**Status:** Planned
The home screen becomes an overview of what exists org-wide (owner, draft/published/deprecated state, lineage, what's currently running in production), not just a personal "my Specs" list — playground-style iteration stays inside a Spec's own workspace.
