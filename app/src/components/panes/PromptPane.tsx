import { useState } from "react";
import { Maximize2, Save } from "lucide-react";
import { useStore } from "../../store";
import { mirrorPromptIdForSpec } from "../../promptFactory";
import type { SpecProject } from "../../types";
import type { SaveToLibraryMeta } from "../../libraryFactory";
import { Button } from "@/components/ui/button";
import { PromptPlaygroundBody } from "../prompts/PromptPlaygroundBody";
import { SaveToLibraryModal } from "../library/SaveToLibraryModal";

/**
 * Embedded shell for the Spec Workspace's "Prompt" tab — renders the exact same Playground body
 * used by the full-page Prompts catalog (just without its navigation chrome), so editing a Prompt
 * feels identical whether you got here from a Spec or from the Prompts list directly.
 */
export function PromptPane({ spec }: { spec: SpecProject }) {
  const { prompts, currentUserId, selectPrompt, duplicatePromptAsStandalone } = useStore();
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const mirroredId = mirrorPromptIdForSpec(spec.id);
  const prompt = prompts.find((p) => p.id === mirroredId) ?? null;

  function handleDuplicate(meta: SaveToLibraryMeta) {
    if (!prompt) return;
    duplicatePromptAsStandalone(prompt.id, meta);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600">Prompt</div>
        {prompt && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowDuplicateModal(true)}>
              <Save size={13} /> Save as standalone prompt
            </Button>
            <Button size="sm" onClick={() => selectPrompt(prompt.id)}>
              <Maximize2 size={13} /> Open in full Playground
            </Button>
          </div>
        )}
      </div>

      {!prompt ? (
        <p className="text-sm text-slate-500">No Prompt yet — click Generate to draft one from the Spec.</p>
      ) : (
        <>
          {spec.target?.copiedFromPromptId && (
            <p className="text-xs text-slate-400">Inserted from another prompt in the catalog — now an independent version.</p>
          )}
          <PromptPlaygroundBody prompt={prompt} />
        </>
      )}

      {showDuplicateModal && prompt && (
        <SaveToLibraryModal
          title="Save as a standalone Prompt"
          defaultName={`${spec.name} — Prompt`}
          ownerId={currentUserId}
          onSave={handleDuplicate}
          onClose={() => setShowDuplicateModal(false)}
        />
      )}
    </div>
  );
}
