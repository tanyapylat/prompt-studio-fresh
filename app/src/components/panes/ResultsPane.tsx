import { useMemo, useState } from "react";
import { Beaker, Loader2, Rows3, Search, WrapText } from "lucide-react";
import { useStore } from "../../store";
import { useAssistantActions } from "../../assistantContext";
import type { SpecProject } from "../../types";
import { datasetVariableNames } from "../../dataset";
import {
  buildResultRows,
  collectAllLabels,
  matchesFilters,
  matchesSearch,
  matchesStatusFilter,
  resultRowsToCsv,
  resultRowsToJson,
  DEFAULT_RESULTS_FILTERS,
  type ResultStatusFilter,
} from "../../results";
import { downloadTextFile, timestampForFilename } from "../../download";
import { suggestRunInsightsHeuristic } from "../../engine";
import { useResultsViewPrefs } from "../../resultsViewPrefs";
import { Button } from "@/components/ui/button";
import { RunSummary } from "../results/RunSummary";
import { ResultsTable } from "../results/ResultsTable";
import { ResultsColumnsMenu } from "../results/ResultsColumnsMenu";
import { ResultsFiltersMenu } from "../results/ResultsFiltersMenu";
import { ResultsExportMenu } from "../results/ResultsExportMenu";
import { ResultItemPanel } from "../results/ResultItemPanel";

const STATUS_FILTERS: { id: ResultStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "passed", label: "Passed" },
  { id: "failed", label: "Failed" },
];

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "results"
  );
}

/**
 * The Results tab: a summary of the latest Run (pass rate, latency/cost, pass-rate-by-assertion,
 * "what to review first"), then a search/filter/columns/export toolbar over the paginated
 * `ResultsTable`, and the `ResultItemPanel` detail drawer for one row (prompt/output, per-assertion
 * evaluation, metadata/note) at a time.
 */
