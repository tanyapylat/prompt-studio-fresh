import { useEffect, useState } from "react";

/**
 * Purely local display preferences for the Results table — same convention as
 * `datasetViewPrefs.ts`: how it's currently being *looked at*, not data, so it never touches
 * `SpecProject`/Library/export and never shows up as an edit to the Spec.
 */

export type ResultsSortField = "failCount" | "latencyMs" | "costUsd";
export type ResultsSortDir = "asc" | "desc";
/** Optional columns a user can hide — Status, Input(s), and the row-actions column are always shown. */
export type ResultsColumnId = "output" | "referenceOutput" | "checks" | "latency" | "cost" | "labels";

export interface ResultsViewPrefs {
  /** Compact (truncated, single-line) vs full (wrapped, multi-line) table cells. */
  wrap: boolean;
  pageSize: number;
  sortField: ResultsSortField;
  sortDir: ResultsSortDir;
  hiddenColumns: ResultsColumnId[];
  /** When the prompt has more than one variable: one combined "Inputs" column vs. one column per variable. */
  splitInputColumns: boolean;
}

export const DEFAULT_RESULTS_VIEW_PREFS: ResultsViewPrefs = {
  wrap: false,
  pageSize: 25,
  sortField: "failCount",
  sortDir: "desc",
  hiddenColumns: [],
  splitInputColumns: false,
};

export const RESULTS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const STORAGE_PREFIX = "prompt-studio:results-view:";

function readPrefs(specId: string): ResultsViewPrefs {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${specId}`);
    if (!raw) return DEFAULT_RESULTS_VIEW_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RESULTS_VIEW_PREFS, ...parsed };
  } catch {
    return DEFAULT_RESULTS_VIEW_PREFS;
  }
}

function writePrefs(specId: string, prefs: ResultsViewPrefs) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${specId}`, JSON.stringify(prefs));
  } catch {
    // View prefs are a nice-to-have — silently ignore storage failures (private mode, quota, etc).
  }
}

/** Reads/writes `ResultsViewPrefs` for one Spec, persisted to localStorage so it survives reloads. */
export function useResultsViewPrefs(specId: string) {
  const [prefs, setPrefs] = useState<ResultsViewPrefs>(() => readPrefs(specId));

  useEffect(() => {
    setPrefs(readPrefs(specId));
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
