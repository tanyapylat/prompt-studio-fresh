import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Eye, XCircle } from "lucide-react";
import { datasetItemInputsPreview, resolveDatasetItemValues } from "../../dataset";
import { formatCost, formatLatency, type ResultRow } from "../../results";
import {
  RESULTS_PAGE_SIZE_OPTIONS,
  type ResultsSortField,
  type ResultsViewPrefs,
} from "../../resultsViewPrefs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LabelChips } from "./LabelChips";

function SortHeader({
  label,
  field,
  prefs,
  onSort,
}: {
  label: string;
  field: ResultsSortField;
  prefs: ResultsViewPrefs;
  onSort: (field: ResultsSortField) => void;
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
 * The Results tab's main table — mirrors the Dataset tab's `DatasetTable` (compact/wrapped cells,
 * sortable columns, pagination, configurable columns, row selection), with pass/fail, output,
 * checks, latency, cost, and an inline-editable Labels column added on top. Full detail
 * (per-assertion reasons, metadata, notes) lives in `ResultItemPanel`, not inline here.
 */
export function ResultsTable({
  rows,
  variableNames,
  prefs,
  selectedIds,
  onToggleSelect,
  onBulkSelect,
  onSort,
  onOpenItem,
  onSetLabels,
  allLabels,
  onPageSizeChange,
}: {
  rows: ResultRow[];
  variableNames: string[];
  prefs: ResultsViewPrefs;
  selectedIds: Set<string>;
  onToggleSelect: (datasetItemId: string) => void;
  onBulkSelect: (ids: string[], selected: boolean) => void;
  onSort: (field: ResultsSortField) => void;
  onOpenItem: (datasetItemId: string) => void;
  onSetLabels: (datasetItemId: string, labels: string[]) => void;
  allLabels: string[];
  onPageSizeChange: (size: number) => void;
}) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(rows.length / prefs.pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedPage]);

  const start = clampedPage * prefs.pageSize;
  const pageRows = rows.slice(start, start + prefs.pageSize);
  const pageIds = pageRows.map((r) => r.result.datasetItemId);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const showOutput = !prefs.hiddenColumns.includes("output");
  const showReferenceOutput = !prefs.hiddenColumns.includes("referenceOutput");
  const showChecks = !prefs.hiddenColumns.includes("checks");
  const showLatency = !prefs.hiddenColumns.includes("latency");
  const showCost = !prefs.hiddenColumns.includes("cost");
  const showLabels = !prefs.hiddenColumns.includes("labels");
  const splitInputs = prefs.splitInputColumns && variableNames.length > 1;
  const inputColumns = splitInputs ? variableNames : ["__combined__"];

  const cellTextClass = prefs.wrap
    ? "whitespace-pre-wrap break-words align-top"
    : "truncate whitespace-nowrap align-top";

  const columnCount =
    1 +
    1 +
    inputColumns.length +
    (showOutput ? 1 : 0) +
    (showReferenceOutput ? 1 : 0) +
    (showChecks ? 1 : 0) +
    (showLatency ? 1 : 0) +
    (showCost ? 1 : 0) +
    (showLabels ? 1 : 0) +
    1;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-8 border-b border-slate-200 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={() => onBulkSelect(pageIds, !allPageSelected)}
                  className="size-3.5 accent-primary"
                  title="Select all rows on this page"
                />
              </th>
              <th className="w-14 border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">Status</th>
              {inputColumns.map((col) => (
                <th key={col} className="min-w-[180px] border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">
                  {col === "__combined__" ? "Inputs" : `{${col}}`}
                </th>
              ))}
              {showOutput && (
                <th className="min-w-[200px] border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">Output</th>
              )}
              {showReferenceOutput && (
                <th className="min-w-[160px] border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">
                  Reference Output
                </th>
              )}
              {showChecks && (
                <th className="w-28 border-b border-slate-200 px-2.5 py-2">
                  <SortHeader label="Checks" field="failCount" prefs={prefs} onSort={onSort} />
                </th>
              )}
              {showLatency && (
                <th className="w-24 border-b border-slate-200 px-2.5 py-2">
                  <SortHeader label="Latency" field="latencyMs" prefs={prefs} onSort={onSort} />
                </th>
              )}
              {showCost && (
                <th className="w-20 border-b border-slate-200 px-2.5 py-2">
                  <SortHeader label="Cost" field="costUsd" prefs={prefs} onSort={onSort} />
                </th>
              )}
              {showLabels && (
                <th className="min-w-[160px] border-b border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-500">Labels</th>
              )}
              <th className="w-9 border-b border-slate-200 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const { result, item, failCount, passCount } = row;
              const values = item ? resolveDatasetItemValues(item, variableNames) : {};
              const allPass = failCount === 0;
              return (
                <tr
                  key={result.datasetItemId}
                  onClick={() => onOpenItem(result.datasetItemId)}
                  className="cursor-pointer odd:bg-white even:bg-slate-50/50 hover:bg-accent/60"
                >
                  <td className="border-b border-slate-100 px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(result.datasetItemId)}
                      onChange={() => onToggleSelect(result.datasetItemId)}
                      className="size-3.5 accent-primary"
                    />
                  </td>
                  <td className="border-b border-slate-100 px-2.5 py-2">
                    {allPass ? (
                      <CheckCircle2 size={15} className="text-emerald-600" />
                    ) : (
                      <XCircle size={15} className="text-rose-600" />
                    )}
                  </td>
                  {inputColumns.map((col) => (
                    <td key={col} className={`max-w-[280px] border-b border-slate-100 px-2.5 py-2 text-slate-700 ${cellTextClass}`}>
                      {item
                        ? col === "__combined__"
                          ? datasetItemInputsPreview(item, variableNames) || "—"
                          : values[col] || "—"
                        : "—"}
                    </td>
                  ))}
                  {showOutput && (
                    <td className={`max-w-[280px] border-b border-slate-100 px-2.5 py-2 text-slate-700 ${cellTextClass}`}>
                      {result.output || "—"}
                    </td>
                  )}
                  {showReferenceOutput && (
                    <td className={`max-w-[240px] border-b border-slate-100 px-2.5 py-2 ${cellTextClass}`}>
                      {item?.expectedOutput ? (
                        <span className="text-slate-700">{item.expectedOutput}</span>
                      ) : (
                        <span className="italic text-slate-400">No output</span>
                      )}
                    </td>
                  )}
                  {showChecks && (
                    <td className="border-b border-slate-100 px-2.5 py-2 whitespace-nowrap">
                      <Badge tone={allPass ? "success" : "danger"}>
                        {passCount}/{result.scores.length} passed
                      </Badge>
                    </td>
                  )}
                  {showLatency && (
                    <td className="border-b border-slate-100 px-2.5 py-2 whitespace-nowrap text-slate-500">
                      {formatLatency(result.latencyMs)}
                    </td>
                  )}
                  {showCost && (
                    <td className="border-b border-slate-100 px-2.5 py-2 whitespace-nowrap text-slate-500">
                      {formatCost(result.costUsd)}
                    </td>
                  )}
                  {showLabels && (
                    <td className="max-w-[220px] border-b border-slate-100 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <LabelChips
                        labels={result.labels ?? []}
                        suggestions={allLabels}
                        onChange={(next) => onSetLabels(result.datasetItemId, next)}
                        size="sm"
                        placeholder="Add…"
                      />
                    </td>
                  )}
                  <td className="border-b border-slate-100 px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenItem(result.datasetItemId)}
                      title="View details"
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-6 text-center text-slate-400">
                  No rows match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span>
          {rows.length} row{rows.length === 1 ? "" : "s"}
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
              {RESULTS_PAGE_SIZE_OPTIONS.map((size) => (
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
