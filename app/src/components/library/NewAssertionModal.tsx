import { useState } from "react";
import { Braces, Code2, Gauge, Plus } from "lucide-react";
import type { AssertionTier } from "../../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TIER_OPTIONS: { tier: AssertionTier; label: string; hint: string; icon: typeof Gauge }[] = [
  { tier: "deterministic", label: "Deterministic", hint: "A built-in, parameterized check — no LLM call.", icon: Braces },
  { tier: "custom_code", label: "Custom code", hint: "Your own JS/Python function run against the output.", icon: Code2 },
  { tier: "rubric_grading", label: "LLM judge", hint: "An LLM-as-judge rubric — editable later.", icon: Gauge },
];

/**
 * New Assertion CTA — created straight into the library (no Spec involved), always private
 * regardless of tier. `deterministic`/`custom_code` stay private forever (engineer-owned check
 * types); only `rubric_grading` entries can be made public later.
 */
export function NewAssertionModal({
  onCreate,
  onClose,
}: {
  onCreate: (tier: AssertionTier, name: string) => void;
  onClose: () => void;
}) {
  const [tier, setTier] = useState<AssertionTier>("deterministic");
  const [name, setName] = useState("");

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(tier, trimmed);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Assertion</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. No competitor mentions"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Type</label>
            <div className="space-y-1.5">
              {TIER_OPTIONS.map(({ tier: t, label, hint, icon: Icon }) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                    tier === t ? "border-primary bg-accent/40" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{label}</span>
                    <span className="block text-[11px] text-slate-500">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
            {tier !== "rubric_grading" && (
              <p className="mt-2 text-[11px] text-slate-400">
                {tier === "deterministic" ? "Deterministic" : "Custom code"} assertions are always private — only
                engineer-verified checks can be made public.
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" disabled={!name.trim()} onClick={handleCreate}>
            <Plus size={13} /> Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
