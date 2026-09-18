import { useMemo, useRef, useState } from "react";
import {
  Beaker,
  ChevronDown,
  FolderInput,
  FolderOutput,
  ListPlus,
  Loader2,
  Play,
  Rows3,
  Search,
  Shuffle,
  SlidersHorizontal,
  Upload,
  WrapText,
  X,
} from "lucide-react";
import { useStore } from "../../store";
import { markArtifactManuallyEdited, rerun } from "../../specFactory";
import type { DatasetItem, SpecProject } from "../../types";
import { datasetToLibraryEntry, type SaveToLibraryMeta } from "../../libraryFactory";
import { collectAllDatasetLabels, datasetVariableNames, pickRandomIds } from "../../dataset";
import {
  buildResultRows,
  collectAllLabels,
  matchesStatusFilter,
  resultRowsToCsv,
  resultRowsToJson,
  type ResultStatusFilter,
} from "../../results";
import { downloadTextFile, timestampForFilename } from "../../download";
import { suggestRunInsightsHeuristic } from "../../engine";
import { useDatasetViewPrefs } from "../../datasetViewPrefs";
import { useAssistantActions } from "../../assistantContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SaveToLibraryModal } from "../library/SaveToLibraryModal";
import { LoadFromLibraryModal } from "../library/LoadFromLibraryModal";
import { AddDatasetRowModal } from "../dataset/AddDatasetRowModal";
import { ImportDatasetModal } from "../dataset/ImportDatasetModal";
import { DatasetColumnsMenu } from "../dataset/DatasetColumnsMenu";
import { DatasetItemPanel } from "../dataset/DatasetItemPanel";
import { RunSummary } from "../results/RunSummary";
import { ResultItemPanel } from "../results/ResultItemPanel";
import { ResultsExportMenu } from "../results/ResultsExportMenu";
import { EvalPane } from "../panes/EvalPane";
import { PlaygroundRunGrid } from "./PlaygroundRunGrid";

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
 * Sits below the message editor in the full-page Playground for any Prompt that's linked to a
 * Spec — lets you see the Dataset and the latest Run's results, and kick off a new run, without
 * leaving this page for the Spec's Workspace. A convenience layer, not a replacement: the
 * Workspace's own Dataset/Eval/Results tabs stay put for deeper table/filter work (pagination,
 * column config, bulk labeling) and the Eval editor here just opens the very same `EvalPane` in a
 * drawer.
 */
