import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, FolderInput, ListPlus, Trash2, Upload } from "lucide-react";
import { useStore } from "../../store";
import type { DatasetItem, LibraryDataset } from "../../types";
import { libraryDatasetVariableNames } from "../../dataset";
import { useDatasetViewPrefs, type DatasetSortField } from "../../datasetViewPrefs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatasetTable } from "../dataset/DatasetTable";
import { DatasetColumnsMenu } from "../dataset/DatasetColumnsMenu";
import { DatasetItemPanel } from "../dataset/DatasetItemPanel";
import { AddDatasetRowModal } from "../dataset/AddDatasetRowModal";
import { ImportDatasetModal } from "../dataset/ImportDatasetModal";

/**
 * Full-page shell for a library Dataset — mirrors `PromptPlayground.tsx`'s pattern (back button +
 * owner controls, body below) but for a standalone `LibraryDataset` instead of a Spec's embedded
 * `dataset[]`. No sample-run controls here: a library Dataset isn't paired with a target Prompt.
 */
export function DatasetWorkspace() {
  const { selectedLibraryDataset: entry, currentUserId, selectLibraryDataset, updateLibraryEntry, deleteLibraryEntry } =
    useStore();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [modal, setModal] = useState<"add" | "import" | null>(null);
  const [openItem, setOpenItem] = useState<{ id: string; mode: "view" | "edit" } | null>(null);

  const prefsKey = entry ? `lib_${entry.id}` : "lib_none";
  const { prefs, update: updatePrefs, toggleColumn } = useDatasetViewPrefs(prefsKey);

  const variableNames = useMemo(() => (entry ? libraryDatasetVariableNames(entry) : ["input"]), [entry]);
  const isMultiVariable = variableNames.length > 1;

  const sortedItems = useMemo(() => {
    if (!entry) return [];
    const items = [...entry.items];
    const dir = prefs.sortDir === "asc" ? 1 : -1;
    items.sort((a, b) => ((a[prefs.sortField] ?? 0) - (b[prefs.sortField] ?? 0)) * dir);
    return items;
  }, [entry, prefs.sortField, prefs.sortDir]);

  if (!entry) return null;
  const isMine = entry.ownerId === currentUserId;

  function patchItems(fn: (items: DatasetItem[]) => DatasetItem[]) {
    updateLibraryEntry("datasets", entry!.id, (e) => {
      const d = e as LibraryDataset;
      return { ...d, items: fn(d.items), updatedAt: Date.now() };
    });
  }

  function handleRename(name: string) {
    updateLibraryEntry("datasets", entry!.id, (e) => ({ ...e, name, updatedAt: Date.now() }));
  }

  function handleToggleVisibility() {
    updateLibraryEntry("datasets", entry!.id, (e) => ({
      ...e,
      visibility: e.visibility === "org" ? "private" : "org",
      updatedAt: Date.now(),
    }));
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${entry!.name}"? This can't be undone.`)) return;
    deleteLibraryEntry("datasets", entry!.id);
    selectLibraryDataset(null);
  }

  function handleDeleteItem(id: string) {
    patchItems((items) => items.filter((it) => it.id !== id));
  }

  function handleSort(field: DatasetSortField) {
    if (prefs.sortField === field) {
      updatePrefs({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" });
    } else {
      updatePrefs({ sortField: field, sortDir: "desc" });
    }
  }

  function handleBulkSelect(_ids: string[], _selected: boolean) {
    // No row-selection/sample-run affordance in the library context — bulk checkboxes are inert here.
  }

  const totalRows = entry.items.length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => selectLibraryDataset(null)}>
            <ChevronLeft size={16} /> Datasets
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          {isMine ? (
            <input
              value={entry.name}
              onChange={(e) => handleRename(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
            />
          ) : (
            <span className="text-sm font-semibold text-slate-900">{entry.name}</span>
          )}
          <Badge tone={entry.visibility === "org" ? "success" : "neutral"}>
            {entry.visibility === "org" ? "Public" : "Private"}
          </Badge>
          <span className="text-xs text-slate-400">
            {totalRows} row{totalRows === 1 ? "" : "s"}
          </span>
        </div>
        {isMine && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleToggleVisibility}>
              Make {entry.visibility === "org" ? "Private" : "Public"}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              <Trash2 size={13} /> Delete
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Dataset — {totalRows} row{totalRows === 1 ? "" : "s"}
          </h3>
          <div className="flex items-center gap-2">
            {totalRows > 0 && (
              <DatasetColumnsMenu
                prefs={prefs}
                onToggleColumn={toggleColumn}
                onUpdate={updatePrefs}
                isMultiVariable={isMultiVariable}
              />
            )}
            <div className="relative">
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
                          {isMultiVariable ? "One field per dataset variable" : "Type in a custom row"}
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
            <FolderInput size={13} className="mr-1 inline" /> No rows yet — add one manually or import a file.
          </p>
        ) : (
          <DatasetTable
            items={sortedItems}
            variableNames={variableNames}
            prefs={prefs}
            onSort={handleSort}
            selectedIds={new Set()}
            onToggleSelect={() => {}}
            onBulkSelect={handleBulkSelect}
            onOpenItem={(id, mode = "view") => setOpenItem({ id, mode })}
            onDeleteItem={handleDeleteItem}
            onPageSizeChange={(pageSize) => updatePrefs({ pageSize })}
          />
        )}
      </div>

      {modal === "add" && (
        <AddDatasetRowModal
          variableNames={variableNames}
          onAdd={(item) => patchItems((items) => [...items, item])}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "import" && (
        <ImportDatasetModal
          variableNames={variableNames}
          onImport={(items, mode) => patchItems((current) => (mode === "replace" ? items : [...current, ...items]))}
          onClose={() => setModal(null)}
        />
      )}

      {openItem && (
        <DatasetItemPanel
          items={sortedItems}
          itemId={openItem.id}
          variableNames={variableNames}
          mode={openItem.mode}
          onModeChange={(mode) => setOpenItem((cur) => (cur ? { ...cur, mode } : cur))}
          onClose={() => setOpenItem(null)}
          onNavigate={(id) => setOpenItem({ id, mode: "view" })}
          onPatch={patchItems}
          onDelete={handleDeleteItem}
        />
      )}
    </div>
  );
}