export function ResultsPane({
  spec,
  onRunSample,
  sampleRunBusy,
}: {
  spec: SpecProject;
  onRunSample: (itemIds: string[]) => void;
  sampleRunBusy: boolean;
}) {
  const { updateSpec } = useStore();
  const { openWithPrompt } = useAssistantActions();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ResultStatusFilter>("all");
  const [filters, setFilters] = useState(DEFAULT_RESULTS_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  const { prefs, update: updatePrefs, toggleColumn } = useResultsViewPrefs(spec.id);

  const variableNames = datasetVariableNames(spec.target?.messages);
  const isMultiVariable = variableNames.length > 1;
  const lastRun = spec.runs[spec.runs.length - 1] ?? null;
  const allLabels = useMemo(() => collectAllLabels(spec), [spec]);
  const allRows = useMemo(() => (lastRun ? buildResultRows(spec, lastRun) : []), [spec, lastRun]);
  const heuristicInsights = useMemo(
    () => (lastRun ? suggestRunInsightsHeuristic(spec, lastRun) : { reviewFirst: [], improvements: [] }),
    [spec, lastRun],
  );

  const filteredRows = useMemo(
    () =>
      allRows.filter(
        (row) => matchesStatusFilter(row, statusFilter) && matchesSearch(row, search, variableNames) && matchesFilters(row, filters),
      ),
    [allRows, statusFilter, search, variableNames, filters],
  );

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const av = prefs.sortField === "failCount" ? a.failCount : (a.result[prefs.sortField] ?? 0);
      const bv = prefs.sortField === "failCount" ? b.failCount : (b.result[prefs.sortField] ?? 0);
      return prefs.sortDir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [filteredRows, prefs.sortField, prefs.sortDir]);

  function handleSort(field: typeof prefs.sortField) {
    updatePrefs({ sortField: field, sortDir: prefs.sortField === field && prefs.sortDir === "asc" ? "desc" : "asc" });
  }

  function patchResult(itemId: string, patch: Partial<{ note: string; labels: string[] }>) {
    if (!lastRun) return;
    updateSpec(spec.id, (s) => ({
      ...s,
      runs: s.runs.map((run) =>
        run.id === lastRun.id
          ? { ...run, results: run.results.map((r) => (r.datasetItemId === itemId ? { ...r, ...patch } : r)) }
          : run,
      ),
    }));
  }

  function handleExport(scope: "all" | "filtered" | "selected", format: "json" | "csv") {
    const source = scope === "all" ? allRows : scope === "selected" ? allRows.filter((r) => selectedIds.has(r.result.datasetItemId)) : filteredRows;
    const base = `${slugify(spec.name)}-results-${timestampForFilename()}`;
    if (format === "json") {
      downloadTextFile(`${base}.json`, resultRowsToJson(source, spec, variableNames), "application/json");
    } else {
      downloadTextFile(`${base}.csv`, resultRowsToCsv(source, variableNames), "text/csv");
    }
  }

  if (!lastRun) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Results</h3>
        <p className="text-sm text-slate-500">
          No run yet — try a sample from the Dataset tab, or ask North Star to run the eval suite.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-800">Results</h3>

      <RunSummary
        spec={spec}
        run={lastRun}
        rows={allRows}
        insights={heuristicInsights}
        onAskNorthStar={() => openWithPrompt("Refresh review insights for this run.")}
        onReviewItem={setDetailItemId}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            title="Compact view"
            onClick={() => updatePrefs({ wrap: false })}
            className={`rounded-md px-1.5 py-1 ${!prefs.wrap ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-800"}`}
          >
            <Rows3 size={13} />
          </button>
          <button
            title="Full view (wrap text)"
            onClick={() => updatePrefs({ wrap: true })}
            className={`rounded-md px-1.5 py-1 ${prefs.wrap ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-800"}`}
          >
            <WrapText size={13} />
          </button>
        </div>
        <ResultsColumnsMenu prefs={prefs} onToggleColumn={toggleColumn} onUpdate={updatePrefs} isMultiVariable={isMultiVariable} />
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rows…"
            className="w-40 rounded-md border border-slate-200 bg-white py-1 pl-6 pr-2 text-xs text-slate-800 outline-none focus:border-ring"
          />
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                statusFilter === f.id ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ResultsFiltersMenu filters={filters} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} assertions={spec.assertions} allLabels={allLabels} />
        <ResultsExportMenu filteredCount={filteredRows.length} selectedCount={selectedIds.size} totalCount={allRows.length} onExport={handleExport} />
        <span className="flex-1" />
        <Button size="sm" variant="default" disabled={sampleRunBusy} onClick={() => onRunSample(sortedRows.slice(0, 5).map((r) => r.result.datasetItemId))}>
          {sampleRunBusy ? <Loader2 size={12} className="animate-spin" /> : <Beaker size={12} />}
          {sampleRunBusy ? "Running…" : "Re-run a sample"}
        </Button>
      </div>

      <ResultsTable
        rows={sortedRows}
        variableNames={variableNames}
        prefs={prefs}
        selectedIds={selectedIds}
        onToggleSelect={(id) =>
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onBulkSelect={(ids, selected) =>
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
              if (selected) next.add(id);
              else next.delete(id);
            }
            return next;
          })
        }
        onSort={handleSort}
        onOpenItem={setDetailItemId}
        onSetLabels={(id, labels) => patchResult(id, { labels })}
        allLabels={allLabels}
        onPageSizeChange={(size) => updatePrefs({ pageSize: size })}
      />

      {detailItemId && (
        <ResultItemPanel
          rows={sortedRows}
          datasetItemId={detailItemId}
          variableNames={variableNames}
          assertions={spec.assertions}
          run={lastRun}
          allLabels={allLabels}
          onClose={() => setDetailItemId(null)}
          onNavigate={setDetailItemId}
          onSetNote={(id, note) => patchResult(id, { note })}
          onSetLabels={(id, labels) => patchResult(id, { labels })}
        />
      )}
    </div>
  );
}
