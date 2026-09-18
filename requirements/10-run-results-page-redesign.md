# Run Results Page — Redesign Requirements

**Author:** Veronica Kravets · **Audience:** engineering (to be broken down into stories) · **Grounded in:** a working click-through prototype at [`app/`](../app/README.md)

## 0. Purpose & how to use this document

The individual Run Results page (what you land on after an eval run finishes — one prompt or a
side-by-side comparison of several, scored against a dataset) was the single highest-leverage,
most-used screen in AI Studio and needed a ground-up UX pass. Rather than write requirements in
the abstract, we built a **click-through prototype** first, iterated on it against real exported
eval data and a round of UAT feedback, and are now writing this document *from* that finished
prototype — not the other way around. Every requirement below has a working reference
implementation you can click through before you scope or estimate it.

**This document has three jobs**, matching the three things asked for:

1. **§4 Functional Requirements** — what has to be implemented, as discrete, story-sized
   requirement blocks (`RES-1`, `RES-2`, …), each with acceptance criteria and a pointer to
   exactly where it's demonstrated in the prototype.
2. **§6 Demo Scenarios** — the 5 seeded scenarios built to exercise specific data shapes and
   edge cases, so you're never designing against a hypothetical.
3. **§2 How to Read the Prototype** — how to run it, navigate it, and where in the source to
   look when the prose here is ambiguous.

**How to use this to plan stories:** each `RES-` block is written to be independently
story-sized. Section groupings (A–L) are a reasonable epic/milestone split. §7 and §8 exist so
you don't accidentally scope in something that was deliberately left as prototype-only or
explicitly deferred — read those before estimating.

---

## 1. Context & background

- This is a **UX/interaction prototype**, not shipped product. `app/` is a standalone
  click-through React app with no real backend, no persistence beyond the browser's
  `localStorage` (and only for view preferences — wrap/compact, hidden columns, etc. — never for
  data), and no real model calls on this page. Every run result you see was **seeded**, not
  computed live. §2.3 explains exactly what's real vs. invented in that seed data and why that
  distinction matters for you.
- The redesign was scoped against **real exported eval data** Veronica provided (7 Promptfoo-style
  CSV exports covering single-prompt runs, a 3-way prompt comparison, and runs with/without
  reference outputs), plus a large **config export** (`configs-new-2026-6-24.csv`, ~23MB, actual
  production eval *configurations*, not results) that was cross-checked afterward to find gaps in
  assertion-type coverage. That second pass is what produced Scenario 5 and the `not-equals` /
  `contains-html` / composite-assertion ("assert-set") requirements — see §4.E and §6.
- Two rounds of UAT feedback from Veronica against the running prototype are folded into the
  requirements below already; nothing here is a first draft.

---

## 2. How to read the prototype

### 2.1 Run it

```powershell
cd app
npm install   # only if you haven't already
npm run dev
```

Open whatever URL Vite prints (defaults to `http://localhost:5173/`, but picks the next free port
if that's busy — check the terminal output). No login, no setup — you land on the Specs home with
5 seeded "Scenario" Specs already run and ready to click into (see §6).

### 2.2 Where to click

- **Sidebar → Runs** opens the global **Eval runs list** (`RunsList.tsx`) — every run across every
  Spec, sortable/filterable/paginated, styled like the existing Specs/Prompts list tables.
- Click any row → opens that run's full results on its **own page, in a new browser tab**, at
  `/runs/:runId` (`RunDetailPage.tsx`). This satisfies "individual runs open in a separate tab"
  (RES‑1) — it's a real route, not a modal; it survives reload, and browser back/forward work.
- The same results view is also embedded **inside a Spec's own workspace**, under its **Results**
  tab (`ResultsPane.tsx` → same shared `RunDetailBody.tsx` component) — useful while iterating on
  one Spec without leaving it. Both surfaces render identically; only the page chrome around them
  differs (a "View full history" link takes you from the embedded view to the standalone page).
- Every Scenario's Spec name is prefixed `"Scenario N — …"` so it's unambiguous which requirement
  set a given run is meant to exercise (see §6 for the full breakdown).

### 2.3 What's real vs. invented in the seed data — read this before judging any specific number

Scenarios 1–4 are built from Veronica's real CSV exports: every row's actual input values, the
model's actual output text, and its actual pass/fail/score per named check are real, parsed
straight from the export. **Invented on top of that real data**, and clearly commented as such at
the top of [`app/src/seed/scenarioSeeds.ts`](../app/src/seed/scenarioSeeds.ts): the system prompt
text (the export only ever recorded a `promptId`/`versionId`, never the prompt itself), a
human-readable Prompt name, which tier (deterministic/custom-code/LLM-rubric) each named check
belongs to, the actual LLM-rubric instructions a judge would have been given (the export only ever
has a name + pass/fail, never the rubric text), dataset-row source (manual vs. synthetic), a
handful of reviewer notes, and 2 synthetic "Error" rows (no real row in any export ever came back
as an API-level error).

**Scenario 5 is the one exception** — nothing in it comes from a source file; the rows, outputs,
and every score are hand-authored specifically to exercise `not-equals`, `contains-html`, and a
weighted composite ("assert-set") metric, none of which existed in any of the 7 real exports. See
§6.5.

**The takeaway for you:** don't treat any specific number, output string, or rubric wording in the
prototype as something to match byte-for-byte — the *interaction design and data model* are what's
being specified. Where a real system's actual data shape differs (e.g. a real judge's actual
rubric text, real token pricing), use that instead.