export function PlaygroundDatasetSection({ spec }: { spec: SpecProject }) {
  const { updateSpec, saveToLibrary, pinFromLibrary, currentUserId } = useStore();
  const { openWithPrompt } = useAssistantActions();

  const [showEvals, setShowEvals] = useState(false);
  const [modal, setModal] = useState<"save" | "load" | "add" | "import" | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [randomCount, setRandomCount] = useState(5);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [datasetPanelMode, setDatasetPanelMode] = useState<"view" | "edit">("view");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ResultStatusFilter>("all");
  const [busy, setBusy] = useState<"sample" | "full" | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { prefs, update: updatePrefs, toggleColumn } = useDatasetViewPrefs(spec.id);

  const variableNames = datasetVariableNames(spec.target?.messages);
  const isMultiVariable = variableNames.length > 1;
  const lastRun = spec.runs[spec.runs.length - 1] ?? null;
  const allLabels = useMemo(() => collectAllLabels(spec), [spec]);
  const allDatasetLabels = useMemo(() => collectAllDatasetLabels(spec.dataset), [spec.dataset]);
  const resultRows = useMemo(() => (lastRun ? buildResultRows(spec, lastRun) : []), [spec, lastRun]);
  const heuristicInsights = useMemo(
    () => (lastRun ? suggestRunInsightsHeuristic(spec, lastRun) : { reviewFirst: [], improvements: [] }),
    [spec, lastRun],
  );

  async function runOn(kind: "sample" | "full", itemIds: string[] | undefined) {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setBusy(kind);
    try {
      const updated = await rerun(spec, itemIds, controller.signal, currentUserId);
      updateSpec(spec.id, () => updated);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        window.alert(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
      abortControllerRef.current = null;
    }
  }

  function handleRunSelected(itemIds: string[]) {
    if (itemIds.length === 0) return;
    void runOn("sample", itemIds);
  }
  function handleRunRandomN(count: number) {
    handleRunSelected(pickRandomIds(spec.dataset.map((d) => d.id), count));
  }
  function handleRunAll() {
    void runOn("full", undefined);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function patchDataset(fn: (items: DatasetItem[]) => DatasetItem[]) {
    updateSpec(spec.id, (s) => markArtifactManuallyEdited({ ...s, dataset: fn(s.dataset), updatedAt: Date.now() }, "dataset"));
  }
  function handleDeleteItem(id: string) {
    patchDataset((items) => items.filter((it) => it.id !== id));
  }
  function handleSaveDataset(meta: SaveToLibraryMeta) {
    saveToLibrary("datasets", datasetToLibraryEntry(spec, meta));
  }
  function patchRunResults(itemId: string, patch: Partial<{ labels: string[] }>) {
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

  const totalRows = spec.dataset.length;
  const selectedCount = selectedIds.size;
  const clampedRandomCount = Math.max(1, Math.min(randomCount, totalRows || 1));
  const anyRunBusy = busy !== null;

  const resultByItemId = useMemo(() => new Map(resultRows.map((r) => [r.result.datasetItemId, r])), [resultRows]);
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return spec.dataset.filter((item) => {
      const row = resultByItemId.get(item.id);
      if (statusFilter !== "all") {
        if (!row || !matchesStatusFilter(row, statusFilter)) return false;
      }
      if (q) {
        const haystack = [item.input, item.expectedOutput, ...Object.values(item.variables ?? {}), row?.result.output, ...(row?.result.labels ?? [])]
          .filter(Boolean)
          .join(" \n ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [spec.dataset, resultByItemId, statusFilter, search]);
  const hasActiveFilter = search.trim().length > 0 || statusFilter !== "all";

  function handleExport(scope: "all" | "filtered" | "selected", format: "json" | "csv") {
    const filteredResultRows = resultRows.filter((r) => filteredItems.some((it) => it.id === r.result.datasetItemId));
    const source =
      scope === "all" ? resultRows : scope === "selected" ? resultRows.filter((r) => selectedIds.has(r.result.datasetItemId)) : filteredResultRows;
    const base = `${slugify(spec.name)}-results-${timestampForFilename()}`;
    if (format === "json") {
      downloadTextFile(`${base}.json`, resultRowsToJson(source, spec, variableNames), "application/json");
    } else {
      downloadTextFile(`${base}.csv`, resultRowsToCsv(source, variableNames), "text/csv");
    }
  }

  const detailHasResult = !!(lastRun && detailItemId && lastRun.results.some((r) => r.datasetItemId === detailItemId));

  function closeDetail() {
    setDetailItemId(null);
    setDatasetPanelMode("view");
  }

  return (
    <div className="mt-8 space-y-3 border-t border-slate-200 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Dataset &amp; Evals{" "}
          <span className="font-normal text-slate-500">
            — {hasActiveFilter ? `${filteredItems.length} of ${totalRows}` : totalRows} row{totalRows === 1 ? "" : "s"}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowEvals(true)} title="Configure assertions and the LLM judge policy">
            <SlidersHorizontal size={13} /> Manage evals
            {spec.assertions.length > 0 && <Badge>{spec.assertions.length}</Badge>}
          </Button>
          <Button size="sm" onClick={() => setModal("load")}>
            <FolderInput size={13} /> Load from Library
          </Button>
          {totalRows > 0 && (
            <Button size="sm" onClick={() => setModal("save")}>
              <FolderOutput size={13} /> Save to Library
            </Button>
          )}
          <div className="relative" ref={addMenuRef}>
            <Button size="sm" variant="default" onClick={() => setAddMenuOpen((v) => !v)}>
              <ListPlus size={13} /> Add <ChevronDown size={12} />
            </Button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
                  <button
                    onClick={() => {
                      setModal("add");
                      setAddMenuOpen(false);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <ListPlus size={14} className="mt-0.5 shrink-0 text-primary" />
                    <span>
                      <span className="block text-xs font-medium text-slate-800">Add manually</span>
                      <span className="block text-[11px] text-slate-500">
                        {isMultiVariable ? "One field per prompt variable" : "Type in a custom row"}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setModal("import");
                      setAddMenuOpen(false);
                    }}
                    className="flex w-full items-start gap-2 border-t border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <Upload size={14} className="mt-0.5 shrink-0 text-primary" />
                    <span>
                      <span className="block text-xs font-medium text-slate-800">Create from file</span>
                      <span className="block text-[11px] text-slate-500">Upload a CSV or JSONL file</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {totalRows === 0 ? (
        <p className="text-sm text-slate-500">
          No rows yet — Generate from the Spec, add one manually, or load a dataset from the Library.
        </p>
      ) : (
        <>
          {lastRun && (
            <RunSummary
              spec={spec}
              run={lastRun}
              rows={resultRows}
              insights={heuristicInsights}
              onAskNorthStar={() => openWithPrompt("Refresh review insights for this run.")}
              onReviewItem={setDetailItemId}
            />
          )}

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
            <DatasetColumnsMenu prefs={prefs} onToggleColumn={toggleColumn} onUpdate={updatePrefs} isMultiVariable={isMultiVariable} />
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
            {lastRun && (
              <ResultsExportMenu
                filteredCount={filteredItems.length}
                selectedCount={selectedCount}
                totalCount={totalRows}
                onExport={handleExport}
              />
            )}
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <Beaker size={13} className="shrink-0 text-slate-400" />
            <span className="font-medium text-slate-700">Run on</span>
            <label className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={totalRows}
                value={clampedRandomCount}
                onChange={(e) => setRandomCount(Number(e.target.value) || 1)}
                className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-ring"
              />
              <Button size="sm" onClick={() => handleRunRandomN(clampedRandomCount)} disabled={anyRunBusy}>
                <Shuffle size={12} /> Random N
              </Button>
            </label>
            <span className="flex-1" />
            {selectedCount > 0 && (
              <>
                <Badge tone="accent">{selectedCount} selected</Badge>
                <Button size="sm" onClick={() => setSelectedIds(new Set())}>
                  <X size={12} /> Clear
                </Button>
              </>
            )}
            <Button size="sm" variant="default" disabled={selectedCount === 0 || anyRunBusy} onClick={() => handleRunSelected([...selectedIds])}>
              {busy === "sample" ? <Loader2 size={12} className="animate-spin" /> : <Beaker size={12} />}
              {busy === "sample" ? "Running…" : `Run selected${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
            </Button>
            <Button size="sm" variant="default" disabled={anyRunBusy} onClick={handleRunAll} title="Run every row in the dataset">
              {busy === "full" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {busy === "full" ? "Running…" : "Run all"}
            </Button>
          </div>

          <PlaygroundRunGrid
            items={filteredItems}
            variableNames={variableNames}
            lastRun={lastRun}
            wrap={prefs.wrap}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onBulkSelect={(ids, selected) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const id of ids) {
                  if (selected) next.add(id);
                  else next.delete(id);
                }
                return next;
              });
            }}
            onOpenItem={setDetailItemId}
          />
        </>
      )}

      {modal === "save" && (
        <SaveToLibraryModal
          title="Save Dataset to Library"
          defaultName={`${spec.name} — Dataset`}
          ownerId={currentUserId}
          onSave={handleSaveDataset}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "load" && (
        <LoadFromLibraryModal
          title="Load Dataset from Library"
          kind="datasets"
          onPick={(entry, datasetMode) => pinFromLibrary("datasets", entry.id, spec.id, datasetMode)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "add" && (
        <AddDatasetRowModal
          variableNames={variableNames}
          onAdd={(item) => patchDataset((items) => [...items, item])}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "import" && (
        <ImportDatasetModal
          variableNames={variableNames}
          onImport={(items, mode) => patchDataset((current) => (mode === "replace" ? items : [...current, ...items]))}
          onClose={() => setModal(null)}
        />
      )}

      {showEvals && (
        <Sheet open onOpenChange={(open) => !open && setShowEvals(false)}>
          <SheetContent width="xl">
            <SheetHeader>
              <SheetTitle>Manage evals</SheetTitle>
            </SheetHeader>
            <SheetBody>
              <EvalPane spec={spec} />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}

      {detailItemId && lastRun && detailHasResult && (
        <ResultItemPanel
          rows={resultRows}
          datasetItemId={detailItemId}
          variableNames={variableNames}
          assertions={spec.assertions}
          allLabels={allLabels}
          onClose={closeDetail}
          onNavigate={setDetailItemId}
          onSetLabels={(id, labels) => patchRunResults(id, { labels })}
        />
      )}
      {detailItemId && !detailHasResult && (
        <DatasetItemPanel
          items={spec.dataset}
          itemId={detailItemId}
          variableNames={variableNames}
          mode={datasetPanelMode}
          onModeChange={setDatasetPanelMode}
          onClose={closeDetail}
          onNavigate={setDetailItemId}
          onPatch={patchDataset}
          onDelete={handleDeleteItem}
          allLabels={allDatasetLabels}
        />
      )}
    </div>
  );
}
