import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Beaker, Loader2, Maximize2, Minimize2, Rows3, Search, WrapText, X } from "lucide-react";
import { useStore } from "../../store";
import { useAssistantActions } from "../../assistantContext";
import type { RunGroup, SpecProject } from "../../types";
import { datasetVariableNames } from "../../dataset";
import {
  buildResultRows,
  collectAllLabels,
  matchesFilters,
  matchesSearch,
  matchesStatusFilter,
  resultRowsToCsv,
  resultRowsToJson,
  assertionTierById,
  DEFAULT_RESULTS_FILTERS,
  type ResultStatusFilter,
} from "../../results";
import { downloadTextFile, timestampForFilename } from "../../download";
import { suggestRunInsightsHeuristic } from "../../engine";
import { useResultsViewPrefs, computeAutoHiddenColumns } from "../../resultsViewPrefs";
import { withUpdatedNote } from "../../dataset";
import { Button } from "@/components/ui/button";
import { RunSummary } from "./RunSummary";
import { ResultsTable } from "./ResultsTable";
import { ResultsColumnsMenu } from "./ResultsColumnsMenu";
import { ResultsFiltersMenu } from "./ResultsFiltersMenu";
import { ResultsExportMenu } from "./ResultsExportMenu";
import { ResultItemPanel } from "./ResultItemPanel";
import { ComparisonRunBody } from "./ComparisonRunBody";

const STATUS_FILTERS: { id: ResultStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "passed", label: "Passed" },
  { id: "failed", label: "Failed" },
  { id: "error", label: "Errors" },
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
 * The shared guts of the Results view: a summary of the given Run (pass rate, latency/cost,
 * pass-rate-by-assertion, "what to review first"), then a search/filter/columns/export toolbar
 * over the paginated `ResultsTable`, and the `ResultItemPanel` detail drawer for one row at a
 * time. Extracted so it can render *any* `RunGroup` for a Spec — used both by the in-Workspace
 * Results tab (`ResultsPane`, latest run by default) and the standalone `RunDetailPage` (browsing
 * any run from the global Runs list) without duplicating this logic in two places.
 */
interface RunDetailBodyProps {
  spec: SpecProject;
  run: RunGroup;
  /** Omit to hide the "Re-run a sample" action — e.g. when browsing a non-latest historical run. */
  onRunSample?: (itemIds: string[]) => void;
  sampleRunBusy?: boolean;
  /** Extra control(s) rendered at the start of the toolbar row, e.g. a run-history picker. */
  toolbarStart?: ReactNode;
  /** Extra control(s) rendered right after the toolbar's Export menu, e.g. a "view full history" link. */
  toolbarEnd?: ReactNode;
}

/**
 * Dispatches to the N-way `ComparisonRunBody` when this Run compared 2+ prompts/targets against
 * the same dataset in one go (`run.comparison`), otherwise the normal single-output `SingleRunBody`
 * — kept as a thin wrapper (not a branch inside one component) so neither body has to call the
 * other's hooks conditionally.
 */
export function RunDetailBody(props: RunDetailBodyProps) {
  if (props.run.comparison && props.run.comparison.variants.length > 1) {
    return <ComparisonRunBody spec={props.spec} run={props.run} toolbarStart={props.toolbarStart} toolbarEnd={props.toolbarEnd} />;
  }
  return <SingleRunBody {...props} />;
}

