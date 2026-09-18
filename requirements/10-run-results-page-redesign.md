# Run Results Page — Redesign Requirements

**Author:** Veronica Kravets · **Audience:** engineering (to be broken down into stories)

**Deployed prototype:** _{{ add link here }}_

## 0. Purpose & how to use this document

The individual Run Results page — what you land on after an eval run finishes, whether that's one
prompt or a side-by-side comparison of several, scored against a dataset — is the single
highest-leverage, most-used screen in the product. This document describes, in business/product
terms, **what the redesigned page needs to do and why** — not how a prototype happens to have
built it. A click-through prototype exists (link above) purely so every requirement below can be
seen in action with real example data instead of staying abstract; treat it as an illustration of
the intended behavior, not a spec of its own.

**This document has three jobs:**

1. **§4 Requirements** — what has to be true of the finished page, as discrete, story-sized
   requirement blocks (`RES-1`, `RES-2`, …), each with the reasoning behind it and how to tell
   it's working.
2. **§3 Demo scenarios** — the specific business situations the prototype was checked against,
   and how to find each one in the deployed link above.
3. **§2 Background** — the real-world data this was scoped against, and what to trust vs. not
   trust when reading the prototype's example numbers.

**How to use this to plan stories:** each `RES-` block is written to be independently story-sized.
The lettered section groupings (A–L) are a reasonable epic/milestone split. §6 and §7 exist so
nothing gets accidentally scoped in that was deliberately left as a future decision or explicitly
descoped for this round — read those before estimating.

---

## 1. Goals & guiding principles

Why this page is being redesigned, and the priorities that should settle any ambiguity below:

1. **Never make the reviewer hold context in their head.** The single biggest complaint about the
   current page is that reading a piece of AI-generated output, then judging why a check on it
   passed or failed, then checking metadata, meant flipping between separate tabs/screens — by
   the time you reached the reasoning, you'd already lost sight of the output it was judging.
   Every layout decision below optimizes for "everything I'm comparing stays in front of me at
   once."
2. **Density is a choice, not a default you fight.** A compact view and a fully detailed view
   both need to exist, one click apart — not a setting buried three menus deep. Every column has
   a sensible default (shown, hidden, or shown-only-when-relevant), but any user override sticks.
3. **Match the industry-standard eval-tool experience where it's already proven, improve on it
   where it's obviously worth it.** Per-check result chips, reasoning for both a pass and a fail,
   filtering, and comparison charts should feel familiar to anyone who's used a mainstream
   open-source eval tool. The two-panel review layout, adaptive column visibility, and
   weighted/composite checks are meant to go further than that baseline.
4. **A check's pass/fail must never be ambiguous.** Every other visual signal (what kind of check
   it is, where a test case came from, how results are grouped) has to be layered on without
   competing with the one signal that matters most: did it pass or fail. See RES‑29 for a concrete
   case where this shaped the design.
5. **Never present an estimate as a measured fact.** Cost/latency/token figures are estimates
   until real usage metering is wired up; the page has to read that way wherever they appear.

---

## 2. Background — what this was scoped against

- This redesign was scoped against **real historical eval exports**: 7 exported result sets
  covering single-prompt runs, a 3-way prompt comparison, and runs both with and without a
  reference/expected answer to compare against — plus a much larger **export of eval
  configurations** (not results — the actual setup of many real eval suites) that was reviewed
  afterward specifically to check for gaps: check types or structures the redesign hadn't
  accounted for yet. That second pass is where the "not-equals" / "contains HTML" check types and
  the weighted/composite check requirement (§4.E) came from.
- Two rounds of hands-on feedback against the running prototype are already folded into the
  requirements below — this isn't a first draft.

### What's real vs. invented in the prototype's example data

Four of the five demo scenarios (§3) are built from the real exports above: every example
input, every example model output, and every example pass/fail/score is real, taken straight from
that export. A handful of supporting details the exports never captured were **invented on top of
that real data**, purely to make the demo readable — most notably: what the underlying prompt
actually says (exports only ever recorded which prompt/version ran, never its content), a
human-readable name for that prompt, and — for AI-judged checks — the actual grading instructions
a judge would have been given (exports only ever recorded a check's name and its pass/fail, never
its instructions). One scenario (Scenario 5, §3) is entirely invented, to demonstrate a check
shape that hadn't come up yet in the real exports.

