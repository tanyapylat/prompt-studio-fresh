import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronDown, ChevronUp, Eye, MoreVertical, Pencil, StickyNote, Trash2 } from "lucide-react";
import type { DatasetItem } from "../../types";
import { datasetItemInputsPreview, resolveDatasetItemValues } from "../../dataset";
import {
  DATASET_PAGE_SIZE_OPTIONS,
  type DatasetSortField,
  type DatasetViewPrefs,
} from "../../datasetViewPrefs";
import { Button } from "@/components/ui/button";
import { DatasetSourceIcon } from "./DatasetSourceIcon";

function formatTimestamp(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function SortHeader({
  label,
  field,
  prefs,
  onSort,
}: {
  label: string;
  field: DatasetSortField;
  prefs: DatasetViewPrefs;
  onSort: (field: DatasetSortField) => void;
}) {
  const active = prefs.sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 text-xs font-medium ${active ? "text-slate-800" : "text-slate-500"} hover:text-slate-800`}
    >
      {label}
      {active ? (
        prefs.sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      ) : (
        <ChevronsUpDown size={12} className="text-slate-300" />
      )}
    </button>
  );
}

/**
 * The Dataset tab's main table — a compact, sortable, paginated grid replacing the old vertical
 * card list. Cell text is either truncated to one line (`prefs.wrap === false`, for scanning many
 * rows) or fully wrapped (`prefs.wrap === true`, for reading long content in place); either way,
 * full editing happens in the row detail panel (`DatasetItemPanel`), not inline here.
 */
export function DatasetTable({
  items,
  variableNames,
  prefs,
  onSort,
  selectedIds,
  onToggleSelect,
  onBulkSelect,
  onOpenItem,
  onDeleteItem,
  onPageSizeChange,
}: {
  items: DatasetItem[];
  variableNames: string[];
  prefs: DatasetViewPrefs;
  onSort: (field: DatasetSortField) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onBulkSelect: (ids: string[], selected: boolean) => void;
  onOpenItem: (id: string, mode?: "view" | "edit") => void;
  onDeleteItem: (id: string) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(items.length / prefs.pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedPage]);

  const start = clampedPage * prefs.pageSize;
  const pageItems = items.slice(start, start + prefs.pageSize);
  const pageIds = pageItems.map((it) => it.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const showSource = !prefs.hiddenColumns.includes("source");
  const showReferenceOutput = !prefs.hiddenColumns.includes("referenceOutput");
  const showCreatedAt = !prefs.hiddenColumns.includes("createdAt");
  const showUpdatedAt = !prefs.hiddenColumns.includes("updatedAt");
  const splitInputs = prefs.splitInputColumns && variableNames.length > 1;
  const inputColumns = splitInputs ? variableNames : ["__combined__"];

  const cellTextClass = prefs.wrap
    ? "whitespace-pre-wrap break-words align-top"
    : "truncate whitespace-nowrap align-top";

  const columnCount =
    1 + (showSource ? 1 : 0) + inputColumns.length + (showReferenceOutput ? 1 : 0) + (showCreatedAt ? 1 : 0) + (showUpdatedAt ? 1 : 0) + 1;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="w-8 border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={() => onBulkSelect(pageIds, !allPageSelected)}
                  className="size-3.5 accent-primary"
                  title="Select all rows on this page"
                />
              </th>
              {showSource && (
                <th className="w-20 border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">Source</th>
              )}
              {inputColumns.map((col) => (
                <th key={col} className="min-w-[200px] border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">
                  {col === "__combined__" ? "Inputs" : `{${col}}`}
                </th>
              ))}
              {showReferenceOutput && (
                <th className="min-w-[160px] border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-500">
                  Reference Output
                </th>
              )}
              {showCreatedAt && (
                <th className="w-36 border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                  <SortHeader label="Created At" field="createdAt" prefs={prefs} onSort={onSort} />
                </th>
              )}
              {showUpdatedAt && (
                <th className="w-36 border-b border-slate-200 bg-slate-50 px-2.5 py-2">
                  <SortHeader label="Modified At" field="updatedAt" prefs={prefs} onSort={onSort} />
                </th>
              )}
              <th className="w-9 border-b border-slate-200 bg-slate-50 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => {
              const values = resolveDatasetItemValues(item, variableNames);
              return (
                <tr
                  key={item.id}
                  onClick={() => onOpenItem(item.id, "view")}
                  className="cursor-pointer odd:bg-white even:bg-slate-50/50 hover:bg-accent/60"
                >
                  <td className="border-b border-slate-100 px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggleSelect(item.id)}
                      className="size-3.5 accent-primary"
                    />
                  </td>
                  {showSource && (
                    <td className="border-b border-slate-100 px-2.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <DatasetSourceIcon source={item.source} />
                        {item.note?.trim() && (
                          <span title="Has a note">
                            <StickyNote size={12} className="shrink-0 text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  {inputColumns.map((col) => (
                    <td key={col} className={`max-w-[320px] border-b border-slate-100 px-2.5 py-2 text-slate-700 ${cellTextClass}`}>
                      {col === "__combined__" ? datasetItemInputsPreview(item, variableNames) || "—" : values[col] || "—"}
                    </td>
                  ))}
                  {showReferenceOutput && (
                    <td className={`max-w-[240px] border-b border-slate-100 px-2.5 py-2 ${cellTextClass}`}>
                      {item.expectedOutput ? (
                        <span className="text-slate-700">{item.expectedOutput}</span>
                      ) : (
                        <span className="italic text-slate-400">No output</span>
                      )}
                    </td>
                  )}
                  {showCreatedAt && (
                    <td className="border-b border-slate-100 px-2.5 py-2 whitespace-nowrap text-slate-500">
                      {formatTimestamp(item.createdAt)}
                    </td>
                  )}
                  {showUpdatedAt && (
                    <td className="border-b border-slate-100 px-2.5 py-2 whitespace-nowrap text-slate-500">
                      {formatTimestamp(item.updatedAt)}
                    </td>
                  )}
                  <td className="relative border-b border-slate-100 px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenMenuId((cur) => (cur === item.id ? null : item.id))}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {openMenuId === item.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-lg shadow-slate-900/10">

                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              onOpenItem(item.id, "view");
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              onOpenItem(item.id, "edit");
                            }}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 hover:bg-slate-50"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              onDeleteItem(item.id);
                            }}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-6 text-center text-slate-400">
                  No rows on this page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span>
          {items.length} row{items.length === 1 ? "" : "s"} in total
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            Show
            <select
              value={prefs.pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                setPage(0);
              }}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-ring"
            >
              {DATASET_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span>
            Page {clampedPage + 1} of {totalPages}
          </span>
          <Button size="icon" variant="ghost" disabled={clampedPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={clampedPage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
