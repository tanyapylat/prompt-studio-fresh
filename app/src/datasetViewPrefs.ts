import { useEffect, useState } from "react";

/**
 * Purely local display preferences for the Dataset table — how it's currently being *looked at*,
 * not data. Deliberately kept out of `SpecProject` (and therefore Library/export) and out of the
 * store, so switching to compact rows or hiding a column never shows up as an edit to the Spec.
 */

export type DatasetSortField = "createdAt" | "updatedAt";
export type DatasetSortDir = "asc" | "desc";
/** Optional columns a user can hide — Inputs and the row-actions column are always shown. */
export type DatasetColumnId = "source" | "referenceOutput" | "createdAt" | "updatedAt";

export interface DatasetViewPrefs {
  /** Compact (truncated, single-line) vs full (wrapped, multi-line) table cells. */
  wrap: boolean;
  pageSize: number;
  sortField: DatasetSortField;
  sortDir: DatasetSortDir;
  hiddenColumns: DatasetColumnId[];
  /** When the prompt has more than one variable: one combined "Inputs" column vs. one column per variable. */
  splitInputColumns: boolean;
}

export const DEFAULT_DATASET_VIEW_PREFS: DatasetViewPrefs = {
  wrap: false,
  pageSize: 25,
  sortField: "createdAt",
  sortDir: "desc",
  hiddenColumns: [],
  splitInputColumns: false,
};

export const DATASET_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const STORAGE_PREFIX = "prompt-studio:dataset-view:";

function readPrefs(specId: string): DatasetViewPrefs {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${specId}`);
    if (!raw) return DEFAULT_DATASET_VIEW_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DATASET_VIEW_PREFS, ...parsed };
  } catch {
    return DEFAULT_DATASET_VIEW_PREFS;
  }
}

function writePrefs(specId: string, prefs: DatasetViewPrefs) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${specId}`, JSON.stringify(prefs));
  } catch {
    // View prefs are a nice-to-have — silently ignore storage failures (private mode, quota, etc).
  }
}

/** Reads/writes `DatasetViewPrefs` for one Spec, persisted to localStorage so it survives reloads. */
export function useDatasetViewPrefs(specId: string) {
  const [prefs, setPrefs] = useState<DatasetViewPrefs>(() => readPrefs(specId));

  useEffect(() => {
    setPrefs(readPrefs(specId));
  }, [specId]);

  function update(patch: Partial<DatasetViewPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writePrefs(specId, next);
      return next;
    });
  }

  function toggleColumn(column: DatasetColumnId) {
    update({
      hiddenColumns: prefs.hiddenColumns.includes(column)
        ? prefs.hiddenColumns.filter((c) => c !== column)
        : [...prefs.hiddenColumns, column],
    });
  }

  return { prefs, update, toggleColumn };
}