### 2.4 Source map — where each requirement area lives

| Area | Key files |
|---|---|
| Routing / entry points | `App.tsx`, `RunsList.tsx`, `RunDetailPage.tsx`, `ResultsPane.tsx` |
| Shared results logic (rows, filters, search, CSV/JSON export) | `results.ts` |
| View preferences (wrap, hidden columns, sort, chip density) | `resultsViewPrefs.ts` |
| Summary header, per-assertion rollup, heuristic insights | `components/results/RunSummary.tsx`, `engine.ts` (`suggestRunInsightsHeuristic`) |
| Single-run table | `components/results/ResultsTable.tsx` |
| Single-run detail panel | `components/results/ResultItemPanel.tsx` |
| Comparison (N-way) view: table, charts, panel | `components/results/ComparisonRunBody.tsx`, `charts.tsx`, `ComparisonItemPanel.tsx` |
| Filters / Columns / Export popovers | `components/results/ResultsFiltersMenu.tsx`, `ResultsColumnsMenu.tsx`, `ResultsExportMenu.tsx` |
| Assertion/check data model + catalog | `types.ts` (`Assertion`, `AssertionScore`, `AssertionTier`, `CodeCheck`), `assertionCatalog.ts` |
| Scoring logic (incl. composite/grouped assertions) | `engine.ts` (`scoreOneAssertion`, `scoreAssertionGroup`, `scoreCodeAssertion`) |
| Seed data / the 5 Scenarios | `seed/scenarioSeeds.ts`, `seed/scenarioFixtures.generated.ts` |

---

## 3. Goals & design principles

These are the "why" behind §4 — worth keeping in mind when a story's exact behavior is ambiguous:

1. **Never make the reviewer hold context in their head.** The single biggest complaint about the
   old design was a 3-tab detail panel (prompt/output → evaluation → metadata) where reading a
   rubric meant losing sight of the output it was judging. Every layout decision here optimizes
   for "what you're comparing stays on screen together."
2. **Density is a choice, not a default you fight.** Compact vs. full view is one click, not a
   setting buried in a menu; column visibility defaults are chosen so the common case needs no
   configuration, but every default is overridable and that choice sticks.
3. **Promptfoo parity where it's proven, better where it's obviously worth it.** Per-metric chips,
   pass-reasoning for both fail *and* pass, filters, and the comparison charts all mirror
   Promptfoo's own eval UI (a tool the team already trusts) rather than inventing new conventions
   from scratch — but the two-column detail panel, adaptive column visibility, and composite
   assertions go beyond what Promptfoo's own UI does.
4. **A metric's pass/fail is the one signal that must never be ambiguous.** Every other visual
   dimension (metric type, row source, grouping) has to be layered on *without* competing with the
   green/red pass-fail signal — see RES‑28 for a concrete case where this constrained the design.
5. **Nothing here should silently lie about data it doesn't have.** Cost/latency/tokens are
   estimates and must read as such; a column that would be empty for this run's shape shouldn't
   show at all (Reference Output) rather than showing a column of dashes.

---

## 4. Functional Requirements

Every block: an ID, a one-line summary, acceptance criteria, and where it's demonstrated. Statuses
are all **Prototyped** (built and clickable in `app/`, not shipped) unless noted otherwise.

### A. Navigation & entry points

#### RES-1 — Runs open in their own browser tab
Clicking a run anywhere in the app (Eval runs list, a Spec's Results tab) opens that run's full
results on its own page, in a new tab, at a real bookmarkable/shareable URL — not a modal or an
in-place navigation that loses the list you clicked from.
- Acceptance: `window.open()` to `/runs/{runId}`, a real route; reload/back/forward all work; the
  originating list/tab is untouched.
- Demo: any row in `RunsList.tsx`, or "View full history" from a Spec's Results tab.

#### RES-2 — Run detail page header: identity, version history, way back
The standalone run page's header shows: the resolved prompt identity (RES‑5), a version-history
switcher for other runs against the *same* prompt version, the run's own id/timestamp, and a way
back to either the originating list or that Spec's workspace (whichever makes sense given how you
arrived).
- Demo: `RunDetailPage.tsx`.

#### RES-3 — Global Eval Runs list
A cross-Spec list of every run, sortable by id/description/author/created/pass-rate/test-count,
with per-column filters, resizable/hideable columns, and pagination — the landing point for
"browse everything," parallel to the existing Specs/Prompts list UX.
- Demo: `RunsList.tsx`.

### B. Run summary header (top of every results page, single-run or comparison)

#### RES-4 — Aggregate status at a glance
Shows: total row count, total metric count, aggregate pass rate as a large percentage, and — when
this run only scored a chosen subset of the dataset rather than the whole thing — a "Sample run —
N of M rows" badge instead of the usual full-run framing.
- Demo: `RunSummary.tsx` header block, `RunDetailPage.tsx` (`run.scope === "sample"` badge).

