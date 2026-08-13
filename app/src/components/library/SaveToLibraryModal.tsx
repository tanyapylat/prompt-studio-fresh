import { useState } from "react";
import type { LibraryVisibility } from "../../types";
import type { SaveToLibraryMeta } from "../../libraryFactory";
import { Button, Modal, TextArea, TextInput } from "../ui";

export function SaveToLibraryModal({
  title,
  defaultName,
  ownerId,
  onSave,
  onClose,
}: {
  title: string;
  defaultName: string;
  ownerId: string;
  onSave: (meta: SaveToLibraryMeta) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<LibraryVisibility>("org");

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      visibility,
      ownerId,
    });
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-600">
          Name
          <TextInput value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Description
          <TextArea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this for, and when should someone reuse it?"
            className="mt-1"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Tags (comma-separated)
          <TextInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="support, tone, guardrail" className="mt-1" />
        </label>
        <div>
          <span className="block text-xs font-medium text-slate-600">Visibility</span>
          <div className="mt-1.5 flex gap-2">
            {(["org", "private"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  visibility === v
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {v === "org" ? "Org-wide — anyone can find and pin it" : "Private — only visible to you"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
            Save to library
          </Button>
        </div>
      </div>
    </Modal>
  );
}
