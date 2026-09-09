import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import type { SpecProject } from "../../types";
import { applySpecBriefJson, specBriefToJson } from "../../specFactory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * View + edit the Spec's brief as raw JSON — everything SpecPane edits field-by-field (name/goal/
 * context/I-O contracts/requirements/examples/openQuestions), not the generated artifacts
 * (those have their own tabs). Doubles as an import path: paste in a real spec doc shaped like
 * this (see e.g. CQA-spec.txt) and Apply merges it straight onto the fields above.
 */
export function SpecJsonModal({ spec, onApply, onClose }: { spec: SpecProject; onApply: (next: SpecProject) => void; onClose: () => void }) {
  const [text, setText] = useState(() => specBriefToJson(spec));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  function handleApply() {
    try {
      const next = applySpecBriefJson(spec, text);
      setError(null);
      onApply(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't parse that as JSON.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent width="xl">
        <DialogHeader>
          <DialogTitle>Spec JSON — {spec.name}</DialogTitle>
          <Button size="sm" variant="ghost" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </Button>
        </DialogHeader>
        <DialogBody>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            spellCheck={false}
            className="h-[60vh] w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          {error && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Editing this and clicking Apply replaces the matching fields above — anything you remove from the
            JSON (e.g. delete the whole "requirements" key) is left untouched rather than cleared, so partial
            edits are safe. Generated artifacts (Prompt, Assertions, Dataset, Runs) aren't included here.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