#### RES-5 — Real prompt identity, not just an internal Spec name
The primary heading is the resolved Prompt identity — human-readable name + the **real** external
Prompt-Management project id and version id (e.g. `Compliance Chat Assistant 4595, v1 2100`,
not AI Studio's own internal ids) — with the Spec's own name shown as a secondary line only when
it's not just a duplicate of the Prompt name (true for every Scenario Spec, since `spec.name` there
is really an eval-scenario description, e.g. "Scenario 1 — Compliance chat, 14 assertions").
- Acceptance: format is `"{name} {projectId}, v{versionNumber} {versionId}"`; falls back
  gracefully (e.g. "version not synced") when a version was never synced to Prompt Management.
- Demo: `promptFactory.ts` (`resolveRunPromptIdentity` / `describeRunPromptIdentity`),
  `RunDetailPage.tsx`, `RunsList.tsx`'s Description column.

#### RES-6 — Per-assertion pass-rate rollup, grouped, clickable
A row of pill/chips, one per top-level assertion (a composite/grouped assertion — RES‑29 — counts
as exactly one chip here, never expanded into its children), each showing `name · X% (n/m)`,
color-coded pass/fail-against-threshold, grouped visually by the assertion's own `group` tag
(mirroring how the assertion-authoring screen groups them). Clicking a chip filters the table below
to "every row where this exact metric had this exact outcome"; clicking it again clears the filter.
- Demo: `RunSummary.tsx` (`AssertionRollup`, `AssertionChip`).

#### RES-7 — Run-level cost/latency/token summary
A compact stat strip: total/avg cost, avg/median/max latency, total tokens, tokens-per-second —
run-level aggregates, separate from the per-row figures (RES‑18).
- Demo: `RunSummary.tsx` (`Stat`), `results.ts` (`averageOf`, `totalOf`, `maxOf`, `tokensPerSecond`).

#### RES-8 — Automated "review this first" suggestions (free tier only)
A zero-cost, instant, client-computed pass over the run surfaces (a) the rows with the most failing
metrics, worth reviewing first, and (b) which metrics fail most often and a one-line hint on likely
cause (rubric/prompt/code). A "deeper pass" action exists to hand off to an AI assistant for a
richer analysis — **building that deeper AI-assisted pass itself is out of scope**; see §7.
- Demo: `RunSummary.tsx` ("Review first" / "Worth improving"), `engine.ts`
  (`suggestRunInsightsHeuristic`).

### C. Results table — structure & density

#### RES-9 — Compact vs. full view toggle, full by default
A two-icon segmented toggle switches every cell between single-line/truncated (compact) and
wrapped/multi-line (full). Full is the default on first view of any run.
- Demo: `RunDetailBody.tsx` toolbar (Rows3/WrapText icons), `resultsViewPrefs.ts`
  (`DEFAULT_RESULTS_VIEW_PREFS.wrap = true`).

#### RES-10 — Row numbering
A leading `#` column, always visible, numbering visible rows in their current sorted/filtered
order (not a stable dataset-row id).
- Demo: `ResultsTable.tsx`.

#### RES-11 — Three-state row status: Passed / Failed / Error
A row that errored *before* any metric could run (e.g. a simulated provider timeout) is visually
and semantically distinct from a row that ran and failed a metric — different icon/color, and its
Metrics cell reads "Errored before metrics ran" rather than showing empty/zeroed chips. Error rows
are excluded from every pass-rate rollup the same way n/a scores are.
- Demo: `ResultsTable.tsx` status cell, `types.ts` (`RunItemResult.error`), `results.ts`
  (`rowStatus`).

#### RES-12 — Dataset row source indicator
Every row shows whether its dataset item is manually authored or synthetically generated, via a
small distinct icon — separate from (and orthogonal to) row status.
- Demo: `components/dataset/DatasetSourceIcon.tsx`, `types.ts` (`DatasetItemSource`).

#### RES-13 — Resizable columns
Every column has a drag handle on its right edge; width persists per Spec across reloads.
- Demo: `ResultsTable.tsx` (`ColResizeHandle`), same pattern reused in `RunsList.tsx`.

#### RES-14 — Full-screen mode, clearly labeled
A dedicated, clearly text-labeled ("Full screen" / "Exit full screen", not icon-only) control
expands the results table (single-run *or* comparison) to a fixed full-viewport overlay with its
own close action — available identically in both the single-run and the N-way comparison layouts.
- Acceptance: the control must be visually distinct enough to notice next to the compact/wrap
  toggle — icon-only was tried and missed by UAT; both layouts now use the same labeled-button
  treatment.
- Demo: `RunDetailBody.tsx` and `ComparisonRunBody.tsx`, both have a `fullScreen` state and a
  `<Button>` with the Maximize2/Minimize2 icon plus visible text.

#### RES-15 — Consistent top alignment
Every cell in a row — checkbox, `#`, status, source, every data column — aligns to the top of the
row regardless of how tall that row grows in full view, so a short cell next to a tall wrapped one
never looks misaligned.
- Demo: `ResultsTable.tsx` (`align-top` on every `<td>`).

#### RES-16 — Table fills available width, no dead whitespace
The table stretches to use all available horizontal space as columns are hidden/shown/resized,
instead of leaving an empty strip on the right once visible columns no longer add up to the
container's width.
- Demo: `ResultsTable.tsx` — a `ResizeObserver`-driven trailing filler column.

