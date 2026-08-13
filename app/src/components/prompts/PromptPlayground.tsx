import { ChevronLeft, ExternalLink, Link2, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { activePromptVersion } from "../../promptFactory";
import { Badge, Button } from "../ui";
import { PromptPlaygroundBody } from "./PromptPlaygroundBody";

/**
 * Full-page shell for the Prompts catalog: same editing/testing body as the embedded Spec Prompt
 * tab, wrapped with navigation chrome (back button, rename, visibility, delete) that only makes
 * sense as a standalone destination.
 */
export function PromptPlayground() {
  const {
    selectedPrompt: prompt,
    selectedPromptVersionId,
    specs,
    selectPrompt,
    select,
    updatePromptMeta,
    deletePrompt,
  } = useStore();

  if (!prompt) return null;

  const version = activePromptVersion(prompt);
  const linkedSpec = prompt.specId ? specs.find((s) => s.id === prompt.specId) : null;

  function handleOpenSpec() {
    if (!prompt!.specId) return;
    selectPrompt(null);
    select(prompt!.specId);
  }

  function handleRename(name: string) {
    updatePromptMeta(prompt!.id, (p) => ({ ...p, name, updatedAt: Date.now() }));
  }

  function handleToggleVisibility() {
    updatePromptMeta(prompt!.id, (p) => ({
      ...p,
      visibility: p.visibility === "org" ? "private" : "org",
      updatedAt: Date.now(),
    }));
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${prompt!.name}"? This can't be undone.`)) return;
    deletePrompt(prompt!.id);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => selectPrompt(null)}>
            <ChevronLeft size={16} /> Prompts
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          {prompt.specId ? (
            <span className="text-sm font-semibold text-slate-900">{prompt.name}</span>
          ) : (
            <input
              value={prompt.name}
              onChange={(e) => handleRename(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
            />
          )}
          <Badge tone={version.status === "published" ? "success" : "neutral"}>
            {version.status === "published" ? "Published" : "Draft"}
          </Badge>
          {linkedSpec ? (
            <button
              onClick={handleOpenSpec}
              className="flex items-center gap-1.5 text-xs text-sky-700 hover:text-sky-700"
              title="Open the linked Spec"
            >
              <Link2 size={12} /> {linkedSpec.name} <ExternalLink size={11} />
            </button>
          ) : (
            <Badge>Standalone</Badge>
          )}
        </div>
        {!prompt.specId && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleToggleVisibility}>
              Make {prompt.visibility === "org" ? "Private" : "Org-wide"}
            </Button>
            <Button size="sm" variant="danger" onClick={handleDelete}>
              <Trash2 size={13} /> Delete
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <PromptPlaygroundBody prompt={prompt} initialVersionId={selectedPromptVersionId} />
      </div>
    </div>
  );
}