**The takeaway:** don't treat any specific number, output, or wording in the prototype as
something to match exactly — the *behavior and rules* being demonstrated are the requirement, not
the illustrative content sitting inside them.

---

## 3. Demo scenarios — what to look at, and where to find it

Five example runs are available at the link above, so every requirement in §4 can be checked
against something concrete instead of a hypothetical. Each one is named so it's unambiguous which
business case it represents — open the runs list at the link above and look for a name starting
with **"Scenario N — …"**.

| # | Look for a run named… | Represents | Illustrates |
|---|---|---|---|
| 1 | *Scenario 1 — Compliance chat, 14 assertions* (and two sibling variants: *Intake bot, 7 inputs & n/a checks* / *Pet-service greeter, 4 inputs*) | A single prompt evaluated with no expected/reference answer to compare against | The base single-run view; a case with many checks at once; a case with several input fields per test case; checks that don't apply to every test case; one test case that hard-errored instead of scoring |
| 2 | *Scenario 2 — Intake bot, 3-prompt comparison* | Three candidate prompt versions evaluated side by side, on the same test cases and same checks | The whole comparison view — shared table, charts, filters, and detail view across variants |
| 3 | *Scenario 3 — Pricing-help detector* and *Contact-preference classifier* | A single prompt evaluated **with** a known correct/expected answer to compare each output against | How the page behaves once a reference answer exists — one example with a yes/no-style reference, one with a multiple-choice-style reference |
| 4 | *Scenario 4 — Category/lead classifier, 100 rows* | A single prompt evaluated against a large test set (100+ cases) with several input fields each, and a reference answer | How the page holds up at scale — density, column choices, one hard-errored test case mixed into a large run |
| 5 | *Scenario 5 — Funnel headlines, grouped & new check types* | A single prompt, entirely invented for this purpose | A weighted, multi-part check (§4.E) and two additional standard check types not seen in the real exports |

### Scenario 5, in detail — the one to study for weighted/composite checks

An invented "funnel-page headline generator": given a service category (e.g. "Divorce Lawyer"),
the prompt writes a page headline and a one-line description. Its checks:

1. Output must contain proper markup for a headline (a new standard check type).
2. Output must **not** be the generic fallback headline for that category (a new standard check
   type, using per-row data).
3. **"Headline quality score"** — a single named check that is really an equally-weighted average
   of three smaller checks (headline length, category-relevant keyword present, and a
   benefit-led-not-clickbait tone check graded by an AI judge), passing once that average clears a
   set bar.
4. A separate AI-judged check on whether the description is compelling and specific.

The example test cases deliberately isolate different situations, each worth opening once you're
in the prototype: two clean passes; one failing *only* check 1 with everything else passing; one
failing *only* check 2 similarly in isolation; two where the weighted check (#3) fails outright;
and — the single most important example in the whole prototype — **one case where one of the
three smaller checks inside the weighted check fails, but the weighted check still passes overall**
because the average of all three still clears the bar. That last case is the one to point to when
explaining why "weighted average" is more useful than "every sub-check must pass."

---

## 4. Requirements

Every block: an ID, what must be true, why, and how to tell it's working. Section groupings A–L
are a reasonable story/epic split.

### A. Getting to a run's results

#### RES-1 — A run's results open in their own place, not on top of what you were doing
Opening any run's results must not replace or hide the list you opened it from. It should behave
like a distinct destination with its own address — something you could bookmark, share with a
colleague, or open again later, and reloading it should show the same thing.
- Why: reviewing results is naturally a "keep several open at once, compare them" task; losing the
  list you were browsing every time you open one result defeats that.

#### RES-2 — The results page always states which prompt/version it evaluated, and lets you move sideways to related runs
The top of the page must make it obvious *what* was actually run (RES‑5), let you jump to other
runs of that exact same prompt version (e.g. to spot flakiness across reruns), and offer a clear
way back to wherever you came from.

#### RES-3 — One place to browse every run, across every project
A single list surfaces every run system-wide — sortable, filterable, with pagination — so
"browse everything that's ever been run" doesn't require opening each project one at a time.

### B. The summary header (top of every results page, single run or comparison)

#### RES-4 — Aggregate status at a glance
Shows, without any interaction: how many test cases ran, how many checks were evaluated, the
overall pass rate, and a clear flag when this run only scored a chosen subset of the test cases
rather than the whole set.

#### RES-5 — The page names the real prompt and version it evaluated, not an internal label
The main heading must show the actual, human-recognizable name of what was evaluated, together
with its real, externally-meaningful project and version identifiers — the same identifiers
someone would use to find that exact prompt version anywhere else in the organization — rather
than only this tool's own internal label. Any internal/eval-specific label (e.g. a description of
which business scenario this run represents) should still be shown, but only as secondary
information, and only when it actually adds something beyond the real name.
- Why: reviewers, engineers, and auditors need to know *exactly* which real, versioned prompt
  produced these results without cross-referencing anything else.