#### RES-9b — Sortable columns, paginated
Sortable by fail-count (default, descending — worst rows first), latency, cost, or tokens; results
paginated with a configurable page size.
- Demo: `RunDetailBody.tsx` (`handleSort`), `resultsViewPrefs.ts` (`ResultsSortField`,
  `RESULTS_PAGE_SIZE_OPTIONS`).

### D. Columns — content & defaults

#### RES-17 — Column set
Always visible, never hideable: row-select checkbox, `#`, Status, Source, Inputs, Output, Metrics.
Optional (hideable, see RES‑18/19/21): Reference Output, Labels, Latency, Cost, Tokens.
- Demo: `resultsViewPrefs.ts` (`ResultsColumnId`).

#### RES-18 — Latency/Cost/Tokens hidden by default, always
These three are hidden on first view of any run regardless of dataset size — not "hidden only when
crowded." Still one click away via the Columns menu, and that choice persists. When hidden, their
values aren't fully lost: the Metrics cell (single-run) and each variant's status badge
(comparison) show a small inline "Promptfoo-style" summary line of whichever of the three are
currently hidden, so the data stays glanceable without needing 3 extra columns permanently open.
- Demo: `resultsViewPrefs.ts` (`computeAutoHiddenColumns`), `ResultsTable.tsx` /
  `ComparisonRunBody.tsx` (the compact footer line inside the Metrics/badge cell).

