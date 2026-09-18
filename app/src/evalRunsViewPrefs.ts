import { useState } from "react";

/**
 * Purely local display preferences for the global Eval Runs list — same convention as
 * `resultsViewPrefs.ts`: how it's currently being *looked at*, not data, so it never touches any
 * Spec. One global key, unlike `resultsViewPrefs.ts` (per-Spec), since this list isn't scoped to
 * a single Spec.
 */

/** "Run ID" and "Description" stay always visible — they're the row's identity, not optional detail. */
export type EvalRunsColumnId = "author" | "createdAt" | "passRate" | "tests";

/** Every column can be drag-resized, including the two that can never be hidden ("id"/"description"). */
export type EvalRunsWidthColumnId = "id" | "description" | EvalRunsColumnId;

export type EvalRunsColumnWidths = Partial<Record<EvalRunsWidthColumnId, number>>;

/** Fallback widths (px) for any column the user hasn't dragged yet. */
export const DEFAULT_EVAL_RUNS_COLUMN_WIDTHS: Record<EvalRunsWidthColumnId, number> = {
  id: 110,
  description: 340,
  author: 200,
  createdAt: 150,
  passRate: 90,
  tests: 100,
};

export const EVAL_RUNS_MIN_COLUMN_WIDTH = 60;

export interface EvalRunsViewPrefs {
  hiddenColumns: EvalRunsColumnId[];
  pageSize: number;
  columnWidths: EvalRunsColumnWidths;
  /** Whether the header row stays pinned to the top while scrolling the list. On by default. */
  stickyHeader: boolean;
}

export const EVAL_RUNS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export const DEFAULT_EVAL_RUNS_VIEW_PREFS: EvalRunsViewPrefs = {
  hiddenColumns: [],
  pageSize: 25,
  columnWidths: {},
  stickyHeader: true,
};

const STORAGE_KEY = "prompt-studio:eval-runs-view";

function readPrefs(): EvalRunsViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EVAL_RUNS_VIEW_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_EVAL_RUNS_VIEW_PREFS, ...parsed };
  } catch {
    return DEFAULT_EVAL_RUNS_VIEW_PREFS;
  }
}

function writePrefs(prefs: EvalRunsViewPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // View prefs are a nice-to-have — silently ignore storage failures (private mode, quota, etc).
  }
}

/** Reads/writes `EvalRunsViewPrefs`, persisted to localStorage so it survives reloads. */
export function useEvalRunsViewPrefs() {
  const [prefs, setPrefs] = useState<EvalRunsViewPrefs>(() => readPrefs());

  function update(patch: Partial<EvalRunsViewPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writePrefs(next);
      return next;
    });
  }

  function toggleColumn(column: EvalRunsColumnId) {
    update({
      hiddenColumns: prefs.hiddenColumns.includes(column)
        ? prefs.hiddenColumns.filter((c) => c !== column)
        : [...prefs.hiddenColumns, column],
    });
  }

  function setColumnWidth(column: EvalRunsWidthColumnId, width: number) {
    update({ columnWidths: { ...prefs.columnWidths, [column]: width } });
  }

  return { prefs, update, toggleColumn, setColumnWidth };
}
