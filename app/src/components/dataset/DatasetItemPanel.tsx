import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import type { DatasetItem } from "../../types";
import {
  parseVariablesJson,
  resolveDatasetItemValues,
  stringifyVariables,
  tryPrettyPrintText,
  withUpdatedExpectedOutput,
  withUpdatedLabels,
  withUpdatedNote,
  withUpdatedVariables,
} from "../../dataset";
import { Button } from "@/components/ui/button";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LabelChips } from "../results/LabelChips";
import { DatasetSourceIcon } from "./DatasetSourceIcon";

/**
 * Full-detail side panel for one Dataset row — the "full view" companion to the compact table.
 * Opens read-only, with an Edit toggle that turns the Input (Fields/JSON) and Reference Output
 * sections into editable drafts; Prev/Next step through `items` (the table's current sorted/
 * filtered order) without closing the panel.
 */
export function DatasetItemPanel({
  items,
  itemId,
  variableNames,
  mode,
  onModeChange,
  onClose,
  onNavigate,
  onPatch,
  onDelete,
  allLabels,
}: {
  items: DatasetItem[];
  itemId: string;
  variableNames: string[];
  mode: "view" | "edit";
  onModeChange: (mode: "view" | "edit") => void;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onPatch: (fn: (items: DatasetItem[]) => DatasetItem[]) => void;
  onDelete: (id: string) => void;
  /** Every label already used across this dataset — powers the annotation label editor's autocomplete. */
  allLabels: string[];
}) {
  const index = items.findIndex((it) => it.id === itemId);
  const item = index >= 0 ? items[index] : null;
  const isMultiVariable = variableNames.length > 1;

  const [inputMode, setInputMode] = useState<"fields" | "json">("fields");
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expectedOutputDraft, setExpectedOutputDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    if (!item) return;
    setFieldDrafts(resolveDatasetItemValues(item, variableNames));
    setJsonDraft(stringifyVariables(item, variableNames));
    setJsonError(null);
    setInputMode("fields");
    setExpectedOutputDraft(item.expectedOutput ?? "");
    // Re-sync drafts whenever we switch rows, or start a fresh edit on the same row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, mode === "edit"]);

  useEffect(() => {
    setNoteDraft(item?.note ?? "");
    // Re-sync the note draft whenever we switch rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  if (!item) return null;

  const values = resolveDatasetItemValues(item, variableNames);

  function patchItem(fn: (it: DatasetItem) => DatasetItem) {
    onPatch((current) => current.map((it) => (it.id === itemId ? fn(it) : it)));
  }

  function handleNoteBlur() {
    if (noteDraft !== (item?.note ?? "")) patchItem((it) => withUpdatedNote(it, noteDraft));
  }

  function handleFieldChange(name: string, value: string) {
    setFieldDrafts((prev) => {
      const next = { ...prev, [name]: value };
      setJsonDraft(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function handleJsonChange(value: string) {
    setJsonDraft(value);
    try {
      setFieldDrafts(parseVariablesJson(value, variableNames));
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON.");
    }
  }

  function handleSave() {
    if (jsonError) return;
    onPatch((current) =>
      current.map((it) =>
        it.id === itemId ? withUpdatedExpectedOutput(withUpdatedVariables(it, variableNames, fieldDrafts), expectedOutputDraft) : it,
      ),
    );
    onModeChange("view");
  }

  function handleDelete() {
    const next = items[index + 1]?.id ?? items[index - 1]?.id ?? null;
    onDelete(itemId);
    if (next) onNavigate(next);
    else onClose();
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent width="lg" showCloseButton={false}>
        <SheetHeader className="flex-col items-stretch gap-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>
                Row {index + 1} of {items.length}
              </SheetTitle>
              <DatasetSourceIcon source={item.source} size={15} />
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                title="Previous row"
                disabled={index <= 0}
                onClick={() => onNavigate(items[index - 1].id)}
              >
                <ChevronUp size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Next row"
                disabled={index >= items.length - 1}
                onClick={() => onNavigate(items[index + 1].id)}
              >
                <ChevronDown size={14} />
              </Button>
              <div className="mx-1 h-5 w-px bg-slate-200" />
              {mode === "view" ? (
                <>
                  <Button size="sm" onClick={() => onModeChange("edit")}>
                    <Pencil size={13} /> Edit
                  </Button>
                  <Button size="icon" variant="ghost" title="Delete row" onClick={handleDelete}>
                    <Trash2 size={14} className="text-slate-400 hover:text-rose-600" />
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => onModeChange("view")}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="default" disabled={!!jsonError} onClick={handleSave}>
                    <Check size={13} /> Save
                  </Button>
                </>
              )}
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">Labels</span>
            <LabelChips
              labels={item.labels ?? []}
              suggestions={allLabels}
              onChange={(next) => patchItem((it) => withUpdatedLabels(it, next))}
              size="md"
              placeholder="Add a label…"
            />
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Input</h4>
              {isMultiVariable && (
                <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {(["fields", "json"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setInputMode(m)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        inputMode === m ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-800"
                      }`}
                    >
                      {m === "fields" ? "Fields" : "JSON"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {mode === "view" ? (
              isMultiVariable && inputMode === "json" ? (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
                  {stringifyVariables(item, variableNames)}
                </pre>
              ) : (
                <div className="space-y-2">
                  {variableNames.map((name) => (
                    <div key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      {isMultiVariable && (
                        <label className="mb-1 block font-mono text-[10px] text-primary">{`{${name}}`}</label>
                      )}
                      <p className="whitespace-pre-wrap break-words text-xs text-slate-800">{values[name] || "—"}</p>
                    </div>
                  ))}
                </div>
              )
            ) : isMultiVariable && inputMode === "json" ? (
              <div>
                <AutoGrowTextarea
                  value={jsonDraft}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  minHeight={140}
                  maxHeight={360}
                  className="font-mono text-xs"
                />
                {jsonError && <p className="mt-1 text-[11px] text-rose-600">{jsonError}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {variableNames.map((name) => (
                  <div key={name}>
                    {isMultiVariable && (
                      <label className="mb-1 block font-mono text-[11px] text-primary">{`{${name}}`}</label>
                    )}
                    <AutoGrowTextarea
                      value={fieldDrafts[name] ?? ""}
                      onChange={(e) => handleFieldChange(name, e.target.value)}
                      minHeight={64}
                      maxHeight={320}
                      autoFocus={name === variableNames[0]}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reference Output</h4>
            {mode === "view" ? (
              item.expectedOutput ? (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
                  {tryPrettyPrintText(item.expectedOutput)}
                </pre>
              ) : (
                <p className="text-xs italic text-slate-400">No reference output set.</p>
              )
            ) : (
              <AutoGrowTextarea
                value={expectedOutputDraft}
                onChange={(e) => setExpectedOutputDraft(e.target.value)}
                placeholder="What the output should look like, if known"
                minHeight={64}
                maxHeight={320}
              />
            )}
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reviewer note</h4>
            <p className="text-[11px] text-slate-400">
              Sticks to this dataset row itself — unlike a Run result's note, it isn't tied to any one run and won't get overwritten by a rerun.
            </p>
            <AutoGrowTextarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="What's worth remembering about this row…"
              minHeight={64}
              maxHeight={240}
            />
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