- Acceptance: if the real version was never registered/synced anywhere yet, say so plainly instead
  of showing a blank or a guess.

#### RES-6 — A pass-rate breakdown per check, grouped, and clickable to filter
Directly below the header, show every check's own pass rate for this run, visually grouped the
same way checks are grouped when they're authored (so, e.g., every "Guardrails"-tagged check rolls
up together), color-coded against whether it's meeting its own required pass bar. Clicking a
check's entry should narrow the results table below to exactly the rows where that check had a
given outcome; clicking it again should clear that narrowing.

#### RES-7 — Run-level cost, latency, and token summary
A compact strip of run-level totals/averages (cost, latency, tokens) — separate from the same
figures shown per individual test case (RES‑19).

#### RES-8 — Automatic, free "review this first" guidance
Without any user action or cost, the page should point out which test cases have the most
failing checks (worth reviewing first) and which checks fail most often, with a short plain-
language hint at likely cause. A path to hand this off for a deeper, opt-in AI-assisted analysis
should exist as an escalation, but building that deeper analysis itself is **out of scope** for
this round (§6).

### C. The results table — structure & density

#### RES-9 — A compact view and a fully detailed view, one click apart, detailed by default
Every row must be viewable either as a single truncated line per field (compact) or fully
expanded/wrapped (detailed), switchable with one click. Detailed is the default the first time
anyone opens a given run's results.

#### RES-10 — Row numbering
Every visible row is numbered in its current sorted/filtered order, so a reviewer can say "case
#14" and mean something concrete and locatable.

#### RES-11 — Three distinct outcomes per row: passed, failed, or errored
A test case that broke before any check could even run (e.g. the underlying system never
responded) must look and read differently from a test case that ran fully and simply failed a
check — different visual treatment, and its checks column should say plainly that nothing could be
scored, rather than showing empty or zeroed-out results. Errored rows must be excluded from every
pass-rate calculation, the same way not-applicable checks are (RES‑26).

#### RES-12 — Where each test case came from is visible per row
Every row shows, via a small distinct indicator, whether that test case was written by a person or
generated — independent of, and never confused with, whether it passed or failed.

#### RES-13 — Column widths are adjustable
Every column's width can be dragged wider or narrower, and that choice is remembered.

