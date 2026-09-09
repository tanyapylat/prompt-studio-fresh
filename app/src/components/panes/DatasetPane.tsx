import { useRef, useState } from "react";
import { Beaker, ChevronDown, FolderInput, FolderOutput, ListPlus, Loader2, Rows3, Shuffle, Upload, WrapText, X } from "lucide-react";
import { useStore } from "../../store";
import type { DatasetItem, SpecProject } from "../../types";
import { markArtifactManuallyEdited } from "../../specFactory";
import { datasetToLibraryEntry, type SaveToLibraryMeta } from "../../libraryFactory";
import { datasetVariableNames } from "../../dataset";
import { useDatasetViewPrefs } from "../../datasetViewPrefs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveToLibraryModal } from "../library/SaveToLibraryModal";
import { LoadFromLibraryModal } from "../library/LoadFromLibraryModal";
import { AddDatasetRowModal } from "../dataset/AddDatasetRowModal";
import { ImportDatasetModal } from "../dataset/ImportDatasetModal";
import { DatasetColumnsMenu } from "../dataset/DatasetColumnsMenu";
import { DatasetTable } from "../dataset/DatasetTable";
import { DatasetItemPanel } from "../dataset/DatasetItemPanel";

/**
 * The Dataset tab: toolbar (Add/Import/Load & Save to Library), a "sample run" control strip for
 * trying the prompt on a handful of rows before running the whole thing, the compact/paginated
 * `DatasetTable`, and the `DatasetItemPanel` detail view/editor for one row at a time.
 */
export function DatasetPane({
  spec,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  onRunSample,
  onRunRandomN,
  sampleRunBusy,
}: {
  spec: SpecProject;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  onRunSample: (itemIds: string[]) => void;
  onRunRandomN: (n: number) => void;
  sampleRunBusy: boolean;
}) {
  const { updateSpec, saveToLibrary, pinFromLibrary, currentUserId } = useStore();
  const [modal, setModal] = useState<"save" | "load" | "add" | "import" | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [randomCount, setRandomCount] = useState(5);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<"view" | "edit">("view");
  const addMenuRef = useRef<HTMLDivElement>(null);

  const { prefs, update: updatePrefs, toggleColumn } = useDatasetViewPrefs(spec.id);

  const variableNames = datasetVariableNames(spec.target?.messages);
  const isMultiVariable = variableNames.length > 1;

  function patchDataset(fn: (items: DatasetItem[]) => DatasetItem[]) {
    updateSpec(spec.id, (s) => markArtifactManuallyEdited({ ...s, dataset: fn(s.dataset), updatedAt: Date.now() }, "dataset"));
  }

  function handleSave(meta: SaveToLibraryMeta) {
    saveToLibrary("datasets", datasetToLibraryEntry(spec, meta));
  }

  function handleDeleteItem(id: string) {
    patchDataset((items) => items.filter((it) => it.id !== id));
  }

  function handleSort(field: typeof prefs.sortField) {
    updatePrefs({ sortField: field, sortDir: prefs.sortField === field && prefs.sortDir === "desc" ? "asc" : "desc" });
  }

  const selectedCount = selectedIds.size;
  const clampedRandomCount = Math.max(1, Math.min(randomCount, spec.dataset.length || 1));

  const sortedItems = [...spec.dataset].sort((a, b) => {
    const av = a[prefs.sortField] ?? 0;
    const bv = b[prefs.sortField] ?? 0;
    return prefs.sortDir === "asc" ? av - bv : bv - av;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Dataset — {spec.dataset.length} rows</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setModal("load")}>
            <FolderInput size={13} /> Load from Library
          </Button>
          {spec.dataset.length > 0 && (
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

      {spec.dataset.length === 0 ? (
        <p className="text-sm text-slate-500">No rows yet — Generate from the Spec, add one manually, or load a dataset from the Library.</p>
      ) : (
        <>
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
            <Beaker size={13} className="shrink-0 text-slate-400" />
            <span className="font-medium text-slate-700">Sample run</span>
            <span className="text-slate-400">— test a few rows before running the whole dataset.</span>
            <span className="flex-1" />
            <label className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={spec.dataset.length}
                value={clampedRandomCount}
                onChange={(e) => setRandomCount(Number(e.target.value) || 1)}
                className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-ring"
              />
              <Button size="sm" onClick={() => onRunRandomN(clampedRandomCount)}>
                <Shuffle size={12} /> Pick random
              </Button>
            </label>
            {selectedCount > 0 && (
              <>
                <Badge tone="accent">{selectedCount} selected</Badge>
                <Button size="sm" onClick={onClearSelection}>
                  <X size={12} /> Clear
                </Button>
              </>
            )}
            <Button size="sm" variant="default" disabled={selectedCount === 0 || sampleRunBusy} onClick={() => onRunSample([...selectedIds])}>
              {sampleRunBusy ? <Loader2 size={12} className="animate-spin" /> : <Beaker size={12} />}
              {sampleRunBusy ? "Running…" : `Run sample${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
            </Button>
          </div>

          <DatasetTable
            items={sortedItems}
            variableNames={variableNames}
            prefs={prefs}
            onSort={handleSort}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onBulkSelect={(ids, selected) => {
              for (const id of ids) {
                if (selectedIds.has(id) !== selected) onToggleSelect(id);
              }
            }}
            onOpenItem={(id, mode) => {
              setDetailItemId(id);
              setDetailMode(mode ?? "view");
            }}
            onDeleteItem={handleDeleteItem}
            onPageSizeChange={(size) => updatePrefs({ pageSize: size })}
          />
        </>
      )}

      {modal === "save" && (
        <SaveToLibraryModal
          title="Save Dataset to Library"
          defaultName={`${spec.name} — Dataset`}
          ownerId={currentUserId}
          onSave={handleSave}
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

      {detailItemId && (
        <DatasetItemPanel
          items={sortedItems}
          itemId={detailItemId}
          variableNames={variableNames}
          mode={detailMode}
          onModeChange={setDetailMode}
          onClose={() => {
            setDetailItemId(null);
            setDetailMode("view");
          }}
          onNavigate={setDetailItemId}
          onPatch={patchDataset}
          onDelete={handleDeleteItem}
        />
      )}
    </div>
  );
}