function SingleRunBody({
  spec,
  run,
  onRunSample,
  sampleRunBusy = false,
  toolbarStart,
  toolbarEnd,
}: RunDetailBodyProps) {
  const { updateSpec } = useStore();
  const { openWithPrompt } = useAssistantActions();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ResultStatusFilter>("all");
  const [filters, setFilters] = useState(DEFAULT_RESULTS_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

  // Search/filters/selection/detail-panel are about *this* Run's rows — carrying them over
  // silently when the caller swaps in a different Run (the history picker, RunVersionSwitcher)
  // can leave you staring at an apparently-empty or wrongly-narrowed table with no clue why.
  useEffect(() => {
    setSearch("");
    setStatusFilter("all");
    setFilters(DEFAULT_RESULTS_FILTERS);
    setSelectedIds(new Set());
    setDetailItemId(null);
  }, [run.id]);

  const variableNames = datasetVariableNames(spec.target?.messages);
  const isMultiVariable = variableNames.length > 1;
  const hasReferenceOutputs = useMemo(() => spec.dataset.some((item) => !!item.expectedOutput), [spec.dataset]);
  const autoHiddenColumns = useMemo(() => computeAutoHiddenColumns({ hasReferenceOutputs }), [hasReferenceOutputs]);
  const { prefs, update: updatePrefs, toggleColumn } = useResultsViewPrefs(spec.id, autoHiddenColumns);

  const allLabels = useMemo(() => collectAllLabels(spec), [spec]);
  const allRows = useMemo(() => buildResultRows(spec, run), [spec, run]);
  const tierById = useMemo(() => assertionTierById(spec), [spec]);
  const heuristicInsights = useMemo(() => suggestRunInsightsHeuristic(spec, run), [spec, run]);

  const filteredRows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          matchesStatusFilter(row, statusFilter) &&
          matchesSearch(row, search, variableNames) &&
          matchesFilters(row, filters, prefs.hiddenColumns, tierById),
      ),
    [allRows, statusFilter, search, variableNames, filters, prefs.hiddenColumns, tierById],
  );

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    function sortValue(row: (typeof sorted)[number]): number {
      if (prefs.sortField === "failCount") return row.failCount;
      if (prefs.sortField === "tokens") return row.result.tokenUsage?.totalTokens ?? 0;
      return row.result[prefs.sortField] ?? 0;
    }
    sorted.sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      return prefs.sortDir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [filteredRows, prefs.sortField, prefs.sortDir]);

  function handleSort(field: typeof prefs.sortField) {
    updatePrefs({ sortField: field, sortDir: prefs.sortField === field && prefs.sortDir === "asc" ? "desc" : "asc" });
  }

  /**
   * Drives both the assertion rollup's chips (`RunSummary`) and each row's per-check chips
   * (`ResultsTable`) — clicking either narrows the table to "everything else with this same check
   * outcome"; clicking the same chip again clears it. Also resets the All/Passed/Failed pill back
   * to "All" so it can't silently contradict the new assertion-level filter (e.g. "Passed" +
   * "this check failed" would always show zero rows).
   */
  function handleFilterByAssertion(assertionId: string, outcome: "passed" | "failed") {
    setFilters((prev) =>
      prev.assertionId === assertionId && prev.assertionOutcome === outcome
        ? { ...prev, assertionId: null }
        : { ...prev, assertionId, assertionOutcome: outcome },
    );
    setStatusFilter("all");
  }

  function patchResult(itemId: string, patch: Partial<{ labels: string[] }>) {
    updateSpec(spec.id, (s) => ({
      ...s,
      runs: s.runs.map((r) =>
        r.id === run.id
          ? { ...r, results: r.results.map((res) => (res.datasetItemId === itemId ? { ...res, ...patch } : res)) }
          : r,
      ),
    }));
  }

  /** Edits the *dataset row's* persistent note (not this Run's own `labels`) — sticks around across reruns/prompt changes, unlike a Run-scoped annotation. */
  function patchNote(itemId: string, note: string) {
    updateSpec(spec.id, (s) => ({
      ...s,
      dataset: s.dataset.map((item) => (item.id === itemId ? withUpdatedNote(item, note) : item)),
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

  const content = (
    <div className="space-y-4">
      <RunSummary
        spec={spec}
        run={run}
        rows={allRows}
        insights={heuristicInsights}
        onAskNorthStar={() => openWithPrompt("Refresh review insights for this run.")}
        onReviewItem={setDetailItemId}
        onFilterByAssertion={handleFilterByAssertion}
        activeAssertionId={filters.assertionId}
        activeAssertionOutcome={filters.assertionOutcome}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {toolbarStart}
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
        {/* Icon-only originally — easy to miss next to the compact/wrap toggle, unlike the
            comparison view's labeled equivalent (see `ComparisonRunBody`'s "Full screen" Button
            in its own header banner). Made into the same labeled Button here so it reads as its
            own distinct feature instead of blending into the row of view-toggle icons. */}
        <Button size="sm" variant={fullScreen ? "default" : "secondary"} onClick={() => setFullScreen((v) => !v)}>
          {fullScreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          {fullScreen ? "Exit full screen" : "Full screen"}
        </Button>
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
        <ResultsFiltersMenu
          filters={filters}
          onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
          assertions={spec.assertions}
          allLabels={allLabels}
          prefs={prefs}
        />
        {/* n/a scores are excluded from every count above — visible as a distinct, neutral chip inline instead of a separate filter dimension. */}
        <ResultsExportMenu filteredCount={filteredRows.length} selectedCount={selectedIds.size} totalCount={allRows.length} onExport={handleExport} />
        {toolbarEnd}
        <span className="flex-1" />
        {onRunSample && (
          <Button size="sm" variant="default" disabled={sampleRunBusy} onClick={() => onRunSample(sortedRows.slice(0, 5).map((r) => r.result.datasetItemId))}>
            {sampleRunBusy ? <Loader2 size={12} className="animate-spin" /> : <Beaker size={12} />}
            {sampleRunBusy ? "Running…" : "Re-run a sample"}
          </Button>
        )}
      </div>

      <ResultsTable
        rows={sortedRows}
        variableNames={variableNames}
        prefs={prefs}
        onUpdate={updatePrefs}
        fullScreen={fullScreen}
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
        assertions={spec.assertions}
        onFilterByAssertion={handleFilterByAssertion}
        activeAssertionId={filters.assertionId}
        activeAssertionOutcome={filters.assertionOutcome}
      />

      {detailItemId && (
        <ResultItemPanel
          rows={sortedRows}
          datasetItemId={detailItemId}
          variableNames={variableNames}
          assertions={spec.assertions}
          allLabels={allLabels}
          onClose={() => setDetailItemId(null)}
          onNavigate={setDetailItemId}
          onSetLabels={(id, labels) => patchResult(id, { labels })}
          onSetNote={patchNote}
        />
      )}
    </div>
  );

  if (!fullScreen) return content;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white p-4">
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setFullScreen(false)}>
          <X size={12} /> Close full screen
        </Button>
      </div>
      {content}
    </div>
  );
}
