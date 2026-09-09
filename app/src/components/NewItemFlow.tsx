import { useState } from "react";
import { ChevronLeft, Copy, FileText, Pencil, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ForkSource {
  id: string;
  name: string;
  goal: string;
  published: boolean;
}

/**
 * Shared "New Spec" / "New Prompt" guided flow: optionally choose from-scratch vs new-version
 * first (Specs only), then always choose manual vs North Star. One component so both entry
 * points stay in lockstep instead of drifting into two bespoke creation UIs.
 */
export function NewItemFlow({
  open,
  onClose,
  itemLabel,
  showOriginStep = false,
  forkSources = [],
  onManual,
  onNorthStar,
}: {
  open: boolean;
  onClose: () => void;
  itemLabel: string;
  showOriginStep?: boolean;
  forkSources?: ForkSource[];
  onManual: (sourceId?: string) => void;
  onNorthStar: (sourceId?: string) => void;
}) {
  const [step, setStep] = useState<"origin" | "mode">(showOriginStep ? "origin" : "mode");
  const [sourceId, setSourceId] = useState<string | null>(null);

  function reset() {
    setStep(showOriginStep ? "origin" : "mode");
    setSourceId(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function chooseScratch() {
    setSourceId(null);
    setStep("mode");
  }

  function chooseSource(id: string) {
    setSourceId(id);
    setStep("mode");
  }

  function finish(mode: "manual" | "northStar") {
    const chosen = sourceId ?? undefined;
    if (mode === "manual") onManual(chosen);
    else onNorthStar(chosen);
    handleClose();
  }

  const sourceName = sourceId ? (forkSources.find((s) => s.id === sourceId)?.name ?? null) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent width="md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step === "mode" && showOriginStep && (
              <button
                onClick={() => setStep("origin")}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Back"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <DialogTitle>New {itemLabel}</DialogTitle>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {step === "origin" && (
            <>
              <p className="text-xs text-slate-500">Start from scratch, or build on an existing Spec as a new version.</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={chooseScratch}
                  className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <FileText size={18} className="text-primary" />
                  <span className="text-sm font-medium text-slate-900">From scratch</span>
                  <span className="text-[11px] text-slate-500">Start with a blank {itemLabel}.</span>
                </button>
                <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Copy size={16} className="text-primary" /> New version
                  </span>
                  <span className="text-[11px] text-slate-500">Fork an existing Spec into a fresh draft.</span>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                    {forkSources.length === 0 && <p className="text-[11px] text-slate-400">No Specs to fork yet.</p>}
                    {forkSources.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => chooseSource(s.id)}
                        className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-slate-800">{s.name}</span>
                          <span className="block truncate text-[10px] text-slate-400">{s.goal || "No goal yet"}</span>
                        </span>
                        <Badge tone={s.published ? "success" : "neutral"}>{s.published ? "Published" : "Draft"}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {step === "mode" && (
            <>
              <p className="text-xs text-slate-500">
                {sourceName
                  ? (
                    <>
                      Building a new version of <span className="font-medium text-slate-700">{sourceName}</span>.
                      How do you want to fill it in?
                    </>
                  )
                  : `How do you want to build this ${itemLabel}?`}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => finish("manual")}
                  className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <Pencil size={18} className="text-primary" />
                  <span className="text-sm font-medium text-slate-900">Type it myself</span>
                  <span className="text-[11px] text-slate-500">Fill it in by hand, at your own pace.</span>
                </button>
                <button
                  onClick={() => finish("northStar")}
                  className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <Sparkles size={18} className="text-primary" />
                  <span className="text-sm font-medium text-slate-900">North Star</span>
                  <span className="text-[11px] text-slate-500">Describe what you want — North Star drafts it with you.</span>
                </button>
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
