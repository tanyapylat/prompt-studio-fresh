import { useRef, useState } from "react";
import {
  Beaker,
  ChevronDown,
  FolderInput,
  FolderOutput,
  ListPlus,
  Loader2,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useStore } from "../../store";
import type { DatasetItem, SpecProject } from "../../types";
import { markEdited } from "../../specFactory";
import { datasetToLibraryEntry, type SaveToLibraryMeta } from "../../libraryFactory";
import { datasetVariableNames, withUpdatedVariable, resolveDatasetItemValues } from "../../dataset";
import { Badge, Button } from "../ui";
import { SaveToLibraryModal } from "../library/SaveToLibraryModal";
import { LoadFromLibraryModal } from "../library/LoadFromLibraryModal";
import { AddDatasetRowModal } from "../dataset/AddDatasetRowModal";
import { ImportDatasetModal } from "../dataset/ImportDatasetModal";

const TONE_FOR = { seed: "neutral", synthetic: "info", "case-c": "accent" } as const;

export function DatasetPane({
  spec,
  selectedIds,
  onToggleSelect,
  onSelectRandom,
  onClearSelection,
  onRunSample,
  sampleRunBusy,
}: {
  spec: SpecProject;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectRandom: (n: number) => void;
  onClearSelection: () => void;
  onRunSample: (itemIds: string[]) => void;
  sampleRunBusy: boolean;
}) {
  const { updateSpec, saveToLibrary, pinFromLibrary, currentUserId } = useStore();
  const [modal, setModal] = useState<"save" | "load" | "add" | "import" | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [expandedOutputIds, setExpandedOutputIds] = useState<Set<string>>(new Set());
  const [randomCount, setRandomCount] = useState(5);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const variableNames = datasetVariableNames(spec.target?.messages);
  const isMultiVariable = variableNames.length > 1;

  function patchDataset(fn: (items: DatasetItem[]) => DatasetItem[]) {
    updateSpec(spec.id, (s) => markEdited({ ...s, dataset: fn(s.dataset), updatedAt: Date.now() }));
  }

  function handleSave(meta: SaveToLibraryMeta) {
    saveToLibrary("datasets", datasetToLibraryEntry(spec, meta));
  }

  function toggleExpandedOutput(id: string) {
    setExpandedOutputIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCount = selectedIds.size;
  const clampedRandomCount = Math.max(1, Math.min(randomCount, spec.dataset.length || 1));

  return (
    <div className="max-w-5xl space-y-3">
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
            <Button size="sm" variant="primary" onClick={() => setAddMenuOpen((v) => !v)}>
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
                    <ListPlus size={14} className="mt-0.5 shrink-0 text-sky-600" />
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
                    <Upload size={14} className="mt-0.5 shrink-0 text-sky-600" />
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

      {spec.dataset.length === 0 && (
        <p className="text-sm text-slate-500">No rows yet — Generate from the Spec, add one manually, or load a dataset from the Library.</p>
      )}

      {spec.dataset.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
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
              className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-sky-500"
            />
            <Button size="sm" onClick={() => onSelectRandom(clampedRandomCount)}>
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
          <Button
            size="sm"
            variant="primary"
            disabled={selectedCount === 0 || sampleRunBusy}
            onClick={() => onRunSample([...selectedIds])}
          >
            {sampleRunBusy ? <Loader2 size={12} className="animate-spin" /> : <Beaker size={12} />}
            {sampleRunBusy ? "Running…" : `Run sample${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        {spec.dataset.map((item) => {
          const values = resolveDatasetItemValues(item, variableNames);
          const outputExpanded = expandedOutputIds.has(item.id) || !!item.expectedOutput;
          return (
            <div
              key={item.id}
              className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => onToggleSelect(item.id)}
                className="mt-1 size-3.5 shrink-0 accent-sky-600"
                title="Select for a sample run"
              />
              <Badge tone={TONE_FOR[item.source]}>{item.source}</Badge>
              <div className="min-w-0 flex-1 space-y-1.5">
                {variableNames.map((name) => (
                  <div key={name} className="flex items-start gap-1.5">
                    {isMultiVariable && (
                      <label className="mt-1 shrink-0 font-mono text-[10px] text-sky-700">{`{${name}}`}</label>
                    )}
                    <textarea
                      value={values[name] ?? ""}
                      rows={1}
                      onChange={(e) =>
                        patchDataset((items) =>
                          items.map((it) => (it.id === item.id ? withUpdatedVariable(it, variableNames, name, e.target.value) : it)),
                        )
                      }
                      className="flex-1 resize-none bg-transparent text-xs text-slate-800 outline-none"
                    />
                  </div>
                ))}
                {outputExpanded ? (
                  <div className="flex items-start gap-1.5 border-t border-slate-200/70 pt-1.5">
                    <label className="mt-1 shrink-0 text-[10px] text-slate-400">Expected</label>
                    <textarea
                      value={item.expectedOutput ?? ""}
                      rows={1}
                      placeholder="Expected output (optional)"
                      onChange={(e) =>
                        patchDataset((items) =>
                          items.map((it) => (it.id === item.id ? { ...it, expectedOutput: e.target.value } : it)),
                        )
                      }
                      className="flex-1 resize-none bg-transparent text-xs italic text-slate-500 outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => toggleExpandedOutput(item.id)}
                    className="text-[10px] text-slate-400 opacity-0 hover:text-sky-600 group-hover:opacity-100"
                  >
                    + Expected output
                  </button>
                )}
              </div>
              <button
                onClick={() => patchDataset((items) => items.filter((it) => it.id !== item.id))}
                className="shrink-0 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

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
          onPick={(entry, datasetMode) => {
            pinFromLibrary("datasets", entry.id, spec.id, datasetMode);
          }}
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
          onImport={(items, mode) =>
            patchDataset((current) => (mode === "replace" ? items : [...current, ...items]))
          }
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