#### RES-14 — A clearly-labeled full-screen mode, in every layout
A prominent, clearly worded control (not just an icon that's easy to miss) expands the results
table to fill the whole screen, with an equally clear way to exit — available identically whether
you're looking at a single run or a multi-prompt comparison.
- Note: an icon-only version of this control was tried first and was missed by real users during
  review — it needs to read as an obvious, labeled action, not something to discover by accident.

#### RES-15 — Every row's cells line up at the top, regardless of row height
When one field in a row wraps onto several lines and its neighbors don't, every cell in that row
must still start at the same vertical position — nothing should look "sunken" or misaligned just
because a neighboring cell is short.

#### RES-16 — The table always fills the available width
As columns are hidden, shown, or resized, the table should stretch to use all the horizontal space
available rather than leaving a dead, unused strip once the visible columns no longer add up to
the full width.

#### RES-17 — Sortable, with the worst results surfaced first by default, and paginated
Results can be sorted by how many checks failed (the default — worst test cases first, no filter
required to see them), or by latency/cost/tokens; large runs are paginated with a choice of page
size.

### D. Which columns show, and when

#### RES-18 — A sensible, minimal default column set
Always shown, and never something a user can accidentally hide: a way to select rows, the row
number, pass/fail/error status, where the test case came from, its inputs, the model's output, and
its check results. Everything else is optional and controlled the way RES‑22 describes.

#### RES-19 — Latency, cost, and token columns are hidden by default, always — not just when the table is crowded
These three don't show automatically even on a run with very few test cases and plenty of room —
they're performance/cost bookkeeping, not the primary review signal, so they stay one click away
regardless of how much space is available. When hidden, they aren't fully lost: a short inline
summary of whichever of the three are currently hidden still appears folded into the check-results
column, so the numbers stay glanceable without needing three permanently-open columns.

#### RES-20 — A reference/expected-answer column shows only when at least one test case actually has one
If no test case in this run has a known correct answer to compare against, that column shouldn't
exist at all for this run — never a column full of blanks. The moment at least one test case does
have one, it should show automatically.

#### RES-21 — When a prompt takes several inputs, they're combined into one readable column by default, with an option to split them out
By default, every input field for a test case is shown together in one column, each one clearly
labeled by name (not run together as an unlabeled string of values) — with an option to instead
give each input field its own column when that's more useful (only offered when the prompt
actually has more than one input field).

#### RES-22 — One place to control every optional column, plus a couple of directly related display choices
A single menu exposes every column that can be hidden/shown (RES‑18–21), plus: turning the
per-check result indicators on/off (kept independent from the check-results column's own
visibility — turning that column off must never also remove the only control that turns those
indicators back on) and switching between combined vs. per-field input columns. The check-results
column's own "only show failures" density option lives on that column itself instead (RES‑25), not
in this general menu.

### E. Check results & check types

#### RES-23 — "Checks" is called "Metrics" everywhere
Every label a user sees for this concept — the column, the detail-view section, anything
exported — should consistently say "Metrics," not "Checks."

#### RES-24 — One compact result indicator per check, per row
Each row shows a small pass/fail indicator per check, with its short name and its score (when that
check produces one). Clicking one narrows the whole table to exactly that check's outcome — the
same behavior as clicking a check in the header rollup (RES‑6).

#### RES-25 — The Metrics column can be switched to "only show failures/errors"
A density control that lives specifically on the Metrics column's own header — separate from the
general column menu (RES‑22) — lets a reviewer collapse every passing check out of view and see
only what's failing or errored, for a much faster read on a mostly-passing run.

#### RES-26 — A check can be explicitly "not applicable" to a given test case, and that must never count as a pass or a fail
Some checks legitimately don't apply to every test case (e.g. a pet-related check on a
vehicle-related test case). That state needs its own neutral, clearly distinct treatment — and
must be excluded from both sides of every pass-rate calculation, at the level of a single test
case, a single check summed across the run, or a whole run. If a check never applied to a single
test case in the run, say so plainly instead of showing a misleading 0% or 100%.

#### RES-27 — The full grading instructions behind an AI-judged check are always reachable, without crowding the compact view
The compact per-row indicator surfaces the actual instructions an AI judge was given (e.g. on
hover), rather than forcing them into the table itself; the full text is always available in the
detailed per-row view (RES‑40).

#### RES-28 — Every check shows its reasoning, whether it passed or failed
In the detailed table view, every check's result includes a short explanation of *why* — not only
for failures. A check that passed with no explanation at all reads as unfinished next to a
fully-explained failure; this must be avoided for every AI-judged check. Simple built-in checks
(e.g. an exact-match check) can stay terse, since there's nothing meaningful to explain either way.

