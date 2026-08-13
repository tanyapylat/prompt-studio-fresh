import { useState } from "react";
import clsx from "clsx";
import { CheckSquare, Layers3 } from "lucide-react";
import type { GenerateArtifact, GenerateSelection } from "../types";
import { Button, Modal } from "./ui";

type GenerateMode = "all" | "selected";

const ARTIFACTS: { id: GenerateArtifact; label: string; description: string }[] = [
  { id: "prompt", label: "Prompt", description: "Draft the target prompt from the Spec." },
  { id: "assertions", label: "Assertions", description: "Create checks and an LLM judge when needed." },
  { id: "dataset", label: "Dataset", description: "Build seed and synthetic test inputs." },
];

const ALL_ARTIFACTS: GenerateSelection = {
  prompt: true,
  assertions: true,
  dataset: true,
};

export function GenerateOptionsModal({
  isRegenerate,
  onGenerate,
  onClose,
}: {
  isRegenerate: boolean;
  onGenerate: (selection: GenerateSelection) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<GenerateMode>("all");
  const [selection, setSelection] = useState<GenerateSelection>(ALL_ARTIFACTS);
  const hasSelection = Object.values(selection).some(Boolean);

  function toggleArtifact(artifact: GenerateArtifact) {
    setSelection((current) => ({ ...current, [artifact]: !current[artifact] }));
  }

  return (
    <Modal title={isRegenerate ? "Regenerate from Spec" : "Generate from Spec"} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Choose whether to create the complete bundle or only specific artifacts.
        </p>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setMode("all")}
            className={clsx(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              mode === "all"
                ? "border-sky-500 bg-sky-50"
                : "border-slate-200 hover:bg-slate-50",
            )}
          >
            <Layers3 size={18} className="mt-0.5 shrink-0 text-sky-600" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Generate everything</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Generate the prompt, assertions, and dataset together.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode("selected")}
            className={clsx(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              mode === "selected"
                ? "border-sky-500 bg-sky-50"
                : "border-slate-200 hover:bg-slate-50",
            )}
          >
            <CheckSquare size={18} className="mt-0.5 shrink-0 text-sky-600" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Choose what to generate</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Select one or more artifacts and keep the others unchanged.
              </span>
            </span>
          </button>
        </div>

        {mode === "selected" && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            {ARTIFACTS.map((artifact) => (
              <label
                key={artifact.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selection[artifact.id]}
                  onChange={() => toggleArtifact(artifact.id)}
                  className="mt-0.5 size-4 accent-sky-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{artifact.label}</span>
                  <span className="block text-xs text-slate-500">{artifact.description}</span>
                </span>
              </label>
            ))}
            {!hasSelection && (
              <p className="px-2 text-xs text-rose-600">Select at least one artifact to generate.</p>
            )}
          </div>
        )}

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Generation will not start a run. Use the Run button when you are ready to evaluate.
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={mode === "selected" && !hasSelection}
            onClick={() => onGenerate(mode === "all" ? ALL_ARTIFACTS : selection)}
          >
            {isRegenerate ? "Regenerate" : "Generate"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
