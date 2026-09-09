import { useState } from "react";
import type { LibraryVisibility } from "../../types";
import type { SaveToLibraryMeta } from "../../libraryFactory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SaveToLibraryModal({
  title,
  defaultName,
  ownerId,
  onSave,
  onClose,
  visibilityLocked,
}: {
  title: string;
  defaultName: string;
  ownerId: string;
  onSave: (meta: SaveToLibraryMeta) => void;
  onClose: () => void;
  /** When set, hides the org/private toggle and forces this visibility instead. */
  visibilityLocked?: LibraryVisibility;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<LibraryVisibility>(visibilityLocked ?? "org");

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      visibility: visibilityLocked ?? visibility,
      ownerId,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="pb-0">
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">
              Name
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Description
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this for, and when should someone reuse it?"
                className="mt-1"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Tags (comma-separated)
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="support, tone, guardrail"
                className="mt-1"
              />
            </label>
            <div>
              <span className="block text-xs font-medium text-slate-600">Visibility</span>
              {visibilityLocked ? (
                <p className="mt-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Private — only visible to you.
                </p>
              ) : (
                <div className="mt-1.5 flex gap-2">
                  {(["org", "private"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisibility(v)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        visibility === v
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border text-slate-600 hover:bg-secondary"
                      }`}
                    >
                      {v === "org" ? "Public — anyone can find and pin it" : "Private — only visible to you"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleSave} disabled={!name.trim()}>
            Save to library
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
