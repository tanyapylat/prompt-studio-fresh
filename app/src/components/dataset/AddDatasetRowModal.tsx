import { useState } from "react";
import { Plus } from "lucide-react";
import { buildDatasetItem } from "../../dataset";
import type { DatasetItem } from "../../types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Manual-add form for one or more Dataset rows at a time — fields are derived live from the
 * current Target's `{variable}` placeholders (falls back to a single "input" field for Specs
 * that haven't touched the structured Playground yet), plus an optional expected output.
 */
export function AddDatasetRowModal({
  variableNames,
  onAdd,
  onClose,
}: {
  variableNames: string[];
  onAdd: (item: DatasetItem) => void;
  onClose: () => void;
}) {
  const emptyValues = () => Object.fromEntries(variableNames.map((n) => [n, ""]));
  const [values, setValues] = useState<Record<string, string>>(emptyValues);
  const [expectedOutput, setExpectedOutput] = useState("");
  const [addedCount, setAddedCount] = useState(0);

  const hasContent = Object.values(values).some((v) => v.trim());

  function handleAdd() {
    if (!hasContent) return;
    onAdd(buildDatasetItem(values, variableNames, "manual", expectedOutput));
    setValues(emptyValues());
    setExpectedOutput("");
    setAddedCount((c) => c + 1);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a row manually</DialogTitle>
        </DialogHeader>
        <DialogBody className="pb-0">
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {variableNames.length > 1
                ? "One field per variable used in the current prompt."
                : "The value for this row's input variable."}
            </p>
            {variableNames.map((name) => (
              <div key={name}>
                <label className="mb-1 block font-mono text-[11px] text-primary">{`{${name}}`}</label>
                <Textarea
                  rows={2}
                  value={values[name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                  placeholder={`Value for ${name}`}
                  autoFocus={name === variableNames[0]}
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Expected output (optional)</label>
              <Textarea
                rows={2}
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                placeholder="What the output should look like, if known"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="justify-between">
          <span className="text-xs text-slate-400">
            {addedCount > 0 ? `${addedCount} row${addedCount === 1 ? "" : "s"} added so far.` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button variant="default" onClick={handleAdd} disabled={!hasContent}>
              <Plus size={13} /> Add row
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