#### RES-29 — Every check shows what kind it is, but only one kind gets an actual color
Every check should be labeled by kind — a simple built-in check, custom logic, an AI-judged check,
or a weighted/composite check (RES‑30) — and it must be possible to filter by kind. Deliberately,
only the AI-judged kind gets an actual distinct color treatment (a muted, non-alarming tone,
reused as a subtle accent on that check's whole result card); weighted/composite checks get their
own distinct-but-equally-muted treatment; the rest stay visually neutral.
- Why: the detail view already has an unambiguous pass/fail signal (an icon, a score, and
  color already used for that). Giving every kind of check its own saturated color on top of that
  would compete with it — e.g. a bright "green" kind-label sitting next to a red fail icon reads as
  contradictory. AI-judged checks are the one kind that's genuinely easy to overlook otherwise, so
  that's the one exception.

#### RES-30 — Support a weighted, multi-part check ("composite check")
A single named check can really be several smaller checks rolled together with individual
weights, passing once their weighted average clears a set bar — e.g. an overall "headline
quality" check that's really an average of a length check, a keyword check, and a tone check.
- The smaller checks inside it can themselves be of any kind (built-in, custom, or AI-judged), and
  can be mixed.
- Everywhere a normal check would appear — the header rollup, the per-row indicator, filters — the
  composite check must appear as exactly **one** entry with its own aggregate result; its smaller
  checks are never separately counted or double-counted in any pass-rate calculation.
- The full breakdown of every smaller check's own result must always be reachable underneath the
  main entry, never hidden away.
- It must be visibly possible for some of the smaller checks to fail while the composite check as
  a whole still passes, if the weighted average still clears the bar — see Scenario 5 (§3) for a
  concrete example a reviewer can point to.
- Note for whoever designs the underlying data model: this document intentionally doesn't
  prescribe *how* a composite check should be represented internally — that's an engineering
  decision — only the behavior it must produce.

#### RES-31 — Two additional standard, built-in check types
Alongside whatever standard checks already exist, add: a check that the output must **not** match
a specific value (as opposed to must match), and a check that the output must contain valid markup
for a given element (found to be a real, recurring need when reviewing real eval configurations,
not something either of the existing checks covered).

### F. Filtering & search

#### RES-32 — One search box, matching every text field on a row
A single free-text search matches against every input field, the output, the reference answer (if
any), and any reviewer note on that row — matching the full underlying text, not just whatever's
currently visible/truncated.

#### RES-33 — One-click status filters
All / Passed / Failed / Errored — always visible, no menu required, independent of the fuller
filter panel (RES‑34).

#### RES-34 — A full filter panel covering every meaningful dimension
Beyond the quick status filters: filter by a specific check and its outcome, by check kind, by
label (including explicitly "has no label"), by where a test case came from, by latency/cost/token
ranges, by whether a reference answer exists, and by whether a reviewer note exists. Show how many
filters are currently active, and offer a one-click way to clear all of them at once.

#### RES-35 — You can only filter on what's currently visible
Every section of the filter panel only appears if its related column is currently shown (RES‑22)
— hiding, say, the cost column also removes the ability to filter by a cost range, so nobody can
end up filtering on a number they can no longer see or verify.

#### RES-36 — Clicking a result to filter is one consistent behavior everywhere, and never silently contradicts another filter
Clicking a check's result — from a row or from the header rollup (RES‑6/24) — always drives the
same underlying filter, clicking it again always clears it, and applying it always resets the
quick status filter (RES‑33) back to "all," so the two can never combine into a filter that's
guaranteed to show zero results (e.g. "passed" plus "this check failed").

### G. The detail view for a single test case

#### RES-37 — One two-part view, not separate tabs, replaces the current design
Opening a test case's full detail must show, at once, on one screen: every input, the output, and
the reference answer (if any) pinned on one side, always visible — and every check's full result
and reasoning on the other side, scrollable independently. This directly replaces the previous
tabbed design's core problem: reading a check's reasoning used to mean losing sight of the output
it was judging, because they lived on different tabs.

#### RES-38 — Metadata is a small section, not a whole tab
Identifiers, timestamps, and performance figures collapse into a compact section rather than
consuming as much visual weight as the output and the check results.

#### RES-39 — Step to the next/previous test case without closing the detail view
Simple forward/back controls move to the next or previous test case (in whatever order the table
is currently sorted/filtered to) without closing and reopening the view.

#### RES-40 — What each check's detail shows depends on its kind
A simple built-in check shows what value or pattern it checked against — nothing more is needed.
Custom-logic checks show their name only; the underlying logic itself is not shown — reviewing it
was judged to add noise, not useful context, for this audience. AI-judged checks show their actual
full grading instructions, collapsible if long, rather than either cutting them off or letting them
take over the screen. A weighted/composite check (RES‑30) shows its pass bar and the full result
of every smaller check inside it.

### H. Letting a reviewer annotate what they see

#### RES-41 — A free-text note per test case, that survives future runs
A reviewer can attach a free-text note to a test case; it must persist on that test case itself
(not just on this one run), so it's still there after a prompt change and a rerun. It must be
searchable (RES‑32) and filterable (RES‑34).

#### RES-42 — Short labels per result, visible by default
A reviewer can attach short, free-form labels to a specific result — meant to flag or group
something about *this run's specific outcome* that the built-in checks don't capture (unlike the
note above, a label isn't expected to still be meaningful after the prompt changes and reruns).
Labels must be filterable, including "has no label," and — unlike performance figures (RES‑19) —
must be visible by default, since this is reviewer-facing signal, not bookkeeping.

### I. Comparing several prompt variants at once

#### RES-43 — The comparison layout appears automatically whenever a run actually compares variants
When a run evaluated two or more prompt variants against the exact same test cases and the exact
same checks in one go, the results page must automatically show the comparison layout instead of
the single-run layout — no separate action required to switch into it.
- Note: comparing variants that were checked against genuinely different check sets is **not**
  supported (§6) — only same-test-cases, same-checks comparisons.

#### RES-44 — Comparison charts
Three chart types: a pass-rate comparison across variants; a per-check breakdown comparing every
variant side by side for each check; and, specifically when comparing exactly two variants, an
agreement view showing, per test case, whether the two variants agreed or disagreed.

#### RES-45 — One shared table, every variant side by side, not a separate table per variant
Each test case appears exactly once, with every variant's status/output/check-results shown
side by side within that one row — using the same column rules as the single-run table (RES‑18–21).

#### RES-46 — Comparison-specific filtering and column choices
The same status and check filters as the single-run view, plus the ability to show/hide
source/latency/cost/tokens independently per variant.

#### RES-47 — The comparison detail view shows every variant side by side for one test case
Opening a test case in the comparison view shows every variant's output and every check's outcome
for that one test case together — inputs/note/reference (shared across variants) shown once — so a
difference between two variants is visible without flipping between separate single-variant views.

#### RES-48 — Full-screen mode in the comparison view too
The same clearly-labeled full-screen control as RES‑14, available in the comparison layout as well.

### J. Getting data out

#### RES-49 — Export the current view as JSON or CSV
Export whatever's currently filtered, whatever's currently selected, or everything — in either
format.

### K. Being honest about estimated figures

#### RES-50 — Cost, latency, and token figures must always read as estimates, not measured fact
Everywhere these appear — the summary header, the inline column-replacement summary (RES‑19), a
comparison view — they should be understood as an estimate, not billed/measured usage, until real
usage metering exists. This is a flag for whoever builds the real version: the estimate-vs-actual
distinction needs to be preserved and stay visible, not quietly presented as fact once real numbers
are available for some but not all of these figures.

### L. Preferences

#### RES-51 — Every view choice is remembered per project, sane defaults win only until a user overrides them
Compact/detailed view, which columns are hidden, sort order, page size, and check-result density
all persist per project, across visits. The very first time a project's results are viewed, hidden
columns should start from the sensible computed defaults described above (RES‑19/20); the instant
a user makes any explicit choice of their own — even re-hiding something that was already
shown — that choice must win from then on and never silently revert back to the computed default.

---

## 5. Underlying rules the data itself must support

A short summary of the capabilities the system needs, independent of any particular UI —
useful for whoever designs how results are actually stored and computed:

- A single check's result on a single test case must be able to be marked **not applicable**,
  distinct from pass or fail, and excluded from every pass-rate calculation everywhere (RES‑26).
- A test case's run must be able to record a **hard error** (nothing could be scored) as a third,
  distinct outcome from pass/fail (RES‑11).
- A named check must be able to be a **weighted combination of several smaller checks**, each
  possibly of a different kind, with its own pass bar, and the ability to report both its own
  single aggregate result and the full breakdown of its parts (RES‑30).
- Two additional standard, built-in check types are needed: "must not equal a given value" and
  "must contain valid markup for a given element" (RES‑31).
- The system must be able to carry the **real, externally-meaningful identity** of the prompt and
  version a run evaluated — not only an internal label — so the results page can always show
  genuine identity (RES‑5).
- A single run must be able to represent **several prompt variants evaluated together** against
  the identical test cases and identical checks, so a comparison is one run, not several
  separately-run results stitched together after the fact (RES‑43).

---

## 6. Explicitly out of scope for this round

Called out so nothing here gets accidentally scoped into a story:

- **Building/editing a weighted or composite check from scratch through a UI.** This document
  requires the results page to fully *display* one correctly (RES‑30); it does not require the
  check-authoring experience to gain the ability to construct one.
- **A deeper, AI-generated review pass.** The free, instant "review this first" guidance (RES‑8)
  is required; a richer, opt-in AI-assisted analysis beyond that was discussed and is explicitly
  deferred, not required for this round.
- **Real-time model or AI-judge grading on this page.** The scoring *rules* in §4/§5 are the
  requirement; live grading against a real model, in real time, is not part of this page's scope.
- **Test cases checked against genuinely different checks per test case within one run.** A run's
  set of checks is fixed for the whole run. The closest supported case is a fixed check set where
  some checks legitimately don't apply to some test cases (RES‑26) — a different, and more common,
  situation than truly varying which checks run per test case.
- **Comparing variants that were graded with different checks.** RES‑43 requires the same test
  cases *and* the same checks across every variant being compared.
- **Real, metered cost/latency/token usage.** RES‑50 requires these to read as estimates; wiring
  up real measured usage is separate future work.

---

## 7. Open questions for whoever scopes this next

- **Unequal weighting inside a composite check.** The requirement (RES‑30) allows it, and it's a
  documented real-world need, but the prototype's own example only demonstrates equal weighting.
  Worth confirming how much of a priority actual unequal-weight configuration deserves.
- **Checks that vary per test case within a single run** (§6) — a real pattern seen in about one
  in ten real eval configurations reviewed, but out of scope here. Worth its own requirements pass
  if it turns out to matter more than that.
- **Composite checks nested inside other composite checks.** Not required here — no real example
  needed it — but worth flagging if it turns out to be a real need later.

---

## 8. Glossary

- **Run** — one execution of a prompt's full set of checks against its test cases. A **comparison
  run** is a single run where several prompt variants were evaluated together against the same
  test cases and the same checks (RES‑43).
- **Check / Metric** — used interchangeably (the page itself always says "Metric," RES‑23); one
  named pass/fail (or scored) test applied to every test case.
- **Check kind** — a simple built-in check (no AI involved), custom logic, an AI-judged check, or a
  weighted/composite check (RES‑30) — ordered roughly cheapest/simplest to most expensive, matching
  how checks are already classified when they're authored.
- **Composite / weighted check** — a single named check that's really several smaller checks
  averaged together with individual weights, passing once that average clears a set bar (RES‑30).
- **Not applicable (n/a)** — a check result explicitly excluded from pass/fail accounting because
  the check didn't make sense for that particular test case (RES‑26) — distinct from a hard
  **error** on that test case (RES‑11).
- **Sample run** — a run that only scored a chosen subset of the test cases rather than all of
  them, flagged distinctly in the summary header (RES‑4).
