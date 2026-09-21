import { useEffect, useState } from "react";

/**
 * Purely local display preferences for the Results table — same convention as
 * `datasetViewPrefs.ts`: how it's currently being *looked at*, not data, so it never touches
 * `SpecProject`/Library/export and never shows up as an edit to the Spec.
 */

export type ResultsSortField = "failCount" | "latencyMs" | "costUsd" | "tokens";
export type ResultsSortDir = "asc" | "desc";
/** Optional columns a user can hide — Status, Input(s), and the row-actions column are always shown. */
export type ResultsColumnId = "source" | "output" | "referenceOutput" | "assertions" | "latency" | "cost" | "tokens" | "labels";

export interface ResultsViewPrefs {
  /** Compact (truncated, single-line) vs full (wrapped, multi-line) table cells. */
  wrap: boolean;
  pageSize: number;
  sortField: ResultsSortField;
  sortDir: ResultsSortDir;
  hiddenColumns: ResultsColumnId[];
  /** When the prompt has more than one variable: one combined "Inputs" column vs. one column per variable. */
  splitInputColumns: boolean;
  /**
   * Assertions column: one small named chip per assertion (pass/fail + score), Promptfoo-style,
   * instead of just the aggregate "X/Y passed" badge. On by default — parity with promptfoo's own
   * results view, where per-assertion chips are always what you see; can still be turned off to
   * save horizontal room once an assertion's already well understood.
   */
  showAssertionChips: boolean;
  /**
   * Assertions column: when `showAssertionChips` is on, only render chips for assertions that
   * actually failed (n/a and passing chips are hidden) — a more compact, problems-only view. Off
   * by default. Configured via a small filter control in the Assertions column header itself, not
   * the Columns menu, since it's specific to that one column.
   */
  assertionsOnlyFailing: boolean;
}

/** Wrapped-by-default, per-item — flipped from the old compact default so a fresh Spec's Results tab opens already showing full output/reasoning (promptfoo parity was compact-first; we're not). */
export const DEFAULT_RESULTS_VIEW_PREFS: ResultsViewPrefs = {
  wrap: true,
  pageSize: 25,
  sortField: "failCount",
  sortDir: "desc",
  hiddenColumns: [],
  splitInputColumns: false,
  showAssertionChips: true,
  assertionsOnlyFailing: false,
};

export const RESULTS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

// v4 — bumped so browsers with prefs cached under v1–v3 (which stored the optional column as
// "checks") fall through to the corrected default shape instead of carrying a stale column id
// that no longer matches anything ("checks" was renamed to "assertions" — see RES-23).
const STORAGE_PREFIX = "prompt-studio:results-view:v4:";

function readPrefs(specId: string, autoHiddenColumns: ResultsColumnId[]): ResultsViewPrefs {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${specId}`);
    // No saved prefs yet for this Spec — start from the shape-aware smart default (computed by the
    // caller from row count/variable count/comparison-variant count) instead of always-empty. Once
    // a real preference exists (even an explicit empty array), it always wins over the auto-guess.
    if (!raw) return { ...DEFAULT_RESULTS_VIEW_PREFS, hiddenColumns: autoHiddenColumns };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RESULTS_VIEW_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_RESULTS_VIEW_PREFS, hiddenColumns: autoHiddenColumns };
  }
}

function writePrefs(specId: string, prefs: ResultsViewPrefs) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${specId}`, JSON.stringify(prefs));
  } catch {
    // View prefs are a nice-to-have — silently ignore storage failures (private mode, quota, etc).
  }
}

/**
 * Reads/writes `ResultsViewPrefs` for one Spec, persisted to localStorage so it survives reloads.
 * `autoHiddenColumns` — computed by the caller via `computeAutoHiddenColumns` from the current
 * Run's shape (row count, variable count, comparison-variant count) — seeds `hiddenColumns` only
 * the very first time this Spec's Results view is opened; any explicit user choice afterward
 * (including the Columns menu) always takes over from then on.
 */
export function useResultsViewPrefs(specId: string, autoHiddenColumns: ResultsColumnId[] = []) {
  const [prefs, setPrefs] = useState<ResultsViewPrefs>(() => readPrefs(specId, autoHiddenColumns));

  useEffect(() => {
    setPrefs(readPrefs(specId, autoHiddenColumns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specId]);

  function update(patch: Partial<ResultsViewPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writePrefs(specId, next);
      return next;
    });
  }

  function toggleColumn(column: ResultsColumnId) {
    update({
      hiddenColumns: prefs.hiddenColumns.includes(column)
        ? prefs.hiddenColumns.filter((c) => c !== column)
        : [...prefs.hiddenColumns, column],
    });
  }

  return { prefs, update, toggleColumn };
}

/**
 * The smart initial column visibility, computed once from the Run's own shape — never overrides an
 * explicit user choice (see `readPrefs`).
 *   - Latency/Cost/Tokens are always hidden by default now (not just "when crowded") — this
 *     per-row metadata is one click away in the detail panel's metadata footer, and a column set
 *     that silently changes shape as a dataset grows was more surprising than useful. Still just a
 *     default — the Columns menu always brings any of them back, and that choice sticks.
 *   - Labels is shown by default (unlike Latency/Cost/Tokens) — it's the reviewer-facing "group
 *     assertions with a short tag" annotation feature, not per-row performance metadata, so it
 *     should be visible without an extra click.
 *   - Reference Output is hidden by default only when *no* row in the Run actually has one — shown
 *     by default the moment at least one does, regardless of crowding.
 */
export function computeAutoHiddenColumns(shape: { hasReferenceOutputs: boolean }): ResultsColumnId[] {
  const hidden: ResultsColumnId[] = ["latency", "cost", "tokens"];
  if (!shape.hasReferenceOutputs) hidden.push("referenceOutput");
  return hidden;
}