#### RES-19 — Reference Output shown only when present anywhere in the run
Hidden by default only when *no* row in the run has a reference/expected output; shown by default
the moment at least one does — never a column of dashes.
- Demo: `resultsViewPrefs.ts` (`computeAutoHiddenColumns`'s `hasReferenceOutputs` check).

#### RES-20 — Inputs column: combined by default, distinguishable, splittable
By default all input variables render in one "Inputs" column; a Columns-menu toggle splits it into
one column per variable when the prompt has more than one. When combined, each variable is
rendered as a distinguishable `name: value` pair (bold/tinted name, not a flat run-on string of
concatenated values) — in wrap mode, each pair stacks on its own line.
- Demo: `ResultsTable.tsx` (`CombinedInputsCell`), reused identically in `ComparisonRunBody.tsx`.

#### RES-21 — Columns menu
One popover exposes: a checkbox per optional column (RES‑17/18/19), "show per-metric chips"
on/off (independent of the Metrics column's own visibility — turning Metrics off must never also
hide the control that turns chips back on), and "one column per variable" (only shown when
relevant). The Metrics column's own "only show failing" density toggle deliberately lives in that
column's own header instead, not here (RES‑24).
- Demo: `ResultsColumnsMenu.tsx`.

### E. Metrics / checks column & assertion types

#### RES-22 — Rename "Checks" → "Metrics" everywhere
Column header, detail-panel section title, CSV/JSON export field names, and every menu label.
- Demo: grep `"Metrics"` across `ResultsTable.tsx`, `ResultItemPanel.tsx`, `ComparisonRunBody.tsx`,
  `results.ts` (export builders).

#### RES-23 — Per-row Metrics cell: one chip per assertion
Promptfoo-style: a pass/fail icon, a short truncated name, and the numeric score (when the
assertion type produces one) — clicking a chip filters the whole table to that metric+outcome
(same mechanism as RES‑6's rollup chips).
- Demo: `ResultsTable.tsx`.

#### RES-24 — Metrics column density toggle: "only failing/errored"
A small filter control **in the Metrics column's own header** — not the global Columns menu —
switches between showing every metric's chip vs. only the failing/n/a ones, for a much more
compact table when most metrics pass most of the time.
- Demo: `ResultsTable.tsx` (`MetricsHeaderFilter`), `resultsViewPrefs.ts`
  (`metricsOnlyFailing`).

#### RES-25 — Not-applicable ("n/a") scores are a distinct third state
An assertion that didn't apply to a given row (e.g. a pet-specific check on a vehicle-related row)
renders as a neutral "n/a" chip — not counted as passed or failed — and is excluded from both the
numerator and denominator of every pass-rate rollup at every level (row, assertion, run,
comparison-variant). An assertion that's n/a on *every* row it ran against shows "no applicable
rows" in the summary rollup instead of a misleading 100%/0%.
- Demo: `types.ts` (`AssertionScore.na`), `RunSummary.tsx`, `engine.ts` (pass-rate math).

#### RES-26 — Rubric text is reachable from the compact chip, not force-shown
The compact per-row chip for an LLM-rubric metric surfaces the actual rubric text in its hover
tooltip (alongside the reason) — full text lives in the detail panel (RES‑39), never crowding the
compact table.
- Demo: `ResultsTable.tsx` (chip `title` attribute).

#### RES-27 — Reasoning shown for both PASS and FAIL, inline in full view
In wrapped/full view, every metric chip shows its pass-or-fail reason as a line underneath — not
just for failures. A bare "Passed." next to a fully-reasoned failure reads as a placeholder;
every LLM-judged metric must carry a real one- or two-sentence explanation either way.
Deterministic/custom-code checks may stay terse ("Passed.") since there's nothing to explain.
- Demo: `ResultsTable.tsx`, `ResultItemPanel.tsx`.

#### RES-28 — Metric "type" is visible and filterable, but only LLM-rubric gets a color
Every metric is classified as one of: a built-in deterministic check, custom code, an LLM rubric,
or a composite group (RES‑29) — shown as a small type badge next to the metric in the detail panel,
and filterable via "Metric type" in the Filters panel (RES‑33). **Design constraint:** the detail
panel already has an unambiguous green/red pass-fail signal (icon + score badge + reason color);
giving deterministic/custom-code their own saturated colors on top of that would compete with it
(concretely: a green "type" badge next to a red ✗ on a failing deterministic check reads as
contradictory). So only the type that's genuinely easy to miss — LLM rubric — gets an actual color
(a muted "info"/sky tone), echoed as a thin left-border accent on the whole metric card; composite
groups get their own distinct accent (violet/"accent" tone); deterministic and custom-code stay
plain/neutral.
- Demo: `ResultItemPanel.tsx` (`assertionTypeTone`, `assertionAccentBorder`).

#### RES-29 — Composite/grouped assertions ("assert-set")
Support Promptfoo's `assert-set` concept: several weighted sub-checks rolled into one named metric
with its own pass threshold (real-world example this was scoped from: an "H1 tag quality score"
averaging a length check, a keyword check, and a tone check).
- Acceptance:
  - A group is scored as the **weighted average** of its sub-checks' own scores
    (`Σ(childScore × weight) / Σ(weight)`, weight defaults to 1) and passes when that average
    reaches the group's own threshold (default 0.5).
  - Each sub-check is scored independently, by its own type (deterministic/custom-code/LLM-rubric)
    — a group can mix types among its children.
  - The group appears as **exactly one row/chip** everywhere a normal assertion would (summary
    rollup, table Metrics cell, filters) — its children are never separate top-level rows and are
    never double-counted in any rollup.
  - The full per-child breakdown (each child's own pass/fail/score/reason) is always reachable:
    indented under the parent chip in the table's wrap view, and as an expandable "Sub-checks"
    list in the detail panel, showing each child's score and its own weight if not 1.
  - A row can have some sub-checks fail while the group as a whole still passes, if the weighted
    average still clears the threshold — this must be visibly demonstrable, not just true in the
    math (see Scenario 5, §6.5).
- Demo: `engine.ts` (`scoreOneAssertion`, `scoreAssertionGroup`), `types.ts` (`Assertion.children`
  / `.weight` / `.groupThreshold`, `AssertionScore.childScores`), `ResultsTable.tsx` /
  `ResultItemPanel.tsx` rendering, `results.ts` (`flattenAssertions`).
- **Note on how this was modeled** — read before designing the real data model: the prototype
  deliberately did **not** add a 4th value to the existing 3-value assertion-tier enum
  (`deterministic` / `custom_code` / `rubric_grading`). Adding one would have forced updates to
  every place in this codebase that exhaustively switches on that enum, including an entirely
  separate org-wide Library-of-reusable-assertions subsystem that has nothing to do with the
  Results page. Instead, "is this a group" is modeled as an orthogonal property (`children`
  present or not), independent of `tier`. **This was the pragmatic choice for a click-through
  prototype with a large existing surface area to avoid destabilizing — it is not necessarily the
  right modeling choice for the real system.** If the real backend's assertion model can cleanly
  support a first-class "group" type without that same blast radius, that's likely the better
  design; treat this note as "here's the constraint we were working around," not "do it this way."

#### RES-30 — Deterministic-check catalog: add not-equals and contains-html
Two additions to the built-in parameterized check catalog, found missing during the config-export
coverage check (§1): `not-equals` (output must not exactly match a given string) and
`contains-html` (output must contain at least one HTML tag). Both slot into the existing catalog
mechanism — no special-casing needed elsewhere (the assertion-authoring screen's mode picker is
already catalog-driven).
- Demo: `assertionCatalog.ts`, `engine.ts` (`scoreCodeAssertion`).

### F. Filtering & search

#### RES-31 — Free-text search across every text field
A single search box matches against a row's input values, output, reference output, and reviewer
note — not just the visible/truncated text, the full underlying value.
- Demo: `RunDetailBody.tsx` (search state), `results.ts` (`matchesSearch`).

#### RES-32 — Quick status pills
All / Passed / Failed / Error — one click, always visible in the toolbar, independent of the full
Filters panel.
- Demo: `RunDetailBody.tsx` (`STATUS_FILTERS`).

#### RES-33 — Advanced Filters panel
A popover covering every filterable dimension: a specific metric + its outcome (pass/fail), metric
type (deterministic/custom-code/LLM-rubric), label (including an explicit "(no label)" option),
dataset row source, latency/cost/token min-max ranges, reference-output presence, and reviewer-note
presence. Shows an active-filter count badge; "Clear all" resets everything at once.
- Demo: `ResultsFiltersMenu.tsx`.

#### RES-34 — Filters only exist for visible columns
Every filter section in RES‑33 is conditionally rendered based on whether its corresponding column
is currently shown (RES‑21) — hiding the Cost column also hides the cost range filter, so a user
can never be silently filtering on a number they can't currently see/verify.
- Demo: `ResultsFiltersMenu.tsx` (`showLatency`/`showCost`/`showTokens`/etc. gates).

#### RES-35 — Chip-click filtering is one unified mechanism
Clicking a per-row metric chip (RES‑23) or a summary-rollup chip (RES‑6) both drive the exact same
underlying filter state; clicking an already-active chip clears it; applying a chip filter resets
the quick status pill (RES‑32) back to "All" so the two can never silently contradict each other
(e.g. "Passed" + "this metric failed" would always show zero rows).
- Demo: `RunDetailBody.tsx` (`handleFilterByAssertion`).

### G. Detail side panel

#### RES-36 — Two-column layout replaces the old 3-tab design
Opening a row's detail view shows a single full-width panel, not tabs: **left column**, pinned —
every input value, the model's output, the reference output (if present), the reviewer note.
**Right column**, scrollable — every metric, always expanded, with its full reasoning. This
directly replaces the old design's problem: reading a rubric used to mean losing sight of the
output it judged, because they lived on different tabs.
- Demo: `ResultItemPanel.tsx`.

#### RES-37 — Metadata is a footer, not a tab
Row/run identifiers, timestamps, and token/cost/latency detail collapse into a small
footer/section rather than consuming a whole tab of the old design.
- Demo: `ResultItemPanel.tsx` (metadata section).

#### RES-38 — Prev/next navigation without closing
Chevron controls step to the previous/next row (in current sort/filter order) without closing and
reopening the panel.
- Demo: `ResultItemPanel.tsx` (`onNavigate`).

#### RES-39 — Per-metric card content, by type
Every metric renders as a card: pass/fail/n/a icon, name, type badge (RES‑28), score.
- Deterministic check → what value/pattern it checked against (no source needed, the mode name
  plus its parameter says everything).
- Custom code → **no source code shown** — the metric's name is treated as sufficient context;
  showing the function body was judged as noise, not useful review context.
- LLM rubric → the actual rubric text, collapsible/expandable if long (a "Show full rubric"
  toggle) rather than either truncating it or letting it consume the whole panel.
- Composite group (RES‑29) → its pass threshold, plus the full sub-check breakdown described in
  RES‑29's acceptance criteria.
- Demo: `ResultItemPanel.tsx` (`RubricText`, `checkValueDisplay`, sub-check rendering block).

### H. Annotations

#### RES-40 — Reviewer note per dataset row
A free-text note, edited inline from the detail panel, persists on the **dataset row** (not the
run) — so it survives reruns and prompt changes, unlike a run-scoped annotation would. Searchable
(RES‑31) and filterable (has-note / no-note, RES‑33).
- Demo: `ResultItemPanel.tsx`, `dataset.ts` (`withUpdatedNote`).

#### RES-41 — Short labels per run result
Freeform short tags attached to a **run result** (not the dataset row — these are meant to group
or flag something about *this specific run's* outcome, which may not hold true on a future rerun),
editable from both the table and the panel, filterable including an explicit "no label" option,
and — per the latest UAT round — **visible by default** (unlike Latency/Cost/Tokens, which are
performance metadata and stay hidden by default; labels are the reviewer-facing annotation
feature and shouldn't need an extra click to see).
- Demo: `components/results/LabelChips.tsx`, `resultsViewPrefs.ts` (`computeAutoHiddenColumns`
  does *not* include `labels`).

### I. Multi-prompt comparison view

#### RES-42 — Automatic N-way layout when a run compares variants
A single `RunGroup` can carry 2+ prompt variants run against the *same* dataset and the *same*
assertion set (this is the only comparison shape supported — see §8 for what's explicitly not
supported). When it does, the Results page automatically renders the comparison layout instead of
the single-run layout; no separate route or user action needed.
- Demo: `RunDetailBody.tsx` (dispatches to `ComparisonRunBody` when `run.comparison.variants.length
  > 1`), `types.ts` (`RunGroup.comparison`, `RunVariant`).

#### RES-43 — Comparison charts
Three chart types, all rendered without a charting-library dependency (kept intentionally simple —
see §8):
1. **Pass-rate bar**, one bar per variant.
2. **Grouped bar per metric**, one bar per variant within each metric group — the per-assertion
   breakdown side by side across variants.
3. **Agreement scatter** (only meaningful/shown for exactly 2 variants) — one dot per dataset row,
   x/y = each variant's per-row pass fraction, colored by whether the two variants agreed.
- Demo: `components/results/charts.tsx` (`PassRateBarChart`, `GroupedBarChart`, `ScatterChart`),
  `ComparisonRunBody.tsx`.

#### RES-44 — One shared table, every variant side by side
Each dataset row appears exactly once; every variant's status/output/metrics render in their own
sub-columns within that row — not N separate tables. Uses the same column-visibility rules as the
single-run table (RES‑17–21) and the same combined/distinguishable Inputs cell (RES‑20).
- Demo: `ComparisonRunBody.tsx`.

#### RES-45 — Comparison-specific filters and columns
Status filter (matches if *any* variant has that status), a metric filter, and a Columns menu that
additionally exposes per-variant Source/Latency/Cost/Tokens visibility (on top of the same global
column set).
- Demo: `ComparisonRunBody.tsx` (its own filter/columns controls).

#### RES-46 — Comparison detail panel: every variant side by side
Opening a row shows all variants' outputs and every metric's outcome for that one row together —
input/note/reference shown once (shared across variants), so a regression between two variants is
visible without flipping between separate single-variant panels.
- Demo: `ComparisonItemPanel.tsx`.

#### RES-47 — Comparison full-screen, same treatment as single-run
Same full-screen behavior and same clearly-labeled control as RES‑14, in the comparison view's own
prominent header banner (variant count, row/metric counts) rather than a crowded toolbar.
- Demo: `ComparisonRunBody.tsx`.

### J. Export

#### RES-48 — Export current view as JSON or CSV
Export popover offers a row-scope choice (filtered rows / selected rows / all rows) crossed with a
format choice (JSON / CSV); filename includes the Spec name and a timestamp.
- Demo: `ResultsExportMenu.tsx`, `results.ts` (`resultRowsToJson`, `resultRowsToCsv`).

### K. Data honesty

#### RES-49 — Cost/latency/token figures must read as estimates
Wherever these appear (run summary, per-row Metrics footer, comparison badges), they come from a
token-counting/pricing estimate, not billed usage. This isn't a UI requirement so much as a
flag for engineering: **when wiring this to the real system, the estimate-vs-billed distinction
needs to be preserved or made explicit**, not silently presented as measured fact.
- Demo: `pricing.ts` (`simulatedPerf`).

### L. Cross-cutting

#### RES-50 — View preferences persist per Spec, sensible smart defaults, user choice always wins
Wrap/compact, hidden columns, sort field/direction, page size, and Metrics chip density all persist
per Spec (not globally) across reloads. On the very first time a given Spec's results are viewed,
hidden columns seed from a computed smart default (RES‑18/19); the instant a user makes any
explicit choice — even re-hiding a column that was already shown — that choice wins forever after,
never silently reverting to the computed default again.
- Demo: `resultsViewPrefs.ts` (`useResultsViewPrefs`, `computeAutoHiddenColumns`).

---

## 5. Data model additions (summary, for backend/type design)

For a system with an existing eval/assertion data model, these are the additions the above
requirements assume exist somewhere:

| Concept | Field(s) | Notes |
|---|---|---|
| Row-level hard failure vs. scored failure | `RunItemResult.error?: string` | Distinct 3rd status (RES‑11); excluded from every rollup like `na` is. |
| Not-applicable score | `AssertionScore.na?: boolean` | Excluded from numerator *and* denominator everywhere (RES‑25). |
| Composite/grouped assertion | `Assertion.children?: Assertion[]`, `.weight?: number` (on a child), `.groupThreshold?: number` | See RES‑29's full acceptance criteria and its modeling note — this is the one place we'd actively recommend reconsidering the exact shape for a from-scratch backend design. |
| Group's per-child breakdown | `AssertionScore.childScores?: AssertionScore[]` | Never flattened into the top-level scores list (RES‑29). |
| Two new deterministic modes | `CodeCheckMode`: `"not_equals"`, `"contains_html"` | RES‑30. |
| Real external prompt identity | `SpecProject.psProjectId`, `.promptDisplayName`; `Target.psVersionId` | RES‑5 — carries the *real* Prompt-Management project/version ids through to the Results page, distinct from this system's own internal ids. |
| Multi-variant run | `RunGroup.comparison?: { variants: RunVariant[] }` | RES‑42 — one run, N prompt variants, same dataset + same assertion set only (see §8). |

---

## 6. Demo scenarios

Five seeded Specs, each prefixed `"Scenario N — …"` in the Specs/Runs lists, each built to exercise
a specific data shape. §2.3 explains what's real vs. invented in each.

| # | Spec name(s) | Shape | Exercises |
|---|---|---|---|
| 1 | *Compliance chat, 14 assertions* · *Intake bot, 7 inputs & n/a checks* · *Pet-service greeter, 4 inputs* | One prompt, no reference output | Base single-run table/panel; many-assertion density; multi-variable inputs; per-row n/a assertions (RES‑25); a synthetic Error row (RES‑11) |
| 2 | *Intake bot, 3-prompt comparison* | 3 prompt variants, same dataset+assertions, no reference output | The whole comparison view (§4.I) — table, charts, filters, panel |
| 3 | *Pricing-help detector (boolean ref)* · *Contact-preference classifier (enum ref)* | One prompt, **with** a reference output | Reference Output column's presence-based default (RES‑19); a boolean-style and an enum-style reference value |
| 4 | *Category/lead classifier, 100 rows* | One prompt, many rows (100+), many input variables, with reference output | Table performance/density at scale; column crowding decisions; a synthetic Error row mid-dataset |
| 5 | *Funnel headlines, grouped & new check types* | One prompt, 8 rows, fully invented (§2.3) | `not-equals`, `contains-html` (RES‑30); a 3-child weighted composite assertion (RES‑29), including the specific case of "one sub-check fails but the group still passes" |

### 6.5 Scenario 5, in detail — the one to study for RES‑29/30

A fully invented "funnel-page headline generator": given a service category (e.g. "Divorce
Lawyer"), the prompt writes an `<h1>` headline and a one-line meta description. Its assertion set:

1. `contains-html` (deterministic) — output must include an `<h1>` tag.
2. `not-equals` (deterministic) — headline must not be the generic templated fallback for that row's
   category (demonstrating a `{{var}}`-templated deterministic check value).
3. **"H1 tag quality score"** (composite/grouped) — equal-weighted average of 3 children:
   an H1-length check (30–70 chars, custom code), a category-keyword check (custom code), and a
   tone check ("benefit-led, not clickbait", LLM rubric) — group threshold 0.6.
4. "Meta description is compelling and specific" (LLM rubric, standalone).

The 8 rows deliberately isolate different failure patterns — worth opening each one in the detail
panel:
- 2 rows where every metric passes cleanly.
- 1 row that fails *only* `contains-html` (model dropped the `<h1>` tag) with everything else,
  including the group, passing — proving metrics are scored independently.
- 1 row that fails *only* `not-equals` (regenerated the exact fallback headline) similarly isolated.
- 2 rows where the group fails, via different combinations of its 3 children failing.
- **1 row where the group's keyword sub-check fails but the group still passes overall** — because
  the weighted average of its 3 children (2 passing, 1 failing) still clears the 0.6 threshold.
  This is the single most important row in the whole prototype to point at when explaining RES‑29
  to anyone who hasn't internalized what "weighted" buys you over "all children must pass."

---

## 7. Explicitly out of scope for this round

Called out so nothing here gets accidentally scoped into a story:

- **Authoring new composite/grouped assertions.** The Results page fully *displays* assert-set
  groups (RES‑29); the separate assertion-authoring screen was **not** extended to let a user build
  or edit a group from scratch (add/remove children, set weights/threshold via UI). Scenario 5's
  group was hand-built directly in seed data, not through the authoring UI.
- **A deeper, AI-generated review pass.** The free heuristic "review this first" / "worth
  improving" picks (RES‑8) are built and real; an LLM-backed, opt-in *deeper* analysis pass beyond
  that heuristic was discussed and explicitly deferred — not built, not stubbed with fake output.
- **Real model calls / real judge grading on this page.** Every score in every Scenario is seeded,
  not computed against a live model or a live LLM judge. The scoring *engine* (pass/fail logic,
  weighted-average aggregation) is real and reusable; the *inputs* to it (what the model actually
  said) are not live.
- **Per-row-varying assertion sets.** A run's assertion set is fixed for the whole run — Promptfoo
  configs where different dataset rows are checked against genuinely different assertions were
  identified as a real pattern in the config-export coverage check but are **not** supported here;
  the closest equivalent covered is a fixed assertion set where some assertions are `n/a` for some
  rows (RES‑25), which is a different (and much more common, per the coverage check) case.
- **Comparisons across different assertion sets.** RES‑42's comparison view requires every variant
  to share the same dataset *and* the same assertion set. Comparing two prompts that were graded
  differently isn't supported.
- **A charting library.** RES‑43's charts are deliberately minimal, dependency-free SVG — fine for
  3 chart types at this scale; revisit if comparison views grow more chart types.
- **Real cost/latency/token metering.** See RES‑49 — the *shape* (where these numbers appear, when
  they're hidden) is the requirement; the numbers themselves are estimates.

---

## 8. Open questions / decisions engineering should make explicitly

- **RES‑29's data model.** As flagged inline: we deliberately avoided adding a 4th assertion-tier
  value to sidestep this prototype's existing exhaustive-switch surface area. A real backend
  starting fresh (or with a less tightly-coupled tier enum) may reasonably model "group" as a true
  first-class type instead of an orthogonal `children` property. Worth a short design spike before
  committing to a shape.
- **Unequal weighting.** The data model supports per-child `weight`, but Scenario 5 only
  demonstrates equal weights (all `1`). Confirm whether unequal weighting is a real near-term need
  (real-world configs found during the coverage check did use it) before deciding how much UI
  affordance a weight-editing story deserves.
- **Per-row-varying assertions** (see §7) — flagged as a real pattern (~11% of configs in the
  coverage check used per-test assertions) but out of scope here. Worth its own requirements pass
  if it turns out to be common in the eval configs this will actually need to support.
- **Nested groups.** Children are scored one level deep only (a child's own `children`, if any,
  are ignored) — no real-world example needed a group-of-groups, so this wasn't built. Flag if the
  real system's configs ever nest deeper.

---

## 9. Glossary

- **Run / RunGroup** — one execution of a Spec's assertion suite against its dataset, producing one
  `RunItemResult` per dataset row (or, for a comparison run, one per row *per variant*).
- **Comparison run** — a single `RunGroup` whose `comparison.variants` holds 2+ prompt variants
  scored against the *same* dataset and assertion set (RES‑42).
- **Assertion / Metric** — used interchangeably in the UI (renamed from "Check" — RES‑22); one
  named pass/fail (or scored) test applied to every row.
- **Tier** — an assertion's cost class: `deterministic` (built-in parameterized check, no LLM call),
  `custom_code` (user function), `rubric_grading` (LLM-as-judge) — cheapest-first, matching the
  existing assertion-authoring screen's own ordering.
- **Composite / grouped assertion / assert-set** — Promptfoo's term for several weighted sub-checks
  rolled into one named metric with its own pass threshold (RES‑29).
- **n/a (not applicable)** — a score explicitly excluded from pass/fail accounting because the
  check didn't apply to that particular row (RES‑25) — distinct from a hard row-level `error`
  (RES‑11).
- **Sample run** — a run that only scored a chosen subset of the dataset (see
  [`requirements/05-runs-and-results.md`](05-runs-and-results.md), RUN‑12), surfaced as a distinct
  badge in the summary header (RES‑4) instead of the usual full-run framing.
