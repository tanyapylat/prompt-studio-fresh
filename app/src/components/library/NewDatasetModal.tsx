import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * New Dataset CTA — creates an empty, private library Dataset directly (no Spec to infer
 * variables from), so the author picks the field/variable names by hand up front.
 */
export function NewDatasetModal({
  onCreate,
  onClose,
}: {
  onCreate: (name: string, fields: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [fields, setFields] = useState<string[]>(["input"]);

  function updateField(index: number, value: string) {
    setFields((f) => f.map((v, i) => (i === index ? value : v)));
  }

  function addField() {
    setFields((f) => [...f, ""]);
  }

  function removeField(index: number) {
    setFields((f) => f.filter((_, i) => i !== index));
  }

  const cleanFields = fields.map((f) => f.trim()).filter(Boolean);
  const canCreate = name.trim().length > 0 && cleanFields.length > 0;

  function handleCreate() {
    if (!canCreate) return;
    onCreate(name.trim(), cleanFields);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Dataset</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Name</label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Support tone regression set" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Fields</label>
            <p className="mb-2 text-[11px] text-slate-400">
              Column/variable names each row will have — no Spec to infer them from yet, so name them by hand.
            </p>
            <div className="space-y-1.5">
              {fields.map((field, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={field}
                    onChange={(e) => updateField(i, e.target.value)}
                    placeholder="field name"
                    className="font-mono text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={fields.length <= 1}
                    onClick={() => removeField(i)}
                    title="Remove field"
                  >
                    <Trash2 size={13} className="text-slate-400" />
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="secondary" className="mt-2" onClick={addField}>
              <Plus size={13} /> Add field
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" disabled={!canCreate} onClick={handleCreate}>
            <Plus size={13} /> Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
