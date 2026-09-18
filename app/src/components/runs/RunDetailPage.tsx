import { useMemo, useState } from "react";
import { ArrowUpRight, Beaker, ChevronDown, ChevronLeft } from "lucide-react";
import { useStore } from "../../store";
import { saveTab } from "../Workspace";
import { RunDetailBody } from "../results/RunDetailBody";
import { describeRunPromptIdentity, resolveRunPromptIdentity } from "../../promptFactory";
import type { RunGroup, SpecProject } from "../../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";

function formatUsDateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(ts);
}

/** 0–60% red, 61–89% orange, 90–100% green — same coding as the Eval runs list. */
function passRateTone(rate: number): string {
  const pct = Math.round(rate * 100);
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 61) return "text-orange-600";
  return "text-rose-600";
}

/**
 * Promptfoo-style picker next to the run id/date line — jumps between other Runs that evaluated
 * this *exact same* Prompt version (`run.targetId`), each shown with its date, id, and pass score
 * (mirroring the eval-switcher dropdown on promptfoo's own eval detail page). Scoped to one
 * version on purpose: switching to a different Prompt version entirely is a bigger jump (a
 * different row in the Eval runs list) than re-checking this version's own run history for
 * flakiness/drift. Collapses to a plain, non-interactive label when there's nothing to switch to.
 */
function RunVersionSwitcher({ spec, run, onSelect }: { spec: SpecProject; run: RunGroup; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const targetId = run.targetId ?? spec.target?.id ?? null;
  const siblingRuns: RunGroup[] = [...spec.runs].filter((r) => (r.targetId ?? spec.target?.id ?? null) === targetId).reverse();

  if (siblingRuns.length <= 1) {
    return (
      <>
        <span className="font-mono">{run.id}</span>
        <span>Created {formatUsDateTime(run.createdAt)}</span>
      </>
    );
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md py-0.5 pl-0 pr-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <span className="font-mono">{run.id}</span>
        <span>· Created {formatUsDateTime(run.createdAt)}</span>
        <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10">
            {/* A `<div>`, not a `<p>` — this whole switcher can be rendered inside the header's own
                `<p>` line, and a `<p>` can't legally contain another `<p>` (invalid HTML, console error). */}
            <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {siblingRuns.length} runs for this Prompt version
            </div>
            {siblingRuns.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setOpen(false);
                  onSelect(r.id);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${
                  r.id === run.id ? "bg-accent/60" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{formatUsDateTime(r.createdAt)}</span>
                  <span className="block truncate font-mono text-[10px] text-slate-400">{r.id}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${passRateTone(r.passRate)}`}>{Math.round(r.passRate * 100)}%</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/**
 * Standalone, full-page view of exactly one Run — the AI Studio equivalent of Promptfoo's eval
 * detail screen. Reachable from the sidebar's Runs list (browsing across every Spec) or from a
 * Spec's Results tab ("View full history"). Renders the same `RunDetailBody` the in-Workspace
 * Results tab uses, so summary/table/filters/columns/export/annotation behave identically in both
 * places — only the surrounding page chrome differs.
 */
export function RunDetailPage() {
  const { selectedRun, selectedId, selectRun, select, prompts } = useStore();

  // Same identity the Eval runs list shows (real Prompt Management project/version ids when
  // known) — the primary heading below, not `spec.name`, which for the CSV-imported Scenario
  // demos is really an eval-scenario description, not the underlying Prompt's own name. See the
  // NOTE FOR ENGINEER on `SpecProject.promptDisplayName`. Computed unconditionally (before the
  // early return below) to keep this component's hook order stable across renders.
  const identity = useMemo(
    () => (selectedRun ? resolveRunPromptIdentity(selectedRun.spec, selectedRun.run, prompts) : null),
    [selectedRun, prompts],
  );

  if (!selectedRun || !identity) return null;
  const { spec, run } = selectedRun;
  // Clearing selectedRunId is enough to "go back" — it naturally falls through to whatever was
  // showing before (that Spec's Workspace if one was open, otherwise the Runs list section).
  const cameFromWorkspace = selectedId === spec.id;
  const title = describeRunPromptIdentity(identity);
  const showScenarioSubtitle = spec.name !== identity.promptName;

  function openSpecWorkspace() {
    saveTab(spec.id, "results");
    select(spec.id);
    selectRun(null);
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Button variant="ghost" size="sm" onClick={() => selectRun(null)}>
            <ChevronLeft size={14} /> {cameFromWorkspace ? "Back to Spec" : "Eval runs"}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900" title={title}>
              {title}
            </h1>
            {run.scope === "sample" && (
              <Badge tone="warning">
                <Beaker size={11} /> Sample
              </Badge>
            )}
          </div>
          {/* Secondary line — the Spec's own name, when it's not just a duplicate of the heading
              above (e.g. the CSV-imported Scenario demos, where `spec.name` is an eval-scenario
              description like "Scenario 1 — Compliance chat, 14 assertions", not a Prompt name). */}
          {showScenarioSubtitle && <p className="text-xs font-medium text-slate-500">{spec.name}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <RunVersionSwitcher spec={spec} run={run} onSelect={selectRun} />
            <span>
              {run.results.length} rows × {spec.assertions.length} metrics
            </span>
          </p>
        </div>

        {!cameFromWorkspace && (
          <Button variant="secondary" size="sm" onClick={openSpecWorkspace}>
            Open Spec workspace <ArrowUpRight size={13} />
          </Button>
        )}
      </div>

      <div className="mt-6">
        <RunDetailBody spec={spec} run={run} />
      </div>
    </PageShell>
  );
}
